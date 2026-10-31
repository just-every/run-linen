import { encryptSecret, decryptSecret } from '../../platform/crypto';
import { id, now, requiredString } from '../../platform/http';
import { request, safeJson } from '../connections/core';
import { check, livePerson, softwarePrincipal, softwareTarget, type SoftwareContext } from './software-license-core';

export async function registerSoftwareConnection(ctx: SoftwareContext, b: Record<string, any>) {
  const p = await softwarePrincipal(ctx, true);
  check(b.consent === true && typeof b.reason === 'string' && b.reason.trim(), 'software_connection_consent', 422);
  check(['zoom','jamf','microsoft-graph'].includes(b.provider), 'software_provider_unsupported', 422);
  const config: Record<string, any> = { softwareLicenseConsent: { actorId: p.userId, reason: b.reason.trim(), at: now() } };
  if (b.provider === 'jamf') {
    const u = new URL(requiredString(b.config?.origin, 'origin'));
    check(u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/' && !u.port && /^[a-z0-9-]+\.jamfcloud\.com$/i.test(u.hostname), 'software_jamf_origin_denied', 422);
    config.origin = u.origin;
  } else if (b.provider === 'microsoft-graph') {
    check(/^[a-f0-9-]{36}$/i.test(b.config?.tenantId), 'tenant_uuid_required', 422); config.tenantId = b.config.tenantId;
  } else config.accountId = softwareTarget(b.config?.accountId, 'accountId');
  const secret = { clientId: softwareTarget(b.secret?.clientId, 'clientId'), clientSecret: requiredString(b.secret?.clientSecret, 'clientSecret') };
  const key = id(), t = now();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare("INSERT INTO connections(id,workspace_id,provider,name,config_json,secret_ciphertext,status,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,'unverified',1,?,?)")
      .bind(key,p.workspaceId,b.provider,softwareTarget(b.name,'name'),JSON.stringify(config),await encryptSecret(ctx.env.ENCRYPTION_KEY,JSON.stringify(secret)),t,t),
    ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),p.workspaceId,p.userId,'software.connection_consented',key,JSON.stringify({provider:b.provider}),t),
  ]);
  return { id:key, revision:1, provider:b.provider, status:'unverified' };
}
export async function softwareConnection(ctx: SoftwareContext, key: string, expectedProvider?: string) {
  const row = await ctx.env.DB.prepare('SELECT * FROM connections WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,key).first<any>();
  check(row && row.secret_ciphertext && ['active','unverified'].includes(row.status), 'software_connection_unavailable', 503);
  check(!expectedProvider || row.provider === expectedProvider, 'software_connection_provider', 422);
  const config = JSON.parse(row.config_json);
  check(['zoom','jamf','microsoft-graph'].includes(row.provider), 'software_provider_unsupported', 422);
  // Existing Graph connections can be read, but writes require a fresh title grant.
  if (row.provider !== 'microsoft-graph') check(config.softwareLicenseConsent, 'software_connection_consent');
  if (config.softwareLicenseConsent) await livePerson(ctx,config.softwareLicenseConsent.actorId,['owner']);
  return { ...row, config };
}
export async function softwareClient(ctx: SoftwareContext, row: any) {
  const s = JSON.parse(await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext));
  check(typeof s.clientId === 'string' && typeof s.clientSecret === 'string', 'software_credential_invalid', 503);
  let origin: string, tokenUrl: string, body: URLSearchParams, headers: Record<string,string> = {};
  if (row.provider === 'microsoft-graph') {
    check(/^[a-f0-9-]{36}$/i.test(row.config.tenantId), 'tenant_uuid_required', 422);
    origin = 'https://graph.microsoft.com'; tokenUrl = `https://login.microsoftonline.com/${row.config.tenantId}/oauth2/v2.0/token`;
    body = new URLSearchParams({client_id:s.clientId,client_secret:s.clientSecret,grant_type:'client_credentials',scope:'https://graph.microsoft.com/.default'});
  } else if (row.provider === 'zoom') {
    origin = 'https://api.zoom.us'; tokenUrl = 'https://zoom.us/oauth/token';
    body = new URLSearchParams({grant_type:'account_credentials',account_id:row.config.accountId}); headers.Authorization = `Basic ${btoa(s.clientId+':'+s.clientSecret)}`;
  } else {
    const u = new URL(row.config.origin);
    check(u.protocol === 'https:' && /^[a-z0-9-]+\.jamfcloud\.com$/i.test(u.hostname) && u.origin === row.config.origin && !u.port && !u.username && !u.password, 'software_jamf_origin_denied', 422);
    origin = u.origin; tokenUrl = origin + '/api/oauth/token'; body = new URLSearchParams({client_id:s.clientId,client_secret:s.clientSecret,grant_type:'client_credentials'});
  }
  const token = await safeJson(await request(tokenUrl,{method:'POST',headers,body}));
  check(typeof token.access_token === 'string' && token.access_token, 'software_auth_denied', 503);
  const call = async (path: string, init: RequestInit = {}) => {
    const u = new URL(path,origin);
    check(u.origin === origin && !u.username && !u.password && !u.hash, 'software_cursor_denied', 502);
    return request(u.href,{...init,headers:{Accept:'application/json',Authorization:`Bearer ${token.access_token}`,'Cache-Control':'no-cache',...init.headers}});
  };
  return { call, json: async (path: string) => safeJson(await call(path)), origin };
}
export async function completeConnectionRead(ctx: SoftwareContext, row: any) {
  const t=now();
  const result = await ctx.env.DB.batch([
    ctx.env.DB.prepare("UPDATE connections SET status='active',updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND status IN ('active','unverified')")
      .bind(t,ctx.principal.workspaceId,row.id,row.revision),
    ctx.env.DB.prepare(`INSERT INTO connection_validations SELECT ?,?,?,?,'active',? WHERE changes()=1
      ON CONFLICT(workspace_id,connection_id) DO UPDATE SET connection_revision=excluded.connection_revision,validated_at=excluded.validated_at,state=excluded.state,evidence_json=excluded.evidence_json`)
      .bind(ctx.principal.workspaceId,row.id,row.revision,t,JSON.stringify({readOnly:true,workflowVerified:false,writeAuthority:'not-established',kind:'software-provider-read',provider:row.provider,coverage:'Only the completed software inventory or usage resource; no broader provider scope is implied'})),
  ]);
  check(result[0].meta.changes === 1, 'software_connection_changed');
}
