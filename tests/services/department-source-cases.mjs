import assert from 'node:assert/strict';

// Department membership must hold on derived service and execution doors too.
export async function departmentSourceChecks({call:rootCall,db}) {
  const workspace='department-source-workspace',stamp=new Date().toISOString();
  await db.batch([
    db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(workspace,'Department source checks',stamp),
    db.prepare('INSERT INTO workspace_settings VALUES(?,?,1)').bind(workspace,'{}'),
    ...['owner','operator'].map(user=>db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(workspace,user,JSON.stringify([user]))),
  ]);
  const call=(method,path,body,user='owner')=>rootCall(method,path,body,user,workspace);
  const ok=async(method,path,body,user)=>{const result=await call(method,path,body,user);assert.ok(result.status<300,JSON.stringify(result));return result.body;};
  const department=await ok('POST','/departments',{name:'Facilities service operations',kind:'facilities'});
  const ticket=await ok('POST','/work',{title:'Facilities printer incident',body:'Printer unavailable in the north office',kind:'incident',departmentId:department.id,deduplicationKey:'department-source-incident'});
  await db.prepare('INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at,context_type,context_snapshot_json) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind('department-source-plan',workspace,ticket.id,ticket.revision,'owner','[]','department-source-plan',stamp,'work','{}').run();
  const service=await ok('POST','/services',{name:'North office printing',description:'Office print workflow',businessImpact:'Printing unavailable',source:'Reviewed service record',observedAt:stamp});
  let incident=await ok('POST','/incidents',{title:'North office printer outage',serviceId:service.id,impact:'Office printing unavailable',cohorts:['north-office']});
  const assetBody={name:'North office printer',serviceId:service.id,assetType:'hardware',externalId:'synthetic-linen-12001',source:'Reviewed asset register',currency:'USD',acquisitionCost:500,observedAt:stamp};
  let asset=await ok('POST','/software-assets',assetBody);
  const assign=()=>({revision:asset.revision,personId:'owner',workId:ticket.id,receipt:'Reviewed handoff to office custodian',source:'Owner custody review'});
  assert.equal((await call('POST',`/incidents/${incident.id}/link`,{revision:incident.revision,employeeIncidentId:ticket.id},'operator')).status,403);
  assert.equal((await call('POST',`/software-assets/${asset.id}/assign`,assign(),'operator')).status,404);
  assert.equal((await ok('GET','/plans',undefined,'operator')).some(plan=>plan.id==='department-source-plan'),false);
  assert.equal((await call('POST','/plans',{workId:ticket.id,revision:ticket.revision,idempotencyKey:'department-origin-refusal',steps:[{action:'group.add',actionVersion:1,target:'synthetic-linen-12002',beneficiaryId:'owner',connectionId:'missing',grantId:'missing',grantVersion:1}]},'operator')).status,403,'Unrelated staff cannot propose an effect against departmental work');
  const membership=async active=>{
    const current=(await ok('GET','/departments')).items.find(item=>item.id===department.id);
    return ok('POST',`/departments/${department.id}/members`,{revision:current.revision,userId:'operator',active});
  };
  await membership(true);
  assert.equal((await ok('GET','/plans',undefined,'operator')).some(plan=>plan.id==='department-source-plan'),true);
  incident=await ok('POST',`/incidents/${incident.id}/link`,{revision:incident.revision,employeeIncidentId:ticket.id},'operator');
  assert.equal(incident.data.links.some(link=>link.employeeIncidentId===ticket.id),true);
  asset=await ok('POST',`/software-assets/${asset.id}/assign`,assign(),'operator');
  assert.equal(asset.data.assignments.at(-1).workId,ticket.id);
  // A previously accepted problem retains its ticket source fence after revocation.
  await db.prepare('INSERT INTO svc_records VALUES(?,?,?,?,?,?,?,1,?,?)').bind('department-source-problem',workspace,'problem','owner','operators','[]',JSON.stringify({title:'Department source problem',serviceId:service.id,sourceProposalId:'reviewed-department-proposal',evidence:[{type:'ticket',id:ticket.id,revision:ticket.revision}],incidentIds:[],workarounds:[]}),stamp,stamp).run();
  assert.equal((await call('GET','/problems/department-source-problem',undefined,'operator')).status,200);
  await membership(false);
  assert.equal((await ok('GET','/plans',undefined,'operator')).some(plan=>plan.id==='department-source-plan'),false);
  assert.equal((await call('GET','/problems/department-source-problem',undefined,'operator')).status,404);
  assert.equal((await ok('GET','/problems',undefined,'operator')).items.some(item=>item.id==='department-source-problem'),false);
  const anotherAsset=await ok('POST','/software-assets',{...assetBody,name:'Second north office printer',externalId:'synthetic-linen-12003'});
  assert.equal((await call('POST',`/software-assets/${anotherAsset.id}/assign`,{...assign(),revision:anotherAsset.revision},'operator')).status,404);
  assert.equal((await call('GET','/problems/department-source-problem')).status,200,'Existing owner authority remains available');
}
