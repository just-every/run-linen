import type { Env } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import type { Credential } from './authority';
import { authorizedTool, liveTool, readableTicket, ticket, recheckTicket } from './ticket-scope';
import { projectTicket } from './projection';
import { routeUnplaced } from '../work/desk-routing';

function callAudit(env: Env, c: Credential, tool: string, target: string, at: string) {
  return env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), c.workspace_id, c.principal_id, 'mcp.call', c.id,
      JSON.stringify({ credentialId: c.id, principalId: c.principal_id, method: 'tools/call', tool, targetIds: [target], outcome: 'success' }), at);
}
function authorityGuard(env: Env, c: Credential, tool: 'work.create' | 'work.comment', guardId: string) {
  return env.DB.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(
    SELECT 1 FROM mcp_credentials c WHERE c.id=? AND c.grant_version=? AND ${authorizedTool(tool)}) THEN 1 ELSE 0 END`)
    .bind(guardId, c.id, c.grant_version);
}
/** Write and audit roll back together, including authority withdrawn by a concurrent commit or trigger. */
export async function createTicket(env: Env, c: Credential, input: Record<string, any>) {
  const workId = id(), at = now(), guard = id(), finish = id(), originalGuard = id();
  const fingerprint = await hashToken(JSON.stringify(['mcp', input.title, input.body, input.kind ?? 'request']));
  const existing = await env.DB.prepare('SELECT id,request_hash FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?')
    .bind(c.workspace_id, c.principal_id, input.deduplicationKey).first<{ id: string; request_hash: string }>();
  if (existing && existing.request_hash !== fingerprint) throw new ApiError(409, 'idempotency_conflict', 'Material request changed');
  try {
    await env.DB.batch([
      authorityGuard(env, c, 'work.create', guard),
      env.DB.prepare(`INSERT OR IGNORE INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,sensitivity,created_at,updated_at,dedup_key,request_hash)
        VALUES(?,?,?,?,?,?,'normal',?,?,?,?)`).bind(workId, c.workspace_id, c.principal_id, c.principal_id,
          input.kind ?? 'request', input.title, at, at, input.deduplicationKey, fingerprint),
      env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,'mcp.work_created',?,?,? WHERE changes()=1`)
        .bind(id(), c.workspace_id, c.principal_id, workId, JSON.stringify({ credentialId: c.id, workId }), at),
      env.DB.prepare(`INSERT OR IGNORE INTO work_messages SELECT ?,workspace_id,id,requester_id,'public',?,'initial',?
        FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=? AND request_hash=?`)
        .bind(id(), input.body, at, c.workspace_id, c.principal_id, input.deduplicationKey, fingerprint),
      // A competing create must match this request's original fingerprint and MCP provenance.
      env.DB.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(
        SELECT 1 FROM work_records w WHERE workspace_id=? AND requester_id=? AND dedup_key=? AND request_hash=?
        AND EXISTS(SELECT 1 FROM audit_events a WHERE a.workspace_id=w.workspace_id AND a.actor_id=w.requester_id AND a.target=w.id AND a.action='mcp.work_created')) THEN 1 ELSE 0 END`)
        .bind(originalGuard, c.workspace_id, c.principal_id, input.deduplicationKey, fingerprint),
      env.DB.prepare(`INSERT INTO audit_events SELECT ?,workspace_id,requester_id,'mcp.call',?,
        json_object('credentialId',?,'principalId',requester_id,'method','tools/call','tool','work.create','targetIds',json_array(id),'outcome','success'),?
        FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?`)
        .bind(id(),c.id,c.id,at,c.workspace_id,c.principal_id,input.deduplicationKey),
      authorityGuard(env, c, 'work.create', finish),
      env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id IN(?,?,?)').bind(guard, finish, originalGuard),
    ]);
  } catch (error) {
    if (String(error).includes('CHECK constraint failed')) throw new ApiError(409, 'mcp_commit_conflict', 'Authority or request changed');
    throw error;
  }
  const saved = await env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?')
    .bind(c.workspace_id, c.principal_id, input.deduplicationKey).first<any>();
  if (saved.id === workId) await routeUnplaced({ env, principal: { workspaceId: c.workspace_id, userId: c.principal_id, roles: ['integration'] } }, saved.id, 'created');
  const current = await env.DB.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(c.workspace_id, saved.id).first<any>();
  if (!await liveTool(env, c, 'work.create') || current.sensitivity !== 'normal') throw new ApiError(404, 'not_found', 'Work not found');
  return projectTicket(env, c, current);
}

export async function commentTicket(env: Env, c: Credential, input: Record<string, any>) {
  const row = await ticket(env, c, 'work.comment', input.workId);
  if (row.revision !== input.revision) throw new ApiError(409, 'revision_conflict', 'Refresh the ticket before commenting');
  const at = now(), messageId = id(), key = 'mcp:' + c.principal_id + ':' + input.deduplicationKey;
  const prior = await env.DB.prepare('SELECT body,author_id FROM work_messages WHERE workspace_id=? AND work_id=? AND source_key=?')
    .bind(c.workspace_id, row.id, key).first<{ body: string; author_id: string }>();
  if (prior) {
    if (prior.body !== input.body || prior.author_id !== c.principal_id) throw new ApiError(409, 'idempotency_conflict', 'Comment changed');
    await recheckTicket(env, c, 'work.comment', row);
    await callAudit(env, c, 'work.comment', row.id, at).run();
    return { id: row.id, revision: row.revision, added: false };
  }
  const guard = id(), finish = id();
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(
        SELECT 1 FROM work_records w,mcp_credentials c WHERE c.id=? AND c.grant_version=? AND w.id=? AND w.revision=?
        AND ${authorizedTool('work.comment')} AND ${readableTicket(true)}) THEN 1 ELSE 0 END`)
        .bind(guard, c.id, c.grant_version, row.id, input.revision),
      env.DB.prepare(`UPDATE work_records SET revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?`)
        .bind(at, c.workspace_id, row.id, input.revision),
      env.DB.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'private',?,?,?)")
        .bind(messageId, c.workspace_id, row.id, c.principal_id, input.body, key, at),
      env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
        .bind(id(), c.workspace_id, c.principal_id, 'mcp.work_commented', row.id,
          JSON.stringify({ credentialId: c.id, workId: row.id, messageId }), at),
      callAudit(env, c, 'work.comment', row.id, at),
      env.DB.prepare(`INSERT INTO work_fulfilment_link_guards SELECT ?,CASE WHEN EXISTS(
        SELECT 1 FROM work_records w,mcp_credentials c WHERE c.id=? AND c.grant_version=? AND w.id=? AND w.revision=?
        AND ${authorizedTool('work.comment')} AND ${readableTicket(true)}) THEN 1 ELSE 0 END`)
        .bind(finish, c.id, c.grant_version, row.id, input.revision + 1),
      env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id IN(?,?)').bind(guard, finish),
    ]);
  } catch (error) {
    if (String(error).includes('CHECK constraint failed')) throw new ApiError(409, 'mcp_commit_conflict', 'Ticket or authority changed');
    if (String(error).includes('UNIQUE constraint failed')) throw new ApiError(409, 'idempotency_conflict', 'Comment already committed; refresh the ticket');
    throw error;
  }
  return { id: row.id, revision: input.revision + 1, added: true };
}
