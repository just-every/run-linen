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
  const approver=await ok('/members','POST',{email:'synthetic-linen-210@example.test',name:'synthetic-linen-210',password:'synthetic-linen-211-passphrase',roles:['employee']},auth,201);
  const calendar=(await ok('/approval-calendars','GET',undefined,auth)).items[0];
  await ok(`/catalog/${item.id}/approvals`,'POST',{revision:1,calendarId:calendar.id,approvals:[{key:'synthetic_linen_212',name:'synthetic-linen-212',mode:'any',approvers:[{type:'member',userId:approver.id}],remindHours:8,slaHours:24}]},auth);
  const upload=await raw(`/work/${work.id}/catalog-quote`,{method:'POST',headers:{'Content-Type':'application/pdf','X-Filename':'synthetic-linen-archive-quote.pdf','X-Catalog-Id':item.id,'X-Linen-CSRF':auth.csrf,Cookie:auth.cookie},body:archivedQuote});
  assert.equal(upload.status,201);
  await ok(`/work/${work.id}/fulfilment`,'POST',{catalogId:item.id,catalogRevision:2,beneficiaryId:session.user.id,purpose:'Vendor purchase'},auth,201);
  const login=await raw('/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'synthetic-linen-210@example.test',password:'synthetic-linen-211-passphrase'})});
  assert.equal(login.status,200);
  const approverAuth={cookie:login.headers.get('set-cookie').split(';')[0]};
  approverAuth.csrf=(await ok('/session','GET',undefined,approverAuth)).csrfToken;
  const queued=(await ok('/approval-stages','GET',undefined,approverAuth)).items.find(s=>s.catalogId===item.id);
  assert.ok(queued);
  await ok(`/work/${work.id}/approval-stage`,'POST',{catalogId:item.id,stageKey:queued.stageKey,decision:'approved',comment:'synthetic-linen-214',expectedWorkRevision:queued.expectedWorkRevision,expectedFulfilmentRevision:queued.expectedFulfilmentRevision,expectedCatalogRevision:queued.expectedCatalogRevision,idempotencyKey:'synthetic-linen-215'},approverAuth);
  assert.equal((await ok(`/work/${work.id}/approvals/${item.id}`,'GET',undefined,auth)).satisfied,true);
  await ok('/fixtures/approval-archive','POST',{workId:work.id,catalogId:item.id,approverId:approver.id},auth);

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
  const gated=(await ok('/catalog','GET',undefined,auth)).items.find(c=>c.name==='Portable service purchase');
  const chain=await ok(`/work/${work.id}/approvals/${gated.id}`,'GET',undefined,auth);
  assert.equal(chain.satisfied,false,'CATALOG-002 archived approval cannot satisfy a restored request');
  assert.equal(chain.stages[0].state,'pending');assert.equal(chain.stages[0].activeAt,null);assert.equal(chain.stages[0].slaAt,null);
  const history=await ok('/fixtures/approval-archive','GET',undefined,auth);
  assert.equal(history.decisions.length,1);assert.equal(history.decisions[0].state,'history_only');
  assert.equal(JSON.parse(history.decisions[0].row_json).comment,'synthetic-linen-214');
  assert.equal(history.liveDecisions,0);assert.equal(history.tokens,0);assert.equal(history.configs,0);assert.equal(history.subscriptions,0);
  assert.equal(history.mail.length,1);assert.equal(history.mail[0].state,'history_only');
  assert.equal((await ok('/approval-mail/config','GET',undefined,auth)).enabled,0);
  console.log('PASS CATALOG-002 native archive: frozen stage gate retained, decisions/mail historical, timers dormant and no email token/config/subscription authority');
  console.log('PASS ACCESS-008 native archive remaps application, entitlement, cost and owner snapshot without live authority');
}
