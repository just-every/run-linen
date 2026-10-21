import type { Context } from 'hono';
import type { AppEnv, Env } from '../../platform/types';
import { ApiError, auditStatement, id, now, requiredString } from '../../platform/http';
import { hashToken, token } from '../../platform/crypto';

export const toolScopes = {
  'work.list': 'work.read', 'work.get': 'work.read', 'work.search': 'work.read',
  'work.history': 'work.read', 'work.create': 'work.create', 'work.comment': 'work.comment',
} as const;
const publicColumns = 'id,principal_id,name,scopes_json,tools_json,expires_at,state,created_by,created_at,last_used_at,invalidated_at';

export async function expireMcpCredentials(env: Env) {
  await env.DB.prepare("UPDATE mcp_credentials SET state='expired',secret_hash=NULL,invalidated_at=? WHERE state='active' AND expires_at<=?")
    .bind(now(), now()).run();
}
export async function currentOwner(c: Context<AppEnv>) {
  const p = c.get('principal');
  if (!await c.env.DB.prepare(`SELECT 1 FROM memberships m,json_each(m.roles_json) r
    WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner'`)
    .bind(p.workspaceId, p.userId).first()) throw new ApiError(403, 'owner_required', 'Current owner required');
  return p;
}
export async function listMcpCredentials(c: Context<AppEnv>) {
  const p = await currentOwner(c);
  await expireMcpCredentials(c.env);
  const rows = await c.env.DB.prepare(`SELECT ${publicColumns} FROM mcp_credentials WHERE workspace_id=? ORDER BY created_at,id`)
    .bind(p.workspaceId).all();
  return { items: rows.results };
}
function selection(value: unknown, allowed: readonly string[], field: string) {
  if (!Array.isArray(value) || !value.length || value.length > allowed.length ||
      value.some(v => typeof v !== 'string' || !allowed.includes(v)) || new Set(value).size !== value.length)
    throw new ApiError(400, 'invalid_selection', `Choose a closed ${field} selection`);
  return value as string[];
}
export async function mintMcpCredential(c: Context<AppEnv>, input: Record<string, unknown>) {
  const p = await currentOwner(c), credentialId = id(), at = now();
  const principalId = requiredString(input.principalId, 'principalId', 200), name = requiredString(input.name, 'name', 120);
  const scopes = selection(input.scopes, ['work.read', 'work.create', 'work.comment'], 'scope');
  const tools = selection(input.tools, Object.keys(toolScopes), 'tool');
  if (tools.some(t => !scopes.includes(toolScopes[t as keyof typeof toolScopes])))
    throw new ApiError(400, 'scope_tool_mismatch', 'Every selected tool needs its scope');
  const expires = typeof input.expiresAt === 'string' ? Date.parse(input.expiresAt) : NaN;
  if (!Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 365 * 86400000)
    throw new ApiError(400, 'mcp_expiry_invalid', 'Expiry must be in the next 365 days');
  const secret = 'linen_mcp_' + token();
  try {
    await c.env.DB.prepare(`INSERT INTO mcp_credentials VALUES(?,?,?,?,?,?,?,?, 'active',?,?,NULL,NULL)`)
      .bind(credentialId,p.workspaceId,principalId,name,JSON.stringify(scopes),JSON.stringify(tools),
        new Date(expires).toISOString(),await hashToken(secret),p.userId,at).run();
  } catch (error) {
    const message = String(error);
    if (message.includes('mcp_owner_required')) throw new ApiError(403,'owner_required','Current owner required');
    if (message.includes('mcp_principal_required') || message.includes('FOREIGN KEY'))
      throw new ApiError(403,'mcp_principal_required','Active integration-only automation principal required');
    if (message.includes('mcp_expiry_invalid')) throw new ApiError(400,'mcp_expiry_invalid','Expiry must be in the next 365 days');
    throw error;
  }
  // The secret is returned only by this mint response; no read or archive projects it.
  return { id: credentialId, secret, expiresAt: new Date(expires).toISOString(), toolsAvailable: false };
}
export async function revokeMcpCredential(c: Context<AppEnv>, credentialId: string) {
  const p = await currentOwner(c), at = now();
  const row = await c.env.DB.prepare('SELECT 1 FROM mcp_credentials WHERE workspace_id=? AND id=?')
    .bind(p.workspaceId,credentialId).first();
  if (!row) throw new ApiError(404,'not_found','Credential not found');
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE mcp_credentials SET state='revoked',secret_hash=NULL,invalidated_at=? WHERE workspace_id=? AND id=?
      AND state='active' AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
       WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`)
      .bind(at,p.workspaceId,credentialId,p.workspaceId,p.userId),
    auditStatement(c,'mcp.credential_revoked',credentialId,{},true),
  ]);
  await currentOwner(c);
  return { revoked: true };
}
