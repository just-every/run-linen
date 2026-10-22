import {approvalChainChecks} from './approval-chain-cases.mjs';
import assert from 'node:assert/strict';
import {harness} from './amend-harness.mjs';
import {bundleChecks} from './bundle-cases.mjs';
import {catalogTaskChecks} from './catalog-task-cases.mjs';
const h=await harness(),{db,ok,api}=h;const future=ms=>new Date(Date.now()+ms).toISOString();
try {
  await ok('/test/connections',{});
  const actor=await ok('/automation-principals',{name:'Manager policy fixture',idempotencyKey:'actor'});
  await ok('/subject-mappings',{connectionId:'graph',localUserId:'employee',providerSubject:'provider-employee-distinct'});
  for(const manager of ['manager','new-manager'])await db.exec(`INSERT INTO users VALUES('${manager}','${manager}@test','Manager','unused','2026-01-01'); INSERT INTO memberships VALUES('w','${manager}','["owner"]',1);`);
  await db.exec(`INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,merged_into,revision,observed_at,effective_at,member_id,binding_id) VALUES('employee','w','hr','employee','Employee','manager',1,NULL,1,'2026-01-01','2026-01-01','employee','reviewed-fixture-binding')`);
  const work=await ok('/work',{title:'Manager access',body:'Private conversation text',deduplicationKey:'manager'},'employee');
  const catalog=await ok('/catalog',{name:'Manager required',kind:'access',target:'managed',ownerId:'owner',requiresManager:true});
  const expiry=future(3600000),request={catalogId:catalog.id,beneficiaryId:'employee',purpose:'Project',expiresAt:expiry};
  assert.equal((await ok(`/work/${work.id}/fulfilment`,request,'employee')).state,'blocked','manager identity is not approval');
  const makeGrant=(issuer,id,action)=>ok('/grants',{id,principalId:actor.id,action,actionVersion:1,target:'managed',beneficiaryId:'provider-employee-distinct',
    localBeneficiaryId:'employee',connectionId:'graph',verifierConnectionId:'probe',validFrom:future(-60000),validUntil:future(86400000),maxUses:30,conditions:{workId:work.id}},issuer);
  await makeGrant('owner','unrelated-add','group.add');await makeGrant('owner','remove','group.remove');
  assert.equal((await ok(`/work/${work.id}/fulfilment`,request,'employee')).state,'blocked','unrelated issuer standing grant cannot supply manager approval');
  // Construct exact grant scope using persisted authoritative mapping, for explicit denial probe.
  const grant=await db.prepare("SELECT * FROM execution_grants WHERE id='unrelated-add'").first();
  const step={action:'group.add',actionVersion:1,connectionId:'graph',connectionRevision:grant.connection_revision,target:'managed',
    beneficiaryId:grant.beneficiary_id,localBeneficiaryId:'employee',mappingId:grant.mapping_id,mappingRevision:grant.mapping_revision,
    grantId:grant.id,grantVersion:grant.version,verifierConnectionId:'probe',verifierConnectionRevision:1,expiresAt:expiry,revocationGrantId:'remove'};
  assert.equal((await api('/test/manager-policy',{step,planId:'work:'+work.id})).value.code,'manager_approval_required');
  const noFulfilment=await ok('/work',{title:'Omitted fulfilment',body:'Request',deduplicationKey:'omitted'},'employee');
  assert.equal((await api('/plans/granted',{workId:noFulfilment.id,revision:1,steps:[step],idempotencyKey:'omitted'},'employee')).value.code,'manager_approval_required','omitting manager-required fulfilment cannot bypass policy');
  assert.equal((await api('/plans/granted',{workId:work.id,revision:1,steps:[step],idempotencyKey:'unapproved'},'employee')).value.code,'manager_approval_required','execution dispatch invokes current work manager policy');
  const queue=(await ok('/fulfilment-decisions',undefined,'manager')).items;
  assert.equal(queue.length,1);assert.equal(queue[0].workId,work.id);
  assert.equal(JSON.stringify(queue[0]).includes('Private conversation text'),false,'the queue carries no conversation text');
  assert.equal((await ok('/fulfilment-decisions',undefined,'owner')).items.length,0,'no global owner leak');
  assert.equal((await ok('/fulfilment-decisions',undefined,'employee')).items.length,0);
  const approvalInput={...queue[0],expectedHolderId:queue[0].holderId,idempotencyKey:'decision'};
  assert.equal((await api(`/work/${work.id}/fulfilment/approve`,approvalInput,'owner')).status,403);
  const approved=await ok(`/work/${work.id}/fulfilment/approve`,approvalInput,'manager');
  const manualAudit=await db.prepare("SELECT id,created_at FROM audit_events WHERE action='work.fulfilment_approved' AND target=?").bind(approved.id).first();
  const approvalChanges=items=>items.filter(e=>e.changes.some(c=>c.field==='approval'));
  const manualActivity=approvalChanges((await ok(`/work/${work.id}/activity`)).items);
  assert.equal(manualActivity.length,1,'DESK-017 the manual manager decision appears once in the ticket history');
  assert.equal(manualActivity[0].id,manualAudit.id);
  assert.equal(manualActivity[0].actor,queue[0].holderName,'DESK-017 the approving person is attributed');
  assert.equal(manualActivity[0].at,manualAudit.created_at,'DESK-017 approval history retains its event time');
  assert.deepEqual(manualActivity[0].changes,[{field:'approval',before:null,after:{approvalId:approved.id,catalogId:catalog.id,
    workRevision:queue[0].expectedWorkRevision,fulfilmentRevision:queue[0].expectedFulfilmentRevision,
    catalogRevision:queue[0].expectedCatalogRevision,holderId:queue[0].holderId}}],'DESK-017 only the exact approval identity and revisions enter the history');
  assert.equal(manualActivity[0].visibility,'private');
  assert.equal((await api(`/work/${work.id}/activity`,undefined,'stranger')).status,404,'DESK-017 an unrelated employee cannot read approval history');
  assert.equal((await api(`/work/${work.id}/activity`,undefined,'owner','other')).status,404,'DESK-017 approval history stays in its workspace');
  assert.equal(approvalChanges((await ok(`/work/${work.id}/activity`,undefined,'employee')).items).length,0,'DESK-017 the requester sees no internal approval change');
  assert.deepEqual(await ok(`/work/${work.id}/fulfilment/approve`,approvalInput,'manager'),approved);
  assert.deepEqual(approvalChanges((await ok(`/work/${work.id}/activity`)).items),manualActivity,'DESK-017 approval replay appends no second history event');
  assert.equal((await ok('/fulfilment-decisions',undefined,'manager')).items.length,0);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='work.fulfilment_approved'").first()).n,1);
  assert.equal((await api('/plans/granted',{workId:work.id,revision:1,steps:[{...step,expiresAt:future(7200000)}],idempotencyKey:'unapproved-extension'},'employee')).value.code,'manager_approval_required');
  assert.equal((await api('/plans/granted',{workId:work.id,revision:1,steps:[{...step,expiresAt:undefined,revocationGrantId:undefined}],idempotencyKey:'unapproved-indefinite'},'employee')).value.code,'manager_approval_required');
  assert.equal((await ok(`/work/${work.id}/fulfilment`,request,'employee')).state,'pending');
  const plan=await ok('/plans/granted',{workId:work.id,revision:1,steps:[step],idempotencyKey:'approved'},'employee');
  // Changed authoritative manager invalidates the exact approval before the provider effect.
  await db.exec("UPDATE work_people SET manager_id='new-manager',revision=2 WHERE id='employee'");
  assert.equal((await api('/test/run',{operationId:plan.operations.find(o=>o.parent_id==='initial').id},actor.id)).value.code,'manager_approval_required');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM test_provider').first()).n,0);
  assert.equal((await ok(`/work/${work.id}/fulfilment`,request,'employee')).state,'blocked');
  assert.equal((await api(`/work/${work.id}/fulfilment/approve`,approvalInput,'manager')).status,403);
  // A valid new manager-issued exact standing grant avoids manufacturing a fresh approval click.
  const currentManagerGrant=await makeGrant('new-manager','current-manager-add','group.add');
  const standingApproval=await db.prepare('SELECT * FROM work_fulfilment_approvals WHERE work_id=? AND grant_id=? AND grant_version=?')
    .bind(work.id,currentManagerGrant.id,currentManagerGrant.version).first();
  const standingAudit=await db.prepare("SELECT id,created_at FROM audit_events WHERE action='work.fulfilment_approved' AND target=?")
    .bind(standingApproval.id).first();
  const standingActivity=approvalChanges((await ok(`/work/${work.id}/activity`)).items);
  const grantActivity=standingActivity.find(e=>e.id===standingAudit.id);
  assert.ok(grantActivity,'DESK-017 a current-manager standing grant records an approval event');
  assert.equal(grantActivity.actor,(await db.prepare("SELECT name FROM users WHERE id='new-manager'").first()).name);
  assert.equal(grantActivity.at,standingAudit.created_at);
  assert.deepEqual(grantActivity.changes,[{field:'approval',before:null,after:{approvalId:standingApproval.id,catalogId:catalog.id,
    workRevision:standingApproval.work_revision,fulfilmentRevision:standingApproval.fulfilment_revision,catalogRevision:standingApproval.catalog_revision,
    holderId:'new-manager',grantId:currentManagerGrant.id,grantVersion:currentManagerGrant.version}}],'DESK-017 standing approval records its exact grant version');
  assert.equal((await api('/grants',{id:currentManagerGrant.id,principalId:actor.id,action:'group.add',actionVersion:1,target:'managed',
    beneficiaryId:'provider-employee-distinct',localBeneficiaryId:'employee',connectionId:'graph',verifierConnectionId:'probe',
    validFrom:future(-60000),validUntil:future(86400000),maxUses:30,conditions:{workId:work.id}},'new-manager')).value.code,'grant_changed');
  assert.deepEqual(approvalChanges((await ok(`/work/${work.id}/activity`)).items),standingActivity,'DESK-017 replaying standing-grant creation adds no approval history');
  assert.equal((await ok(`/work/${work.id}/fulfilment`,request,'employee')).state,'pending');
  const resolved=await ok('/test/standing',{workId:work.id,target:'managed',beneficiaryId:'employee',kind:'access',expiresAt:expiry},'employee');
  assert.equal(resolved.step.grantId,'current-manager-add');
  const standing=await ok('/plans/granted',{workId:work.id,revision:1,steps:[resolved.step],idempotencyKey:'standing'},'employee');
  await ok('/test/link',{workId:work.id,planId:standing.planId,operationIds:standing.operations.map(o=>o.id)},'employee');
  const initial=standing.operations.find(o=>o.parent_id==='initial');
  assert.equal((await ok('/test/run',{operationId:initial.id},actor.id)).state,'effect_verified');
  await ok('/test/verify',{operationId:initial.id,verifierVersion:1},actor.id);
  let current=await ok(`/work/${work.id}/fulfilments/${catalog.id}`,undefined,'employee');
  for(const [event,expiresAt] of [['earlier-one',future(1800000)],['earlier-two',future(900000)]]) {
    const correction=await ok(`/work/${work.id}/fulfilment/amend`,{catalogId:catalog.id,expectedWorkRevision:current.workRevision,
      expectedFulfilmentRevision:current.revision,idempotencyKey:event,beneficiaryId:'employee',purpose:'Project',expiresAt},'employee');
    assert.equal(correction.state,'amended',JSON.stringify(correction));
    const timeline=(await ok(`/work/${work.id}/activity`)).items;
    const change=timeline.filter(e=>e.action==='fulfilment amended').at(-1);
    assert.ok(change.changes.some(c=>c.field==='expiresAt'&&c.before===current.expiresAt&&c.after===expiresAt),'The amended expiry records its exact original and replacement instants');
    assert.equal((await ok(`/work/${work.id}/activity`,undefined,'employee')).items.some(e=>e.action==='fulfilment amended'),false,'Expiry field history stays within the existing private ticket scope');

    current=await ok(`/work/${work.id}/fulfilments/${catalog.id}`,undefined,'employee');
  }
  await db.exec("UPDATE work_catalog SET revision=revision+1 WHERE target='managed'");
  assert.equal((await ok(`/work/${work.id}/fulfilment`,{...request,expiresAt:current.expiresAt},'employee')).state,'blocked','standing approval is tied to catalogue revision');
  assert.equal((await api('/test/manager-policy',{step:resolved.step,planId:'work:'+work.id})).value.code,'manager_approval_required');
  await bundleChecks({ok,api,db,actor,future});
  await catalogTaskChecks({ok,api,db,actor,future});
  await approvalChainChecks({ok,api,db,mf:h.mf});
  console.log('MANAGER APPROVAL passed: current manager alone/unrelated issuer denied; exact revision-scoped approval and replay; wrong holder denied; manager change invalidates at effect; current manager-issued scoped standing grant proceeds without extra approval.');
} finally {await h.close();}
