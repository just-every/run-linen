import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../../../platform/types';
import { ApiError } from '../../../platform/http';
import { hashToken } from '../../../platform/crypto';
import { platformAdmissionGuard } from '../../../platform/privacy';
import type { AdoptionContext } from '../core';
import type { D1ImportContext } from '../../../modules/import-kit/src/d1/index';
import { freshserviceTargets } from './targets';
import { MAPPING_VERSION } from './mapping';

export async function importContext(ctx: AdoptionContext, namespace: string, sessionHash?: string): Promise<D1ImportContext> {
  const { DB: db } = ctx.env, { userId, workspaceId } = ctx.principal;
  const user = await db.prepare('SELECT email FROM users WHERE id=?').bind(userId).first<{email:string}>();
  if (!user) throw new ApiError(403,'owner_required','Current owner required');
  const privacy = await platformAdmissionGuard(db,workspaceId,userId,user.email);
  const revision = (await db.prepare('SELECT revision FROM freshservice_import_privacy WHERE workspace_id=?').bind(workspaceId).first<{revision:number}>())?.revision ?? 0;
  // Match native session validity at each atomic boundary. Retained legacy
  // sessions have no proof; versioned sessions must still match current authority.
  return {destination:workspaceId,namespace,mappingVersion:MAPPING_VERSION,batchSize:1,maxBatches:1,storage:{database:db,targets:freshserviceTargets},authorization:{principalId:userId,predicate(action,destination) {
    return {sql:`?=? AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value='owner') AND ${privacy.sql}
      AND (?='erase' OR COALESCE((SELECT revision FROM freshservice_import_privacy WHERE workspace_id=?),0)=?)
      ${sessionHash ? `AND EXISTS(SELECT 1 FROM sessions s
        LEFT JOIN platform_auth_session_proofs p ON p.session_id=s.id
        LEFT JOIN platform_auth_versions v ON v.user_id=s.user_id
        WHERE s.token_hash=? AND s.user_id=? AND s.workspace_id=?
        AND s.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND (p.version IS NULL OR p.version=v.version))` : action === 'erase' ? '' : 'AND 0'}`,
      params:[destination,workspaceId,workspaceId,userId,...privacy.bindings,action,workspaceId,revision,...(sessionHash?[sessionHash,userId,workspaceId]:[])]};
  }}};
}
export async function requestContext(c: Context<AppEnv>, namespace: string) {
  if (!c.get('principal').roles.includes('owner')) throw new ApiError(403,'owner_required','Freshservice file migration requires a current owner');
  return importContext({env:c.env,principal:c.get('principal')},namespace,await hashToken(getCookie(c,'linen_session') ?? ''));
}
export async function jobContext(c: Context<AppEnv>, id: string) {
  const row = await c.env.DB.prepare('SELECT namespace FROM ik_jobs WHERE id=? AND destination=? AND principal_id=? AND namespace LIKE \'freshservice:%\'').bind(id,c.get('principal').workspaceId,c.get('principal').userId).first<{namespace:string}>();
  if (!row) throw new ApiError(404,'not_found','Import job not found');
  return requestContext(c,row.namespace);
}
