import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, auditStatement, id, jsonBody, now, requiredString } from '../../platform/http';
import { hashToken, token } from '../../platform/crypto';
import { currentOwner } from '../mcp/credentials';

export function registerRestCredentialRoutes(app:Hono<AppEnv>) {
  app.use('/rest-credentials*',async(c,next)=>{c.header('Cache-Control','no-store');await next();});
  app.get('/rest-credentials',async c=>{
    const p=await currentOwner(c);
    return c.json({items:(await c.env.DB.prepare(`SELECT id,principal_id,name,scopes_json,expires_at,state,created_by,created_at,last_used_at,invalidated_at FROM rest_credentials WHERE workspace_id=? ORDER BY created_at,id`).bind(p.workspaceId).all()).results});
  });
  app.post('/rest-credentials',async c=>{
    const p=await currentOwner(c),b=await jsonBody(c),credentialId=id();
    const principalId=requiredString(b.principalId,'principalId',200),name=requiredString(b.name,'name',120);
    if(!Array.isArray(b.scopes)||b.scopes.length!==1||b.scopes[0]!=='work.create')
      throw new ApiError(400,'rest_scope','Only work.create is available');
    const expires=typeof b.expiresAt==='string'?Date.parse(b.expiresAt):NaN;
    if(!Number.isFinite(expires)||expires<=Date.now()||expires>Date.now()+365*86400000)
      throw new ApiError(400,'rest_expiry','Expiry must be in the next 365 days');
    const secret='linen_rest_'+token(),expiresAt=new Date(expires).toISOString();
    try {
      await c.env.DB.prepare(`INSERT INTO rest_credentials(id,workspace_id,principal_id,name,scopes_json,expires_at,secret_hash,state,created_by,created_at) VALUES(?,?,?,?,?,?,?,'active',?,?)`)
        .bind(credentialId,p.workspaceId,principalId,name,JSON.stringify(b.scopes),expiresAt,await hashToken(secret),p.userId,now()).run();
    }catch(error){
      if(/rest_owner_required|rest_principal_required/.test(String(error)))throw new ApiError(403,'rest_authority','Current owner and active integration-only principal required');
      throw error;
    }
    return c.json({id:credentialId,secret,expiresAt,scopes:b.scopes},201);
  });
  app.post('/rest-credentials/:id/revoke',async c=>{
    const p=await currentOwner(c),credentialId=c.req.param('id');
    if(!await c.env.DB.prepare('SELECT 1 FROM rest_credentials WHERE workspace_id=? AND id=?').bind(p.workspaceId,credentialId).first())throw new ApiError(404,'not_found','Credential not found');
    await c.env.DB.batch([c.env.DB.prepare(`UPDATE rest_credentials SET state='revoked',secret_hash=NULL,invalidated_at=? WHERE workspace_id=? AND id=? AND state='active' AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`)
      .bind(now(),p.workspaceId,credentialId,p.workspaceId,p.userId),auditStatement(c,'rest.credential_revoked',credentialId,{},true)]);
    await currentOwner(c);
    return c.json({revoked:true});
  });
}
