import assert from 'node:assert/strict';
import { action } from './connected-helpers.mjs';
// ASSET-010: audit a stock room at phone and desktop width; 18 of 20 expected devices scanned, two missing open follow-ups.
export async function assetAuditJourney({page,api,base,out}) {
  for (const [width,location] of [[390,'Denver stock room'],[1440,'Denver IT closet']]) {
    await page.setViewportSize({width,height:1000});
    const prefix=`DEN${width}`,tags=Array.from({length:20},(_,n)=>`${prefix}-${String(n+1).padStart(3,'0')}`);
    for (const [n,tag] of tags.entries()) await api('/assets',{serial:`${prefix}-SN-${n+1}`,assetTag:tag,source:'Denver stocktake sheet',location});
    await page.goto(base+'/app#/assets');
    await action(page,'Start a physical audit',{location},'/asset-audits','Start audit',201);
    const audit=page.getByRole('article',{name:`Audit of ${location}`});
    await audit.getByText('0 of 20 expected devices found').waitFor();
    const scan=audit.getByLabel('Scan or type an asset tag');
    for (const tag of tags.slice(0,18)) {
      const saved=page.waitForResponse(r=>r.url().endsWith('/scans')&&r.request().method()==='POST');
      await scan.fill(tag.toLowerCase());await scan.press('Enter');
      assert.equal((await saved).status(),200,`ASSET-010 scan ${tag}`);
      await audit.getByText(`${tag}: Found on the expected list`).waitFor();
    }
    await audit.getByText('18 of 20 expected devices found').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('autocomplete')),'off','ASSET-010 the scan field keeps focus for the next tag');
    await audit.locator('summary').getByText('Not yet scanned (2)').click();
    for (const tag of tags.slice(18)) await audit.getByText(tag,{exact:false}).first().waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`ASSET-010 audit fits ${width}`);
    await audit.screenshot({path:`${out}/ASSET-010-scanning-${width}.png`});
    const completed=page.waitForResponse(r=>r.url().endsWith('/complete')&&r.request().method()==='POST');
    await audit.getByRole('button',{name:'Complete audit',exact:true}).click();
    assert.equal((await completed).status(),200,'ASSET-010 audit completes');
    const result=page.getByRole('article',{name:`Completed audit of ${location}`});
    await result.getByText('Missing devices and their follow-ups').waitFor();
    const links=result.getByRole('link',{name:'Follow-up request'});
    assert.equal(await links.count(),2,'ASSET-010 two missing devices open two follow-ups');
    await result.screenshot({path:`${out}/ASSET-010-reconciled-${width}.png`});
    await links.first().click();
    await page.getByRole('heading',{name:`Find missing device ${tags[18]} (${prefix}-SN-19)`}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`ASSET-010 follow-up fits ${width}`);
    await page.screenshot({path:`${out}/ASSET-010-follow-up-${width}.png`});
    const audits=await api('/asset-audits'),done=audits.items.find(a=>a.location===location);
    assert.deepEqual([done.expected.length,done.found.length,done.missing.length],[20,18,2],'ASSET-010 persisted reconciliation');
  }
  console.log('PASS ASSET-010 browser: Denver stock room audit at 390 and 1440, 18 of 20 scanned, two missing devices open follow-up requests');
}
