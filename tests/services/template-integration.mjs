import assert from 'node:assert/strict';
/** CHANGE-001: the production change/execution/grant path; only remote HTTP is a test edge. */
export async function templateIntegration({ok,call,db,implementation}) {
  const service=await ok('POST','/services',{name:'Standard catalog integration',description:'Reviewed order workflow',businessImpact:'Sales',source:'Reviewed fixture register',observedAt:new Date().toISOString()});
  const templateBody={title:'Standard deployment from catalog',risk:'Bounded',impact:'Sales',services:[service.id],cohorts:['a','b'],canaryCohorts:['a','b'],implementation,compensation:{...implementation,payload:{release:'r1'}},implementationPlan:'Deploy reviewed release',testPlan:'Independent workflow check',backoutPlan:'Restore previous release',active:true};
  let template=await ok('POST','/change-templates',templateBody);
  template=await ok('POST',`/change-templates/${template.id}/approve`,{revision:template.revision,version:template.data.version,reason:'Exact repeatable plan preapproved by owner'});
  const window={start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()};
  let standard=await ok('POST','/changes',{changeType:'standard',templateId:template.id,templateVersion:template.data.version,window},'operator');
  assert.equal(standard.data.approvalPath,'catalog');assert.equal(standard.data.authorizations.length,0);
  const before=(await ok('POST','/fixture/state',{})).writes;
  assert.equal((await call('POST',`/changes/${standard.id}/dispatch`,{revision:standard.revision,phase:'canary',idempotencyKey:'no-bound-grant'},'operator')).body.error.code,'authorization','CHANGE-001 preapproval alone grants no effect');
  // An otherwise valid grant deliberately belongs to another beneficiary.
  const grant=await ok('POST','/grants',{principalId:'operator',beneficiaryId:'another-team',action:'deployment.canary',actionVersion:1,target:'orders',connectionId:'deploy',validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:1,conditions:{payloadHash:'deliberately-out-of-scope'}});
  standard=await ok('POST',`/changes/${standard.id}/grants`,{revision:standard.revision,grantReferences:[{id:grant.id,version:grant.version,phase:'canary'}]},'operator');
  const approvalId=template.data.approval.id;
  template=await ok('PATCH',`/change-templates/${template.id}`,{revision:template.revision,testPlan:'Revised test for future requests',active:false});
  const refusal=await call('POST',`/changes/${standard.id}/dispatch`,{revision:standard.revision,phase:'canary',idempotencyKey:'wrong-beneficiary'},'operator');
  assert.equal(refusal.status,403);assert.equal(refusal.body.error.code,'grant_scope_denied','CHANGE-001 retained approved snapshot survives later edit/deactivation and still requires a separate in-scope grant');
  assert.equal((await ok('POST','/fixture/state',{})).writes,before,'CHANGE-001 out-of-grant standard change emits no provider bytes');
  template=await ok('POST',`/change-templates/${template.id}/withdraw`,{revision:template.revision,approvalId,reason:'Explicit owner withdrawal for the original exact approval'});
  const withdrawn=await call('POST',`/changes/${standard.id}/dispatch`,{revision:standard.revision,phase:'canary',idempotencyKey:'withdrawn-approval'},'operator');
  assert.equal(withdrawn.body.error.code,'template_approval','CHANGE-001 explicit withdrawal fences the original snapshot at the real execution boundary');
  assert.equal((await ok('POST','/fixture/state',{})).writes,before);
  // Real native restore is inert even when source template and change were approved.
  await db.prepare("UPDATE workspace_settings SET settings_json='{\"executionHeld\":true}' WHERE workspace_id='w'").run();
  for(const [record,newId] of [[template,'restored-template'],[standard,'restored-standard']]) {
    const row=await db.prepare('SELECT * FROM svc_records WHERE id=?').bind(record.id).first();
    await ok('POST','/fixture/restore',{table:'svc_records',row:{...row,id:newId},sourceId:'template-archive',sourceKey:record.id});
  }
  const restoredTemplate=await ok('GET','/change-templates/restored-template'),restoredChange=await ok('GET','/changes/restored-standard');
  assert.equal(restoredTemplate.data.active,false);assert.equal(restoredTemplate.data.approval,null);assert.ok(restoredTemplate.data.priorApprovals.every(a=>a.inert),'CHANGE-001 restored historical approvals stay inert');
  assert.equal(restoredChange.data.cabBypass,null);assert.equal(restoredChange.data.authorizations.length,0);
  // A plan mentioning an erased identity cannot keep live approval after redaction.
  let personal=await ok('POST','/change-templates',{...templateBody,title:'Private operator plan',testPlan:'operator must review the independent evidence'});
  personal=await ok('POST',`/change-templates/${personal.id}/approve`,{revision:personal.revision,version:personal.data.version,reason:'Reviewed operator procedure'});
  return {personalTemplateId:personal.id};
}
export async function templateErasureCheck(ok,id) {
  const personal=await ok('GET',`/change-templates/${id}`);
  assert.equal(personal.data.active,false);assert.equal(personal.data.approval,null);assert.ok(personal.data.priorApprovals.every(a=>a.inert),'CHANGE-001 erased approval history cannot revive old bypass');assert.ok(!personal.data.testPlan.includes('operator'));
  console.log('PASS CHANGE-001 real execution path: CAB-free catalog needs separate grants, snapshot retained across template edits, explicit withdrawal and wrong beneficiary refused with zero HTTP writes, inert template/change restore and approval withdrawal on privacy erasure.');
}
