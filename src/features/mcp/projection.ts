import type { Env } from '../../platform/types';
import { ApiError, now } from '../../platform/http';
import { categories, levels, ticketTypes } from '../work/classification-policy';
import { slaFor } from '../work/sla-policies';
import type { SlaTargetState } from '../work/sla-clock';
import { classifiedDropdowns, dropdownValue, type ClassifiedDropdown } from './field-classification';

interface Reader { workspace_id: string; principal_id: string }
interface Message { id: string; author_id: string | null; visibility: string; body: string; created_at: string }
interface Audit { id: string; actor: string | null; action: string; detail_json: string; created_at: string }
interface Change { field: string; before: unknown; after: unknown; custom?: boolean }
interface SafeChange { field: string; field_id?: string; before: string | null; after: string | null }
const actions = ['work.classification_overridden', 'work.classification_proposed', 'work.routed', 'work.group_set',
  'work.assigned', 'work.scenario_run', 'work.field_set', 'work.transitioned',
  'work.merged', 'work.duplicate_merged', 'work.split', 'work.split_created', 'work.parent_set', 'work.linked'];
const arrayChanges = ['work.scenario_run', 'work.merged', 'work.duplicate_merged', 'work.split',
  'work.split_created', 'work.parent_set', 'work.linked'];

/** Projection is not authorization: callers must first check live credentials,
 * queue grants (or own-created get/search), erasure/withholding and sensitivity,
 * then recheck those boundaries after asynchronous reads and at each commit. */
function recordBoundary(credential: Reader, row: any) {
  if (!row || row.workspace_id !== credential.workspace_id || row.sensitivity !== 'normal')
    throw new ApiError(404, 'not_found', 'Ticket not found');
}
const selected = (value: unknown, allowed: readonly string[]) =>
  typeof value === 'string' && allowed.includes(value) ? value : null;
const scalar = (value: unknown) => typeof value === 'string' ? value : null;
function fieldsFor(fields: ClassifiedDropdown[], kind: string) {
  const type = kind === 'request' ? 'service_request' : kind;
  return fields.filter(field => (JSON.parse(field.kinds_json) as string[]).includes(type));
}

async function messages(env: Env, credential: Reader, workId: string): Promise<Message[]> {
  return (await env.DB.prepare(`SELECT m.id,CASE WHEN m.author_id='[erased]'
      OR EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=m.workspace_id AND e.user_id=m.author_id)
      OR EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=m.workspace_id AND e.person_id=m.author_id)
      THEN NULL ELSE m.author_id END author_id,m.visibility,m.body,m.created_at
    FROM work_messages m WHERE m.workspace_id=? AND m.work_id=?
      AND (m.visibility='public' OR (m.visibility='private' AND m.author_id=?)) ORDER BY m.created_at,m.rowid`)
    .bind(credential.workspace_id, workId, credential.principal_id).all<Message>()).results;
}

function target(value: SlaTargetState) {
  return { target: value.target, startedAt: value.startedAt, dueAt: value.dueAt, metAt: value.metAt,
    state: value.state, breachedAt: value.breachedAt };
}
async function safeSla(env: Env, credential: Reader, row: any) {
  // Reuse the native arithmetic; its internal message metadata, policy name,
  // calendar/location and named custom statuses never leave this projection.
  const sla = await slaFor({ env, principal: { workspaceId: credential.workspace_id,
    userId: credential.principal_id, roles: ['integration'] } }, row, now());
  if (!sla) return null;
  return {
    policy: { id: sla.policy.id, revision: sla.policy.revision, hours: sla.policy.hours,
      firstResponseMinutes: sla.policy.firstResponseMinutes, nextResponseMinutes: sla.policy.nextResponseMinutes,
      resolutionMinutes: sla.policy.resolutionMinutes, pauseOn: sla.policy.pauseOn.filter(value => ['requester', 'vendor'].includes(value)),
      boundAt: sla.policy.boundAt },
    firstResponse: target(sla.firstResponse), nextResponses: sla.nextResponses.map(target), resolution: target(sla.resolution),
    pauses: sla.pauses.map(pause => ({ waiting_on: selected(pause.waiting_on, ['requester', 'vendor']),
      paused_at: pause.paused_at, resumed_at: pause.resumed_at, stopsClock: pause.stopsClock })),
  };
}

/** The only ticket payload used for MCP reads and search matching. Never spread
 * a work row, context, native conversation, classification or SLA response. */
