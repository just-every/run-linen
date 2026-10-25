import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {apiFor,action,signIn} from './connected-helpers.mjs';
import {captureCommitment as captureJourney} from './commitment-capture.mjs';

const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
const before=JSON.parse(await readFile(out+'/commitment-context.json','utf8'));
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
try {
    const page=await browser.newPage({timezoneId:'UTC',viewport:{width:1440,height:1000}});
    await signIn(page,base,'commitment-owner@example.test','synthetic-linen-1');const api=apiFor(page);
    assert.equal((await api(`/work/${before.workId}`)).work.state,'closed');
    const current=await api(`/commitments/${before.commitmentId}`);assert.equal(current.revision,3);
    const wait=Math.max(0,Date.parse(current.dueAt)-Date.now()+100);assert.ok(wait<11000);await page.waitForTimeout(wait);
    await fetch(base+'/__journey/tick',{method:'POST'});
    let coverage=await api(`/commitments/${before.commitmentId}/coverage`);
    assert.equal(coverage.coverage[0].state,'verified');assert.deepEqual(coverage.uncoveredCohorts,before.missingIds);
    await page.goto(base+'/app#/commitments/'+before.commitmentId);await page.getByText('Every scheduled starter retains baseline repository read permission',{exact:true}).first().waitFor();
    await captureJourney(page,{path:out+'/commitment-restarted-scheduled-readback.png',fullPage:true});
    await action(page,'Update the commitment',{freshnessSeconds:2},'/commitments/'+before.commitmentId);
    await action(page,'Observe this commitment now',{},'/observe','Run scoped observations');
    await page.waitForTimeout(2200);await page.reload();await page.locator('.status-stale').first().waitFor();
    assert.equal((await api(`/commitments/${before.commitmentId}/coverage`)).coverage[0].state,'stale');
    await captureJourney(page,{path:out+'/commitment-stale-unknown.png',fullPage:true});
    const source=(await api('/connections')).find(c=>c.id===before.connectionId);
    await api(`/connections/${source.id}/disconnect`,{revision:source.revision});await page.reload();
    assert.equal((await api(`/commitments/${before.commitmentId}/coverage`)).coverage[0].state,'uncertain');
    await captureJourney(page,{path:out+'/commitment-withdrawn-source.png',fullPage:true});
    await action(page,'Retire this commitment',{},'/retire','Retire commitment');
    assert.ok(Date.parse((await api(`/commitments/${before.commitmentId}`)).data.expiresAt)<=Date.now());
    const rejected=await page.evaluate(async id=>{const session=await(await fetch('/api/v1/session')).json();return(await fetch(`/api/v1/commitments/${id}/observe`,{method:'POST',headers:{'Content-Type':'application/json','X-Linen-CSRF':session.csrfToken},body:'{}'})).status},before.commitmentId);
    assert.equal(rejected,409);
    await captureJourney(page,{path:out+'/commitment-retired.png',fullPage:true});
    for(const width of [1440,390]) {
        await page.setViewportSize({width,height:1000});const profile=page.getByRole('button',{name:'Your workspace and account'});
        await page.keyboard.press('Tab');await profile.focus();assert.equal(await profile.evaluate(e=>e.matches(':focus-visible')),true);
        assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
        await profile.evaluate(e=>e.blur());await profile.hover();assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').transitionDelay),'0.3s');
        await page.waitForTimeout(420);assert.equal(await profile.evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
        await page.screenshot({path:`${out}/commitment-tooltip-${width}.png`});
    }
    console.log(JSON.stringify({workerRestart:true,scheduledLiveReadback:true,missingEvidenceUnknown:true,staleEvidenceUnknown:true,sourceWithdrawalUnknown:true,ownerRetirement:true,tooltipsBothWidths:true,remoteWrites:false}));
} finally {await browser.close();}
