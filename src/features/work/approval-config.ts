import { ApiError, id, now } from '../../platform/http';
import type { WorkContext, WorkRecord } from './core';
import { currentWorkPrincipal } from './identity';
import { permit } from './core';
import { calendarFromRow, type BusinessCalendar } from './calendar';
import { normalizeCatalogForm } from './catalog-form-schema';

export interface StageApprover { type: 'application_owner' | 'group' | 'member'; groupId?: string; userId?: string }
export interface StageDef { key: string; name: string; mode: 'any' | 'all'; approvers: StageApprover[]; aboveCents: number | null; costField: string | null; remindHours: number | null; slaHours: number | null; calendar: BusinessCalendar; calendarId?: string; calendarRevision?: number }
export const stagesOf = (catalog: { approvals_json?: string }) => JSON.parse(catalog.approvals_json || '[]') as StageDef[];

export async function normalizeStages(ctx: WorkContext, input: unknown, form: { fields: { id: string; type: string }[] }, calendar: BusinessCalendar): Promise<StageDef[]> {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 8) throw new ApiError(422, 'approval_stages', 'At most 8 approval stages');
  const keys = new Set<string>(), stages: StageDef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['key', 'name', 'mode', 'approvers', 'aboveCents', 'costField', 'remindHours', 'slaHours', 'calendar'].includes(k)))
      throw new ApiError(422, 'approval_stages', 'A stage has a key, name, mode, approvers and optional aboveCents, costField, remindHours and slaHours');
    const s = raw as Record<string, any>;
    if (typeof s.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(s.key) || s.key === 'manager' || keys.has(s.key)) throw new ApiError(422, 'approval_stages', 'Each stage has its own key of lowercase letters, digits and underscores (not "manager")');
    if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 120) throw new ApiError(422, 'approval_stages', 'Each stage has a name of at most 120 characters');
    if (!['any', 'all'].includes(s.mode)) throw new ApiError(422, 'approval_stages', 'A stage is any-of or all-of');
    if (!Array.isArray(s.approvers) || !s.approvers.length || s.approvers.length > 20) throw new ApiError(422, 'approval_stages', 'A stage names 1 to 20 approvers');
    const approvers: StageApprover[] = [];
    for (const a of s.approvers) {
      if (!a || typeof a !== 'object' || !['application_owner', 'group', 'member'].includes(a.type) || Object.keys(a).some(k => !['type', 'groupId', 'userId'].includes(k)))
        throw new ApiError(422, 'approval_stages', 'An approver is the application owner, a group or a member');
      if (a.type === 'group' && !await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, a.groupId).first())
        throw new ApiError(422, 'approval_stages', 'A group approver names a group of this workspace');
      if (a.type === 'member' && !await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, a.userId).first())
        throw new ApiError(422, 'approval_stages', 'A member approver is an active member of this workspace');
      approvers.push(a.type === 'group' ? { type: 'group', groupId: a.groupId } : a.type === 'member' ? { type: 'member', userId: a.userId } : { type: 'application_owner' });
    }
    const whole = (v: unknown, name: string, max: number) => { if (v === undefined || v === null) return null; if (!Number.isSafeInteger(v) || (v as number) < 1 || (v as number) > max) throw new ApiError(422, 'approval_stages', `${name} is a whole number from 1 to ${max}`); return v as number; };
    const aboveCents = s.aboveCents === undefined || s.aboveCents === null ? null : Number.isSafeInteger(s.aboveCents) && s.aboveCents >= 0 && s.aboveCents <= 1_000_000_000 ? s.aboveCents as number : (() => { throw new ApiError(422, 'approval_stages', 'The threshold is whole USD cents'); })();
    const costField = s.costField ?? null;
    if (costField !== null && !form.fields.some(f => f.id === costField && f.type === 'number')) throw new ApiError(422, 'approval_stages', 'The cost field is a number question of this item');
    const remindHours = whole(s.remindHours, 'The reminder', 2000), slaHours = whole(s.slaHours, 'The SLA', 8000);
    if (remindHours !== null && slaHours !== null && remindHours > slaHours) throw new ApiError(422, 'approval_stages', 'The reminder comes before the SLA');
    keys.add(s.key);
    stages.push({ key: s.key, name: s.name.trim(), mode: s.mode, approvers, aboveCents, costField, remindHours, slaHours, calendar });
  }
  return stages;
}

export async function editApprovals(ctx: WorkContext, catalogId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx); permit(ctx, ['owner']);
  if (!Number.isInteger(input.revision)) throw new ApiError(422, 'catalog_revision', 'Current item revision required');
  const row = await ctx.env.DB.prepare('SELECT form_json,requires_manager FROM work_catalog WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, catalogId).first<{ form_json: string;requires_manager:number }>();
  if (!row) throw new ApiError(404, 'not_found', 'Catalog item not found');
  const calendarRow = await ctx.env.DB.prepare('SELECT * FROM work_calendars WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, input.calendarId ?? '').first<any>();
  if (!calendarRow) throw new ApiError(422, 'approval_calendar_required', 'Select an existing business calendar for approval reminders and SLA');
  const calendar = calendarFromRow(calendarRow);
  const stages = (await normalizeStages(ctx, input.approvals ?? [], normalizeCatalogForm(JSON.parse(row.form_json)), calendar)).map(s=>({...s,calendarId:String(input.calendarId),calendarRevision:calendarRow.revision}));
  if(input.manager!=null&&(!row.requires_manager || typeof input.manager!=='object'||Array.isArray(input.manager)||Object.keys(input.manager).some(k=>!['remindHours','slaHours'].includes(k))))throw new ApiError(422,'approval_manager_timing','Manager timing has only reminder and SLA business hours on a manager-required item');
  const manager = input.manager == null ? null : row.requires_manager ? (await normalizeStages(ctx,[{...(input.manager as object),key:'manager_timer',name:'Manager approval',mode:'any',approvers:[{type:'application_owner'}]}],normalizeCatalogForm(JSON.parse(row.form_json)),calendar))[0] : null;
  const managerConfig=manager?{...manager,key:'manager',calendarId:String(input.calendarId),calendarRevision:calendarRow.revision}:null;
  const results = await ctx.env.DB.batch([ctx.env.DB.prepare(`UPDATE work_catalog SET approvals_json=?,manager_approval_json=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`).bind(JSON.stringify(stages),managerConfig?JSON.stringify(managerConfig):null, ctx.principal.workspaceId, catalogId, input.revision,ctx.principal.workspaceId,ctx.principal.userId),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,'catalog.approvals_edited',?,?,? WHERE changes()=1").bind(id(), ctx.principal.workspaceId, ctx.principal.userId, catalogId, JSON.stringify({ fromRevision: input.revision, toRevision: Number(input.revision) + 1, manager:!!managerConfig, calendarId: input.calendarId, stages: stages.map(s => s.key) }), now())]);
  if (!results[0].meta.changes) throw new ApiError(409, 'catalog_changed', 'This item changed while you were filling it in. Review it and submit again.');
  return { id: catalogId, revision: Number(input.revision) + 1, approvals: stages };
}
