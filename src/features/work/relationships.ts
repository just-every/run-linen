import {registeredHistory,historyEventStatement} from '../history/event';
import {historyProtection} from './work-history';
import {ticketHistory} from './work-history';
import { workDepartmentStaff } from './scope';
import { departmentNotHrSql, departmentWorkBatch } from './department-spaces';
import { currentWorkPrincipal } from "./identity";
import { closeResolution } from "./desk-fields";
import { ApiError, id, now, requiredString } from "../../platform/http";
import { getWork, permit, type WorkContext, type WorkRecord } from "./core";
import { workReadable } from "./scope";
import { bindSlaPolicy } from "./sla-policies";

/** DESK-006: merge, split, parent/child and links. Agents act; requesters follow through public messages. */
const linkKinds = ["asset", "problem", "change", "release", "engineering_issue"] as const;
type LinkKind = (typeof linkKinds)[number];
const ref = (workId: string) => workId.slice(0, 6).toUpperCase();
const agentOnly = (ctx: WorkContext) => permit(ctx, ["owner", "operator"]);
function publicNote(ctx: WorkContext, workId: string, key: string, body: string, at: string, eventId?: string) {
  return ctx.env.DB.prepare("INSERT OR IGNORE INTO work_messages(id,workspace_id,work_id,author_id,visibility,body,source_key,created_at) SELECT ?,?,?,?,'public',?,?,? WHERE (? IS NULL OR EXISTS(SELECT 1 FROM audit_events WHERE id=?))")
    .bind(id(), ctx.principal.workspaceId, workId, ctx.principal.userId, body, key, at, eventId ?? null, eventId ?? null);
}
const open = (w: WorkRecord & { merged_into?: string | null }) => !["closed", "cancelled"].includes(w.state) && !w.merged_into;

/** The duplicate closes with a pointer; its requester (and beneficiary) follow the surviving ticket's public conversation. */
export async function mergeWork(ctx: WorkContext, duplicateId: string, input: { intoId?: unknown; reason?: unknown }) {
  await currentWorkPrincipal(ctx);
  agentOnly(ctx);
  const reason = requiredString(input.reason, "reason", 2000);
  if (typeof input.intoId !== "string" || input.intoId === duplicateId) throw new ApiError(422, "merge_target", "Choose a different surviving ticket");
  const duplicate = await getWork(ctx, duplicateId) as WorkRecord & { merged_into?: string | null }, into = await getWork(ctx, input.intoId) as WorkRecord & { merged_into?: string | null };
  if(!workDepartmentStaff(ctx.principal,duplicate)||!workDepartmentStaff(ctx.principal,into))throw new ApiError(403,'department_staff','Current department staff authority required');
  if((duplicate.department_id??null)!==(into.department_id??null))throw new ApiError(422,'merge_department','Merge requests only within the same department workspace');
  if (duplicate.sensitivity !== "normal" || into.sensitivity !== "normal")
    throw new ApiError(422, "merge_sensitivity", "HR and restricted tickets are never merged");
  if(duplicate.department_kind==='hr'||into.department_kind==='hr'||JSON.parse(duplicate.protected_departments_json??'[]').length||JSON.parse(into.protected_departments_json??'[]').length)throw new ApiError(422,'merge_sensitivity','HR workspace tickets are never merged');
  if (!open(duplicate) || !open(into)) throw new ApiError(409, "merge_state", "Both tickets must be open and not already merged");
  const at = now(), db = ctx.env.DB, ws = ctx.principal.workspaceId;
  // DESK-010: the merge is an automatic close, recorded with the Duplicate code and its public closing line as close notes.
  const closedLine = `This ticket was merged into ticket ${ref(into.id)} as a duplicate. Updates continue there; this conversation is closed.`;
  const resolution = await closeResolution(ctx, duplicate, "Duplicate", closedLine, at);
  const followers = [...new Set([duplicate.requester_id, duplicate.beneficiary_id])].filter((u) => u !== into.requester_id && u !== into.beneficiary_id);
  const eventId = id();
  const [moved] = await departmentWorkBatch(ctx,duplicate,[
    db.prepare("UPDATE work_records SET state='closed',closed_at=?,merged_into=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND merged_into IS NULL").bind(at, into.id, at, ws, duplicate.id, duplicate.revision),
    ticketHistory(ctx,duplicate,'work.merged',{state:duplicate.state,mergedInto:null,closedAt:duplicate.closed_at??null},{state:'closed',mergedInto:into.id,closedAt:at},at,{id:eventId}),
    ...followers.map((u) => db.prepare("INSERT OR IGNORE INTO work_participants(workspace_id,work_id,user_id,reason,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM audit_events WHERE id=?)")
      .bind(ws, into.id, u, `merged duplicate ${duplicate.id}`, at, eventId)),
    publicNote(ctx, into.id, `merge:${duplicate.id}`, `Ticket ${ref(duplicate.id)} ("${duplicate.title}") was merged into this ticket as a duplicate. Both requesters follow updates here.`, at, eventId),
    publicNote(ctx, duplicate.id, `merged-into:${into.id}`, closedLine, at, eventId),
    resolution,
    ticketHistory(ctx,into,'work.duplicate_merged',{duplicate:null},{duplicate:duplicate.id},at,{conditional:false}),
  ],'staff');
  if (!moved.meta.changes) throw new ApiError(409, "merge_conflict", "The duplicate changed; refresh before merging");
  return readRelationships(ctx, into.id);
}

