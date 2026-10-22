import { ApiError, id, now } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { attributeDimensions, normalizeAttributes, type AttributeDimension } from './catalog-audience';
import { normalizeMatch, type PolicyMatch } from './access-policies';

/**
 * LIFE-002: a template names the join, move or leave it serves, the reviewed values (department, location, role =
 * title, employment type) it matches, and dated tasks for a team, the person's manager or the accountable owner.
 * Every active template whose named values all match applies; a template that names none applies to everyone.
 * Due dates are whole business days from the start or end of the change; a reminder is whole business days
 * before the due date. Only the owner writes templates; owner and HR read them.
 */
export const templateKinds = ['join', 'move', 'leave'] as const;
export type TemplateAssignee = { type: 'group'; groupId: string } | { type: 'manager' } | { type: 'owner' };
export interface TemplateTask { key: string; title: string; assignee: TemplateAssignee; anchor: 'start' | 'end'; offsetDays: number; remindDays: number | null }
export interface TemplateRow { id: string; name: string; kind: string; match_json: string; tasks_json: string; active: number; revision: number }
export const parseTemplate = (row: TemplateRow) => ({
  id: row.id, name: row.name, kind: row.kind as typeof templateKinds[number], active: row.active === 1, revision: row.revision,
  match: JSON.parse(row.match_json) as PolicyMatch, tasks: JSON.parse(row.tasks_json) as TemplateTask[],
});
export type Template = ReturnType<typeof parseTemplate>;

export async function normalizeTasks(ctx: WorkContext, input: unknown): Promise<TemplateTask[]> {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30)
    throw new ApiError(422, 'lifecycle_template_tasks', 'One to 30 dated tasks required');
  const keys = new Set<string>(), tasks: TemplateTask[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['key', 'title', 'assignee', 'anchor', 'offsetDays', 'remindDays'].includes(k)))
      throw new ApiError(422, 'lifecycle_template_tasks', 'A task has a key, title, assignee, anchor, offsetDays and optional remindDays');
    const t = raw as Record<string, any>;
    if (typeof t.key !== 'string' || !/^[a-z][a-z0-9_]{0,39}$/.test(t.key) || keys.has(t.key))
      throw new ApiError(422, 'lifecycle_template_tasks', 'Each task has a distinct key of lowercase letters, digits and underscores');
    if (typeof t.title !== 'string' || !t.title.trim() || t.title.length > 200)
      throw new ApiError(422, 'lifecycle_template_tasks', 'Each task has a title of at most 200 characters');
    if (!['start', 'end'].includes(t.anchor)) throw new ApiError(422, 'lifecycle_template_tasks', 'A task is dated from the start or the end');
    if (!Number.isInteger(t.offsetDays) || t.offsetDays < -120 || t.offsetDays > 365)
      throw new ApiError(422, 'lifecycle_template_tasks', 'The due offset is a whole number of business days from -120 to 365');
    if (t.remindDays !== undefined && t.remindDays !== null && (!Number.isInteger(t.remindDays) || t.remindDays < 0 || t.remindDays > 60))
      throw new ApiError(422, 'lifecycle_template_tasks', 'The reminder is 0 to 60 business days before the due date, or none');
    const a = t.assignee;
    if (!a || typeof a !== 'object' || !['group', 'manager', 'owner'].includes(a.type) || Object.keys(a).some(k => !['type', 'groupId'].includes(k)) || (a.type === 'group') !== (typeof a.groupId === 'string'))
      throw new ApiError(422, 'lifecycle_template_tasks', 'A task is for a team (group), the manager or the accountable owner');
    if (a.type === 'group' && !await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, a.groupId).first())
      throw new ApiError(422, 'lifecycle_template_tasks', 'A team task names a team of this workspace');
    keys.add(t.key);
    tasks.push({ key: t.key, title: t.title.trim(), assignee: a.type === 'group' ? { type: 'group', groupId: a.groupId } : { type: a.type }, anchor: t.anchor, offsetDays: t.offsetDays, remindDays: t.remindDays ?? null });
  }
  return tasks;
}

export async function listTemplates(ctx: WorkContext, activeOnly = false) {
  const rows = await ctx.env.DB.prepare(`SELECT id,name,kind,match_json,tasks_json,active,revision FROM work_lifecycle_templates
    WHERE workspace_id=? ${activeOnly ? 'AND active=1' : ''} ORDER BY name,id`).bind(ctx.principal.workspaceId).all<TemplateRow>();
  return rows.results.map(parseTemplate);
}

const matches = (match: PolicyMatch, values: Partial<Record<AttributeDimension, string>>) =>
  attributeDimensions.every(d => !match[d]?.length || (values[d] !== undefined && match[d]!.includes(values[d]!)));
