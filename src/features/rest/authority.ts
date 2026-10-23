import type { Context } from 'hono';
import type { AppEnv } from '../../platform/types';
import { hashToken } from '../../platform/crypto';
import { ApiError, now } from '../../platform/http';

export function issuerPredicate(alias: string) {
  return `EXISTS(SELECT 1 FROM memberships issuer,json_each(issuer.roles_json) role
    WHERE issuer.workspace_id=${alias}.workspace_id AND issuer.user_id=${alias}.created_by
    AND issuer.active=1 AND role.value='owner')
    AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=${alias}.workspace_id AND e.person_id=${alias}.created_by)
    AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=${alias}.workspace_id AND e.user_id=${alias}.created_by)`;
}
/** SQL-only live authority, usable again inside each ticket effect's transaction. */
export function restPredicate(alias: string): string {
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
export type RestCredential = {id:string;workspace_id:string;principal_id:string;scopes_json:string};
export async function authenticateRest(c:Context<AppEnv>) {
  const authorization=c.req.header('Authorization')??'';
  if(!/^Bearer linen_rest_[a-f0-9-]{72}$/.test(authorization))
    throw new ApiError(401,'rest_auth_required','REST credential required');
  await c.env.DB.prepare("UPDATE rest_credentials SET state='expired',secret_hash=NULL,invalidated_at=? WHERE state='active' AND expires_at<=?").bind(now(),now()).run();
  const row=await c.env.DB.prepare(`UPDATE rest_credentials SET last_used_at=? WHERE secret_hash=? AND ${restPredicate('rest_credentials')} RETURNING id,workspace_id,principal_id,scopes_json`)
    .bind(now(),await hashToken(authorization.slice(7))).first<RestCredential>();
  if(!row)throw new ApiError(401,'rest_auth_required','Current REST credential required');
  return row;
}
