import {approvalCatalogSql,approvalCatalogBindings} from './approval-catalog-versions';
import {approvalCostCents,snapshotApprovalCosts,type ApprovalCostSnapshot} from './approval-cost';
import { now } from '../../platform/http';
import type { WorkContext, WorkRecord } from './core';
import {personForMember} from './person-binding';
import { resolveManager } from './delegation';
import { businessDue, type BusinessCalendar } from './calendar';
import { stagesOf, type StageDef } from './approval-config';

/** Business hours counted from `from`; never earlier than the instant itself. */
export const businessInstant = (calendar: BusinessCalendar, from: string, hours: number) => businessDue(from, hours * 60, calendar);

/** The cost a stage threshold is tested on: the requester's USD answer it names, else the item's recorded cost. Unknown applies. */
export function stageApplies(def: StageDef, snapshot: ApprovalCostSnapshot) {
  if (def.aboveCents === null) return true;
  const cents = snapshot.approvalAmounts?.[def.key]?.cents ?? approvalCostCents(def,snapshot);
  return cents === null || cents > def.aboveCents;
}
export interface PlannedStage { def: StageDef; ordinal: number; applies: boolean; activeAt: string | null; remindAt: string | null; slaAt: string | null }
/** The frozen stages of one submission; the first applicable stage opens now when no manager decision comes first. */
export async function planStages(ctx: WorkContext, catalog: { approvals_json?: string; requires_manager: number;manager_approval_json?:string|null }, snapshot: ApprovalCostSnapshot): Promise<PlannedStage[]> {
  const defs = stagesOf(catalog);
  snapshotApprovalCosts(defs,snapshot);
  const manager=catalog.requires_manager&&catalog.manager_approval_json?JSON.parse(catalog.manager_approval_json) as StageDef:null;
  const at = now();
  const groups=stageGroups(defs),applies=defs.map(def=>stageApplies(def,snapshot));
  const first=defs.findIndex((_,i)=>applies[i]),firstGroup=first<0?null:groups[first];
  const planned=defs.map((def,ordinal)=>({def,ordinal,applies:applies[ordinal],
    ...(applies[ordinal]&&!catalog.requires_manager&&groups[ordinal]===firstGroup?timers(def.calendar,def,at):{activeAt:null,remindAt:null,slaAt:null})}));
  return manager?[{def:manager,ordinal:-1,applies:true,...timers(manager.calendar,manager,at)},...planned]:planned;
}
/** Adjacent stages explicitly opening together form one group; the next serial stage waits for the whole group. */
const stageGroups=(defs:StageDef[])=>{let group=-1;return defs.map((def,i)=>{if(i===0||!def.withPrevious)group++;return group;});};
export const timers = (calendar: BusinessCalendar, def: StageDef, at: string) => ({ activeAt: at,
  remindAt: def.remindHours ? businessInstant(calendar, at, def.remindHours) : null, slaAt: def.slaHours ? businessInstant(calendar, at, def.slaHours) : null });