/** Copies the chosen public messages into a new ticket for the same people, citing each source message,
 * with the original's classification so the new ticket binds its own SLA. */
export async function splitWork(ctx: WorkContext, workId: string, input: { title?: unknown; messageIds?: unknown; reason?: unknown }) {
  await currentWorkPrincipal(ctx);
  agentOnly(ctx);
  const title = requiredString(input.title, "title", 300), reason = requiredString(input.reason, "reason", 2000);
  const source = await getWork(ctx, workId);
  if(!workDepartmentStaff(ctx.principal,source))throw new ApiError(403,'department_staff','Current department staff authority required');
  const ids = Array.isArray(input.messageIds) ? [...new Set(input.messageIds)] : [];
  if (!ids.length || ids.length > 100) throw new ApiError(422, "split_messages", "Choose 1 to 100 public messages to move");
  const messages = (await ctx.env.DB.prepare("SELECT * FROM work_messages WHERE workspace_id=? AND work_id=? AND visibility='public' AND id IN (SELECT value FROM json_each(?)) ORDER BY created_at,id")
    .bind(ctx.principal.workspaceId, workId, JSON.stringify(ids)).all<any>()).results;
  if (messages.length !== ids.length) throw new ApiError(422, "split_messages", "Only this ticket's public messages can be split out");
  const at = now(), db = ctx.env.DB, ws = ctx.principal.workspaceId, newId = id();
  await departmentWorkBatch(ctx,source,[
    db.prepare("INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,state,sensitivity,impact,created_at,updated_at,context_json,dedup_key,split_from,department_id,protected_departments_json) VALUES(?,?,?,?,?,?,'open',?,?,?,?,'{}',?,?,?,?)")
      .bind(newId, ws, source.requester_id, source.beneficiary_id, source.kind, title, source.sensitivity, (source as any).impact ?? "individual", at, at, `split:${source.id}:${newId}`, source.id,source.department_id??null,source.protected_departments_json??'[]'),
    ...messages.map((m) => db.prepare("INSERT INTO work_messages(id,workspace_id,work_id,author_id,visibility,body,source_key,created_at) VALUES(?,?,?,?,'public',?,?,?)")
      .bind(id(), ws, newId, m.author_id, m.body, `split:${m.id}`, m.created_at)),
    publicNote(ctx, newId, `split-from:${source.id}`, `Split from ticket ${ref(source.id)}: ${messages.length} message${messages.length === 1 ? "" : "s"} moved here, each linked to its original.`, at),
    publicNote(ctx, source.id, `split-to:${newId}`, `Part of this request continues as ticket ${ref(newId)} ("${title}").`, at),
    db.prepare("INSERT INTO work_classifications(workspace_id,work_id,revision,state,current_json,reason,updated_at) SELECT workspace_id,?,1,'overridden',current_json,?,? FROM work_classifications WHERE workspace_id=? AND work_id=? AND current_json IS NOT NULL")
      .bind(newId, `Split from ${source.id}: ${reason}`, at, ws, source.id),
    ticketHistory(ctx,source,'work.split',{splitChild:null},{splitChild:newId},at,{conditional:false}),
    ticketHistory(ctx,{...source,id:newId},'work.split_created',{splitFrom:null},{splitFrom:source.id},at,{conditional:false}),
  ],'staff');
  const classification = await db.prepare("SELECT current_json FROM work_classifications WHERE workspace_id=? AND work_id=?").bind(ws, newId).first<{ current_json: string }>();
  const created = await getWork(ctx, newId);
  if (classification) await bindSlaPolicy(ctx, created, JSON.parse(classification.current_json));
  return readRelationships(ctx, newId);
}

