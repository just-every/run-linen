import assert from 'node:assert/strict';
import { action, apiFor } from './connected-helpers.mjs';

export async function assetLifecycleJourney(page, personId, out) {
  const api=apiFor(page),base=new URL(page.url()).origin;
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(base+'/app#/assets');
    const serial=`NS-MACBOOK-DENVER-${width}`;
    const asset=await action(page,'Record a device',{
      serial,source:'Northstar purchase order PO-1042',location:'Denver stockroom',procured:true,
    },'/assets','Save',201);
    const card=page.locator('.connection-record').filter({has:page.getByRole('heading',{name:serial,exact:true})});
    await card.locator('.badge').getByText('procured',{exact:true}).waitFor();
    await page.screenshot({path:`${out}/ASSET-004-procured-${width}.png`,fullPage:true});
    async function command(kind,expected=200,certificate={}) {
      await action(page,'Record a custody change',{
        command:kind,personId:['assign','receive','return','loan'].includes(kind) && kind!=='receive' ? personId : '',
        evidence:`IT equipment desk: ${kind} receipt for Morgan Chen`,...certificate,
      },`/assets/${asset.id}/commands`,'Save',expected);
      if (expected === 200) { await page.reload(); await card.getByRole('heading',{name:serial,exact:true}).waitFor(); }
    }
    await command('receive');
    await command('assign');
    await command('receive');
    const certificate={certificatePartner:'Front Range ITAD',certificateStandard:'R2v3',certificateReference:'https://records.example.test/itad/PO-1042.pdf'};
    await command('dispose',422,certificate);
    await card.locator('.badge').getByText('received',{exact:true}).waitFor();
    await page.screenshot({path:`${out}/ASSET-004-assigned-refusal-${width}.png`,fullPage:true});
    await command('repair');
    await command('return');
    await command('loan');
    await card.locator('.badge').getByText('loaned',{exact:true}).waitFor();
    await page.screenshot({path:`${out}/ASSET-004-loaned-${width}.png`,fullPage:true});
    await command('return');
    await command('retire');
    await command('dispose',422,{certificatePartner:'',certificateStandard:'',certificateReference:''});
    await command('dispose',200,certificate);
    await card.locator('.badge').getByText('disposed',{exact:true}).waitFor();
    const history=card.locator('details').filter({has:page.getByText('Serial-level custody history',{exact:true})});
    await history.locator('summary').click();
    const link=history.getByRole('link',{name:'ITAD disposal certificate'});
    await link.waitFor();
    assert.equal(await link.getAttribute('href'),certificate.certificateReference,'ASSET-004 preserves the actual certificate reference');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'ASSET-004 fits the viewport');
    await page.screenshot({path:`${out}/ASSET-004-disposed-${width}.png`,fullPage:true});
    await link.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/ASSET-004-certificate-${width}.png`});
    const result=await api(`/assets/${asset.id}/history`);
    assert.ok(result.items.every(e=>e.actor_id&&e.created_at&&e.evidence));
    assert.deepEqual(result.items.map(e=>e.kind),['procure','receive','assign','receive','repair','return','loan','return','retire','dispose']);
    console.log(`PASS ASSET-004: physical lifecycle, loan, assigned/certificate refusals and attributed disposal at ${width}`);
  }
}