export async function projectTicket(env: Env, credential: Reader, row: any) {
  recordBoundary(credential, row);
  const ws = credential.workspace_id;
  const [names, group, classification, service, fields, values, thread, sla] = await Promise.all([
    env.DB.prepare(`SELECT (SELECT name FROM users WHERE id=?) requester_name,
      COALESCE((SELECT name FROM work_people WHERE workspace_id=? AND id=?),
      (SELECT name FROM users WHERE id=?)) beneficiary_name`)
      .bind(row.requester_id, ws, row.pending_person_id ?? row.beneficiary_id, row.beneficiary_id)
      .first<{ requester_name: string | null; beneficiary_name: string | null }>(),
    env.DB.prepare('SELECT id,name label FROM work_groups WHERE workspace_id=? AND id=?')
      .bind(ws, row.group_id ?? null).first<{ id: string; label: string }>(),
    env.DB.prepare(`SELECT json_extract(current_json,'$.priority') priority,json_extract(current_json,'$.impact') impact,
      json_extract(current_json,'$.urgency') urgency,json_extract(current_json,'$.category') category,
      json_extract(current_json,'$.subcategory') subcategory FROM work_classifications WHERE workspace_id=? AND work_id=?`)
      .bind(ws, row.id).first<Record<string, unknown>>(),
    env.DB.prepare(`SELECT s.id,json_extract(s.data_json,'$.name') label FROM svc_records s
      JOIN work_records w ON w.workspace_id=s.workspace_id AND json_extract(w.context_json,'$.serviceId')=s.id
      WHERE w.workspace_id=? AND w.id=? AND s.kind='service' AND s.visibility<>'restricted'`)
      .bind(ws, row.id).first<{ id: string; label: string | null }>(),
    classifiedDropdowns(env, ws),
    env.DB.prepare(`SELECT v.field_id,v.value FROM work_field_values v JOIN work_custom_fields f
      ON f.workspace_id=v.workspace_id AND f.id=v.field_id WHERE v.workspace_id=? AND v.work_id=?
      AND f.privacy_class='nonpersonal' AND f.field_type='dropdown'`)
      .bind(ws, row.id).all<{ field_id: string; value: string }>(),
    messages(env, credential, row.id), safeSla(env, credential, row),
  ]);
  const category = selected(classification?.category, Object.keys(categories));
  const customFields = fieldsFor(fields, row.kind).map(field => ({ id: field.id, name: field.name, type: 'dropdown' as const,
    value: dropdownValue(field, values.results.find(value => value.field_id === field.id)?.value ?? null) }));
  return {
    id: row.id, title: row.title, kind: row.kind, state: row.state, revision: row.revision,
    created_at: row.created_at, updated_at: row.updated_at, closed_at: row.closed_at ?? null,
    paused_at: row.paused_at ?? null, response_at: row.response_at ?? null, resolution_at: row.resolution_at ?? null,
    requester: { id: row.requester_id, name: names?.requester_name ?? null },
    beneficiary: { id: row.beneficiary_id, name: names?.beneficiary_name ?? null },
    group, priority: selected(classification?.priority, ['P1', 'P2', 'P3', 'P4']),
    impact: selected(classification?.impact ?? row.impact, [...levels, 'individual']), urgency: selected(classification?.urgency, levels),
    category: category ? { id: category, label: category } : null,
    subcategory: category ? selected(classification?.subcategory, categories[category as keyof typeof categories]) : null,
    service, sla, custom_fields: customFields.filter(field => field.value !== undefined),
    messages: thread.map(message => ({ id: message.id, author_id: message.author_id,
      ...(message.author_id === null ? { author: 'Erased person' } : {}),
      visibility: message.visibility, body: message.body, created_at: message.created_at })),
  };
}

/** Same original-value extraction as work/activity.ts. Keep custom-field origin
 * internally so a text field named "priority" cannot impersonate a core field.
 * No live ticket state is used to fill a missing/erasure-cleared audit value. */
