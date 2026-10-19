import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';
/** Optional clause proof on an authenticated operator page. Uses the product UI/API, with no provider effects. */
export async function timeJourney({page,base,api,workId,out}) {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/app#/work/${workId}`);
  await page.bringToFront();
  await page.getByText('Time & effort',{exact:true}).click();
  await page.getByLabel('Minutes',{exact:true}).fill('15');
  await page.getByLabel('Work performed',{exact:true}).fill('Investigated the request and checked the remaining task.');
  await page.getByRole('button',{name:'Save time entry',exact:true}).click();
  await page.getByRole('button',{name:'Measure active work',exact:true}).click();
  await page.waitForResponse(async response=>{
    if(!response.url().includes(`/work/${workId}/time/`)||response.request().method()!=='POST'||response.status()!==200)return false;
    return (await response.json()).active_ms>0;
  },{timeout:25000});
  await page.getByRole('button',{name:'Finish measurement',exact:true}).click();
  const entries=(await api(`/work/${workId}/time`)).items;
  assert.ok(entries.some(row=>row.source==='manual'&&row.active_ms===900000));
  assert.ok(entries.some(row=>row.source==='measured'&&row.active_ms>0));
  await captureJourney(page,{path:`${out}/DESK-012-time.png`,fullPage:true});
  await page.goto(`${base}/app#/reports`);
  await page.getByLabel('From',{exact:true}).fill('2000-01-01T00:00');
  await page.getByLabel('Until',{exact:true}).fill('2099-01-01T00:00');
  await page.getByRole('button',{name:'Read this period',exact:true}).click();
  await page.getByRole('heading',{name:'Human effort',exact:true}).waitFor();
  await captureJourney(page,{path:`${out}/DESK-012-effort.png`,fullPage:true});
  console.log('PASS DESK-012: manual and real measured active work feed the effort report at 1440/390');
  return {workId,entries};
}
