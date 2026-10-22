import type { Env } from '../../platform/types';
import { ApiError } from '../../platform/http';
import { credentialPredicate, type Credential } from './authority';
import { toolScopes } from './credentials';

/** Queue readership is separate from every REST, requester, share and group-member rule. */
export function readableTicket(queueOnly = false) {
  return `json_array_length(w.protected_departments_json)=0 AND NOT EXISTS(SELECT 1 FROM work_departments d WHERE d.workspace_id=w.workspace_id AND d.id=w.department_id AND d.kind='hr')
    AND w.workspace_id=c.workspace_id AND w.sensitivity='normal'
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=w.workspace_id AND e.person_id IN(w.requester_id,w.beneficiary_id))
    AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=w.workspace_id AND e.user_id IN(w.requester_id,w.beneficiary_id))
    AND (EXISTS(SELECT 1 FROM work_groups g,json_each(c.queue_groups_json) q WHERE g.workspace_id=w.workspace_id AND g.id=w.group_id AND g.department_id IS w.department_id AND q.value=g.id AND (g.department_id IS NULL OR EXISTS(SELECT 1 FROM work_departments d WHERE d.workspace_id=g.workspace_id AND d.id=g.department_id AND d.active=1)))
      ${queueOnly ? '' : "OR w.department_id IS NULL AND EXISTS(SELECT 1 FROM audit_events a WHERE a.workspace_id=w.workspace_id AND a.actor_id=c.principal_id AND a.target=w.id AND a.action='mcp.work_created')"})`;
}
export function authorizedTool(tool: keyof typeof toolScopes) {
  return `${credentialPredicate('c')} AND EXISTS(SELECT 1 FROM json_each(c.tools_json) WHERE value='${tool}')
    AND EXISTS(SELECT 1 FROM json_each(c.scopes_json) WHERE value='${toolScopes[tool]}')`;
}
export function liveTool(env: Env, c: Credential, tool: keyof typeof toolScopes) {
  return env.DB.prepare(`SELECT 1 FROM mcp_credentials c WHERE c.id=? AND c.grant_version=? AND ${authorizedTool(tool)}`)
    .bind(c.id, c.grant_version).first();
}
export async function ticket(env: Env, c: Credential, tool: keyof typeof toolScopes, workId: string) {
  const row = await env.DB.prepare(`SELECT w.* FROM work_records w,mcp_credentials c
    WHERE c.id=? AND c.grant_version=? AND w.id=? AND ${authorizedTool(tool)} AND ${readableTicket(tool !== 'work.get' && tool !== 'work.search')}`)
    .bind(c.id, c.grant_version, workId).first<any>();
  if (!row) throw new ApiError(404, 'not_found', 'Work not found');
  return row;
}
export async function recheckTicket(env: Env, c: Credential, tool: keyof typeof toolScopes, row: any, queueOnly = tool !== 'work.get' && tool !== 'work.search') {
  const current = await env.DB.prepare(`SELECT 1 FROM work_records w,mcp_credentials c WHERE c.id=? AND c.grant_version=?
    AND w.id=? AND w.revision=? AND ${authorizedTool(tool)} AND ${readableTicket(queueOnly)}`)
    .bind(c.id, c.grant_version, row.id, row.revision).first();
  if (!current) throw new ApiError(404, 'not_found', 'Work not found');
}
