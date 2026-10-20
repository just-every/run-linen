import type { Context, Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { ApiError, id, jsonBody, now, requiredString } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import { permit, type WorkContext } from "./core";
import { cancelStockPurchase, orderStockPurchase, receiveStockPurchase } from "./stock-purchases";

/** ASSET-005: stock rooms. A stock line counts one item at one location. Allocating to an active person decrements
 * the count atomically; when the count falls to or below the line's threshold and the line has no open purchase
 * request, the same write raises one for the reorder quantity, addressed to the line's buyer and not sent anywhere. */
export const stockBuyers = ["Purse", "CDW", "Apple Business", "Dell"] as const;
export const stockKinds = ["device", "accessory"] as const;
export const openPurchase = "state IN ('raised','ordered')";
const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const MAX_COUNT = 100000, MAX_UNIT_CENTS = 100000000;
export const stockKeeper = (ctx: WorkContext) => permit(ctx, ["owner", "operator"]);
const count = (value: unknown, name: string, min: number) => {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > MAX_COUNT)
    throw new ApiError(422, "stock_input", `${name} must be a whole number from ${min} to ${MAX_COUNT}`);
  return Number(value);
};
export const evidenceText = (value: unknown) => {
  if (typeof value !== "string" || !value.trim() || value.length > 10000) throw new ApiError(422, "stock_input", "Attributed evidence is required");
  return value.trim();
};

export async function createStockLine(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  stockKeeper(ctx);
  const location = requiredString(input.location, "location", 200), item = requiredString(input.item, "item", 200);
  if (!stockKinds.includes(input.kind as never)) throw new ApiError(422, "stock_input", "Kind is device or accessory");
  if (!stockBuyers.includes(input.buyer as never)) throw new ApiError(422, "stock_input", `Buyer is one of ${stockBuyers.join(", ")}`);
  const onHand = count(input.onHand, "Counted on hand", 0), threshold = count(input.threshold, "Reorder threshold", 0);
  const reorder = count(input.reorderQuantity, "Reorder quantity", 1);
  if (!Number.isSafeInteger(input.unitCents) || Number(input.unitCents) < 1 || Number(input.unitCents) > MAX_UNIT_CENTS)
    throw new ApiError(422, "stock_input", "Unit estimate in whole USD cents is required");
  const lineId = id(), at = now(), w = ctx.principal.workspaceId;
  const saved = await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT OR IGNORE INTO work_stock_lines(id,workspace_id,location,location_key,item,item_key,kind,on_hand,threshold,reorder_quantity,unit_cents,buyer,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(lineId, w, location, key(location), item, key(item), input.kind, onHand, threshold, reorder, input.unitCents, input.buyer, ctx.principal.userId, at),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0").bind(id(), w, ctx.principal.userId, "work.stock_line_created", lineId,
      JSON.stringify({ location, item, kind: input.kind, onHand, threshold, reorderQuantity: reorder, unitCents: input.unitCents, buyer: input.buyer }), at),
  ]);
  if (!saved[0].meta.changes) throw new ApiError(409, "stock_line_exists", "This location already counts this item");
  return readStockLine(ctx, lineId);
}

export async function allocateStock(ctx: WorkContext, lineId: string, input: Record<string, unknown>) {
  const line = await readStockLine(ctx, lineId), w = ctx.principal.workspaceId, db = ctx.env.DB;
  const quantity = count(input.quantity, "Quantity", 1), evidence = evidenceText(input.evidence);
  if (input.revision !== line.revision) throw new ApiError(409, "revision_conflict", "Stock changed; reload before allocating");
  const personId = typeof input.personId === "string" ? input.personId : "";
  if (!personId || !await db.prepare("SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND active=1 AND merged_into IS NULL").bind(w, personId).first())
    throw new ApiError(422, "person_required", "Active person required");
  if (await db.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state<>'bound'").bind(w, personId).first())
    throw new ApiError(409, "pending_person_unbound", "Stock is held until this pending person authenticates their account");
  if (quantity > line.on_hand) throw new ApiError(409, "insufficient_stock", `Only ${line.on_hand} counted on hand at ${line.location}`);
  const movementId = id(), purchaseId = id(), at = now(), me = ctx.principal.userId;
  const moved = "EXISTS(SELECT 1 FROM work_stock_lines WHERE workspace_id=? AND id=? AND latest_movement_id=?)";
  const results = await db.batch([
    db.prepare("UPDATE work_stock_lines SET on_hand=on_hand-?,revision=revision+1,latest_movement_id=? WHERE workspace_id=? AND id=? AND revision=? AND on_hand>=?")
      .bind(quantity, movementId, w, lineId, line.revision, quantity),
    db.prepare(`INSERT INTO work_stock_movements(id,workspace_id,line_id,kind,quantity,person_id,evidence,actor_id,created_at) SELECT ?,?,?,'allocate',?,?,?,?,? WHERE ${moved}`)
      .bind(movementId, w, lineId, -quantity, personId, evidence, me, at, w, lineId, movementId),
    db.prepare(`INSERT INTO work_stock_purchases(id,workspace_id,line_id,quantity,unit_cents,estimate_cents,buyer,raised_by_movement_id,raised_at)
      SELECT ?,workspace_id,id,reorder_quantity,unit_cents,reorder_quantity*unit_cents,buyer,?,? FROM work_stock_lines
      WHERE workspace_id=? AND id=? AND latest_movement_id=? AND on_hand<=threshold
      AND NOT EXISTS(SELECT 1 FROM work_stock_purchases WHERE workspace_id=? AND line_id=? AND ${openPurchase})`)
      .bind(purchaseId, movementId, at, w, lineId, movementId, w, lineId),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE ${moved}`)
      .bind(id(), w, me, "work.stock_allocated", lineId, JSON.stringify({ quantity, personId, movementId }), at, w, lineId, movementId),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_stock_purchases WHERE workspace_id=? AND id=?)`)
      .bind(id(), w, me, "work.stock_purchase_raised", purchaseId, JSON.stringify({ lineId, movementId, sent: false }), at, w, purchaseId),
  ]);
  if (!results[0].meta.changes) throw new ApiError(409, "revision_conflict", "Stock changed; reload before allocating");
  return { movementId, purchaseRaised: results[2].meta.changes ? purchaseId : null, line: await readStockLine(ctx, lineId) };
}

