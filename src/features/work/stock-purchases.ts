import { ApiError, id, now, requiredString } from "../../platform/http";
import { currentWorkPrincipal } from "./identity";
import type { WorkContext } from "./core";
import { evidenceText, readStockLine, stockKeeper } from "./stock";

/** ASSET-005 purchase requests raised by a stock threshold. Linen never sends them: the owner or operator records
 * the order they placed with the buyer and its reference, cancels with a reason, or receives the ordered quantity,
 * which adds it to the line's count. */
interface Purchase { id: string; line_id: string; quantity: number; state: string }

async function loadPurchase(ctx: WorkContext, purchaseId: string) {
  await currentWorkPrincipal(ctx);
  stockKeeper(ctx);
  const purchase = await ctx.env.DB.prepare("SELECT id,line_id,quantity,state FROM work_stock_purchases WHERE workspace_id=? AND id=?")
    .bind(ctx.principal.workspaceId, purchaseId).first<Purchase>();
  if (!purchase) throw new ApiError(404, "not_found", "Purchase request not found");
  return purchase;
}

async function decide(ctx: WorkContext, purchase: Purchase, from: string[], to: string, set: string, values: unknown[], action: string, detail: unknown) {
  if (!from.includes(purchase.state)) throw new ApiError(409, "purchase_state", `This purchase request is ${purchase.state}`);
  const w = ctx.principal.workspaceId, at = now(), db = ctx.env.DB;
  const result = await db.batch([
    db.prepare(`UPDATE work_stock_purchases SET state=?,decided_by=?,decided_at=?,${set} WHERE workspace_id=? AND id=? AND state=?`)
      .bind(to, ctx.principal.userId, at, ...values, w, purchase.id, purchase.state),
    db.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0").bind(id(), w, ctx.principal.userId, action, purchase.id, JSON.stringify(detail), at),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, "purchase_state", "This purchase request changed; reload");
  return readStockLine(ctx, purchase.line_id);
}

export async function orderStockPurchase(ctx: WorkContext, purchaseId: string, input: Record<string, unknown>) {
  const purchase = await loadPurchase(ctx, purchaseId), reference = requiredString(input.orderReference, "orderReference", 200);
  return decide(ctx, purchase, ["raised"], "ordered", "order_reference=?", [reference], "work.stock_purchase_ordered", { orderReference: reference, sentByLinen: false });
}

export async function cancelStockPurchase(ctx: WorkContext, purchaseId: string, input: Record<string, unknown>) {
  const purchase = await loadPurchase(ctx, purchaseId), reason = requiredString(input.reason, "reason", 2000);
  return decide(ctx, purchase, ["raised", "ordered"], "cancelled", "reason=?", [reason], "work.stock_purchase_cancelled", { reason });
}

export async function receiveStockPurchase(ctx: WorkContext, purchaseId: string, input: Record<string, unknown>) {
  const purchase = await loadPurchase(ctx, purchaseId), evidence = evidenceText(input.evidence), w = ctx.principal.workspaceId, db = ctx.env.DB;
  if (purchase.state !== "ordered") throw new ApiError(409, "purchase_state", purchase.state === "raised" ? "Record the order with the buyer before receiving it" : `This purchase request is ${purchase.state}`);
  const movementId = id(), at = now(), me = ctx.principal.userId;
  const received = "EXISTS(SELECT 1 FROM work_stock_purchases WHERE workspace_id=? AND id=? AND state='received' AND received_at=? AND decided_by=?)";
  const result = await db.batch([
    db.prepare("UPDATE work_stock_purchases SET state='received',received_at=?,decided_by=?,decided_at=? WHERE workspace_id=? AND id=? AND state='ordered'")
      .bind(at, me, at, w, purchase.id),
    db.prepare(`UPDATE work_stock_lines SET on_hand=on_hand+?,revision=revision+1,latest_movement_id=? WHERE workspace_id=? AND id=? AND ${received}`)
      .bind(purchase.quantity, movementId, w, purchase.line_id, w, purchase.id, at, me),
    db.prepare(`INSERT INTO work_stock_movements(id,workspace_id,line_id,kind,quantity,purchase_id,evidence,actor_id,created_at) SELECT ?,?,?,'receive',?,?,?,?,? WHERE ${received}`)
      .bind(movementId, w, purchase.line_id, purchase.quantity, purchase.id, evidence, me, at, w, purchase.id, at, me),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE ${received}`)
      .bind(id(), w, me, "work.stock_purchase_received", purchase.id, JSON.stringify({ quantity: purchase.quantity, movementId }), at, w, purchase.id, at, me),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, "purchase_state", "This purchase request changed; reload");
  return readStockLine(ctx, purchase.line_id);
}
