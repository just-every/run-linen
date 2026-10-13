import assert from 'node:assert/strict';
export async function managerRevisionCases(h,validity) {
  const {db,api,ok,writes}=h,future=ms=>new Date(Date.now()+ms).toISOString();
  await db.exec("UPDATE memberships SET active=1 WHERE workspace_id='w' AND user_id='new-manager'");
  const contexts=[];
  for(const key of ['catalog','person','fulfilment','work','delegate']) {
    const work=await ok('/work',{title:'Revision '+key,body:'Access',deduplicationKey:'revision-'+key},'employee');
    const catalog=await ok('/catalog',{name:'Revision '+key,kind:'access',target:'revision-'+key,ownerId:'owner',requiresManager:true});
    const expiry=future(3600000);
    await ok(`/work/${work.id}/fulfilment`,{catalogId:catalog.id,beneficiaryId:'employee',purpose:'Scoped purpose',expiresAt:expiry},'employee');
    contexts.push({key,work,catalog,expiry,target:"revision-"+key});
  }
  const grantFor=(c,overrides={},issuer='new-manager')=>ok('/grants',{principalId:'actor',action:'group.add',actionVersion:1,
    target:c.target,beneficiaryId:'external-employee',localBeneficiaryId:'employee',connectionId:'graph',...validity,
    maxUses:100,conditions:{workId:c.work.id},...overrides},issuer);
  const planFor=async(c,grant,extra={})=>{
    const row=await db.prepare('SELECT * FROM execution_grants WHERE id=?').bind(grant.id).first();
    const step={action:'group.add',actionVersion:1,target:c.target,beneficiaryId:'external-employee',localBeneficiaryId:'employee',connectionId:'graph',
      grantId:grant.id,grantVersion:grant.version,mappingId:row.mapping_id,mappingRevision:row.mapping_revision,
      expiresAt:c.expiry,revocationGrantId:c.remove.id,...extra};
    return api('/plans/granted',{workId:c.work.id,revision:1,steps:[step],idempotencyKey:crypto.randomUUID()},'employee');
  };
  for(const c of contexts) {
    c.remove=await grantFor(c,{action:'group.remove'},'owner');
    if(c.key==='delegate') {
      await db.prepare('INSERT INTO work_delegations VALUES(?,?,?,?,?,?,NULL)').bind('delegate-test','w','new-manager','delegate',future(-1000),future(3600000)).run();
      const parent=await grantFor(c,{principalId:'delegate'},'owner');
      c.grant=await grantFor(c,{parentId:parent.id,parentVersion:parent.version},'delegate');
      const approvals=(await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_approvals').first()).n;
      const p=await planFor(c,c.grant);assert.equal(p.status,201,JSON.stringify(p));
      assert.equal((await ok('/test/run',{operationId:p.value.operations.find(o=>o.parent_id==='initial').id},'actor')).state,'effect_verified');
      assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_fulfilment_approvals').first()).n,approvals);
      console.log('AUTHORITY: current delegated manager child executes through unrelated owner parent; no extra approval.');
      continue;
    }
    c.grant=await grantFor(c);
    // A caller cannot widen a temporary manager decision by modifying the actual effect plan.
    for(const expiresAt of [undefined,future(7200000)]) {
      const widened=await planFor(c,c.grant,{expiresAt});
      assert.equal(widened.value.code,'manager_approval_required',JSON.stringify(widened));
    }
    const p=await planFor(c,c.grant);assert.equal(p.status,201,JSON.stringify(p));
    const op=p.value.operations.find(o=>o.parent_id==='initial');
    const sql={catalog:`UPDATE work_catalog SET revision=revision+1 WHERE id='${c.catalog.id}'`,
      person:"UPDATE work_people SET revision=revision+1 WHERE workspace_id='w' AND id='employee'",
      fulfilment:`UPDATE work_fulfilments SET revision=revision+1 WHERE work_id='${c.work.id}'`,
      work:`UPDATE work_records SET revision=revision+1 WHERE id='${c.work.id}'`}[c.key];
    await ok('/test/oauth-mutation',{countdown:2,sql});
    const before=writes.length,r=await ok('/test/run',{operationId:op.id},'actor');
    assert.equal(r.last_error,c.key==='work'?'work_changed':'manager_approval_required',JSON.stringify(r));
    assert.equal(writes.length,before);
    console.log(`AUTHORITY: ${c.key} revision changed during effect OAuth denied; zero service writes.`);
  }
}
