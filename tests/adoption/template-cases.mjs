import assert from 'node:assert/strict';
export async function attachArchiveTemplates(ok,auth) {
  const ci=(await ok('/services','GET',undefined,auth)).items.find(s=>s.data.name==='Portable calendar CI');assert.ok(ci);
  let template=await ok('/change-templates','POST',{title:'Portable standard plan',risk:'Bounded',impact:'Payroll',services:[ci.id],cohorts:['Denver'],canaryCohorts:['Denver'],implementation:{release:'reviewed'},compensation:{release:'prior'},implementationPlan:'Deploy reviewed package',testPlan:'Check payroll independently',backoutPlan:'Restore prior package',active:true},auth,201);
  template=await ok(`/change-templates/${template.id}/approve`,'POST',{revision:template.revision,version:template.data.version,reason:'Owner preapproves exact portable version'},auth);
  await ok('/changes','POST',{changeType:'standard',templateId:template.id,templateVersion:template.data.version,window:{start:'2031-02-01T01:00:00Z',end:'2031-02-01T02:00:00Z'}},auth,201);
}
export async function checkArchiveTemplates(ok,auth) {
  const template=(await ok('/change-templates','GET',undefined,auth)).items.find(t=>t.data.title==='Portable standard plan');assert.ok(template,'CHANGE-001 template survives native archive');
  assert.equal(template.data.active,false);assert.equal(template.data.approval,null,'CHANGE-001 restore never carries preapproval');
  const ci=(await ok('/services','GET',undefined,auth)).items.find(s=>s.data.name==='Portable calendar CI');assert.deepEqual(template.data.services,[ci.id],'CHANGE-001 template CI references remap');
  assert.equal(template.data.testPlan,'Check payroll independently','CHANGE-001 portable template plans survive');
  const standard=(await ok('/changes','GET',undefined,auth)).items.find(t=>t.data.title==='Portable standard plan');assert.ok(standard);
  assert.equal(standard.data.cabBypass,null);assert.deepEqual(standard.data.authorizations,[],'CHANGE-001 restored standard change has no CAB bypass or effect authority');
  console.log('PASS CHANGE-001 native archive: exact plans and remapped CI retained; template inactive/unapproved and standard change bypass withdrawn.');
}

/** CHANGE-001 point 8: affected personal-data erasure withdraws a live template approval. */
export async function attachPrivateTemplate(ok,owner,person) {
  const service=await ok('/services','POST',{name:'Private handover CI',description:'Handover service',businessImpact:'Handover blocked',source:'Reviewed register',observedAt:new Date().toISOString()},owner,201);
  const subject=`${person.name} (${person.email})`;
  let template=await ok('/change-templates','POST',{title:`Handover plan for ${person.name}`,risk:'Bounded',impact:'Handover',services:[service.id],cohorts:['Denver'],canaryCohorts:['Denver'],implementation:{release:'reviewed'},compensation:{release:'prior'},implementationPlan:`Deploy after ${subject} confirms`,testPlan:`Ask ${person.email} to verify`,backoutPlan:'Restore prior package',active:true,participants:[person.id]},owner,201);
  template=await ok(`/change-templates/${template.id}/approve`,'POST',{revision:template.revision,version:template.data.version,reason:`Preapproved with ${person.name}`},owner);
  assert.ok(template.data.approval?.id&&template.data.active,'The private template is active with a live approval before erasure');
  const change=await ok('/changes','POST',{changeType:'standard',templateId:template.id,templateVersion:template.data.version,window:{start:'2031-03-01T01:00:00Z',end:'2031-03-01T02:00:00Z'}},owner,201);
  assert.equal(change.data.cabBypass.approvalId,template.data.approval.id,'The standard change is bound to the live approval');
  return {templateId:template.id,approvalId:template.data.approval.id,changeId:change.id,person};
}
export async function checkPrivateTemplateErased(ok,owner,{templateId,approvalId,changeId,person}) {
  const template=await ok(`/change-templates/${templateId}`,'GET',undefined,owner),raw=JSON.stringify(template);
  assert.equal(template.data.active,false,'CHANGE-001 erasure leaves the affected template inactive');
  assert.equal(template.data.approval,null,'CHANGE-001 erasure leaves no live template approval');
  const prior=template.data.priorApprovals.find(a=>a.id===approvalId);
  assert.ok(prior&&prior.inert===true,'CHANGE-001 the former approval is retained inert');
  assert.ok(template.data.priorApprovals.every(a=>a.inert===true),'CHANGE-001 every retained approval is inert');
  for(const value of [person.email,person.name,person.id])assert.ok(!raw.includes(value),`CHANGE-001 erased subject content is removed from the template (${value===person.id?'id':value===person.name?'name':'email'})`);
  assert.ok(!template.participants?.includes?.(person.id),'CHANGE-001 the subject no longer participates in the template');
  const change=(await ok('/changes','GET',undefined,owner)).items.find(c=>c.id===changeId);assert.ok(change);
  assert.equal(change.data.cabBypass,null,'CHANGE-001 the in-flight standard change loses its catalog bypass');
  assert.deepEqual(change.data.authorizations,[]);
  assert.ok(!JSON.stringify(change).includes(person.email));
  await ok('/changes','POST',{changeType:'standard',templateId,templateVersion:template.data.version,window:{start:'2031-03-02T01:00:00Z',end:'2031-03-02T02:00:00Z'}},owner,409);
}