function originalChanges(event: Audit, detail: Record<string, any>): Change[] {
  if (arrayChanges.includes(event.action)) return Array.isArray(detail.changes)
    ? detail.changes.filter((change: any) => change && typeof change.field === 'string'
      && Object.hasOwn(change, 'before') && Object.hasOwn(change, 'after'))
      .map((change: any) => ({ field: change.field, before: change.before, after: change.after,
        custom: event.action === 'work.scenario_run' && change.step === 'fields' })) : [];
  if (event.action === 'work.field_set') return Object.hasOwn(detail, 'before') && Object.hasOwn(detail, 'value')
    ? [{ field: detail.field, before: detail.before, after: detail.value, custom: true }] : [];
  if (event.action === 'work.group_set') return Object.hasOwn(detail, 'from') && Object.hasOwn(detail, 'to')
    ? [{ field: 'group', before: detail.from, after: detail.to }] : [];
  const before = detail.before ?? detail.from, after = detail.after ?? detail.to;
  if (!after || typeof after !== 'object' || Array.isArray(after)) return [];
  return Object.keys(after).filter(field => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after[field]))
    .map(field => ({ field, before: before?.[field] ?? null, after: after[field] }));
}

function safeChange(change: Change, fields: ClassifiedDropdown[], groupIds: Set<string>): SafeChange | null {
  if (change.custom) {
    const field = fields.find(field => field.name === change.field || field.id === change.field);
    if (!field) return null;
    const before = dropdownValue(field, change.before), after = dropdownValue(field, change.after);
    return before !== undefined && after !== undefined
      ? { field: 'custom_field', field_id: field.id, before, after } : null;
  }
  const options: Record<string, readonly string[]> = {
    state: ['open', 'paused', 'closed', 'cancelled'], type: ticketTypes, kind: ['request', ...ticketTypes],
    priority: ['P1', 'P2', 'P3', 'P4'], impact: [...levels, 'individual'], urgency: levels,
    category: Object.keys(categories), subcategory: [...new Set(Object.values(categories).flat())],
  };
  const groupField = ['group', 'groupId', 'group_id'].includes(change.field);
  const allowed = Object.hasOwn(options, change.field) ? options[change.field] : groupField ? [...groupIds] : null;
  if (!allowed) return null;
  const valid = (value: unknown) => value === null || (typeof value === 'string' && allowed.includes(value));
  if (!valid(change.before) || !valid(change.after)) return null;
  // Historical group labels are not reconstructed from mutable configuration.
  return { field: groupField ? 'group' : change.field, before: scalar(change.before), after: scalar(change.after) };
}

export async function projectHistory(env: Env, credential: Reader, row: any) {
  recordBoundary(credential, row);
  const [thread, events, fields, groups] = await Promise.all([
    messages(env, credential, row.id),
    env.DB.prepare(`SELECT e.id,e.action,e.detail_json,e.created_at,CASE WHEN e.actor_id='[erased]'
      OR EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=e.workspace_id AND p.user_id=e.actor_id)
      OR EXISTS(SELECT 1 FROM work_erasure p WHERE p.workspace_id=e.workspace_id AND p.person_id=e.actor_id)
      THEN 'Erased person' WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=e.actor_id) THEN e.actor_id
      ELSE NULL END actor FROM audit_events e WHERE e.workspace_id=? AND e.target=?
      AND e.action IN (${actions.map(() => '?').join(',')}) ORDER BY e.created_at,e.rowid`)
      .bind(credential.workspace_id, row.id, ...actions).all<Audit>(),
    classifiedDropdowns(env, credential.workspace_id),
    env.DB.prepare('SELECT id FROM work_groups WHERE workspace_id=?')
      .bind(credential.workspace_id).all<{ id: string }>(),
  ]);
  const groupIds = new Set(groups.results.map(group => group.id)), permittedFields = fieldsFor(fields, row.kind);
  const changes = events.results.map(event => {
    const detail: Record<string, any> = JSON.parse(event.detail_json);
    const cleared = Object.keys(detail).length === 0 || detail.redacted === 'erasure';
    return { id: event.id, at: event.created_at, kind: 'change' as const, actor: event.actor,
      actorKind: event.action === 'work.scenario_run' ? 'scenario' : event.action === 'work.routed' ? 'rule'
        : event.action === 'work.classification_proposed' ? 'agent' : 'person',
      action: event.action, visibility: 'private',
      changes: originalChanges(event, detail).map(change => safeChange(change, permittedFields, groupIds))
        .filter((change): change is SafeChange => change !== null),
      ...(cleared ? { redacted: 'erasure' as const } : {}),
    };
  });
  const messageEntries = thread.map(message => ({ id: message.id, at: message.created_at, kind: 'message' as const,
    actor: message.author_id ?? 'Erased person', actorKind: message.author_id === credential.principal_id ? 'automation' : 'person', action: 'Message',
    visibility: message.visibility, body: message.body, changes: [] as SafeChange[] }));
  return { items: [...changes, ...messageEntries].sort((a, b) => a.at.localeCompare(b.at)) };
}
