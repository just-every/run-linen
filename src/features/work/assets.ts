import { assetEvent, assetEvents } from './asset-history';
import { currentWorkPrincipal } from "./identity";
import { ApiError, id, now } from "../../platform/http";
import { permit, type WorkContext } from "./core";

export async function acquireAsset(ctx: WorkContext, input: {
  serial: string; source: string; location?: string; procured?: boolean; assetTag?: string;
}) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "integration"]);
  if (!input || ![input.serial, input.source].every(v => typeof v === "string" && v.trim().length > 0 && v.length < 1000)
    || (input.procured !== undefined && typeof input.procured !== "boolean")
    || (input.assetTag !== undefined && (typeof input.assetTag !== "string" || input.assetTag.length > 200)))
    throw new ApiError(422, "asset_input", "Serial and observation or procurement source required");
  const assetId = id(), eventId = id(), at = now(), w = ctx.principal.workspaceId;
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO work_assets(id,workspace_id,serial,state,location,source,observed_at,latest_event_id,asset_tag)
        VALUES(?,?,?,?,?,?,?,?,?)`).bind(assetId,w,input.serial.trim(),input.procured ? "procured" : "stock",input.location || null,input.source,at,eventId,input.assetTag?.trim() || null),
      ctx.env.DB.prepare(`INSERT INTO work_custody(id,workspace_id,asset_id,actor_id,kind,person_id,evidence,created_at)
        VALUES(?,?,?,?,?,NULL,?,?)`).bind(eventId,w,assetId,ctx.principal.userId,input.procured ? "procure" : "record",input.source,at),
      assetEvent(ctx,assetId,'work.asset_recorded',{}, {serial:input.serial.trim(),assetTag:input.assetTag?.trim() || null,
        state:input.procured ? 'procured' : 'stock',personId:null,location:input.location || null,source:input.source,observedAt:at,evidence:input.source},at,[],eventId),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed: work_assets"))
      throw new ApiError(409,"serial_conflict","Serial already exists; reconcile source identity");
    throw error;
  }
  return { id:assetId };
}

type Command = "reserve" | "assign" | "loan" | "receive" | "return" | "repair" | "retire" | "dispose" | "missing";
type CustodyInput = {
  revision:number; command:Command; personId?:string; evidence:string; location?:string;
  certificatePartner?:string; certificateStandard?:string; certificateReference?:string;
};
function disposalCertificate(input: CustodyInput) {
  if (input.command !== "dispose") return null;
  const {certificatePartner:partner,certificateStandard:standard,certificateReference:reference} = input;
  let url: URL;
  try { url = new URL(reference || ""); }
  catch { throw new ApiError(422,"disposal_certificate","Disposal requires the ITAD partner's certificate URL"); }
  if (!partner?.trim() || partner.length > 500 || !["R2v3","e-Stewards"].includes(standard || "")
    || url.protocol !== "https:" || url.username || url.password || reference!.length > 2000)
    throw new ApiError(422,"disposal_certificate","ITAD partner, R2v3 or e-Stewards standard and HTTPS certificate reference required");
  return { partner:partner.trim(), standard, reference:url.href };
}

export async function moveAsset(ctx: WorkContext, assetId: string, input: CustodyInput) {
  await currentWorkPrincipal(ctx);
  permit(ctx,["owner","operator"]);
  const w=ctx.principal.workspaceId, db=ctx.env.DB;
  const asset=await db.prepare("SELECT * FROM work_assets WHERE workspace_id=? AND id=?")
    .bind(w,assetId).first<{state:string;person_id:string|null;location:string|null}>();
  if (!asset) throw new ApiError(404,"not_found","Asset not found");
  const allowed:Record<Command,string[]> = {
    reserve:["stock","returned"], assign:["stock","reserved","returned"], loan:["stock","returned"],
    receive:["procured","assigned","loaned","repair"], return:["assigned","received","loaned","missing","repair"],
    repair:["stock","returned","assigned","received","loaned"], retire:["stock","returned","repair"],
    dispose:["stock","returned","repair","retired"], missing:["assigned","received","loaned"],
  };
  if (!input || !Number.isInteger(input.revision) || !allowed[input.command]?.includes(asset.state)
    || typeof input.evidence !== "string" || !input.evidence.trim() || input.evidence.length > 10000)
    throw new ApiError(422,"invalid_custody","Transition requires compatible lifecycle and attributed evidence");
  // A repair state never hides ongoing custody. Retirement/disposal cannot clear an assignment.
  if (["retire","dispose"].includes(input.command) && asset.person_id)
    throw new ApiError(422,"assigned_asset","Return the assigned device before retirement or disposal");
  if (input.command === "return" && !asset.person_id)
    throw new ApiError(422,"invalid_custody","No assigned person to return this device");
  if (["reserve","assign","loan"].includes(input.command)) {
    if (!input.personId || !await db.prepare("SELECT 1 FROM work_people WHERE workspace_id=? AND id=? AND active=1 AND merged_into IS NULL")
      .bind(w,input.personId).first()) throw new ApiError(422,"person_required","Active person required");
    if (await db.prepare("SELECT 1 FROM work_pending_people WHERE workspace_id=? AND id=? AND state<>'bound'")
      .bind(w,input.personId).first()) throw new ApiError(409,"pending_person_unbound","Stock is held until this pending person authenticates their account");
  } else if (input.personId && input.personId !== asset.person_id) {
    throw new ApiError(422,"custody_person_conflict","Custody changes must match the assigned person");
  }
  const certificate=disposalCertificate(input);
  const state:Record<Command,string> = {
    reserve:"reserved",assign:"assigned",loan:"loaned",receive:asset.person_id ? "received" : "stock",
    return:"returned",repair:"repair",retire:"retired",dispose:"disposed",missing:"missing",
  };
  const person=["return","retire","dispose"].includes(input.command) ? null
    : ["reserve","assign","loan"].includes(input.command) ? input.personId! : asset.person_id;
  const eventId=id(),at=now();
  const results=await db.batch([
    db.prepare(`UPDATE work_assets SET state=?,person_id=?,location=COALESCE(?,location),revision=revision+1,
      latest_event_id=? WHERE workspace_id=? AND id=? AND revision=?`)
      .bind(state[input.command],person,input.location || null,eventId,w,assetId,input.revision),
    db.prepare(`INSERT INTO work_custody(id,workspace_id,asset_id,actor_id,kind,person_id,evidence,created_at,certificate_json)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_assets WHERE workspace_id=? AND id=? AND latest_event_id=?)`)
      .bind(eventId,w,assetId,ctx.principal.userId,input.command,input.command === "return" ? asset.person_id : person,
        input.evidence,at,certificate ? JSON.stringify(certificate) : null,w,assetId,eventId),
    assetEvent(ctx,assetId,'work.asset_custody_changed',
      {state:asset.state,personId:asset.person_id,location:asset.location},
      {state:state[input.command],personId:person,custodyPersonId:input.command==='return' ? asset.person_id : person,location:input.location || asset.location,evidence:input.evidence,certificate},
      at,[asset.person_id,person].filter((value): value is string=>!!value),eventId),
  ]);
  if (!results[0].meta.changes) throw new ApiError(409,"revision_conflict","Custody changed");
  return {id:assetId,state:state[input.command],revision:input.revision+1,custodyEventId:eventId};
}

export async function assetHistory(ctx: WorkContext, assetId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx,["owner","operator"]);
  const asset=await ctx.env.DB.prepare("SELECT id,serial,state FROM work_assets WHERE workspace_id=? AND id=?")
    .bind(ctx.principal.workspaceId,assetId).first();
  if (!asset) throw new ApiError(404,"not_found","Asset not found");
  const rows=await ctx.env.DB.prepare(`SELECT id,actor_id,kind,person_id,evidence,created_at,certificate_json
    FROM work_custody WHERE workspace_id=? AND asset_id=? ORDER BY created_at,rowid`)
    .bind(ctx.principal.workspaceId,assetId).all<{certificate_json:string|null}>();
  const events=await assetEvents(ctx,assetId), byId=new Map(events.map(event=>[event.id,event]));
  return {asset,events,items:rows.results.map(({certificate_json: _certificate,...row})=>{
    const event=byId.get(String((row as any).id));
    const after=new Map(event?.changes.map(change=>[change.field,change.after]) ?? []);
    // Old untyped custody entries retain their identity/time, never inferred field values.
    return {...row,actor_id:event?.actor ?? (row as any).actor_id,person_id:after.get('custodyPersonId') ?? after.get('personId') ?? null,
      evidence:after.get('evidence') ?? null,certificate:after.get('certificate') ?? null};
  })};
}
