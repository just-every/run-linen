import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export default async function prepare({phase,request,origin,cookie}) {
 const sessionResponse=await request(origin+'/api/v1/session',{headers:{cookie}});
 assert.equal(sessionResponse.status,200);
 const session=await sessionResponse.json();
 const api=async(path,body)=>{
  const response=await request(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{cookie,origin,'content-type':'application/json','X-Linen-CSRF':session.csrfToken},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.ok(response.ok,`Native ${path}: ${response.status}`);
  return response.json();
 };
 const suffix=randomUUID(), name='Linen ticket assistant';
 const bot=await api('/automation-principals',{name:'Cable triage automation',idempotencyKey:suffix});
 const group=await api('/work-groups',{name:'Workplace hardware '+suffix});
 const credential=await api('/mcp-credentials',{principalId:bot.id,name,groupIds:[group.id],scopes:['work.read','work.create','work.comment'],tools:['work.list','work.get','work.history','work.search','work.create','work.comment'],expiresAt:new Date(Date.now()+3600000).toISOString()});
 const clients={local:{token:credential.secret,clientId:credential.id,agent:{id:credential.id,name,specialist:'IT service desk agent'}}};
 if(phase==='initial'||phase==='removed')return {values:{},clients};
 const title='Replacement display cable '+suffix;
 const ticket=await api('/work',{title,body:'The display flickers during video calls. Please check the USB-C cable.',deduplicationKey:suffix,kind:'incident'});
 const routed=await api('/work/'+ticket.id+'/group',{groupId:group.id,revision:ticket.revision,assigneeId:null});
 const view=await api('/work/'+ticket.id);
 return {clients,values:{ticket:view.work,key:randomUUID(),query:title,createKey:randomUUID()}};
}
