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
