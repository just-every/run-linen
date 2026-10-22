import assert from 'node:assert/strict';

/** The approved retained-value journey uses only native business routes. SQL
 * supplies authenticated fixture accounts, never audit rows or their values. */
export async function historyErasureChecks(workspaceApi,db) {
  const workspace='synthetic-linen-12800',alice='synthetic-linen-12801',bob='synthetic-linen-12802',carol='synthetic-linen-12803',dave='synthetic-linen-12804',auditor='synthetic-linen-12805';
  await db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(workspace,workspace,'2026-01-01').run();
  await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(workspace,'owner','["owner"]').run();
  for(const [user,name,roles] of [[alice,'Alice',['operator']],[bob,'Bob',['employee']],[carol,'Carol',['operator']],[dave,'Dave',['employee']],[auditor,'Auditor',['operator','auditor']]]) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@example.test',name,'unused','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(workspace,user,JSON.stringify(roles)).run();
  }
  const as=(user,roles)=>({'x-workspace':workspace,'x-user':user,'x-roles':JSON.stringify(roles)});
  const owner=as('owner',['owner']),aliceAuth=as(alice,['operator']),bobAuth=as(bob,['employee']),carolAuth=as(carol,['operator']),daveAuth=as(dave,['employee']),auditAuth=as(auditor,['operator','auditor']);
  const call=async(path,body,auth=owner,status=200)=>{const r=await workspaceApi(path,body,auth);assert.equal(r.status,status,JSON.stringify({path,status:r.status,value:r.value}));return r.value;};
  const make=(key,auth=bobAuth,extra={})=>call('/work',{title:key,body:key,kind:'incident',deduplicationKey:key,...extra},auth,201);
  const work=await make('synthetic-linen-12806');
  const hr=await make('synthetic-linen-12807',owner,{sensitivity:'hr',beneficiaryId:bob});
  const unrelated=await make('synthetic-linen-12808',daveAuth);
  const classify=async(id,priority,auth=aliceAuth,category='hardware',subcategory='laptop')=>{
    const c=await call('/work/'+id+'/classification',undefined,auth);
    return call('/work/'+id+'/classification/override',{revision:c.revision,workRevision:c.workRevision,type:'incident',category,subcategory,impact:'low',urgency:'medium',priority,reason:'synthetic-linen-12809'},auth);
  };
  await classify(work.id,'P3',aliceAuth,'general','other');await classify(work.id,'P2');
  await classify(hr.id,'P3',owner,'general','other');await classify(hr.id,'P2',owner);
  await classify(unrelated.id,'P2',carolAuth);
  const office=await call('/desk-fields',{name:'Office',type:'dropdown',options:['Austin','Denver'],kinds:['incident'],requiredOn:[]},owner,201);
  const text=await call('/desk-fields',{name:'Personal diagnostic',type:'text',kinds:['incident'],requiredOn:[]},owner,201);
  await call('/mcp-fields/'+office.id+'/classification',{nonpersonal:true});
  await call('/mcp-fields/'+text.id+'/classification',{nonpersonal:true},owner,422);
  for(const id of [work.id,hr.id]) {
    const auth=id===hr.id?owner:aliceAuth;
    await call('/work/'+id+'/fields',{fieldId:office.id,value:'Austin'},auth);
    await call('/work/'+id+'/fields',{fieldId:office.id,value:'Denver'},auth);
    await call('/work/'+id+'/fields',{fieldId:text.id,value:'synthetic-linen-12810 private subject marker'},auth);
  }
  const group=await call('/work-groups',{name:'History service team'},owner,201);
  await call('/work-groups/'+group.id+'/members',{userId:alice});
  let current=(await call('/work/'+work.id)).work;
  await call('/work/'+work.id+'/group',{revision:current.revision,groupId:group.id,assigneeId:alice});
  const singleton=(await call('/work/'+work.id+'/activity')).items.find(e=>e.changes.some(c=>c.field==='group'&&c.after===group.id));
  assert.ok(singleton,'one-member group assignment has an original event');
  await call('/work-groups/'+group.id+'/members',{userId:carol});
  current=(await call('/work/'+work.id)).work;
  await call('/work/'+work.id+'/commands',{revision:current.revision,command:'assign',assigneeId:carol,reason:'synthetic-linen-12811'},aliceAuth);
  const asset=await call('/assets',{serial:'synthetic-linen-12812',assetTag:'A-17',source:'synthetic-linen-12813'},owner,201);
  await call('/work/'+work.id+'/links',{kind:'asset',targetId:asset.id},aliceAuth);
  for(const id of [work.id,hr.id]) {
    const w=(await call('/work/'+id)).work;
    await call('/work/'+id+'/commands',{revision:w.revision,command:'pause',waitingOn:'vendor',reason:'synthetic-linen-12814'});
  }
  const before=(await call('/work/'+work.id+'/activity')).items;
  const daveBefore=(await call('/work/'+unrelated.id+'/activity')).items;
  const receipt=await call('/people/'+alice+'/erase',{revision:0,reason:'synthetic-linen-12815'});
  assert.ok(Object.values(receipt.historyCounts).every(n=>Number.isInteger(n)&&n>=0),'receipt contains counts');
  assert.ok(!JSON.stringify(receipt.historyCounts).includes('Austin'),'count receipt contains no values');
  const first=(await call('/work/'+work.id+'/activity')).items;
  const clearedText=first.find(e=>e.changes.some(c=>c.fieldId===text.id));
  assert.ok(clearedText?.redactedAt,'cleared values keep the erasure date');
  await call('/people/'+bob+'/erase',{revision:0,reason:'synthetic-linen-12816'});
  const after=(await call('/work/'+work.id+'/activity')).items;
  assert.ok(before.filter(e=>e.kind==='change').every(e=>after.some(a=>a.id===e.id)),'erasure retains every original event');
  const change=(field,before,afterValue)=>after.some(e=>e.changes.some(c=>c.field===field&&c.before===before&&c.after===afterValue));
  assert.ok(change('priority','P3','P2'),'priority survives actor and subject erasure');
  assert.ok(change('category','general','hardware'),'configured category survives');
  assert.ok(change('Office','Austin','Denver'),'audited nonpersonal custom values survive');
  assert.ok(change('assignee','Erased person',carol),'erased assignee is unlinkable and current assignee remains');
  assert.ok(after.some(e=>e.changes.some(c=>c.after===asset.id||c.after?.id===asset.id)),'asset link remains an ID');
  assert.equal(after.find(e=>e.id===singleton.id).changes.find(c=>c.field==='group').after,'[erased]','change-time singleton count wins over current membership');
  assert.equal(after.find(e=>e.id===clearedText.id).redactedAt,clearedText.redactedAt,'later erasure never rebuilds or re-dates cleared values');
  const textAfter=JSON.stringify(after);
  for(const personal of ['synthetic-linen-12810',alice,bob])assert.ok(!textAfter.includes(personal),'history removes personal value/reference '+personal);
  assert.ok(after.some(e=>e.actor==='Erased person'),'erased actor entry stays without identity link');
  const hrAfter=(await call('/work/'+hr.id+'/activity')).items;
  assert.ok(hrAfter.some(e=>e.changes.some(c=>c.field==='priority'&&c.after==='P2')),'HR priority survives');
  for(const e of hrAfter)for(const c of e.changes)if(['type','category','subcategory','Office'].includes(c.field)||c.fieldId===office.id)assert.ok([null,'[erased]'].includes(c.before)&&[null,'[erased]'].includes(c.after),'HR subject erasure removes stricter field '+c.field);
  assert.deepEqual((await call('/work/'+unrelated.id+'/activity')).items,daveBefore,'unrelated Dave history is unchanged');
  assert.deepEqual((await call('/work/'+work.id+'/activity',undefined,auditAuth)).items,after,'authorized auditor reads the same redacted history');
  const publicHistory=(await call('/work/'+unrelated.id+'/activity',undefined,daveAuth)).items;
  assert.ok(publicHistory.every(e=>e.kind==='message'&&e.visibility==='public'),'employee retains public history only');
  assert.equal((await call('/search?q=synthetic-linen-12810')).total,0,'scrubbed text leaves search');
  await call('/work',{title:'synthetic-linen-12817',body:'synthetic-linen-12817',beneficiaryId:bob,deduplicationKey:'synthetic-linen-12818'},owner,409);
  return {workspace,workId:work.id,hrId:hr.id,unrelatedId:unrelated.id};
}
