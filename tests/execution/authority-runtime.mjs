import assert from 'node:assert/strict';
import { authorityHarness } from './authority-harness.mjs';
import { managerRevisionCases } from './authority-manager-cases.mjs';
const h=await authorityHarness(),{db,api,ok,writes}=h;
const future=ms=>new Date(Date.now()+ms).toISOString();
const validity={validFrom:future(-60000),validUntil:future(86400000)};
let serial=0;
try {
  const basic={principalId:'actor',beneficiaryId:'external-owner',action:'group.add',actionVersion:1,target:'ordinary',connectionId:'graph',...validity,maxUses:100,conditions:{}};
  const grant=(overrides={},issuer='owner')=>ok('/grants',{...basic,...overrides},issuer);
  const map=(localUserId,providerSubject,connectionId='graph',expectedRevision=0)=>ok('/subject-mappings',{localUserId,providerSubject,connectionId,expectedRevision});
  const work=await ok('/work',{title:'Authority boundary',body:'Request',deduplicationKey:'authority'},'actor');
  const makeStep=(g,overrides={})=>({action:'group.add',actionVersion:1,target:'ordinary',beneficiaryId:'external-owner',connectionId:'graph',grantId:g.id,grantVersion:g.version,...overrides});
  const propose=step=>ok('/plans',{workId:work.id,revision:1,idempotencyKey:'plan-'+(++serial),steps:[step]},'actor');
  const dispatch=p=>api(`/plans/${p.id}/dispatch`,{expectedRevision:1},'actor');
  const queued=async step=>{const p=await propose(step);const d=await dispatch(p);assert.equal(d.status,200,JSON.stringify(d));return {plan:p,op:d.value.find(o=>o.parent_id==='initial'),operations:d.value};};
  const run=id=>api('/test/run',{operationId:id},'actor');
  const denial=async(p,code)=>{const n=writes.length,r=await dispatch(p);assert.equal(r.value.code,code,JSON.stringify(r));assert.equal(writes.length,n);};
  const decision=async(op,code)=>assert.ok(await db.prepare('SELECT 1 FROM execution_decisions WHERE operation_id=? AND allowed=0 AND reason=?').bind(op,code).first(),'logged denial '+code);

  // Persist authority before a mapping is known, then learn the owner's actual provider identity.
  const old=await grant(),oldQueued=await queued(makeStep(old));
  await map('owner','external-owner');
  assert.equal((await api('/grants',basic)).value.code,'self_approval_denied','omitted hint cannot conceal owner');
  const n=writes.length,oldRun=await run(oldQueued.op.id);
  assert.equal(oldRun.value.code,'self_approval_denied');assert.equal(writes.length,n);
  await decision(oldQueued.op.id,'self_approval_denied');
  await denial(await propose(makeStep(old)),'self_approval_denied');
  console.log('AUTHORITY: omitted-hint issuance and persisted grant dispatch/effect deny known owner; zero writes.');

  // Same subject string in another connection/workspace must not inherit identity from graph/w.
  const otherConnection=await grant({connectionId:'graph-two',target:'scope-connection'});
  const scopeOp=await queued(makeStep(otherConnection,{connectionId:'graph-two',target:'scope-connection'}));
  assert.equal((await run(scopeOp.op.id)).value.state,'effect_verified');
  const foreign=await ok('/grants',{...basic,connectionId:'foreign'},'owner','other');
  assert.ok(foreign.id);
  const foreignWork=await ok('/work',{title:'Foreign scope',body:'Request',deduplicationKey:'foreign'},'actor','other');
  const foreignPlan=await ok('/plans',{workId:foreignWork.id,revision:1,idempotencyKey:'foreign',steps:[makeStep(foreign,{connectionId:'foreign'})]},'actor','other');
  const foreignOps=await ok(`/plans/${foreignPlan.id}/dispatch`,{expectedRevision:1},'actor','other');
  assert.equal((await ok('/test/run',{operationId:foreignOps[0].id},'actor','other')).state,'effect_verified');
  await map('employee','external-employee');
  const correct=await grant({beneficiaryId:'external-employee',target:'other-person'});
  const correctOp=await queued(makeStep(correct,{beneficiaryId:'external-employee',target:'other-person'}));
  assert.equal((await run(correctOp.op.id)).value.state,'effect_verified');
  assert.ok(writes.some(w=>w.target==='other-person'&&w.subject==='external-employee'));
  console.log('AUTHORITY: other person and other connection effects succeed; foreign workspace grant/effect succeed.');

  await db.prepare("UPDATE connections SET config_json=? WHERE id='graph-two'").bind(JSON.stringify({tenantId:'fixture',principalBindings:{owner:'bound-owner'}})).run();
  assert.equal((await api('/grants',{...basic,connectionId:'graph-two',beneficiaryId:'bound-owner'})).value.code,'self_approval_denied');
  await map('stranger','external-employee');
  assert.equal((await api('/grants',{...basic,beneficiaryId:'external-employee'})).value.code,'provider_subject_ambiguous');
  await denial(await propose(makeStep(correct,{beneficiaryId:'external-employee',target:'other-person'})),'provider_subject_ambiguous');
  await map('stranger','external-stranger','graph',1);

  // Delegated issuer as well as every ancestor must remain independent of the beneficiary.
  const parent=await grant({principalId:'delegate',beneficiaryId:'external-delegate',target:'delegated'});
  await map('delegate','external-delegate');
  assert.equal((await api('/grants',{...basic,beneficiaryId:'external-delegate',target:'delegated',parentId:parent.id,parentVersion:parent.version},'delegate')).value.code,'self_approval_denied');
  const lateParent=await grant({principalId:'delegate',beneficiaryId:'late-delegate',target:'delegated-late'});
  const lateChild=await grant({beneficiaryId:'late-delegate',target:'delegated-late',parentId:lateParent.id,parentVersion:1},'delegate');
  const lateQueued=await queued(makeStep(lateChild,{beneficiaryId:'late-delegate',target:'delegated-late'}));
  await map('delegate','late-delegate','graph',1);
  assert.equal((await run(lateQueued.op.id)).value.code,'self_approval_denied');
  await decision(lateQueued.op.id,'self_approval_denied');
  const ancestorParent=await grant({principalId:'delegate',beneficiaryId:'late-root',target:'root-late'});
  const ancestorChild=await grant({beneficiaryId:'late-root',target:'root-late',parentId:ancestorParent.id,parentVersion:1},'delegate');
  const ancestorQueued=await queued(makeStep(ancestorChild,{beneficiaryId:'late-root',target:'root-late'}));
  await map('owner','late-root','graph',1);
  assert.equal((await run(ancestorQueued.op.id)).value.code,'self_approval_denied');
  await decision(ancestorQueued.op.id,'self_approval_denied');
  console.log('AUTHORITY: configured binding, ambiguous mapping, delegated issuer and ancestor identity rechecks deny.');

  // The second token acquisition is after dispatch checks, immediately before actual service bytes.
  const oauthGrant=await grant({beneficiaryId:'oauth-owner',target:'oauth-self'});
  const oauthQueued=await queued(makeStep(oauthGrant,{beneficiaryId:'oauth-owner',target:'oauth-self'}));
  await ok('/test/oauth-mutation',{countdown:2,sql:"UPDATE execution_subject_mappings SET provider_subject='oauth-owner',revision=revision+1 WHERE workspace_id='w' AND connection_id='graph' AND local_user_id='owner'"});
  const beforeOAuth=writes.length,oauthRun=await run(oauthQueued.op.id);
  assert.equal(oauthRun.value.last_error,'self_approval_denied',JSON.stringify(oauthRun));
  assert.equal(writes.length,beforeOAuth);await decision(oauthQueued.op.id,'self_approval_denied');
  console.log('AUTHORITY: mapping learned during effect OAuth denied at native boundary; zero service writes.');

  // Real work catalogue/approval routes + execution service + native HTTP boundary.
  await db.exec("INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,merged_into,revision,observed_at,effective_at,member_id,binding_id) VALUES('employee','w','hr','employee','Employee','manager',1,NULL,1,'2026-01-01','2026-01-01','employee','reviewed-fixture-binding')");
  const managedWork=await ok('/work',{title:'Managed access',body:'Project access',deduplicationKey:'managed'},'employee');
  const catalog=await ok('/catalog',{name:'Managed application',kind:'access',target:'managed',ownerId:'owner',requiresManager:true});
  const expiry=future(3600000),request={catalogId:catalog.id,beneficiaryId:'employee',purpose:'Project',expiresAt:expiry};
  assert.equal((await ok(`/work/${managedWork.id}/fulfilment`,request,'employee')).state,'blocked');
  const scoped={target:'managed',beneficiaryId:'external-employee',localBeneficiaryId:'employee',conditions:{workId:managedWork.id},verifierConnectionId:'probe'};
  const managedGrant=await grant(scoped),remove=await grant({...scoped,action:'group.remove'});
  const row=await db.prepare('SELECT * FROM execution_grants WHERE id=?').bind(managedGrant.id).first();
  const managedStep=makeStep(managedGrant,{...scoped,mappingId:row.mapping_id,mappingRevision:row.mapping_revision,verifierConnectionRevision:1,expiresAt:expiry,revocationGrantId:remove.id});
  const managedPlan=()=>api('/plans/granted',{workId:managedWork.id,revision:1,steps:[managedStep],idempotencyKey:'managed-'+(++serial)},'employee');
  assert.equal((await managedPlan()).value.code,'manager_approval_required','unrelated owner grant cannot satisfy explicit policy');
  const reviewed=(await ok('/fulfilment-decisions',undefined,'manager')).items.find(d=>d.workId===managedWork.id);assert.ok(reviewed);
  const approvalInput={...reviewed,expectedHolderId:reviewed.holderId,idempotencyKey:'manager-approved'};
  await ok(`/work/${managedWork.id}/fulfilment/approve`,approvalInput,'manager');
  const approved=await managedPlan();assert.equal(approved.status,201,JSON.stringify(approved));
  const approvedOp=approved.value.operations.find(o=>o.parent_id==='initial');
  await db.exec("UPDATE work_people SET manager_id='new-manager',revision=2 WHERE id='employee'");
  const beforeManager=writes.length;
  assert.equal((await run(approvedOp.id)).value.code,'manager_approval_required');assert.equal(writes.length,beforeManager);
  await decision(approvedOp.id,'manager_approval_required');
  console.log('AUTHORITY: explicit manager policy denies dispatch without scoped approval and rejects changed manager before effect.');

  const managerGrant=await grant(scoped,'new-manager');
  const managerRow=await db.prepare('SELECT * FROM execution_grants WHERE id=?').bind(managerGrant.id).first();
  managedStep.grantId=managerGrant.id;managedStep.mappingId=managerRow.mapping_id;managedStep.mappingRevision=managerRow.mapping_revision;
  const approvalCount=(await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_approvals').first()).n;
  const standing=await managedPlan();assert.equal(standing.status,201,JSON.stringify(standing));
  const standingOp=standing.value.operations.find(o=>o.parent_id==='initial');
  assert.equal((await run(standingOp.id)).value.state,'effect_verified');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_approvals').first()).n,approvalCount,'standing coverage creates no extra approval');
  // Revoke addition authority/current manager while leaving independent scheduled security removal intact.
  await ok(`/grants/${managerGrant.id}/revoke`,{version:1},'new-manager');
  await db.exec("UPDATE memberships SET active=0 WHERE workspace_id='w' AND user_id='new-manager'");
  const removal=standing.value.operations.find(o=>o.parent_id!=='initial');
  await db.prepare("UPDATE execution_operations SET due_at=? WHERE id=?").bind(future(-1000),removal.id).run();
  const beforeRemoval=writes.length;
  assert.equal((await run(removal.id)).value.state,'effect_verified');
  assert.equal(writes.length,beforeRemoval+1);assert.equal(writes.at(-1).method,'DELETE');
  console.log('AUTHORITY: current manager standing coverage executes without extra approval; independent scheduled removal survives manager/add-grant revocation.');

  // Revocation while obtaining the write token must also stop an otherwise authorized addition.
  await db.exec("UPDATE memberships SET active=1 WHERE workspace_id='w' AND user_id='new-manager'");
  const fresh=await grant(scoped,'new-manager');managedStep.grantId=fresh.id;
  const inFlight=await managedPlan();assert.equal(inFlight.status,201,JSON.stringify(inFlight));
  const inFlightOp=inFlight.value.operations.find(o=>o.parent_id==='initial');
  await ok('/test/oauth-mutation',{countdown:2,sql:"UPDATE memberships SET active=0 WHERE workspace_id='w' AND user_id='new-manager'"});
  const beforeRevoke=writes.length,revoked=await run(inFlightOp.id);
  assert.equal(revoked.value.last_error,'manager_approval_required',JSON.stringify(revoked));
  assert.equal(writes.length,beforeRevoke);await decision(inFlightOp.id,'manager_approval_required');
  console.log('AUTHORITY: manager revoked during effect OAuth denied by logged policy recheck; zero service writes.');
  await db.exec("UPDATE memberships SET active=1 WHERE workspace_id='w' AND user_id='new-manager'");
  // Use a separate resource: the prior denied operation still owns its reconciliation fence.
  scoped.target='rebind-managed';managedStep.target=scoped.target;
  await db.prepare('UPDATE work_catalog SET target=?,revision=revision+1 WHERE id=?').bind(scoped.target,catalog.id).run();
  const reboundGrant=await grant(scoped,'new-manager');managedStep.grantId=reboundGrant.id;
  managedStep.revocationGrantId=(await grant({...scoped,action:'group.remove'})).id;
  const beforeRebinding=await managedPlan();assert.equal(beforeRebinding.status,201,JSON.stringify(beforeRebinding));
  const reboundOp=beforeRebinding.value.operations.find(o=>o.parent_id==='initial');
  await ok('/test/oauth-mutation',{countdown:2,sql:"UPDATE work_people SET binding_id='fresh-reviewed-binding',revision=revision+1 WHERE workspace_id='w' AND member_id='employee'"});
  const beforeBindingWrites=writes.length,rebound=await run(reboundOp.id);
  assert.equal(rebound.value.last_error,'manager_approval_required',JSON.stringify(rebound));
  assert.equal(writes.length,beforeBindingWrites);await decision(reboundOp.id,'manager_approval_required');
  console.log('AUTHORITY: person binding changed during effect OAuth invalidates standing approval; zero service writes.');
  await managerRevisionCases(h,validity);
  console.log(`AUTHORITY RUNTIME passed: ${writes.length} native fixture writes, all expected; isolated D1 evidence ${h.dir}`);
} finally {await h.close();}
