import type { Env } from '../../platform/types';
import { decodeHistory } from './registry';
import { identityMatcher } from './identity';
import { historyEventKey, intersectRedaction, redactHistory } from './redact';

interface Context {env:Pick<Env,'DB'|'ENCRYPTION_KEY'>;principal:{workspaceId:string}}
/** The archive boundary uses precisely the live history policy. Unknown row
 * schemas remain subject to adoption's existing refusal/clearing rules. */
export async function historyArchiveRow(ctx:Context,table:string,row:Record<string,any>) {
  if(!['audit_events','svc_events'].includes(table))return {row,typed:false};
  const store=table==='audit_events'?'audit':'service',column=store==='audit'?'detail_json':'data_json';
  const e=decodeHistory(row[column]);
  const key=historyEventKey(store,String(row.id),e);
  const prior=await ctx.env.DB.prepare('SELECT envelope_json FROM history_redactions WHERE workspace_id=? AND event_key=?').bind(ctx.principal.workspaceId,key).first<{envelope_json:string}>();
  const matches=await identityMatcher(ctx.env,ctx.principal.workspaceId);
  const count=await ctx.env.DB.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? UNION ALL SELECT 1 FROM history_identity_tombstones WHERE workspace_id=? LIMIT 1').bind(ctx.principal.workspaceId,ctx.principal.workspaceId).first();
  if(!prior&&!count)return {row,typed:!!e};
  const at=new Date().toISOString(),result=await redactHistory(row[column],at,matches,row.actor_id);
  const payload=prior?intersectRedaction(result.payload,JSON.parse(prior.envelope_json)):result.payload;
  return {row:{...row,[column]:JSON.stringify(payload),...(result.actorErased?{actor_id:'[erased]'}:{})},typed:!!e||!!prior};
}
