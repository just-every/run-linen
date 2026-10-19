import assert from 'node:assert/strict';
export async function attachArchiveApplications(ok,auth) {
  const session=await ok('/session','GET',undefined,auth);
  const app=await ok('/applications','POST',{name:'Portable Salesforce',ownerId:session.user.id,approverIds:[session.user.id],connector:'Salesforce not connected',sensitivity:'confidential',entitlements:[{name:'Portable administrator',target:'archive-salesforce-admin',costCents:16500,billingPeriod:'month'}]},auth,201);
  const catalog=await ok('/catalog','POST',{name:'Portable Salesforce admin',kind:'access',applicationId:app.id,entitlementId:app.data.entitlements[0].id},auth,201);
  const work=(await ok('/fixtures/records','GET',undefined,auth)).work.find(w=>w.title==='Restricted laptop fault');
  assert.ok(work);
  await ok(`/work/${work.id}/fulfilment`,'POST',{catalogId:catalog.id,beneficiaryId:session.user.id,purpose:'Configure Salesforce'},auth,201);
}
export async function checkArchiveApplications(ok,request,auth) {
  const app=(await ok('/applications','GET',undefined,auth)).items.find(a=>a.data.name==='Portable Salesforce');
  assert.ok(app,'ACCESS-008 application registry survives native restore');
  const catalog=(await ok('/catalog','GET',undefined,auth)).items.find(c=>c.name==='Portable Salesforce admin');
  assert.ok(catalog,'ACCESS-008 entitlement-linked catalog survives native restore');
  const records=await ok('/fixtures/records','GET',undefined,auth),work=records.work.find(w=>w.title==='Restricted laptop fault');
  assert.ok(work);
  const snapshot=(await ok(`/work/${work.id}/application-services`,'GET',undefined,auth)).items[0];
  assert.equal(snapshot.applicationId,app.id,'ACCESS-008 archived application link remaps');
  assert.equal(snapshot.entitlementId,app.data.entitlements[0].id,'ACCESS-008 entitlement identity is retained');
  assert.equal(snapshot.ownerId,app.ownerId,'ACCESS-008 application owner remaps with request snapshot');
  assert.equal(snapshot.costCents,16500,'ACCESS-008 archived request retains exact USD cost');
  assert.equal(snapshot.billingPeriod,'month');
  const session=await ok('/session','GET',undefined,auth);
  assert.notEqual(snapshot.ownerId,session.user.id,'ACCESS-008 native restore never turns an old app owner into the destination owner');
  assert.equal((await request('/catalog','POST',{name:'Must review restored ownership',kind:'access',applicationId:app.id,entitlementId:app.data.entitlements[0].id},auth)).status,409,'ACCESS-008 restored historical owners have no live membership authority');
  assert.equal((await request('/fixtures/effect','POST',{},auth)).status,409,'ACCESS-008 restored application metadata cannot lift the execution hold');
  console.log('PASS ACCESS-008 native archive remaps application, entitlement, cost and owner snapshot without live authority');
}
