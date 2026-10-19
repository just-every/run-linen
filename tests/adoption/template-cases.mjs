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
