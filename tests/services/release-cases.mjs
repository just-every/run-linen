import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

/** CHANGE-007 public routes over the actual change engine. Only the deployment/probe provider is a fixture. */
export async function releaseChecks({ok,call,db,implementation}) {
  const at=new Date().toISOString(),window={start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()};
  for(const [user,roles] of [['approver',['approver']],['release-sales',['employee']],['release-engineer',['employee']]]){
    await db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)').bind(user,user+'@fixture.test',user,'fixture',at).run();
    await db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?,1)').bind('w',user,JSON.stringify(roles)).run();
  }
  for(const [group,name,member] of [['mfa-pilot','Okta MFA pilot','release-sales'],['engineering','Engineering','release-engineer']])
    await db.prepare('INSERT INTO work_requester_groups(id,workspace_id,name,members_json,created_at) VALUES(?,?,?,?,?)').bind(group,'w',name,JSON.stringify([member]),at).run();
  const grantReferences=[];
  for(const [phase,payload] of [['canary',implementation.payload],['rollout',implementation.payload],['compensate',{release:'r1'}]]){
    const hashed={...payload,phase,cohorts:['a','b'],implementationRevision:1};
    const grant=await ok('POST','/grants',{principalId:'operator',beneficiaryId:implementation.beneficiaryId,action:'deployment.'+phase,actionVersion:1,target:implementation.target,connectionId:implementation.connectionId,
      validFrom:window.start,validUntil:window.end,maxUses:20,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(hashed)).digest('hex')}});
    grantReferences.push({id:grant.id,version:grant.version,phase});
  }
  const cis=[];
  for(const name of ['Okta MFA policy','Okta sign-in widget','VPN MFA prompt'])
    cis.push(await ok('POST','/services',{name,description:'Okta MFA rollout surface',businessImpact:'Sign-in friction',source:'Reviewed CI register',observedAt:at,visibility:'workspace'}));
  const incident=await ok('POST','/incidents',{title:'MFA prompt loops',serviceId:cis[0].id,impact:'Sales cannot sign in',cohorts:['a']});
  const problem=await ok('POST','/problems',{title:'Legacy MFA factor loops',serviceId:cis[0].id,incidentIds:[incident.id],symptoms:'Repeated prompts'});
  const changes=[];
  for(const [n,ci] of cis.entries()){
    const change=await ok('POST','/changes',{title:`Okta MFA rollout step ${n+1}`,risk:'Bounded policy change',impact:'Sign-in prompts',services:[ci.id],window,cohorts:['a','b'],canaryCohorts:['a','b'],implementation,compensation:{...implementation,payload:{release:'r1'}},visibility:'workspace'});
    changes.push(await ok('POST',`/changes/${change.id}/authorize`,{revision:change.revision,reason:'CAB approved the exact implementation',grantReferences}));
  }
  const body={title:'Okta MFA rollout',plan:'Build the policy bundle, test it with the pilot, then canary and roll out each change.',changeIds:changes.map(c=>c.id),problemIds:[problem.id],approverIds:['owner','approver'],affectedGroupIds:['mfa-pilot'],visibility:'workspace'};
  assert.equal((await call('POST','/releases',{...body,approverIds:['operator']})).body.error.code,'release_approver','CHANGE-007 go/no-go approvers currently hold approval authority');
  let release=await ok('POST','/releases',body);
  assert.equal((await call('POST','/releases',{...body,title:'Second grouping'})).body.error.code,'release_change_grouped','CHANGE-007 a change belongs to one open release');
  assert.deepEqual([...release.data.services].sort(),cis.map(c=>c.id).sort(),'CHANGE-007 the release carries the CIs of its changes');
  assert.deepEqual(release.data.problemIds,[problem.id]);
  assert.equal(release.data.goNoGo,'awaiting-decision');
  const calendar=await ok('GET',`/change-calendar?from=${encodeURIComponent(new Date(Date.now()-86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now()+86400000).toISOString())}&timezone=UTC`);
  assert.deepEqual(calendar.releases.find(r=>r.id===release.id)?.data.window,window,'CHANGE-007 the release spans its changes on the shared change calendar');
  const dispatch=(change,phase,key)=>call('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase,idempotencyKey:key},'operator');
  assert.equal((await dispatch(changes[0],'canary','release-early')).body.error.code,'release_go','CHANGE-007 no member change deploys before go');
  const decide=(decision,user,reason)=>call('POST',`/releases/${release.id}/decisions`,{revision:release.revision,decision,reason},user);
  assert.equal((await decide('go','approver','Ready')).body.error.code,'release_phase','CHANGE-007 go needs recorded passed build and test phases');
  release=await ok('POST',`/releases/${release.id}/phases`,{revision:release.revision,phase:'build',outcome:'passed',reference:'Policy bundle build 2031.4'});
  release=await ok('POST',`/releases/${release.id}/phases`,{revision:release.revision,phase:'test',outcome:'passed',reference:'Pilot test report 17'});
  assert.equal((await decide('go','operator','Not named')).status,403,'CHANGE-007 only named approvers decide');
  release=(await decide('no-go','approver','Help desk not briefed')).body;release=(await decide('go','owner','Ready from the owner')).body;
  assert.equal(release.data.goNoGo,'no-go','CHANGE-007 one named no-go holds the release');
  assert.equal((await dispatch(changes[0],'canary','release-held')).body.error.code,'release_go');
  release=(await decide('go','approver','Help desk briefed')).body;
  assert.equal(release.data.goNoGo,'go','CHANGE-007 go/no-go approval recorded by every named approver');
  for(const [n,initial] of changes.entries()){
    await ok('POST','/fixture/state',{failDeployment:n===2});
    let change=await ok('POST',`/changes/${initial.id}/dispatch`,{revision:initial.revision,phase:'canary',idempotencyKey:`release-${n}-canary`},'operator');
    if(n===2)await ok('POST',`/operations/${change.data.invocations.at(-1).executionId}/reconcile`,{},'operator');
    change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations.at(-1).id},'operator');
    if(n<2){
      assert.equal(change.data.state,'canary-verified');
      change=await ok('POST',`/changes/${change.id}/dispatch`,{revision:change.revision,phase:'rollout',idempotencyKey:`release-${n}-rollout`},'operator');
      change=await ok('POST',`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations.at(-1).id},'operator');
      assert.deepEqual(change.data.invocations.map(i=>[i.phase,i.state]),[['canary','verified'],['rollout','verified']],'CHANGE-007 each change deploys canary then rollout');
    } else assert.equal(change.data.state,'failed');
    changes[n]=change;
  }
  await ok('POST','/fixture/state',{});
  release=await ok('GET',`/releases/${release.id}`);
  const notes=`/releases/${release.id}/notices`;
  assert.equal((await call('POST',notes,{revision:release.revision,groupId:'engineering',message:'Okta MFA now uses number matching.',cadenceMinutes:1440})).body.error.code,'release_cohort','CHANGE-007 release notes go only to the affected cohort');
  await ok('POST',notes,{revision:release.revision,groupId:'mfa-pilot',message:'Release notes: Okta MFA now uses number matching.',cadenceMinutes:1440});
  assert.ok((await ok('GET','/service-notices',undefined,'release-sales')).items.some(n=>n.message.includes('number matching')),'CHANGE-007 the affected cohort reads the release notes');
  assert.equal((await ok('GET','/service-notices',undefined,'release-engineer')).items.some(n=>n.message.includes('number matching')),false,'CHANGE-007 employees outside the cohort do not');
  release=await ok('GET',`/releases/${release.id}`);
  assert.equal(release.data.deploy,'held');assert.deepEqual(release.data.holding,[changes[2].id]);
  assert.equal((await call('POST',`/releases/${release.id}/complete`,{revision:release.revision})).body.error.code,'release_open','CHANGE-007 a failed change holds the release open');
  let failed=await ok('POST',`/changes/${changes[2].id}/dispatch`,{revision:changes[2].revision,phase:'compensate',idempotencyKey:'release-2-backout'},'operator');
  failed=await ok('POST',`/changes/${failed.id}/verify`,{revision:failed.revision,invocationId:failed.data.invocations.at(-1).id},'operator');
  assert.equal(failed.data.state,'compensated','CHANGE-007 the failed change is explicitly backed out and read back');
  release=await ok('POST',`/releases/${release.id}/complete`,{revision:(await ok('GET',`/releases/${release.id}`)).revision});
  assert.equal(release.data.state,'completed');
  assert.deepEqual(release.data.outcomes.map(o=>o.outcome),['successful','successful','backed-out'],'CHANGE-007 completes once every change is successful or backed out');
  console.log('PASS CHANGE-007 public routes: three-change Okta MFA release on the shared calendar, named go/no-go held by one no-go, canary then rollout, cohort-only release notes, a failed change holding the release until backout, then completion');
  return {releaseId:release.id};
}
