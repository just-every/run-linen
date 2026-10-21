import assert from 'node:assert/strict';
export const archivedQuote='%PDF-1.7 synthetic-linen-archive-quote\n%%EOF\n';
export async function attachArchiveApplications(ok,auth,raw) {
  const session=await ok('/session','GET',undefined,auth);
  const app=await ok('/applications','POST',{name:'Portable Salesforce',ownerId:session.user.id,approverIds:[session.user.id],connector:'Salesforce not connected',sensitivity:'confidential',entitlements:[{name:'Portable administrator',target:'archive-salesforce-admin',costCents:16500,billingPeriod:'month'}]},auth,201);
  const catalog=await ok('/catalog','POST',{name:'Portable Salesforce admin',kind:'access',applicationId:app.id,entitlementId:app.data.entitlements[0].id},auth,201);
  const work=(await ok('/fixtures/records','GET',undefined,auth)).work.find(w=>w.title==='Restricted laptop fault');
  assert.ok(work);
  await ok(`/work/${work.id}/fulfilment`,'POST',{catalogId:catalog.id,beneficiaryId:session.user.id,purpose:'Configure Salesforce'},auth,201);
  // CATALOG-001: a submitted vendor quote travels in the owner's native archive with its bytes.
  const item=await ok('/catalog','POST',{name:'Portable service purchase',kind:'service',target:'archive-quote-service',ownerId:session.user.id,form:{quoteRequired:true}},auth,201);
  const upload=await raw(`/work/${work.id}/catalog-quote`,{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':'synthetic-linen-archive-quote.pdf','X-Catalog-Id':item.id,'X-Linen-CSRF':auth.csrf,Cookie:auth.cookie},body:archivedQuote});
  assert.equal(upload.status,201);
  await ok(`/work/${work.id}/fulfilment`,'POST',{catalogId:item.id,catalogRevision:1,beneficiaryId:session.user.id,purpose:'Vendor purchase'},auth,201);
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
  const quote=(await ok(`/work/${work.id}`,'GET',undefined,auth)).quotes[0];
  assert.ok(quote,'CATALOG-001 the quote-backed request survives native restore');
  assert.equal(quote.name,'synthetic-linen-archive-quote.pdf');assert.equal(quote.submitted,true,'CATALOG-001 the restored quote stays bound to its submission');
  const file=await request(`/catalog-quotes/${quote.id}`,'GET',undefined,auth);
  assert.equal(file.status,200,'CATALOG-001 the destination owner reads the restored quote');
  assert.equal(await file.text(),archivedQuote,'CATALOG-001 native restore returns the exact quote bytes');
  console.log('PASS ACCESS-008 native archive remaps application, entitlement, cost and owner snapshot without live authority');
}
