import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { decryptSecret, hashToken } from '../../platform/crypto';
import { developmentOwner, normalDevelopmentTicket, positiveId, type DevelopmentBinding } from './development-bindings';
import { departmentWorkBatch } from '../work/department-spaces';
import { slaPauseStatements } from '../work/sla-policies';
import { ticketHistory } from '../work/work-history';
import { approvedTemplate } from './change-templates';
import { prepareChange } from './changes';
import { serviceEvent, serviceSnapshot } from './history';

/** Native GitHub signatures authenticate bytes; the owner binding supplies all local authority. */
export async function ingestDevelopmentEvent(env:Env,key:string,request:Request) {
 const row=await env.DB.prepare('SELECT * FROM svc_development_bindings WHERE id=?').bind(key).first<DevelopmentBinding>();
 if(!row?.active||!row.secret_ciphertext)throw new ApiError(404,'not_found','Active binding not found');
 const raw=await request.text();
 if(raw.length>262144)throw new ApiError(413,'too_large','Development event too large');
 const signature=request.headers.get('x-hub-signature-256')||'';
 if(!/^sha256=[0-9a-f]{64}$/i.test(signature))throw new ApiError(401,'signature','Invalid GitHub signature');
 const secret=await decryptSecret(env.ENCRYPTION_KEY,row.secret_ciphertext);
 const cryptoKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('HMAC',cryptoKey,Uint8Array.from(signature.slice(7).match(/../g)!,v=>parseInt(v,16)),new TextEncoder().encode(raw)))throw new ApiError(401,'signature','Invalid GitHub signature');
 const p=await developmentOwner(env,{userId:row.owner_id,workspaceId:row.workspace_id,roles:['owner']} as Principal);
 const held=await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first<{settings_json:string}>();
 if(held&&JSON.parse(held.settings_json).executionHeld)throw new ApiError(409,'development_held','Restored or held workspaces require fresh owner review');
 let event:any;try{event=JSON.parse(raw);}catch{throw new ApiError(400,'json','Invalid development event');}
 if(event.repository?.id!==row.repository_id||event.repository?.full_name!==row.repository_name)throw new ApiError(422,'repository_binding','Event does not match the bound repository');
 const delivery=request.headers.get('x-github-delivery')||'',type=request.headers.get('x-github-event');
 if(!/^[a-zA-Z0-9-]{1,128}$/.test(delivery))throw new ApiError(422,'delivery_id','A GitHub delivery identity is required');
 const digest=await hashToken(raw);
 const duplicate=async()=>{
  const prior=await env.DB.prepare('SELECT digest,result_id FROM svc_development_receipts WHERE binding_id=? AND delivery_id=?').bind(key,delivery).first<{digest:string;result_id:string}>();
  if(prior){if(prior.digest!==digest)throw new ApiError(409,'replay_conflict','Delivery identity was reused');return {duplicate:true,resultId:prior.result_id};}
  return null;
 };
 const prior=await duplicate();if(prior)return prior;
 let observed:string,eventKey:string,body:string|undefined;
 if(row.kind==='issue') {
  if(event.issue?.number!==row.issue_number||event.issue?.pull_request)throw new ApiError(422,'issue_binding','Event does not match the bound issue');
  if(type==='issues'&&['closed','reopened'].includes(event.action)) {
   if(event.issue.state!==(event.action==='closed'?'closed':'open'))throw new ApiError(422,'issue_state','Issue action and state disagree');
   observed=event.issue.updated_at;eventKey=`issue:${row.issue_number}:${event.action}:${observed}`;
   body=`GitHub issue #${row.issue_number} ${event.action}. ${event.action==='closed'?'Verify with employee; this is not verified recovery.':'Engineering investigation reopened.'}`;
  } else if(type==='issue_comment'&&event.action==='created') {
   observed=event.comment?.created_at;eventKey=`comment:${positiveId(event.comment?.id,'comment.id')}`;
   if(typeof event.comment.body!=='string'||!event.comment.body.trim()||event.comment.body.length>16000)throw new ApiError(422,'comment','A bounded comment is required');
   body=`GitHub issue #${row.issue_number} comment: ${event.comment.body}`;
  } else throw new ApiError(422,'development_event','Unsupported issue event');
 } else {
  if(type!=='deployment'||event.deployment?.environment!=='production'||event.deployment?.production_environment!==true)throw new ApiError(422,'deployment_environment','A production deployment event is required');
  observed=event.deployment.created_at;eventKey=`deployment:${positiveId(event.deployment.id,'deployment.id')}`;
 }
 if(typeof observed!=='string'||!Number.isFinite(Date.parse(observed))||Math.abs(Date.now()-Date.parse(observed))>300000)throw new ApiError(422,'event_freshness','A fresh development event is required');
 // Issue status ordering does not discard comments or independent deployment identities.
 const statusEvent=row.kind==='issue'&&type==='issues';
 const existing=await env.DB.prepare('SELECT digest,result_id FROM svc_development_receipts WHERE binding_id=? AND event_key=?').bind(key,eventKey).first<{digest:string;result_id:string}>();
 if(existing){if(existing.digest!==digest)throw new ApiError(409,'replay_conflict','Event identity was reused');return {duplicate:true,resultId:existing.result_id};}
 if(statusEvent&&row.last_observed_at&&Date.parse(observed)<=Date.parse(row.last_observed_at))throw new ApiError(409,'event_order','Issue status is older than the last accepted status');
 const at=now(),guard=id(),db=env.DB;
 const guardStatement=db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM svc_development_bindings b JOIN memberships m ON m.workspace_id=b.workspace_id AND m.user_id=b.owner_id WHERE b.id=? AND b.revision=? AND b.active=1 AND b.secret_ciphertext IS NOT NULL AND m.active=1 AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner')) AND NOT EXISTS(SELECT 1 FROM workspace_settings WHERE workspace_id=? AND json_extract(settings_json,'$.executionHeld')=1) THEN 1 ELSE 0 END)`).bind(guard,key,row.revision,p.workspaceId);
 const receipt=(resultId:string)=>db.prepare('INSERT INTO svc_development_receipts VALUES(?,?,?,?,?,?)').bind(key,delivery,eventKey,digest,resultId,at);
 const finish=[db.prepare('UPDATE svc_development_bindings SET revision=revision+1,last_observed_at=CASE WHEN ? THEN ? ELSE last_observed_at END WHERE id=?').bind(statusEvent?1:0,observed,key),db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard)];
 try {
  if(row.kind==='issue') {
   const work=await normalDevelopmentTicket(env,p,row.target_id),ctx={env,principal:p};
   const statements=[guardStatement,receipt(work.id)];
   if(statusEvent) {
    const closed=event.action==='closed',state=closed?'paused':'open',statusId='development-verify-'+p.workspaceId;
    const existingStatus=await db.prepare("SELECT id,waiting_on FROM work_custom_statuses WHERE workspace_id=? AND name='Verify with employee'").bind(p.workspaceId).first<{id:string;waiting_on:string|null}>();
    if(existingStatus&&existingStatus.waiting_on!=='requester')throw new ApiError(409,'verification_status','Existing verification status must wait on the requester');
    const selectedStatus=existingStatus?.id||statusId;
    statements.push(db.prepare("INSERT OR IGNORE INTO work_custom_statuses VALUES(?,?,'Verify with employee','requester',?,?)").bind(statusId,p.workspaceId,p.userId,at));
    statements.push(db.prepare('UPDATE work_records SET state=?,paused_at=?,paused_ms=paused_ms+?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(state,closed?at:null,work.paused_at?Math.max(0,Date.parse(at)-Date.parse(work.paused_at)):0,at,p.workspaceId,work.id,work.revision));
    statements.push(ticketHistory(ctx,work,'work.transitioned',{state:work.state},{state},at));
    statements.push(...slaPauseStatements(ctx,work.id,closed?'pause':'resume',closed?'requester':undefined,at,closed?selectedStatus:null));
   }
   statements.push(db.prepare("INSERT INTO work_messages VALUES(?,?,?,?,'private',?,?,?)").bind(id(),p.workspaceId,work.id,p.userId,body!,`development:${key}:${eventKey}`,at),...finish);
   await departmentWorkBatch(ctx,work,statements,'private');
   return {duplicate:false,resultId:work.id};
  }
  const template=await approvedTemplate(db,p,row.target_id,row.template_version!);
  const deployment=event.deployment,payload=deployment.payload;
  const pr=positiveId(payload?.pullRequestNumber,'payload.pullRequestNumber'),run=positiveId(payload?.runId,'payload.runId');
  const data=await prepareChange(db,p,{changeType:'standard',templateId:template.id,templateVersion:row.template_version,window:{start:observed,end:new Date(Date.parse(observed)+3600000).toISOString()}});
  const resultId=id(),origin=`https://github.com/${row.repository_name}`;
  data.developmentContext={provider:'github',repositoryId:row.repository_id,deploymentId:deployment.id,pullRequest:`${origin}/pull/${pr}`,run:`${origin}/actions/runs/${run}`,deployment:`${origin}/deployments/${deployment.id}`,observedAt:observed};
  const record={id:resultId,kind:'change' as const,ownerId:p.userId,visibility:'operators',participants:[],data};
  const templateGuard=id();
  await db.batch([guardStatement,
   db.prepare('INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=? AND id=? AND revision=?) THEN 1 ELSE 0 END)').bind(templateGuard,p.workspaceId,template.id,template.revision),
   receipt(resultId),db.prepare("INSERT INTO svc_records VALUES(?,?,'change',?,'operators','[]',?,1,?,?)").bind(resultId,p.workspaceId,p.userId,JSON.stringify(data),at,at),
   serviceEvent(db,p,record,{},serviceSnapshot(record),'development-deployment-recorded',at),
   db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(templateGuard),...finish]);
  return {duplicate:false,resultId};
 } catch(error) {
  const raced=await duplicate();if(raced)return raced;
  const eventRace=await db.prepare('SELECT digest,result_id FROM svc_development_receipts WHERE binding_id=? AND event_key=?').bind(key,eventKey).first<{digest:string;result_id:string}>();
  if(eventRace?.digest===digest)return {duplicate:true,resultId:eventRace.result_id};
  if(/constraint/i.test(String(error)))throw new ApiError(409,'development_changed','Binding, source event or authority changed; reconcile before retry');
  throw error;
 }
}