export async function setParent(ctx: WorkContext, childId: string, input: { parentId?: unknown }) {
  await currentWorkPrincipal(ctx);
  agentOnly(ctx);
  const child = await getWork(ctx, childId), parentId = input.parentId ?? null;
  if (parentId !== null) {
    if (typeof parentId !== "string" || parentId === childId) throw new ApiError(422, "parent", "Choose another ticket as the parent");
    await getWork(ctx, parentId);
    if (await ctx.env.DB.prepare("WITH RECURSIVE up(id) AS (SELECT ? UNION SELECT w.parent_id FROM work_records w JOIN up ON w.id=up.id WHERE w.workspace_id=? AND w.parent_id IS NOT NULL) SELECT 1 FROM up WHERE id=?")
      .bind(parentId, ctx.principal.workspaceId, childId).first())
      throw new ApiError(422, "parent_cycle", "A ticket cannot be its own ancestor");
  }
  if(!workDepartmentStaff(ctx.principal,child))throw new ApiError(403,'department_staff','Current department staff authority required');
  const previous = (child as WorkRecord & { parent_id: string | null }).parent_id;
  if (parentId === previous) return readRelationships(ctx, childId);
  const at = now(), ws = ctx.principal.workspaceId;
  const [updated] = await departmentWorkBatch(ctx,child,[
    ctx.env.DB.prepare("UPDATE work_records SET parent_id=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?")
      .bind(parentId, at, ws, child.id, child.revision),
    ticketHistory(ctx,child,'work.parent_set',{parent:previous},{parent:parentId},at),
  ],'staff');
  if (!updated.meta.changes) throw new ApiError(409, "parent_conflict", "The ticket changed; refresh before setting its parent");
  return readRelationships(ctx, childId);
}