export const stageStatements = (ctx: WorkContext, workId: string, fulfilmentId: string, stages: PlannedStage[]) => stages.map(s => ctx.env.DB.prepare(
  `INSERT OR IGNORE INTO work_approval_stages(workspace_id,fulfilment_id,work_id,ordinal,stage_key,definition_json,applies,active_at,remind_at,sla_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
  .bind(ctx.principal.workspaceId, fulfilmentId, workId, s.ordinal, s.def.key, JSON.stringify(s.def), Number(s.applies), s.activeAt, s.remindAt, s.slaAt));

interface FulfilmentRow { id: string; revision: number; beneficiary_id: string; application_json?: string | null; work_id?: string }
/** Who may decide a stage now: resolved from current membership, never from what was true at submission. */
export async function stageApprovers(ctx: WorkContext, def: StageDef, f: FulfilmentRow, catalog: { id: string; owner_id: string }) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, users = new Set<string>();
  for (const a of def.approvers) {
    if (a.type === 'member') users.add(a.userId!);
    else if (a.type === 'group') for (const r of (await db.prepare('SELECT user_id FROM work_group_members WHERE workspace_id=? AND group_id=?').bind(w, a.groupId).all<{ user_id: string }>()).results) users.add(r.user_id);
    else if(a.type==='reviewed_manager'){const person=await personForMember(ctx,f.beneficiary_id);if(person?.manager_id)users.add(person.manager_id);}
    else { const app = f.application_json ? JSON.parse(f.application_json) : null;
      if(app?.applicationId){const current=await db.prepare("SELECT owner_id FROM svc_records WHERE workspace_id=? AND id=? AND kind='application'").bind(w,app.applicationId).first<{owner_id:string}>();if(current)users.add(current.owner_id);}
      else users.add(catalog.owner_id);
    }
  }
  for (const user of [...users]) { const holder=await resolveManager(ctx,user);if(holder!==user){users.delete(user);if(holder)users.add(holder);} }
  users.delete(f.beneficiary_id);
  const active = new Set((await db.prepare('SELECT user_id FROM memberships WHERE workspace_id=? AND active=1 AND user_id IN (SELECT value FROM json_each(?))').bind(w, JSON.stringify([...users])).all<{ user_id: string }>()).results.map(r => r.user_id));
  return [...users].filter(u => active.has(u)).sort();
}

export type StageState = 'skipped' | 'waiting' | 'pending' | 'approved' | 'rejected';
export interface StageStatus { key: string; name: string; mode: 'any' | 'all'; ordinal: number; applies: boolean; state: StageState; approvers: string[]; activeAt: string | null; remindAt: string | null; remindedAt: string | null; slaAt: string | null; breachedAt: string | null;
  decisions: { approverId: string; decision: string; comment: string | null; channel: string; at: string }[] }
/** The chain after the manager. `managerApproved` is the manager stage's current state (true when none is required). */
export async function chainStatus(ctx: WorkContext, work: Pick<WorkRecord, 'id' | 'revision'>, catalog: { id: string; owner_id: string; revision: number; approvals_json?: string }, f: FulfilmentRow, managerApproved: boolean, preview?:{stageKey:string;approverId:string;decision:string}) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId;
  const rows = (await db.prepare("SELECT * FROM work_approval_stages WHERE workspace_id=? AND fulfilment_id=? AND stage_key<>'manager' ORDER BY ordinal").bind(w, f.id).all<any>()).results;
  const decisions = (await db.prepare(`SELECT stage_key,approver_id,decision,comment,channel,created_at FROM work_approval_decisions WHERE workspace_id=? AND fulfilment_id=?
    AND inert=0 AND work_revision=? AND fulfilment_revision=? AND ${approvalCatalogSql('work_approval_decisions')} ORDER BY created_at,rowid`).bind(w, f.id, work.revision, f.revision, ...approvalCatalogBindings(catalog.revision)).all<any>()).results;
  if(preview)decisions.push({stage_key:preview.stageKey,approver_id:preview.approverId,decision:preview.decision,comment:null,channel:'portal',created_at:now()});
  const groups=stageGroups(rows.map(row=>JSON.parse(row.definition_json)));
  let prior = managerApproved,group=-1,groupSatisfied=true; const stages: StageStatus[] = [];
  for (const [index,row] of rows.entries()) {
    if(groups[index]!==group){if(group>=0)prior=prior&&groupSatisfied;group=groups[index];groupSatisfied=true;}
    const def = JSON.parse(row.definition_json) as StageDef, mine = decisions.filter(d => d.stage_key === def.key);
    const base = { key: def.key, name: def.name, mode: def.mode, ordinal: row.ordinal, applies: row.applies === 1, activeAt: row.active_at, remindAt: row.remind_at, remindedAt: row.reminded_at, slaAt: row.sla_at, breachedAt: row.breached_at };
    if (!row.applies) { stages.push({ ...base, state: 'skipped', approvers: [], decisions: [] }); continue; }
    const approvers = await stageApprovers(ctx, def, f, catalog);
    const approved = new Set(mine.filter(d => d.decision === 'approved' && approvers.includes(d.approver_id)).map(d => d.approver_id));
    // Decisions were authorized when recorded. Withdrawal can invalidate an approval, but cannot erase a final
    // rejection of this exact revision; only a revised request opens a fresh decision.
    const rejected = mine.some(d => d.decision === 'rejected');
    const satisfied = def.mode === 'any' ? approved.size >= 1 : approvers.length > 0 && approvers.every(a => approved.has(a));
    const state: StageState = rejected ? 'rejected' : !prior ? 'waiting' : satisfied ? 'approved' : 'pending';
    stages.push({ ...base, state, approvers, decisions: mine.map(d => ({ approverId: d.approver_id, decision: d.decision, comment: d.comment, channel: d.channel, at: d.created_at })) });
    groupSatisfied = groupSatisfied && satisfied && !rejected;
  }
  const open = stages.find(s => s.applies && s.state !== 'approved');
  const rejected=stages.some(s=>s.state==='rejected');
  const pendingStages=rejected?[]:stages.filter(s=>s.state==='pending');
  return { stages, satisfied: managerApproved && !open, rejected,pendingStages };
}

/** Open every newly ready stage together, with each stage's own frozen business calendar and offsets. */
export async function activateStageStatements(ctx:WorkContext,fulfilmentId:string,stages:Pick<StageStatus,'key'|'activeAt'>[],at:string){
 const statements:D1PreparedStatement[]=[];
 for(const stage of stages.filter(s=>!s.activeAt)){
  const row=await ctx.env.DB.prepare('SELECT definition_json FROM work_approval_stages WHERE workspace_id=? AND fulfilment_id=? AND stage_key=?').bind(ctx.principal.workspaceId,fulfilmentId,stage.key).first<{definition_json:string}>();
  if(!row)continue;
  const def=JSON.parse(row.definition_json) as StageDef,tm=timers(def.calendar,def,at);
  statements.push(ctx.env.DB.prepare('UPDATE work_approval_stages SET active_at=?,remind_at=?,sla_at=? WHERE workspace_id=? AND fulfilment_id=? AND stage_key=? AND active_at IS NULL').bind(tm.activeAt,tm.remindAt,tm.slaAt,ctx.principal.workspaceId,fulfilmentId,stage.key));
 }
 return statements;
}
