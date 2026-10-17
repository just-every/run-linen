import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {apiFor,signIn,action,local} from './connected-helpers.mjs';
import {nativeCreate} from './native-regressions.mjs';
import {captureJourney} from './viewport-evidence.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
const before=JSON.parse(await readFile(out+'/persistence.json','utf8'));
const browser=await chromium.launch({headless:true,args:["--use-mock-keychain","--password-store=basic"]});
try{
 const page=await browser.newPage({timezoneId:'UTC',viewport:{width:1440,height:1000}});await signIn(page,base,'connected-owner@example.test');const api=apiFor(page);
 assert.deepEqual(await api('/grants'),before.grants,'Actual worker restart retains exact authority');
 assert.deepEqual(await api('/operations'),before.operations,'Restart retains every effect and reconciliation duty');
 assert.deepEqual(await (await fetch(base+'/__fixture/evidence')).json(),before.fixture,'Provider effects were not replayed during restart');
 await page.goto(base+'/app#/commitments/'+before.commitmentId);await page.getByText('London and Sydney can submit renewals',{exact:true}).first().waitFor();
 await captureJourney(page,{path:out+'/J6-real-worker-restart.png',fullPage:true});
 const commitment=await api('/commitments/'+before.commitmentId);
 const id=await nativeCreate(page,base,'commitments','Establish a service commitment',{'What should people always be able to do?':'Time-bounded independent renewal observation','Actual beneficiary identities':commitment.data.cohort.join('\n'),'Independent observation definitions':JSON.stringify(commitment.data.observations),'Evidence freshness in seconds':1,'Observation interval in seconds':3600,'Effective from':local(-60000)});
 await action(page,'Observe this commitment now',{},'/observe','Run scoped observations');
 const fresh=await api('/commitments/'+id+'/coverage');assert.ok(fresh.coverage.every(c=>c.state!=='stale'));
 await new Promise(r=>setTimeout(r,1500));await page.reload();
 assert.ok((await api('/commitments/'+id+'/coverage')).coverage.every(c=>c.state==='stale'));
 await page.locator('.status-stale').first().waitFor();await captureJourney(page,{path:out+'/J6-evidence-freshness-expired.png',fullPage:true});
 const result=JSON.parse(await readFile(out+'/results.json','utf8'));result.checks.push('J6 real Worker stop/restart preserves authority, all effects and provider state; native short-freshness commitment becomes stale without manufactured health');await writeFile(out+'/results.json',JSON.stringify(result,null,2));console.log('PASS real Worker restart and native evidence freshness');
}finally{await browser.close()}
