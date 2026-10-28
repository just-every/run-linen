import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';
/** Optional clause proof on an authenticated operator page. Uses the product UI/API, with no provider effects. */
export async function timeJourney({page,base,api,workId,out}) {
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/app#/work/${workId}`);
  await page.bringToFront();
  // Headless Chromium has no OS window to regain focus after another context closes.
  // Exercise the product's focused-work path using Chromium's browser-level focus signal.
  const focus = await page.context().newCDPSession(page);
  await focus.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  try {
  await page.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible');
  await page.getByText('Time & effort',{exact:true}).click();
  await page.getByLabel('Minutes',{exact:true}).fill('15');
  await page.getByLabel('Work performed',{exact:true}).fill('Investigated the request and checked the remaining task.');
  const manualSaved = page.waitForResponse(response=>response.url().endsWith(`/work/${workId}/time`)&&response.request().method()==='POST'&&response.status()===201);
  await page.getByRole('button',{name:'Save time entry',exact:true}).click();
  await manualSaved;
  const started = page.waitForResponse(response=>response.url().endsWith(`/work/${workId}/time`)&&response.request().method()==='POST'&&response.status()===201);
  await page.getByRole('button',{name:'Measure active work',exact:true}).click();
  await started;
  // The heartbeat deadline begins after the measured entry exists, rather than
  // including the preceding manual-save refresh and the start-button action.
  const measured = page.waitForResponse(async response=>{
    if(!response.url().includes(`/work/${workId}/time/`)||response.request().method()!=='POST'||response.status()!==200)return false;
    return (await response.json()).active_ms>0;
  },{timeout:25000});
  await page.bringToFront();
  await page.waitForFunction(() => document.hasFocus() && document.visibilityState === 'visible');
  // Exercise actual focused keyboard activity while the product records its
  // heartbeat. A headless page left idle after other contexts close can lose
  // browser focus even though CDP previously reported it as focused.
  let recorded = false;
  await Promise.all([
    measured.finally(() => { recorded = true; }),
    (async () => { while (!recorded) { await page.keyboard.press('Shift'); await page.waitForTimeout(1000); } })(),
  ]);
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
  console.log('PASS DESK-012: manual and real measured active work feed the effort report at 1440');
  // REPORT-004: the owner declares a role rate, then reads a baseline window beside this period.
  await page.getByText('Declare labor rates',{exact:true}).click();
  await page.getByLabel('Owner rate (USD/hour)',{exact:true}).fill('90');
  await page.getByRole('button',{name:'Save labor rates',exact:true}).click();
  await page.waitForFunction(async()=>(await (await fetch('/api/v1/reports/labor-rates')).json()).rates?.owner===90);
  await page.getByLabel('Baseline from',{exact:true}).fill('2000-01-01T00:00');
  await page.getByLabel('Baseline until',{exact:true}).fill('2001-01-01T00:00');
  await page.getByLabel('From',{exact:true}).fill('2001-01-01T00:00');
  await page.getByRole('button',{name:'Read this period',exact:true}).click();
  await page.getByRole('heading',{name:'Human work saved',exact:true}).waitFor();
  const saved=await api(`/reports/work-saved?baselineFrom=2000-01-01T00:00:00.000Z&baselineTo=2001-01-01T00:00:00.000Z&currentFrom=2001-01-01T00:00:00.000Z&currentTo=2099-01-01T00:00:00.000Z`);
  const row=saved.requestTypes.find(r=>r.current?.byRole.owner);
  assert.equal(row.baseline,null);assert.ok(row.current.labor.usd>=15/60*90);
  const table=page.getByRole('table',{name:`${row.requestType}: baseline beside current`});
  await table.getByRole('row',{name:/^Labor /}).getByText(`$${row.current.labor.usd.toFixed(2)}`,{exact:true}).waitFor();
  await table.getByRole('row',{name:/^Cost per verified outcome/}).waitFor();
  await captureJourney(page,{path:`${out}/REPORT-004-work-saved.png`,fullPage:true});
  // AGENT-006: the same report carries the ranked proposal, or says why nothing is ranked.
  const proposal=page.getByRole('region',{name:'Next automation proposal'}),next=saved.automationProposal.next;
  await proposal.getByText(next?`Automate ${next.requestType} next`:'No ranked request type still takes human minutes.',{exact:false}).first().waitFor();
  for(const type of saved.automationProposal.notEnoughEvidence)await proposal.getByText(type,{exact:false}).first().waitFor();
  await proposal.scrollIntoViewIfNeeded();
  await captureJourney(page,{path:`${out}/AGENT-006-next-automation.png`,fullPage:true});
  console.log('PASS REPORT-004: owner-declared role rate prices recorded minutes in the baseline/current work-saved report at 1440');
  return {workId,entries};
  } finally {
    await focus.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await focus.detach();
  }
}
