import type { PreparedBy } from '../../modules/agent-door/types.ts';
import type { Env } from '../../platform/types';
import { ApiError, requiredString, id, now } from '../../platform/http';
import type { Credential } from './authority';
import { authorizedTool, liveTool, readableTicket, recheckTicket, ticket } from './ticket-scope';
import { projectHistory, projectTicket } from './projection';
import { commentTicket, createTicket } from './writes';

const string = { type: 'string' }, revision = { type: 'integer', minimum: 1 };
const page = { limit: { type: 'integer', minimum: 1, maximum: 50 }, offset: { type: 'integer', minimum: 0 } };
const schema = (properties: object, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const definitions = [
  { name: 'work.list', description: 'Read normal tickets in the current credential queue grants.', inputSchema: schema({ groupId: string, ...page }) },
  { name: 'work.get', description: 'Read a permitted normal ticket and its filtered conversation.', inputSchema: schema({ workId: string }, ['workId']) },
  { name: 'work.search', description: 'Search permitted ticket fields and visible conversation only.', inputSchema: schema({ query: string, ...page }, ['query']) },
  { name: 'work.history', description: 'Read permitted, redacted ticket activity.', inputSchema: schema({ workId: string }, ['workId']) },
  { name: 'work.create', description: 'File a normal ticket for this automation principal; no group or execution authority.', inputSchema: schema({ title: string, body: string, deduplicationKey: string, kind: { type: 'string', enum: ['request', 'service_request', 'incident', 'question'] } }, ['title', 'body', 'deduplicationKey']) },
  { name: 'work.comment', description: 'Add an internal automation comment at the revision read; no notification or provider effect.', inputSchema: schema({ workId: string, revision, body: string, deduplicationKey: string }, ['workId', 'revision', 'body', 'deduplicationKey']) },
] as const;
function inputFor(definition: typeof definitions[number], raw: unknown): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ApiError(400, 'invalid_arguments', 'Object required');
  const value = raw as Record<string, any>, fields = definition.inputSchema.properties as Record<string, any>;
  if (Object.keys(value).some(key => !Object.hasOwn(fields, key)) || definition.inputSchema.required.some(key => value[key] === undefined))
    throw new ApiError(400, 'invalid_arguments', 'Use the closed tool schema');
  for (const [key, item] of Object.entries(value)) {
    const spec = fields[key];
    if (spec.type === 'integer' ? !Number.isSafeInteger(item) || item < spec.minimum || (spec.maximum && item > spec.maximum)
      : typeof item !== 'string' || !item.trim() || item.length > (key === 'body' ? 20000 : key === 'title' ? 500 : 200))
      throw new ApiError(400, 'invalid_arguments', 'Invalid argument');
    if (spec.enum && !spec.enum.includes(item)) throw new ApiError(400, 'invalid_arguments', 'Invalid selection');
  }
  return value;
}
export async function callTool(env: Env, c: Credential, params: any, auditTarget: (name: string, ids: string[]) => void, actor?: PreparedBy, approvers: readonly {id:string;name:string}[] = []) {
  let targets: string[] = [];
  try {
    const result = await nativeCall(env,c,params,(name,ids)=>{targets=ids;auditTarget(name,ids)},actor,approvers);
    if (!['work.create','work.comment'].includes(params?.name)) await nativeCallAudit(env,c,params?.name,targets,'success',actor);
    return result;
  } catch(error) {
    await nativeCallAudit(env,c,params?.name,targets,error instanceof ApiError?error.code:'internal_error',actor);
    throw error;
  }
}
export function nativeCallAudit(env: Env,c: Credential,tool:string,targets:string[],outcome:string,_actor?:PreparedBy) {
  return env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),c.workspace_id,c.principal_id,'mcp.call',c.id,
    JSON.stringify({credentialId:c.id,principalId:c.principal_id,method:'tools/call',tool,targetIds:targets,outcome}),now()).run();
}
async function nativeCall(env: Env, c: Credential, params: any, auditTarget: (name: string, ids: string[]) => void, actor?: PreparedBy, approvers: readonly {id:string;name:string}[] = []) {
  const definition = definitions.find(item => item.name === params?.name);
  if (!definition) throw new ApiError(403, 'tool_unavailable', 'Tool unavailable');
  auditTarget(definition.name, []);
  if (!await liveTool(env, c, definition.name)) throw new ApiError(403, 'tool_unavailable', 'Tool unavailable');
  const input = inputFor(definition, params.arguments ?? {});
  if (input.workId) {
    const target = await env.DB.prepare('SELECT id FROM work_records WHERE workspace_id=? AND id=?').bind(c.workspace_id, input.workId).first<{id:string}>();
    if (target) auditTarget(definition.name, [target.id]);
  }
  if (definition.name === 'work.create') {
    const created = await createTicket(env, c, input, actor, approvers); auditTarget(definition.name, [created.id]); return created;
  }
  if (definition.name === 'work.comment') return commentTicket(env, c, input, actor, approvers);
  if (definition.name === 'work.get' || definition.name === 'work.history') {
    const row = await ticket(env, c, definition.name, input.workId);
    const result = definition.name === 'work.get' ? await projectTicket(env, c, row) : await projectHistory(env, c, row);
    await recheckTicket(env, c, definition.name, row); return result;
  }
  const queue = definition.name === 'work.list';
  const rows = (await env.DB.prepare(`SELECT w.* FROM work_records w,mcp_credentials c
    WHERE c.id=? AND c.grant_version=? AND ${authorizedTool(definition.name)} AND ${readableTicket(queue)}
    ${queue && input.groupId ? 'AND w.group_id=?' : ''} ORDER BY w.created_at,w.id`)
    .bind(c.id, c.grant_version, ...(queue && input.groupId ? [input.groupId] : [])).all<any>()).results;
  const items = [];
  const query = !queue ? requiredString(input.query, 'query', 200).normalize('NFKC').toLowerCase() : '';
  for (const row of rows) {
    const projected = await projectTicket(env, c, row);
    const history = !queue ? await projectHistory(env, c, row) : undefined;
    if (query && !JSON.stringify({ ...projected, history }).normalize('NFKC').toLowerCase().includes(query)) continue;
    await recheckTicket(env, c, definition.name, row, queue);
    items.push(projected);
  }
  if (!await liveTool(env, c, definition.name)) throw new ApiError(403, 'tool_unavailable', 'Tool unavailable');
  const offset = input.offset ?? 0, limit = input.limit ?? 50;
  const selected = items.slice(offset, offset + limit);
  auditTarget(definition.name, selected.map(item => item.id));
  return { items: selected, total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}
