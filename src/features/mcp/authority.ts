import type { Env } from '../../platform/types';
import { hashToken } from '../../platform/crypto';
import { ApiError, id, now } from '../../platform/http';
import { expireMcpCredentials } from './credentials';

export type Credential = {
  id: string; workspace_id: string; principal_id: string; name: string;
  scopes_json: string; tools_json: string; expires_at: string; secret_hash: string | null;
  state: 'active' | 'revoked' | 'expired'; created_by: string; created_at: string;
  last_used_at: string | null; invalidated_at: string | null;
  queue_groups_json: string; grant_version: number; grant_updated_by: string | null;
};
function issuerPredicate(alias: string) {
  return `EXISTS(SELECT 1 FROM memberships issuer,json_each(issuer.roles_json) role
    WHERE issuer.workspace_id=${alias}.workspace_id AND issuer.user_id=${alias}.created_by
    AND issuer.active=1 AND role.value='owner')
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=${alias}.workspace_id AND e.person_id=${alias}.created_by)
    AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=${alias}.workspace_id AND e.user_id=${alias}.created_by)`;
}
/** SQL-only live authority, usable again inside each ticket effect's transaction. */
export function credentialPredicate(alias: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(alias)) throw new Error('Invalid credential alias');
  return `${alias}.state='active' AND ${alias}.secret_hash IS NOT NULL
    AND unixepoch(${alias}.expires_at)>unixepoch('now') AND ${issuerPredicate(alias)}
    AND EXISTS(SELECT 1 FROM memberships member JOIN execution_automation_principals automation
      ON automation.workspace_id=member.workspace_id AND automation.user_id=member.user_id
      WHERE member.workspace_id=${alias}.workspace_id AND member.user_id=${alias}.principal_id
      AND member.active=1 AND automation.revoked_at IS NULL
      AND json_array_length(member.roles_json)=1 AND json_extract(member.roles_json,'$[0]')='integration')
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=${alias}.workspace_id AND e.person_id=${alias}.principal_id)
    AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=${alias}.workspace_id AND e.user_id=${alias}.principal_id)`;
}
export async function authenticateMcpRequest(env: Env, request: Request): Promise<Credential> {
  const authorization = request.headers.get('Authorization') ?? '';
  const denied = () => new ApiError(401, 'mcp_auth_required', 'Authentication required');
  if (!/^Bearer linen_mcp_[a-f0-9-]{72}$/.test(authorization)) throw denied();
  const digest = await hashToken(authorization.slice(7));
  await expireMcpCredentials(env);
  const candidate = await env.DB.prepare("SELECT id FROM mcp_credentials WHERE secret_hash=? AND state='active'")
    .bind(digest).first<{ id: string }>();
  if (!candidate) throw denied();
  const at = now();
  // Both revocation and last-use updates recheck authority inside the same transaction.
  const [lostIssuer, , authenticated] = await env.DB.batch([
    env.DB.prepare(`UPDATE mcp_credentials SET state='revoked',secret_hash=NULL,invalidated_at=?
      WHERE id=? AND secret_hash=? AND state='active' AND NOT (${issuerPredicate('mcp_credentials')})`)
      .bind(at, candidate.id, digest),
    env.DB.prepare(`INSERT INTO audit_events
      SELECT ?,workspace_id,principal_id,'mcp.credential_revoked',id,
        json_object('credentialId',id,'principalId',principal_id,'issuerId',created_by,'reason','mcp_issuer_inactive'),?
      FROM mcp_credentials WHERE id=? AND changes()>0`)
      .bind(id(), at, candidate.id),
    env.DB.prepare(`UPDATE mcp_credentials SET last_used_at=?
      WHERE id=? AND secret_hash=? AND ${credentialPredicate('mcp_credentials')} RETURNING *`)
      .bind(at, candidate.id, digest),
  ]);
  if (lostIssuer.meta.changes) throw new ApiError(401, 'mcp_issuer_inactive', 'Credential issuer is no longer an active owner');
  const credential = authenticated.results[0] as Credential | undefined;
  if (!credential) throw denied();
  return credential;
}