export const matchingTemplates = (templates: Template[], kind: string, values: Partial<Record<AttributeDimension, string>>) =>
  templates.filter(t => t.kind === kind && matches(t.match, values));

/** The same string the committing batch compares, so a template edit during admission refuses the record. */
export const templateFingerprint = (templates: { id: string; revision: number }[]) =>
  [...templates].sort((a, b) => a.id < b.id ? -1 : 1).map(t => `${t.id}:${t.revision}`).join(',');
export const templateGuardSql = `IFNULL((SELECT group_concat(id||':'||revision,',') FROM (SELECT id,revision FROM work_lifecycle_templates WHERE workspace_id=? AND active=1 ORDER BY id)),'')=?`;

/** The reviewed values a template is matched on: the HR baseline when the admission names one, else the person's own reviewed facts. */
export function valuesFor(person: { attributes_json?: string; effective_at?: string }, kind: string, baseline: { from?: unknown; to?: unknown } | undefined) {
  if (baseline) return normalizeAttributes(kind === 'leave' ? baseline.from : baseline.to);
  return person.effective_at && Date.parse(person.effective_at) <= Date.now() ? normalizeAttributes(JSON.parse(person.attributes_json ?? '{}')) : {};
}

export async function saveTemplate(ctx: WorkContext, input: { templateId?: string; revision?: number; name: unknown; kind: unknown; match: unknown; tasks: unknown; active?: unknown }) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const name = typeof input.name === 'string' && input.name.trim() && input.name.length <= 200 ? input.name.trim() : null;
  if (!name) throw new ApiError(422, 'lifecycle_template_name', 'A template name of at most 200 characters is required');
  if (!templateKinds.includes(input.kind as never)) throw new ApiError(422, 'lifecycle_template_kind', 'A template serves a join, a move or a leave');
  const match = normalizeMatch(input.match), tasks = await normalizeTasks(ctx, input.tasks), w = ctx.principal.workspaceId, templateId = input.templateId ?? id(), at = now();
  const guardId = id(), values = attributeDimensions.flatMap(d => (match[d] ?? []).map(v => [d, v]));
  const guard = values.map(() => 'EXISTS(SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=? AND active=1)').join(' AND ') || '1';
  const ownerSql = "EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')";
  const editing = input.templateId !== undefined;
  if (editing && (!Number.isSafeInteger(input.revision) || typeof input.active !== 'boolean'))
    throw new ApiError(422, 'lifecycle_template_revision', 'Current revision and explicit active flag required');
  const before = editing ? await ctx.env.DB.prepare('SELECT * FROM work_lifecycle_templates WHERE workspace_id=? AND id=?').bind(w, templateId).first<TemplateRow>() : null;
  if (editing && !before) throw new ApiError(404, 'not_found', 'Lifecycle template not found');
  const detail = (t: { kind: unknown; match: PolicyMatch; tasks: TemplateTask[]; active: boolean; revision: number }) => ({ revision: t.revision, active: t.active, kind: t.kind, match: t.match, tasks: t.tasks.map(x => x.key) });
  const active = editing ? Boolean(input.active) : true, revision = editing ? Number(input.revision) + 1 : 1;
  try {
    const result = await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${guard} AND ${ownerSql} THEN 1 ELSE 0 END)`)
        .bind(guardId, ...values.flatMap(([d, v]) => [w, d, v]), w, ctx.principal.userId),
      editing
        ? ctx.env.DB.prepare('UPDATE work_lifecycle_templates SET name=?,kind=?,match_json=?,tasks_json=?,active=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?')
          .bind(name, input.kind, JSON.stringify(match), JSON.stringify(tasks), Number(active), at, w, templateId, input.revision)
        : ctx.env.DB.prepare('INSERT INTO work_lifecycle_templates(id,workspace_id,name,kind,match_json,tasks_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
          .bind(templateId, w, name, input.kind, JSON.stringify(match), JSON.stringify(tasks), at, at),
      ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
        .bind(id(), w, ctx.principal.userId, editing ? 'lifecycle_template.edited' : 'lifecycle_template.created', templateId,
          JSON.stringify({ before: before ? detail(parseTemplate(before)) : null, after: detail({ kind: input.kind, match, tasks, active, revision }) }), at),
      ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guardId),
    ]);
    if (!result[1].meta.changes) throw new ApiError(409, 'revision_conflict', 'This template changed; reload it and review again');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (/CHECK constraint/.test(String(error))) throw new ApiError(409, 'lifecycle_template_changed', 'Choose active values from this workspace; owner authority or a value changed');
    throw error;
  }
  return parseTemplate((await ctx.env.DB.prepare('SELECT * FROM work_lifecycle_templates WHERE workspace_id=? AND id=?').bind(w, templateId).first<TemplateRow>())!);
}
