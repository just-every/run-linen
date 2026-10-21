import type { Context } from 'hono';
import type { AppEnv } from '../../platform/types';
import { hashToken } from '../../platform/crypto';
import { id, now } from '../../platform/http';
import { expireMcpCredentials } from './credentials';

type Credential = { id: string; workspace_id: string; principal_id: string };
const livePrincipal = `EXISTS(SELECT 1 FROM memberships m JOIN execution_automation_principals a
 ON a.workspace_id=m.workspace_id AND a.user_id=m.user_id WHERE m.workspace_id=mcp_credentials.workspace_id
 AND m.user_id=mcp_credentials.principal_id AND m.active=1 AND a.revoked_at IS NULL
 AND json_array_length(m.roles_json)=1 AND json_extract(m.roles_json,'$[0]')='integration')
 AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=mcp_credentials.workspace_id AND e.person_id=mcp_credentials.principal_id)
 AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=mcp_credentials.workspace_id AND p.user_id=mcp_credentials.principal_id)`;
async function authenticate(c: Context<AppEnv>): Promise<Credential | null> {
  const authorization = c.req.header('Authorization') ?? '';
  if (!/^Bearer linen_mcp_[a-f0-9-]{72}$/.test(authorization)) return null;
  const digest = await hashToken(authorization.slice(7));
  await expireMcpCredentials(c.env);
  // This write is also the commit-time authority check; discovery uses no ticket data.
  return c.env.DB.prepare(`UPDATE mcp_credentials SET last_used_at=? WHERE secret_hash=?
    AND state='active' AND expires_at>? AND ${livePrincipal} RETURNING id,workspace_id,principal_id`)
    .bind(now(),digest,now()).first<Credential>();
}
export async function mcpProtocol(c: Context<AppEnv>) {
  c.header('Cache-Control','no-store');
  // Authenticate before parsing a method, an id, or any discovery request.
  const credential = await authenticate(c);
  if (!credential) {
    c.header('WWW-Authenticate','Bearer realm="linen-mcp"');
    return c.json({jsonrpc:'2.0',id:null,error:{code:-32001,message:'Authentication required'}},401);
  }
  if (c.req.method !== 'POST') return c.body(null,405);
  let request: any;
  try {
    if (Number(c.req.header('Content-Length') ?? 0)>1048576) throw new Error();
    request = await c.req.json();
  } catch { return c.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},400); }
  const requestId = typeof request?.id === 'string' || typeof request?.id === 'number' ? request.id : null;
  if (!request || Array.isArray(request) || request.jsonrpc!=='2.0' || typeof request.method!=='string')
    return c.json({jsonrpc:'2.0',id:requestId,error:{code:-32600,message:'Invalid request'}},400);
  const method = request.method;
  let result: unknown, error: {code:number;message:string} | undefined;
  if (method==='initialize') result = {protocolVersion:'2025-03-26',capabilities:{tools:{},resources:{}},serverInfo:{name:'Linen',version:'0.1.0'},instructions:'Ticket tools are not available in this release.'};
  else if (method==='ping') result = {};
  else if (method==='tools/list') result = {tools:[]};
  else if (method==='resources/list') result = {resources:[]};
  else if (method==='resources/templates/list') result = {resourceTemplates:[]};
  else if (method==='notifications/initialized') result = {};
  else error = {code:-32601,message:'Method unavailable'};
  // Use a closed method name; never copy tool names, argument bodies, free text or secrets.
  const auditedMethod = ['initialize','ping','tools/list','resources/list','resources/templates/list','notifications/initialized','tools/call'].includes(method) ? method : 'unavailable';
  await c.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(),credential.workspace_id,credential.principal_id,'mcp.call',credential.id,
      JSON.stringify({credentialId:credential.id,principalId:credential.principal_id,method:auditedMethod,targetIds:[],outcome:error?'method_unavailable':'success'}),now()).run();
  if (request.id===undefined) return c.body(null,202);
  return c.json({jsonrpc:'2.0',id:requestId,...(error?{error}:{result})});
}
