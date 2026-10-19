import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';
export async function searchJourney({page,api,base,out}) {
  const person=await api('/people',{source:'Denver receiving register',sourceId:'jordan-rivera',name:'Jordan Rivera',effectiveAt:'2026-01-01T00:00:00Z',observedAt:new Date().toISOString()});
  const asset=await api('/assets',{serial:'DEN-C02XL93',assetTag:'DEN-IT-042',source:'Denver receiving register',location:'Denver'});
  await api(`/assets/${asset.id}/commands`,{revision:1,command:'assign',personId:person.id,evidence:'Jordan signed the pickup receipt'});
  const request=await api('/work',{title:'Denver laptop network drops',body:'The adapter drops during video calls.',context:{assetId:asset.id},deduplicationKey:crypto.randomUUID()});
  const session=await api('/session');
  const privateWork=await api('/work',{title:'Private HR search journey',body:'Private HR information',sensitivity:'hr',deduplicationKey:crypto.randomUUID()});
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:width===1440?1000:844});
    await page.goto(base+'/app#/work');
    await page.locator('.top-search').getByRole('searchbox').fill('DEN-C02XL93');
    await page.locator('.top-search').getByRole('searchbox').press('Enter');
    await page.getByRole('heading',{name:'Workspace search',exact:true}).waitFor();
    await page.getByRole('article',{name:'DEN-C02XL93 search result',exact:true}).waitFor();
    assert.ok(await page.getByRole('article',{name:'Jordan Rivera search result',exact:true}).count(),'DESK-016 assigned person found by serial');
    assert.ok(await page.getByRole('link',{name:request.title,exact:true}).count(),'DESK-016 linked ticket found by serial');
    await captureJourney(page,{path:`${out}/DESK-016-serial-${width}.png`,fullPage:true});
    await page.getByRole('link',{name:'DEN-C02XL93',exact:true}).click();
    await page.getByText('DEN-IT-042',{exact:true}).first().waitFor();
    await page.getByText('Record a device',{exact:true}).click();
    await page.getByLabel('Asset tag',{exact:true}).waitFor();
    await captureJourney(page,{path:`${out}/DESK-016-device-${width}.png`,fullPage:true});
    await page.goto(base+'/app#/search?q=DEN-C02XL93');
    await page.getByRole('link',{name:request.title,exact:true}).click();
    await page.getByText('Keep the conversation going',{exact:true}).waitFor();
    assert.ok(page.url().endsWith('/work/'+request.id),'DESK-016 result opens native conversation');
    await page.goto(base+'/app#/search?q='+encodeURIComponent(session.user.name)+'&type=ticket');
    await page.getByRole('link',{name:request.title,exact:true}).waitFor();
    await page.goto(base+'/app#/search?q=netwrok&type=ticket');
    await page.getByRole('link',{name:request.title,exact:true}).waitFor();
    assert.equal(await page.getByRole('article',{name:'DEN-C02XL93 search result',exact:true}).count(),0,'DESK-016 ticket filter excludes assets');
    await captureJourney(page,{path:`${out}/DESK-016-typo-${width}.png`,fullPage:true});
    await page.goto(base+'/app#/search?q=UnmatchedRecordXYZ');
    await page.getByText('No visible records matched.',{exact:true}).waitFor();
    await captureJourney(page,{path:`${out}/DESK-016-empty-${width}.png`,fullPage:true});
  }
  return {assetId:asset.id,workId:request.id,privateId:privateWork.id};
}
