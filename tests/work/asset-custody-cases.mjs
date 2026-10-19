import assert from 'node:assert/strict';

export async function assetCustodyChecks(api, personId) {
  const created=await api('/assets',{serial:'NORTHSTAR-MBP-2026-42',source:'Purchase order PO-1042',location:'Denver stockroom',procured:true});
  assert.equal(created.status,201,JSON.stringify(created));
  const path=`/assets/${created.value.id}/commands`, history=`/assets/${created.value.id}/history`;
  let revision=1;
  const command=async (command,extra={})=>{
    const result=await api(path,{revision,command,evidence:`IT physical ${command} receipt`,...extra});
    assert.equal(result.status,200,JSON.stringify(result));revision=result.value.revision;return result.value;
  };
  assert.equal((await api(path,{revision,command:'assign',personId,evidence:'Not received'})).status,422);
  assert.equal((await command('receive')).state,'stock');
  await command('assign',{personId});
  await command('receive',{personId});
  const certificate={certificatePartner:'Front Range ITAD',certificateStandard:'R2v3',certificateReference:'https://records.example.test/itad/PO-1042.pdf'};
  assert.equal((await api(path,{revision,command:'dispose',evidence:'Unsafe',...certificate})).status,422,'ASSET-004 refuses disposal while assigned even with a certificate');
  await command('repair');
  assert.equal((await api(path,{revision,command:'dispose',evidence:'Repair does not clear assignment',...certificate})).status,422);
  await command('return',{personId});
  await command('loan',{personId});
  await command('receive',{personId});
  await command('return',{personId});
  await command('repair');
  await command('receive');
  await command('retire');
  assert.equal((await api(path,{revision,command:'dispose',evidence:'No certificate'})).status,422,'ASSET-004 requires the partner certificate');
  assert.equal((await api(path,{revision,command:'dispose',evidence:'Wrong standard',...certificate,certificateStandard:'ISO 9001'})).status,422);
  assert.equal((await api(path,{revision,command:'dispose',evidence:'Unsafe reference',...certificate,certificateReference:'javascript:alert(1)'})).status,422);
  const disposal=await command('dispose',certificate);
  assert.equal(disposal.state,'disposed');
  assert.equal((await api(path,{revision:revision-1,command:'dispose',evidence:'Stale replay',...certificate})).status,422);
  const result=await api(history);
  assert.equal(result.status,200);
  assert.equal(result.value.asset.serial,'NORTHSTAR-MBP-2026-42');
  assert.deepEqual(result.value.items.map(e=>e.kind),['procure','receive','assign','receive','repair','return','loan','receive','return','repair','receive','retire','dispose']);
  assert.ok(result.value.items.every(e=>e.actor_id==='owner'&&e.created_at&&e.evidence),'ASSET-004 every receipt remains attributed');
  assert.deepEqual(result.value.items.at(-1).certificate,{partner:certificate.certificatePartner,standard:certificate.certificateStandard,reference:certificate.certificateReference});
  assert.equal((await api(history,undefined,{'x-workspace':'b'})).status,404);
  assert.equal((await api(history,undefined,{'x-user':'employee','x-roles':'["employee"]'})).status,403);
  assert.equal((await api(history,undefined,{'x-user':'employee','x-roles':'["owner"]'})).status,403);
  console.log('PASS ASSET-004 procurement, physical receipts, assignment/repair/return, loan, retirement, required ITAD certificate and serial history');
}

