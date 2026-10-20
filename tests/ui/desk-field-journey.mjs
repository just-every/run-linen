import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';
/** DESK-010: an agent sets the Office dropdown and the Awaiting parts status on an incident in the console, is refused
 * closing it without a resolution code, closes it with a code and close notes, and reads the count by code in REPORT-001. */
export async function deskFieldJourney({page,api,base,out}) {
  await page.setViewportSize({width:1440,height:1000});
  await api('/desk-fields',{name:'Office',type:'dropdown',options:['Denver','Austin'],kinds:['incident','service_request']});
  await api('/desk-statuses',{name:'Awaiting parts',waitingOn:'vendor'});
  const work=await api('/work',{title:'Docking station dead',body:'My docking station does not power on.',kind:'incident',deduplicationKey:crypto.randomUUID()});
  await page.goto(`${base}/app#/work/${work.id}`);
  const fields=page.getByRole('region',{name:'Ticket fields'});
  await fields.getByRole('combobox',{name:/^Office/}).selectOption('Denver');
  await fields.getByRole('button',{name:'Save Office',exact:true}).click();
  await page.waitForFunction(async id=>(await (await fetch(`/api/v1/work/${id}/desk`)).json()).fields.some(f=>f.name==='Office'&&f.value==='Denver'),work.id);
  const controls=async()=>{ if(!await page.getByRole('button',{name:'Close',exact:true}).isVisible()) await page.getByText('Service controls',{exact:true}).click(); };
  await controls();
  await page.getByRole('button',{name:'Pause',exact:true}).click();
  await page.getByRole('combobox',{name:/^Status/}).selectOption({label:'Awaiting parts · waits on the vendor'});
  await page.getByLabel('Reason',{exact:true}).fill('Replacement dock ordered from the vendor');
  await page.getByRole('button',{name:'Save to this conversation',exact:true}).click();
  await fields.getByText('Awaiting parts',{exact:true}).waitFor();
  await captureJourney(page,{path:`${out}/DESK-010-awaiting-parts.png`,fullPage:true});
  // The console refuses the close without a resolution code and keeps the ticket paused.
  await controls();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByLabel('Close notes',{exact:true}).fill('Dock replaced; powers on');
  const refused=page.waitForResponse(r=>r.url().endsWith(`/work/${work.id}/commands`)&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Save to this conversation',exact:true}).click();
  assert.equal((await refused).status(),422,'DESK-010 the console close without a resolution code is refused');
  await page.getByText('An incident is resolved only with a resolution code',{exact:false}).first().waitFor();
  assert.equal((await api(`/work/${work.id}`)).work.state,'paused');
  await page.getByRole('combobox',{name:/^Resolution code \(required for an incident\)/}).selectOption('Solved (permanent fix)');
  await page.getByRole('button',{name:'Save to this conversation',exact:true}).click();
  await fields.getByText('Solved (permanent fix)',{exact:true}).waitFor();
  await fields.getByText('Dock replaced; powers on',{exact:true}).waitFor();
  await captureJourney(page,{path:`${out}/DESK-010-resolved.png`,fullPage:true});
  await page.goto(`${base}/app#/reports`);
  await page.getByLabel('From',{exact:true}).fill('2000-01-01T00:00');
  await page.getByLabel('Until',{exact:true}).fill('2099-01-01T00:00');
  await page.getByRole('button',{name:'Read this period',exact:true}).click();
  const byCode=page.getByRole('region',{name:'Resolutions by code'});
  await byCode.getByRole('row',{name:/^Solved \(permanent fix\) \d+$/}).waitFor();
  await captureJourney(page,{path:`${out}/DESK-010-report.png`,fullPage:true});
  console.log('PASS DESK-010: Office field and Awaiting parts status set in the console; close without a code refused, closed with code and notes, counted by code in the report at 1440/390');
}
