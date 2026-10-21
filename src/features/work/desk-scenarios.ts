import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { appendMessage, getWork, permit, transitionWork, type WorkContext } from './core';
import { overrideClassification, readClassification } from './classification';
import { readWorkDesk, setWorkField } from './desk-fields';
import { groupMember, setWorkGroup } from './desk-groups';
import { prepareScenarioPlan, applyScenarioPlan, type ScenarioPlan } from './desk-scenario-plans';
import { insertCannedResponse } from './canned-responses';

/** DESK-015: named scenarios, each scoped to its author, one agent group or the workspace. Running one checks every
 * step against the runner's roles before any change, applies the steps in a fixed order (classification, group and
 * owner, fields, message, status) and records one audit entry listing each change's before and after. */
type Scope = 'author' | 'group' | 'workspace';
interface Steps {
  taskPlan?: ScenarioPlan;
  classification?: Record<string, unknown>;
  group?: { groupId: string; assigneeId?: string | null };
  fields?: { fieldId: string; value: string }[];
  message?: { visibility: 'public' | 'private'; templateId?: string; body?: string };
  status?: { command: 'pause' | 'resume' | 'close'; reason: string; statusId?: string; waitingOn?: string; resolutionCode?: string };
}
interface ScenarioRow { id: string; name: string; scope: Scope; group_id: string | null; author_id: string; steps_json: string; revision: number }
const agents = ['owner', 'operator', 'hr'];
/** The roles each step needs: the same roles its single-ticket door permits. */
const stepRoles: Record<keyof Steps, string[]> = {
  taskPlan: ['owner', 'operator'], classification: ['owner', 'operator'], group: ['owner', 'operator'], fields: agents, message: ['owner', 'operator'], status: agents,
};
const scenario = (r: ScenarioRow) => ({ id: r.id, name: r.name, scope: r.scope, groupId: r.group_id, authorId: r.author_id, steps: JSON.parse(r.steps_json) as Steps, revision: r.revision });

function validSteps(input: unknown): Steps {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(422, 'scenario_steps', 'Give the scenario its steps');
  const s = input as Record<string, any>, steps: Steps = {};
  if (Object.keys(s).some((k) => !Object.hasOwn(stepRoles, k))) throw new ApiError(422, 'scenario_steps', 'Steps are classification, group, fields, message, status and taskPlan');
  if (s.classification !== undefined) steps.classification = s.classification;
  if (s.group !== undefined) steps.group = { groupId: requiredString(s.group?.groupId, 'groupId'), ...(s.group.assigneeId !== undefined ? { assigneeId: s.group.assigneeId } : {}) };
  if (s.fields !== undefined) {
    if (!Array.isArray(s.fields) || !s.fields.length || s.fields.length > 20) throw new ApiError(422, 'scenario_fields', 'Set 1 to 20 fields');
    steps.fields = s.fields.map((f: any) => ({ fieldId: requiredString(f?.fieldId, 'fieldId'), value: typeof f?.value === 'string' ? f.value : '' }));
  }
  if (s.message !== undefined) {
    if (!['public', 'private'].includes(s.message?.visibility) || (!s.message.templateId === !s.message.body))
      throw new ApiError(422, 'scenario_message', 'A message is public or private, from a canned response or its own text');
    steps.message = { visibility: s.message.visibility, ...(s.message.templateId ? { templateId: requiredString(s.message.templateId, 'templateId') } : { body: requiredString(s.message.body, 'body', 10000) }) };
  }
  if (s.status !== undefined) {
    if (!['pause', 'resume', 'close'].includes(s.status?.command)) throw new ApiError(422, 'scenario_status', 'A status step pauses, resumes or closes');
    steps.status = { ...s.status, reason: requiredString(s.status.reason, 'reason', 2000) };
  }
  if (s.taskPlan !== undefined) steps.taskPlan = s.taskPlan;
  if (!Object.keys(steps).length) throw new ApiError(422, 'scenario_steps', 'A scenario needs at least one step');
  return steps;
}

/** Agents save scenarios for themselves or for a group they belong to; only the owner (acting for admin) saves workspace ones. */
export async function saveScenario(ctx: WorkContext, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  const name = requiredString(body.name, 'name', 120), scope = body.scope as Scope;
  if (!['author', 'group', 'workspace'].includes(scope)) throw new ApiError(422, 'scenario_scope', 'A scenario belongs to its author, a group or the workspace');
  if (scope === 'workspace') permit(ctx, ['owner']);
  const groupId = scope === 'group' ? requiredString(body.groupId, 'groupId') : null;
  if (groupId && !await groupMember(ctx, groupId, ctx.principal.userId) && !ctx.principal.roles.includes('owner'))
    throw new ApiError(403, 'not_group_member', 'Save group scenarios for a group you belong to');
  if (groupId && !await ctx.env.DB.prepare('SELECT 1 FROM work_groups WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, groupId).first())
    throw new ApiError(422, 'group_not_found', 'Agent group not found');
  const steps = validSteps(body.steps), scenarioId = id(), t = now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO work_scenarios(id,workspace_id,name,scope,group_id,author_id,steps_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(scenarioId, ctx.principal.workspaceId, name, scope, groupId, ctx.principal.userId, JSON.stringify(steps), t),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.scenario_saved', scenarioId, JSON.stringify({ name, scope, groupId, steps }), t),
  ]);
  return { id: scenarioId, name, scope, groupId, authorId: ctx.principal.userId, steps, revision: 1 };
}

/** The scenarios offered to the reader: their own, their groups' and the workspace's. */
export async function listScenarios(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, agents);
  const rows = (await ctx.env.DB.prepare(`SELECT * FROM work_scenarios s WHERE s.workspace_id=? AND (s.scope='workspace' OR (s.scope='author' AND s.author_id=?)
      OR (s.scope='group' AND EXISTS(SELECT 1 FROM work_group_members m WHERE m.workspace_id=s.workspace_id AND m.group_id=s.group_id AND m.user_id=?)))
    ORDER BY s.name,s.id`).bind(ctx.principal.workspaceId, ctx.principal.userId, ctx.principal.userId).all<ScenarioRow>()).results;
  return { items: rows.map(scenario) };
}

