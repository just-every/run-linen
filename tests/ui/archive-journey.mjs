import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {action} from './connected-helpers.mjs';
import {captureJourney} from './viewport-evidence.mjs';
/** The owner uses the native snapshot controls after a real scoped erasure. */
export async function archiveJourney({page,api,base,out}) {
  const person=await api('/members',{email:'synthetic-linen-13100@example.test',name:'Avery Morgan',password:'synthetic-linen-13101',roles:['employee']});
  const work=await api('/work',{title:'Replace Avery’s Denver dock',body:'Avery’s personal diagnostic history',beneficiaryId:person.id,deduplicationKey:'synthetic-linen-13102'});
  const erased=await api('/adoption/erase',{identity:person.id});assert.equal(erased.state,'completed');
  await page.goto(base+'/app#/work/'+work.id);
  await page.getByRole('heading',{name:'[erased]',exact:true}).waitFor();
  await captureJourney(page,{path:out+'/A6-erased-business-record.png',fullPage:true});
  await page.goto(base+'/app#/imports');
  const run=await action(page,'Create a portable snapshot',{},'/exports','Start snapshot',201);
  let manifest;
  for(let n=0;n<200;n++){
    const response=page.waitForResponse(r=>r.url().endsWith('/exports/'+run.id+'/advance')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Continue snapshot',exact:true}).click();
    const result=await response;assert.equal(result.status(),200,await result.text());
    const data=await result.json();if(data.state==='ready'){manifest=data;break;}
  }
  assert.ok(manifest,'Fresh post-erasure native snapshot reaches ready');
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download snapshot summary',exact:true}).click();
  const saved=await download,summary=JSON.parse(await readFile(await saved.path(),'utf8'));
  assert.deepEqual(summary,manifest,'The native summary download is the completed snapshot');
  const chunk=manifest.chunks.find(c=>c.kind==='records'),file=page.waitForEvent('download');
  await page.getByRole('link',{name:'Download file '+(chunk.ordinal+1),exact:true}).click();
  const bytes=await file;assert.ok(JSON.parse(await readFile(await bytes.path(),'utf8')).length);
  await captureJourney(page,{path:out+'/A6-fresh-portable-snapshot.png',fullPage:true});
  console.log('PASS A6 native erased business record and fresh owner snapshot/summary/file download at 1440/390');
}