export async function assetAuditChecks(api, personId) {
  const ok=(response,status=200)=>{assert.equal(response.status,status,'ASSET-010 '+JSON.stringify(response.value));return response.value;};
  const tags=[];
  for (let n=1;n<=20;n++) {
    const tag=`DEN-AUD-${String(n).padStart(3,'0')}`;tags.push(tag);
    ok(await api('/assets',{serial:`AUDIT-SERIAL-${n}`,assetTag:tag,source:'Denver stocktake sheet',location:n%2 ? 'Denver stock room' : ' denver  STOCK room '}),201);
  }
  const assigned=ok(await api('/assets',{serial:'AUDIT-ASSIGNED-1',assetTag:'DEN-AUD-ASSIGNED',source:'Denver stocktake sheet',location:'Denver stock room'}),201);
  ok(await api(`/assets/${assigned.id}/commands`,{revision:1,command:'assign',personId,evidence:'Desk handoff receipt'}));
  const elsewhere=ok(await api('/assets',{serial:'AUDIT-BOULDER-1',assetTag:'BLD-AUD-001',source:'Boulder stocktake',location:'Boulder office'}),201);
  assert.equal((await api('/asset-audits',{location:'Denver stock room'},{'x-user':'employee','x-roles':'["employee"]'})).status,403,'ASSET-010 employees cannot audit');
  assert.equal((await api('/asset-audits',{location:'Empty closet'})).status,422,'ASSET-010 an audit needs expected devices');
  const audit=ok(await api('/asset-audits',{location:'Denver stock room'}),201);
  assert.equal(audit.expected.length,20,'ASSET-010 expected = the 20 shelf devices at the location; the assigned device is with its person');
  assert.ok(!audit.expected.some(e=>e.assetId===assigned.id));
  assert.equal((await api('/asset-audits',{location:'DENVER STOCK ROOM'})).status,409,'ASSET-010 one open audit per location');
  for (const tag of tags.slice(0,18)) assert.equal(ok(await api(`/asset-audits/${audit.id}/scans`,{code:tag.toLowerCase()})).outcome,'found');
  const repeat=ok(await api(`/asset-audits/${audit.id}/scans`,{code:tags[0]}));
  assert.equal(repeat.repeat,true,'ASSET-010 a repeat scan counts once');
  const stray=ok(await api(`/asset-audits/${audit.id}/scans`,{code:'BLD-AUD-001'}));
  assert.deepEqual([stray.outcome,stray.recordedLocation],['elsewhere','Boulder office'],'ASSET-010 a device recorded elsewhere is reported, not counted');
  assert.equal(ok(await api(`/asset-audits/${audit.id}/scans`,{code:'NO-SUCH-TAG'})).outcome,'unknown');
  assert.equal((await api(`/asset-audits/${audit.id}`,undefined,{'x-workspace':'b'})).status,404,'ASSET-010 audits stay in their workspace');
  assert.equal((await api(`/asset-audits/${audit.id}/complete`,{revision:audit.revision+1})).status,409,'ASSET-010 completion needs the current revision');
  const done=ok(await api(`/asset-audits/${audit.id}/complete`,{revision:audit.revision}));
  assert.equal(done.state,'completed');
  assert.deepEqual([done.expected.length,done.found.length,done.missing.length],[20,18,2],'ASSET-010 scan 18 of 20 expected devices');
  assert.deepEqual(done.missing.map(e=>e.assetTag),tags.slice(18),'ASSET-010 reconciliation names the two missing devices');
  assert.deepEqual(done.unexpected.map(s=>s.outcome).sort(),['elsewhere','unknown']);
  for (const missing of done.missing) {
    assert.ok(missing.followUpWorkId,'ASSET-010 each missing device opens a follow-up task');
    const work=ok(await api(`/work/${missing.followUpWorkId}`));
    assert.equal(work.work.title,`Find missing device ${missing.assetTag} (${missing.serial})`);
    const linked=ok(await api(`/work-links?kind=asset&targetId=${missing.assetId}`));
    assert.ok(linked.items.some(i=>i.id===missing.followUpWorkId),'ASSET-010 the follow-up is linked to its device');
  }
  assert.equal(ok(await api(`/work-links?kind=asset&targetId=${done.found[0].assetId}`)).items.length,0,'ASSET-010 found devices open no follow-up');
  assert.equal((await api(`/asset-audits/${audit.id}/scans`,{code:tags[18]})).status,409,'ASSET-010 a completed audit takes no scans');
  assert.equal((await api(`/asset-audits/${audit.id}/complete`,{revision:done.revision})).status,409,'ASSET-010 completion opens follow-ups once');
  assert.equal(ok(await api('/asset-audits')).items[0].id,audit.id);
  assert.ok(elsewhere.id);
  console.log('PASS ASSET-010 Denver stock room audit: 18 of 20 expected devices scanned, stray and unknown scans reported, two missing devices open linked follow-up tasks');
}
