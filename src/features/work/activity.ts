import { workPrivateReadable } from './scope';
import { approvalActivity } from './approval-activity';
import { conversation, getWork, operator, type WorkContext } from './core';

export interface ActivityEntry {
  id: string;
  at: string;
  kind: 'message' | 'change' | 'notification';
  actor: string;
  initiatedBy?: string;
  actorKind: 'person' | 'rule' | 'scenario' | 'agent' | 'automation';
  action: string;
  visibility: string;
  body?: string;
  changes: { field: string; before: unknown; after: unknown }[];
}
type Audit = { id: string; actor_id: string; actor_name: string; action: string; detail_json: string; created_at: string };
const actions = ['work.classification_overridden', 'work.classification_proposed', 'work.routed', 'work.group_set',
  'work.department_handed_off', 'work.assigned', 'work.scenario_run', 'work.field_set', 'work.transitioned',
  'work.merged', 'work.duplicate_merged', 'work.split', 'work.split_created', 'work.parent_set', 'work.linked', 'catalog.quote_attached'];

function changes(event: Audit, detail: Record<string, any>): ActivityEntry['changes'] {
  if(event.action==='work.department_handed_off')return [{field:'department workspace',before:detail.from,after:detail.to}];
  if (['work.scenario_run', 'work.merged', 'work.duplicate_merged', 'work.split', 'work.split_created', 'work.parent_set', 'work.linked'].includes(event.action)) return (detail.changes ?? []).map(({ field, before, after }: any) => ({ field, before, after }));
  if (event.action === 'work.field_set') return Object.hasOwn(detail, 'before')
    ? [{ field: detail.field, before: detail.before, after: detail.value }] : [];
  if (event.action === 'work.group_set') return Object.hasOwn(detail, 'to') ? [{ field: 'group', before: detail.from, after: detail.to }] : [];
  const before = detail.before ?? detail.from, after = detail.after ?? detail.to;
  if (!after || typeof after !== 'object') return [];
  return Object.keys(after).filter(field => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after[field]))
    .map(field => ({ field, before: before?.[field] ?? null, after: after[field] }));
}

/** DESK-017 ticket slice: existing conversation visibility and stricter operator-only audit access.
 * No raw audit payload or imported-source custody is exposed through this read model. */
export async function ticketActivity(ctx: WorkContext, workId: string) {
  const view = await conversation(ctx, workId);
  const automation = (await ctx.env.DB.prepare(`SELECT a.user_id,CASE WHEN EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=a.workspace_id AND e.person_id=a.user_id)
    OR EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=a.workspace_id AND e.user_id=a.user_id)
    THEN 'Erased automation principal' ELSE a.name END name FROM execution_automation_principals a
    WHERE a.workspace_id=? AND a.user_id IN(SELECT value FROM json_each(?))`)
    .bind(ctx.principal.workspaceId,JSON.stringify(view.messages.map((m: any) => m.author_id))).all<{user_id:string;name:string}>()).results;
  const authors = new Map(automation.map(a => [a.user_id,a.name]));
  const items: ActivityEntry[] = view.messages.map((message: any) => ({
    id: message.id, at: message.created_at, kind: 'message', actor: authors.get(message.author_id) ?? message.author_id, actorKind: authors.has(message.author_id) ? 'automation' : 'person',
    action: message.source_key?.startsWith('transition:') ? 'Public status update' : 'Message',
    visibility: message.visibility, body: message.body, changes: [],
  }));
  // A shared/participant view does not grant the agent's full ticket scope.
  if (operator(ctx.principal) && workPrivateReadable(ctx.principal,view.work) && !('access' in view.work)) {
    await getWork(ctx, workId);
    const rows = (await ctx.env.DB.prepare(`SELECT e.*,CASE WHEN EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=e.workspace_id AND p.user_id=e.actor_id) THEN '[erased]' ELSE COALESCE(u.name,e.actor_id) END actor_name FROM audit_events e
      LEFT JOIN users u ON u.id=e.actor_id WHERE e.workspace_id=? AND e.target=?
      AND e.action IN (${actions.map(() => '?').join(',')}) ORDER BY e.created_at,e.rowid`)
      .bind(ctx.principal.workspaceId, workId, ...actions).all<Audit>()).results;
    for (const event of rows) {
      const detail = JSON.parse(event.detail_json);
      const actorKind = event.action === 'work.scenario_run' ? 'scenario' : event.action === 'work.routed' ? 'rule'
        : event.action === 'work.classification_proposed' ? 'agent' : 'person';
      items.push({ id: event.id, at: event.created_at, kind: 'change', actor: actorKind === 'scenario' ? detail.name ?? 'Scenario' : actorKind === 'rule' ? detail.ruleId ?? 'Support group routing' : actorKind === 'agent' ? 'Linen' : event.actor_name, actorKind,
        ...(actorKind !== 'person' ? { initiatedBy: event.actor_name } : {}),
        action: event.action === 'catalog.quote_attached' ? 'Quote attached' : event.action.replace('work.', '').replaceAll('_', ' '), visibility: 'private', changes: changes(event, detail),
        ...(actorKind === 'scenario' && detail.name ? { body: detail.name } : {}),
      });
    }
    items.push(...await approvalActivity(ctx, workId));
    const deliveries = (await ctx.env.DB.prepare(`SELECT o.id,o.created_at,o.state,o.actor_id,e.id event_id,e.event,e.created_at event_at
      FROM execution_outbox o LEFT JOIN execution_delivery_events e ON e.workspace_id=o.workspace_id AND e.outbox_id=o.id
      WHERE o.workspace_id=? AND o.work_id=? ORDER BY COALESCE(e.created_at,o.created_at),o.rowid,e.rowid`)
      .bind(ctx.principal.workspaceId, workId).all<any>()).results;
    for (const delivery of deliveries) items.push({ id: delivery.event_id ?? delivery.id, at: delivery.event_at ?? delivery.created_at,
      kind: 'notification', actor: delivery.actor_id, actorKind: 'person', action: 'Notification', visibility: 'private',
      body: `Delivery state: ${delivery.event ?? delivery.state}`, changes: [] });
  }
  return { items: items.sort((a, b) => a.at.localeCompare(b.at)) };
}