interface Line { id: string; location: string; item: string; kind: string; on_hand: number; threshold: number; reorder_quantity: number; unit_cents: number; buyer: string; revision: number }

export async function readStockLine(ctx: WorkContext, lineId: string) {
  await currentWorkPrincipal(ctx);
  stockKeeper(ctx);
  const w = ctx.principal.workspaceId;
  const line = await ctx.env.DB.prepare("SELECT id,location,item,kind,on_hand,threshold,reorder_quantity,unit_cents,buyer,revision,created_at FROM work_stock_lines WHERE workspace_id=? AND id=?")
    .bind(w, lineId).first<Line>();
  if (!line) throw new ApiError(404, "not_found", "Stock line not found");
  const [purchases, movements] = await Promise.all([
    ctx.env.DB.prepare("SELECT id,quantity,unit_cents,estimate_cents,buyer,state,raised_at,order_reference,decided_by,decided_at,reason,received_at FROM work_stock_purchases WHERE workspace_id=? AND line_id=? ORDER BY raised_at DESC,rowid DESC LIMIT 10")
      .bind(w, lineId).all<{ state: string }>(),
    ctx.env.DB.prepare("SELECT id,kind,quantity,person_id,purchase_id,evidence,actor_id,created_at FROM work_stock_movements WHERE workspace_id=? AND line_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20")
      .bind(w, lineId).all(),
  ]);
  // Linen records the request; no Purse or vendor connector transmits it yet (ASSET-005 Gap), so every request says so.
  const items = purchases.results.map((p) => ({ ...p, sent: false }));
  return { ...line, belowThreshold: line.on_hand <= line.threshold, openPurchase: items.find((p) => p.state === "raised" || p.state === "ordered") ?? null, purchases: items, movements: movements.results };
}

export async function listStockLines(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  stockKeeper(ctx);
  const rows = (await ctx.env.DB.prepare("SELECT id FROM work_stock_lines WHERE workspace_id=? ORDER BY location_key,item_key LIMIT 200")
    .bind(ctx.principal.workspaceId).all<{ id: string }>()).results;
  return { items: await Promise.all(rows.map((r) => readStockLine(ctx, r.id))) };
}

export function registerStockRoutes(app: Hono<AppEnv>) {
  const ctx = (c: Context<AppEnv>): WorkContext => ({ env: c.env, principal: c.get("principal") });
  app.get("/stock-lines", async (c) => c.json(await listStockLines(ctx(c))));
  app.post("/stock-lines", async (c) => c.json(await createStockLine(ctx(c), await jsonBody(c)), 201));
  app.get("/stock-lines/:id", async (c) => c.json(await readStockLine(ctx(c), c.req.param("id"))));
  app.post("/stock-lines/:id/allocate", async (c) => c.json(await allocateStock(ctx(c), c.req.param("id"), await jsonBody(c))));
  app.post("/stock-purchases/:id/order", async (c) => c.json(await orderStockPurchase(ctx(c), c.req.param("id"), await jsonBody(c))));
  app.post("/stock-purchases/:id/cancel", async (c) => c.json(await cancelStockPurchase(ctx(c), c.req.param("id"), await jsonBody(c))));
  app.post("/stock-purchases/:id/receive", async (c) => c.json(await receiveStockPurchase(ctx(c), c.req.param("id"), await jsonBody(c))));
}
