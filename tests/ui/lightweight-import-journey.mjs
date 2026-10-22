import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureJourney} from './viewport-evidence.mjs';
/** Real authenticated import routes followed by the native ticket, people and stock screens. */
export async function lightweightImportJourney({page,api,base,out}) {
  const original=page.viewportSize(),csv=(name,text)=>({name,base64:Buffer.from(text).toString('base64')});
  const at='2026-10-01T09:00:00Z',later='2026-10-01T10:30:00Z';
  const input={account:'synthetic-linen-browser',files:[{...csv('tickets.csv',`id,subject,description,type,status,requester,created_at,updated_at\nsynthetic-linen-1,Replace the Denver meeting-room dock,The two external monitors remain dark after reconnecting.,incident,open,synthetic-linen-1,${at},${later}\n`),format:'tickets-csv'}]};
  const bytes=await readFile('tests/adoption/fixtures/zendesk/synthetic-linen-1.ndjson');
  const zendesk={account:'synthetic-linen-browser',files:[{name:'tickets.ndjson',format:'tickets-json',base64:bytes.toString('base64')}]};
  const imported=[];
  for(const [path,data]of [['/adoption/csv-imports/tickets',input],['/adoption/zendesk-imports',zendesk]]) {
    const review=await api(path+'/dry-run',{input:data}),job=await api(path,{input:data,reviewedFingerprint:review.fingerprint,operationKey:'synthetic-linen-browser',acceptOmissions:true});
    for(let i=0;i<6;i++){const result=await api(`${path}/${job.id}/resume`,{});if(result.state==='completed')break;assert.ok(i<5,JSON.stringify(result));}
    imported.push({id:review.records[0].targets[0].id,source:path.includes('zendesk')?'zendesk':'csv'});
  }
  const people={account:'synthetic-linen-browser',file:csv('people.csv',`id,name,effective_at,observed_at\nsynthetic-linen-1,Avery Morgan,${at},${later}\n`)};
  const reviewed=await api('/adoption/csv-imports/people/dry-run',people);
  const created=await api('/adoption/csv-imports/people',{...people,reviewedFingerprint:reviewed.fingerprint,acceptOmissions:true});
  assert.equal(created.created,1);
  const assetInput={file:csv('assets.csv','Asset Tag,Serial,Location,Status\nDEN-204,synthetic-linen-204,Denver stockroom,Ready to Deploy\n')};
  const assetReview=await api('/adoption/csv-imports/assets/dry-run',assetInput);
  const asset=await api('/adoption/csv-imports/assets',{...assetInput,reviewedFingerprint:assetReview.fingerprint,acceptOmissions:true});
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:width===1440?1000:844});
    for(const item of imported){
      await page.goto(base+'/app#/work/'+item.id);
      await page.getByRole('heading',{name:item.source==='csv'?'Replace the Denver meeting-room dock':'Dock stops detecting external monitors',exact:true}).waitFor();
      if(item.source==='zendesk')await page.getByText('PRIVATE diagnosis: firmware investigation is pending.',{exact:false}).first().waitFor();
      await fit('ticket-'+item.source,width);
    }
    await page.goto(base+'/app#/lifecycle');
    const choose=page.getByLabel('Person',{exact:true}).first();await choose.selectOption(created.people[0].id);assert.match(await choose.locator('option:checked').innerText(),/Avery Morgan/);
    await fit('people',width);
    await page.goto(base+'/app#/assets/'+asset.assets[0].id);await page.getByRole('heading',{name:'synthetic-linen-204',exact:true}).waitFor();
    await page.getByText('Serial-level custody history',{exact:true}).click();await page.getByRole('list',{name:'Asset activity',exact:true}).waitFor();
    await fit('stock-custody',width);
  }
  await page.setViewportSize(original);
  async function fit(name,width){
    await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);
    await captureJourney(page,{path:`${out}/MIGRATE-004-${name}-${width}.png`,fullPage:true});
    await page.screenshot({path:`${out}/MIGRATE-004-${name}-${width}-viewport.png`});
  }
  console.log('PASS MIGRATE-004 native CSV/Zendesk historical tickets, imported unbound person, stock and custody at 1440/390');
}