const targetQueries: Record<Exclude<LinkKind, "engineering_issue">, string> = {
  asset: "SELECT COALESCE(asset_tag,serial) label FROM work_assets WHERE workspace_id=? AND id=?",
  problem: "SELECT json_extract(data_json,'$.title') label FROM svc_records WHERE workspace_id=? AND id=? AND kind='problem'",
  change: "SELECT json_extract(data_json,'$.title') label FROM svc_records WHERE workspace_id=? AND id=? AND kind='change'",
  release: "SELECT json_extract(data_json,'$.title') label FROM svc_records WHERE workspace_id=? AND id=? AND kind='release'",
};
/** An engineering issue is an https URL kept as a reference; Linen does not sync it. */
export async function linkWork(ctx: WorkContext, workId: string, input: { kind?: unknown; targetId?: unknown }) {
  await currentWorkPrincipal(ctx);
  agentOnly(ctx);
  const work = await getWork(ctx, workId), kind = input.kind as LinkKind;
  if(!workDepartmentStaff(ctx.principal,work))throw new ApiError(403,'department_staff','Current department staff authority required');
  if (!linkKinds.includes(kind) || typeof input.targetId !== "string" || !input.targetId) throw new ApiError(422, "work_link", "Link an asset, problem, change, release or engineering-issue URL");
  if (kind === "engineering_issue") {
    let url: URL | null = null;
    try { url = new URL(input.targetId); } catch { /* refused below */ }
    if (!url || url.protocol !== "https:" || input.targetId.length > 500) throw new ApiError(422, "engineering_issue_url", "An engineering issue is an https URL");
  } else if (!(await ctx.env.DB.prepare(targetQueries[kind]).bind(ctx.principal.workspaceId, input.targetId).first()))
    throw new ApiError(422, "work_link_target", `No ${kind} ${input.targetId} in this workspace`);
  const at = now(), ws = ctx.principal.workspaceId;
  await departmentWorkBatch(ctx,work,[
    ctx.env.DB.prepare("INSERT OR IGNORE INTO work_links(id,workspace_id,work_id,kind,target_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id(), ws, work.id, kind, input.targetId, ctx.principal.userId, at),
    ticketHistory(ctx,work,'work.linked',null,kind==='engineering_issue'?{'engineering issue link':input.targetId}:{link:{kind,id:input.targetId}},at),
    ...(kind==='asset'?[historyEventStatement(ctx,{action:'work.asset_linked',target:input.targetId,assetId:input.targetId,workId:work.id,at,envelope:registeredHistory('work.asset_linked',{kind:'asset',id:input.targetId},null,{link:{kind:'ticket',id:work.id}},{kind:'person',id:ctx.principal.userId},[work.requester_id,work.beneficiary_id],historyProtection(work),at)})]:[]),
  ],'staff');
  return readRelationships(ctx, work.id);
}

export async function readRelationships(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  const work = await getWork(ctx, workId) as WorkRecord & { merged_into?: string | null; split_from?: string | null; parent_id?: string | null };
  const ws = ctx.principal.workspaceId, db = ctx.env.DB;
  const readable = async (ids: string[]) => (await Promise.all(ids.map((i) => db.prepare("SELECT id,title,state,sensitivity,requester_id,beneficiary_id,department_id,protected_departments_json FROM work_records WHERE workspace_id=? AND id=?").bind(ws, i).first<any>())))
    .filter((w) => w && workReadable(ctx.principal, w)).map((w) => ({ id: w.id, title: w.title, state: w.state }));
  const [links, merged, splits, children, participants] = await Promise.all([
    db.prepare("SELECT kind,target_id,created_at FROM work_links WHERE workspace_id=? AND work_id=? ORDER BY kind,created_at").bind(ws, workId).all<any>(),
    db.prepare("SELECT id FROM work_records WHERE workspace_id=? AND merged_into=?").bind(ws, workId).all<{ id: string }>(),
    db.prepare("SELECT id FROM work_records WHERE workspace_id=? AND split_from=?").bind(ws, workId).all<{ id: string }>(),
    db.prepare("SELECT id FROM work_records WHERE workspace_id=? AND parent_id=?").bind(ws, workId).all<{ id: string }>(),
    db.prepare("SELECT p.user_id,u.name,p.reason FROM work_participants p LEFT JOIN users u ON u.id=p.user_id WHERE p.workspace_id=? AND p.work_id=?").bind(ws, workId).all<any>(),
  ]);
  return {
    workId,
    mergedInto: work.merged_into ? (await readable([work.merged_into]))[0] ?? null : null,
    splitFrom: work.split_from ? (await readable([work.split_from]))[0] ?? null : null,
    parent: work.parent_id ? (await readable([work.parent_id]))[0] ?? null : null,
    mergedDuplicates: await readable(merged.results.map((r) => r.id)),
    splitInto: await readable(splits.results.map((r) => r.id)),
    children: await readable(children.results.map((r) => r.id)),
    participants: participants.results,
    links: await Promise.all(links.results.map(async (l) => ({ ...l, label: l.kind === "engineering_issue" ? l.target_id
      : (await db.prepare(targetQueries[l.kind as keyof typeof targetQueries]).bind(ws, l.target_id).first<{ label: string }>())?.label ?? null }))),
  };
}
/** Tickets linked to an asset, problem, change or release, limited to tickets the reader can already read. */
export async function linkedWork(ctx: WorkContext, kind: string, targetId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner", "operator", "auditor"]);
  if (!linkKinds.includes(kind as LinkKind)) throw new ApiError(422, "work_link", "Choose an asset, problem, change, release or engineering issue");
  const rows = (await ctx.env.DB.prepare("SELECT w.id,w.title,w.state,w.sensitivity,w.requester_id,w.beneficiary_id,w.department_id,w.protected_departments_json FROM work_links l JOIN work_records w ON w.workspace_id=l.workspace_id AND w.id=l.work_id WHERE l.workspace_id=? AND l.kind=? AND l.target_id=? ORDER BY l.created_at")
    .bind(ctx.principal.workspaceId, kind, targetId).all<any>()).results;
  return rows.filter((w) => workReadable(ctx.principal, w)).map((w) => ({ id: w.id, title: w.title, state: w.state }));
}
/** The public-only view a merged duplicate's requester gets of the surviving ticket. */
export async function participantView(ctx: WorkContext, workId: string) {
  const ws = ctx.principal.workspaceId;
  const work = await ctx.env.DB.prepare(`SELECT w.id,w.title,w.state,w.kind,w.created_at,w.updated_at,w.closed_at,w.revision FROM work_records w JOIN work_participants p ON p.workspace_id=w.workspace_id AND p.work_id=w.id WHERE w.workspace_id=? AND w.id=? AND w.sensitivity='normal' AND ${departmentNotHrSql('w')} AND p.user_id=?`)
    .bind(ws, workId, ctx.principal.userId).first<any>();
  if (!work) return null;
  // Public messages and status only: no attachments, private notes, context or progress detail.
  const messages = await ctx.env.DB.prepare("SELECT id,work_id,author_id,visibility,body,source_key,created_at FROM work_messages WHERE workspace_id=? AND work_id=? AND visibility='public' ORDER BY created_at,id").bind(ws, workId).all();
  return { work: { ...work, participant: true }, messages: messages.results, attachments: [], progress: [] };
}
