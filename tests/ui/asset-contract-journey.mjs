import assert from 'node:assert/strict';
import { action, apiFor } from './connected-helpers.mjs';
export async function assetContractJourney(page,out) {
  const api=apiFor(page),base=new URL(page.url()).origin;
  const service=await api('/services',{name:'Employee hardware support',description:'MacBook repair coverage',businessImpact:'Employee laptop availability',source:'IT service register',observedAt:new Date().toISOString()});
  const vendor=await api('/suppliers',{name:'AppleCare enterprise support',services:[service.id],contract:'AppleCare PO-1042',currency:'USD',cost:249,costPeriod:'annual',renewalAt:new Date(Date.now()+86400000*10).toISOString()});
  for (const width of [1440]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(base+'/app#/assets');
    const serial=`MACBOOK-REPAIR-DENVER-${width}`;
    const asset=await action(page,'Record a device',{serial,source:'Purchase order PO-1042',location:'Denver equipment desk'},'/assets','Save',201);
    const card=page.locator('.connection-record').filter({has:page.getByRole('heading',{name:serial,exact:true})});
    const contracts=card.locator('details').filter({has:page.locator('summary').getByText('Contracts, warranties & vendors',{exact:true})}).first();
    await contracts.locator(':scope > summary').click();
    const start=new Date(Date.now()-86400000*30).toISOString().slice(0,10),end=new Date(Date.now()+86400000*10).toISOString().slice(0,10);
    for (const kind of ['purchase','lease','warranty','support']) {
      await action(page,'Attach an asset contract',{
        kind,name:kind==='warranty'?'AppleCare for MacBook':`MacBook ${kind}`,vendorId:vendor.id,
        reference:`https://records.example.test/PO-1042/${kind}.pdf`,coverage:'Hardware and battery repairs; accidental damage service fee applies',
        startsAt:start,expiresAt:kind==='purchase'?'':end,alertDays:30,manufacturer:'apple',
      },`/assets/${asset.id}/contracts`,'Save',201);
      await contracts.getByRole('heading',{name:kind==='warranty'?/AppleCare for MacBook/:new RegExp(`MacBook ${kind}`)}).waitFor();
    }
    const lookup=contracts.getByRole('link',{name:'Manufacturer warranty lookup'}).first();
    assert.equal(await lookup.getAttribute('href'),'https://checkcoverage.apple.com/');
    await contracts.getByRole('heading',{name:/AppleCare for MacBook/}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'ASSET-007 asset records fit viewport');
    process.env.LINEN_CAPTURE && await page.screenshot({path:`${out}/ASSET-007-contracts-${width}.png`});
    const work=await api('/work',{title:`MacBook battery repair ${width}`,body:'Battery is failing. Check AppleCare before repair.',deduplicationKey:crypto.randomUUID()});
    await page.goto(base+'/app#/work/'+work.id);
    await page.getByText('Repair asset & coverage',{exact:true}).click();
    await action(page,'Link a repair device',{assetId:asset.id},`/work/${work.id}/repair-assets`);
    const coverage=page.getByRole('region',{name:`Coverage for ${serial}`});
    // A named section is exposed as a region by its accessible name.
    await coverage.getByRole('heading',{name:/AppleCare for MacBook/}).waitFor();
    await page.reload();
    await page.getByText('Repair asset & coverage',{exact:true}).click();
    await coverage.getByText(/Expiry alert: AppleCare for MacBook/).waitFor();
    await coverage.getByRole('heading',{name:/AppleCare for MacBook/}).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'ASSET-007 repair coverage fits viewport');
    process.env.LINEN_CAPTURE && await page.screenshot({path:`${out}/ASSET-007-repair-${width}.png`});
    const readback=await api(`/work/${work.id}/repair-assets`);
    assert.equal(readback.items[0].items.length,4,'ASSET-007 every asset contract is retained on repair readback');
  }
  console.log('PASS ASSET-007: attach AppleCare and all contract kinds, manufacturer lookup and repair coverage/expiry alerts at 1440');
}
