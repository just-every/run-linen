import assert from 'node:assert/strict';
import { action } from './connected-helpers.mjs';
export async function assetFinancialJourney({page,api,base,out}) {
  for(const width of [1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(base+'/app#/assets');
    const serial=`DENVER-LAPTOP-FINANCE-${width}`;
    const asset=await action(page,'Record a device',{serial,source:'Dell PO-4821',location:'Denver office'},'/assets','Save',201);
    const card=page.locator('.connection-record').filter({has:page.getByRole('heading',{name:serial,exact:true})});
    const finances=card.locator('details.evidence').filter({has:page.locator(':scope > summary').getByText('Asset financials & depreciation',{exact:true})}).first();
    await finances.locator(':scope > summary').click();
    await action(page,'Record asset financials',{purchaseUsd:2400,costCenter:'Denver Engineering',inServiceDate:'2025-01-31',usefulMonths:36,method:'straight-line'},`/assets/${asset.id}/financials`);
    await finances.getByLabel('Book value as of').fill('2026-01-31');
    await finances.getByLabel('Fiscal year starts').fill('2025-07-01');
    await finances.getByText('$1,600.00',{exact:true}).first().waitFor();
    assert.equal((await api(`/assets/${asset.id}/financials?asOf=2026-01-31&fiscalStart=2025-07-01`)).bookCents,160000,'ASSET-008 persisted month-12 book value');
    await finances.getByText('Denver Engineering',{exact:true}).waitFor();
    const download=page.waitForEvent('download');
    await finances.getByRole('link',{name:'Export fiscal-year CSV'}).click();
    const file=await download;
    assert.equal(await file.failure(),null,'ASSET-008 accounting CSV download succeeds');
    await file.saveAs(`${out}/ASSET-008-fiscal-${width}.csv`);
    await finances.getByRole('table').scrollIntoViewIfNeeded();
    assert.equal(await finances.getByRole('row').count(),13,'ASSET-008 fiscal year table displays twelve postings');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'ASSET-008 fits viewport');
    process.env.LINEN_CAPTURE && await page.screenshot({path:`${out}/ASSET-008-straight-line-${width}.png`});
    await action(page,'Record asset financials',{method:'declining-balance'},`/assets/${asset.id}/financials`);
    await page.reload();
    const reopened=card.locator('details.evidence').filter({has:page.locator(':scope > summary').getByText('Asset financials & depreciation',{exact:true})}).first();
    await reopened.locator(':scope > summary').click();
    await reopened.getByText('declining-balance',{exact:true}).waitFor();
    await reopened.getByLabel('Book value as of').fill('2025-02-28');
    await reopened.getByLabel('Fiscal year starts').fill('2025-01-01');
    await reopened.getByText('$2,266.67',{exact:true}).first().waitFor();
    await reopened.getByRole('table').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'ASSET-008 declining schedule fits viewport');
    process.env.LINEN_CAPTURE && await page.screenshot({path:`${out}/ASSET-008-declining-${width}.png`});
  }
  console.log('PASS ASSET-008 browser: $2400/36-month asset, month-12 book value, fiscal CSV download, persisted declining policy at 1440');
}
