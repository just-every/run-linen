import assert from 'node:assert/strict';
const base='/adoption/snipeit-imports',pad=n=>String(n).padStart(4,'0');
const cell=value=>/[",\r\n]/.test(value)?`"${value.replaceAll('"','""')}"`:value;

/** A Snipe-IT Custom Asset Report CSV of 500 devices, with the conflict and omission cases a real inventory has. */
function snipeitExport() {
  const headers=['Asset Tag','Asset Name','Serial','Model','Category','Status','Checked Out To','Location','Purchase Cost','Notes'],rows=[];
  for(let n=1;n<=500;n++){
    const serial=n===3?' SYNTHETIC-LINEN-0002 ':n===42?'synthetic-linen-stocktake':n===77?'':`synthetic-linen-${pad(n)}`;
    rows.push([`LT-${pad(n)}`,`MacBook Pro ${n}`,serial,'MacBook Pro 14"','Laptops',n%5?'Ready to Deploy':'Deployed',n%5?'':`Synthetic Person ${n}`,n%2?'Denver':'Austin','2499.00',n===10?'Keyboard replaced,\nbattery fine':'']);
  }
  return Buffer.from([headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n');
}

/** MIGRATE-004: 500 Snipe-IT devices; serial conflicts are reported in the dry run and resolved before apply. */
export async function snipeitImportChecks({ok,request,login,owner,snapshot}) {
  await ok('/members','POST',{email:'snipeit-operator@example.test',name:'Inventory Operator',password:'fixture operator password',roles:['operator']},owner,201);
  const operator=await login('snipeit-operator@example.test','fixture operator password');
  const linen=await ok('/assets','POST',{serial:'SYNTHETIC-LINEN-STOCKTAKE',source:'Denver stocktake',assetTag:'LIN-0001'},owner,201);
  const file={name:'snipeit-assets.csv',base64:snipeitExport().toString('base64')};
  assert.equal((await request(`${base}/dry-run`,'POST',{file},operator)).status,403,'Only an owner reviews a device import');

  const before=await snapshot(),first=await ok(`${base}/dry-run`,'POST',{file},owner,200,{'X-Test-Read-Only':'1'});
  assert.equal(await snapshot(),before,'The dry run changes nothing');
  assert.deepEqual(first.counts,{rows:500,ready:496,conflicts:2,unresolved:2,rejected:1});
  assert.deepEqual(first.conflicts.map(c=>[c.assetTags,c.linenAssetIds,c.resolution]),[[['LT-0002','LT-0003'],[],null],[['LT-0042'],[linen.id],null]],'Duplicate serials in the export and a serial already in Linen are both reported, ignoring case and spaces');
  assert.deepEqual(first.rejected.map(r=>r.assetTag),['LT-0077']);
  assert.ok(first.omissions.some(o=>o.field==='Checked Out To')&&first.omissions.some(o=>/custody/.test(o.reason)),'Snipe-IT custody is listed as not imported');

  const unresolved=await request(base,'POST',{file,reviewedFingerprint:first.fingerprint,acceptOmissions:true},owner);
  assert.equal(unresolved.status,409);assert.equal((await unresolved.json()).error.code,'snipeit_conflicts_unresolved');
  assert.equal((await ok('/assets','GET',undefined,owner)).items.length,1,'An unresolved review records no device');
  assert.equal((await request(`${base}/dry-run`,'POST',{file,resolutions:{'synthetic-linen-stocktake':'LT-0042'}},owner)).status,422,'A serial already in Linen can only be skipped');

  const resolutions={'synthetic-linen-0002':'lt-0003','Synthetic-Linen-Stocktake':'skip'};
  const resolved=await ok(`${base}/dry-run`,'POST',{file,resolutions},owner,200,{'X-Test-Read-Only':'1'});
  assert.deepEqual(resolved.counts,{rows:500,ready:497,conflicts:2,unresolved:0,rejected:1});
  assert.deepEqual(resolved.conflicts.map(c=>c.resolution),['LT-0003','skip']);

  // A device recorded after the review is a new conflict: the reviewed apply is refused whole.
  await ok('/assets','POST',{serial:'synthetic-linen-0500',source:'Austin stocktake'},owner,201);
  const stale=await request(base,'POST',{file,resolutions,reviewedFingerprint:resolved.fingerprint,acceptOmissions:true},owner);
  assert.equal(stale.status,409);assert.equal((await stale.json()).error.code,'snipeit_review_changed');
  assert.equal((await ok('/assets','GET',undefined,owner)).items.length,2,'A refused apply records no device');

  const final=await ok(`${base}/dry-run`,'POST',{file,resolutions:{...resolutions,'SYNTHETIC-LINEN-0500':'skip'}},owner);
  assert.deepEqual(final.counts,{rows:500,ready:496,conflicts:3,unresolved:0,rejected:1});
  const body={file,resolutions:{...resolutions,'SYNTHETIC-LINEN-0500':'skip'},reviewedFingerprint:final.fingerprint};
  assert.equal((await request(base,'POST',body,owner)).status,422,'Omissions need explicit acceptance');
  const applied=await ok(base,'POST',{...body,acceptOmissions:true},owner,201);
  assert.equal(applied.created,496);

  const assets=(await ok('/assets','GET',undefined,owner)).items,byTag=new Map(assets.map(a=>[a.asset_tag,a]));
  assert.equal(assets.length,498);
  assert.equal(byTag.get('LT-0003').serial,'SYNTHETIC-LINEN-0002','The chosen duplicate row is imported');
  for(const tag of ['LT-0002','LT-0042','LT-0077','LT-0500'])assert.ok(!byTag.has(tag),`${tag} is not imported`);
  assert.deepEqual([byTag.get('LIN-0001').serial,byTag.get('LIN-0001').source],['SYNTHETIC-LINEN-STOCKTAKE','Denver stocktake'],'Linen keeps its own device');
  const deployed=byTag.get('LT-0005');
  assert.deepEqual([deployed.state,deployed.person_id,deployed.location],['stock',null,'Denver']);
  const history=await ok(`/assets/${deployed.id}/history`,'GET',undefined,owner);
  assert.equal(history.items.length,1);assert.equal(history.items[0].kind,'record');assert.equal(history.items[0].person_id,null);
  assert.match(history.items[0].evidence,/Snipe-IT status "Deployed"/);assert.doesNotMatch(history.items[0].evidence,/Synthetic Person/);

  const again=await ok(`${base}/dry-run`,'POST',{file},owner);
  assert.deepEqual([again.counts.ready,again.counts.unresolved],[0,498],'Importing the same export again cannot duplicate a device');
  console.log('PASS MIGRATE-004 Snipe-IT export of 500 devices: owner-only read-only dry run reports in-file and existing serial conflicts, apply refused until each is resolved and when Linen changed since review, then one atomic import records devices without Snipe-IT custody');
}