async function offered(ctx: WorkContext, scenarioId: string) {
  const found = (await listScenarios(ctx)).items.find((s) => s.id === scenarioId);
  if (!found) throw new ApiError(404, 'scenario_not_found', 'This scenario is not offered to you');
  return found;
}

/** Runs one offered scenario on one ticket at the revision the runner read. */
export async function runScenario(ctx: WorkContext, workId: string, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  const s = await offered(ctx, requiredString(body.scenarioId, 'scenarioId'));
  const refused = (Object.keys(s.steps) as (keyof Steps)[]).filter((step) => !ctx.principal.roles.some((r) => stepRoles[step].includes(r)));
  if (refused.length) throw new ApiError(403, 'scenario_step_forbidden', `Your role cannot ${refused.join(', ')}; nothing was applied`);
  let work = await getWork(ctx, workId);
  if (typeof body.revision === 'number' && body.revision !== work.revision) throw new ApiError(409, 'revision_conflict', 'Work changed; refresh before running a scenario');
  const taskPlan = s.steps.taskPlan ? await prepareScenarioPlan(ctx, work, s.steps.taskPlan) : null;
  const changes: { step: string; field: string; before: unknown; after: unknown }[] = [];
  const recordRun = async (errorCode?: string) => ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.scenario_run', workId,
      JSON.stringify({ scenarioId: s.id, name: s.name, changes, ...(errorCode ? { errorCode } : {}) }), now()).run();
  try {
  if (s.steps.classification) {
    const current = await readClassification(ctx, workId), after = { ...(current.current ?? {}), ...s.steps.classification };
    const next = await overrideClassification(ctx, workId, { ...after, revision: current.revision, workRevision: current.workRevision, reason: `Scenario: ${s.name}` });
    for (const key of Object.keys(s.steps.classification)) changes.push({ step: 'classification', field: key, before: (current.current as any)?.[key] ?? null, after: (next.current as any)?.[key] ?? null });
  }
  if (s.steps.group) {
    work = await getWork(ctx, workId);
    const changed = await setWorkGroup(ctx, workId, { ...s.steps.group, revision: work.revision });
    changes.push({ step: 'group', field: 'group', before: work.group_id ?? null, after: changed.group_id ?? null });
    changes.push({ step: 'group', field: 'owner', before: work.assignee_id, after: changed.assignee_id });
  }
  for (const f of s.steps.fields ?? []) {
    const before = (await readWorkDesk(ctx, workId)).fields.find((x) => x.id === f.fieldId);
    const after = (await setWorkField(ctx, workId, f)).fields.find((x) => x.id === f.fieldId);
    changes.push({ step: 'fields', field: after?.name ?? f.fieldId, before: before?.value ?? null, after: after?.value ?? null });
  }
  if (s.steps.message) {
    const m = s.steps.message;
    const text = m.templateId
      ? (await insertCannedResponse(ctx, workId, { templateId: m.templateId, revision: (await ctx.env.DB.prepare('SELECT revision FROM work_canned_responses WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, m.templateId).first<{ revision: number }>())?.revision })).text
      : m.body!;
    await appendMessage(ctx, { workId, body: text, visibility: m.visibility, sourceMessageId: `scenario:${s.id}:${id()}` });
    changes.push({ step: 'message', field: m.visibility === 'private' ? 'private note' : 'public reply', before: null, after: 'added' });
  }
  if (s.steps.status) {
    const st = s.steps.status;
    work = await getWork(ctx, workId);
    const changed = await transitionWork(ctx, workId, work.revision, st.command, st.reason, undefined, st.waitingOn, { resolutionCode: st.resolutionCode, statusId: st.statusId });
    changes.push({ step: 'status', field: 'state', before: work.state, after: changed.state });
  }
  if (taskPlan) {
    await applyScenarioPlan(ctx, workId, taskPlan, { scenarioId: s.id, name: s.name });
    changes.push({ step: 'taskPlan', field: 'task plan', before: null, after: taskPlan.id });
  }
  } catch (error) {
    await recordRun(error instanceof ApiError ? error.code : 'scenario_failed');
    throw error;
  }
  await recordRun();
  return { scenario: { id: s.id, name: s.name }, changes, work: await getWork(ctx, workId) };
}

/** A scenario's runs on a ticket, each one audit entry listing its changes; agents only. */
export async function scenarioRuns(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  permit(ctx, agents);
  await getWork(ctx, workId);
  const rows = (await ctx.env.DB.prepare("SELECT actor_id,detail_json,created_at FROM audit_events WHERE workspace_id=? AND target=? AND action='work.scenario_run' ORDER BY created_at,rowid")
    .bind(ctx.principal.workspaceId, workId).all<{ actor_id: string; detail_json: string; created_at: string }>()).results;
  return { items: rows.map((r) => ({ actorId: r.actor_id, at: r.created_at, ...JSON.parse(r.detail_json) })) };
}
