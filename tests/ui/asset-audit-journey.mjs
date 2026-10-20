import assert from 'node:assert/strict';
import { action, fields } from './connected-helpers.mjs';
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

// An action form inside one stock line or request, which repeats per line.
async function scoped(page,scope,title,values,suffix,button) {
  const form=scope.locator(`details[data-action-path$="${suffix}"]`).filter({has:page.locator('summary').getByText(title,{exact:true})}).first();
  if (!await form.evaluate(e=>e.open)) await form.locator(':scope > summary').click();
  await fields(form,values);
  const wait=page.waitForResponse(r=>r.url().endsWith(suffix)&&r.request().method()==='POST');
  await form.getByRole('button',{name:button,exact:true}).click();
  const response=await wait,data=await response.json();
  assert.equal(response.status(),200,JSON.stringify({suffix,data}));
  return data;
}

// ASSET-005: allocate the last two spare monitors in a Denver stock room; the threshold raises a purchase request with quantity and USD estimate.
export async function stockJourney({page,api,base,out}) {
  const person=(await api('/people')).items.find(p=>p.active);
  for (const [width,location] of [[390,'Denver stock room 390'],[1440,'Denver stock room 1440']]) {
    await page.setViewportSize({width,height:1000});
    await page.goto(base+'/app#/assets');
    await action(page,'Add a stock line',{location,item:'27-inch monitor',kind:'accessory',onHand:2,threshold:0,reorderQuantity:10,unitEstimateUsd:'249.99',buyer:'CDW'},'/stock-lines','Add stock line',201);
    const line=page.getByRole('article',{name:`27-inch monitor at ${location}`,exact:true});
    await line.getByText('Counted on hand').waitFor();
    for (const left of [1,0]) {
      const saved=await scoped(page,line,'Allocate from stock',{personId:person.id,quantity:1,evidence:'Desk handoff signed by the employee'},'/allocate','Allocate');
      assert.equal(saved.line.on_hand,left,`ASSET-005 ${left} spare monitors left`);
      assert.equal(Boolean(saved.purchaseRaised),left===0,'ASSET-005 only the allocation that reaches the threshold raises a request');
      // Each allocation refreshes and remounts the line; wait for the new count before the next form.
      await line.locator('.facts > div').filter({hasText:'Counted on hand'}).locator('dd').getByText(String(left),{exact:true}).waitFor();
    }
    const request=line.getByRole('article',{name:`Purchase request for 27-inch monitor at ${location}`});
    await request.getByText('Raised in Linen, not sent').waitFor();
    await request.getByText('$2,499.90 (10 × $249.99)').waitFor();
    await request.getByText('Not sent to CDW.',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`ASSET-005 stock fits ${width}`);
    await line.screenshot({path:`${out}/ASSET-005-raised-${width}.png`});
    await scoped(page,request,'Record the order',{orderReference:`CDW-PO-${width}`},'/order','Record order');
    await request.getByText('Ordered by hand with the buyer').waitFor();
    await scoped(page,request,'Receive into stock',{evidence:'CDW packing slip, 10 monitors'},'/receive','Receive');
    await line.getByText('Received into stock').waitFor();
    const stocked=(await api('/stock-lines')).items.find(l=>l.location===location);
    assert.deepEqual([stocked.on_hand,stocked.purchases[0].state,stocked.purchases[0].order_reference],[10,'received',`CDW-PO-${width}`],'ASSET-005 receipt adds the order to the count');
    await line.screenshot({path:`${out}/ASSET-005-received-${width}.png`});
  }
  console.log('PASS ASSET-005 browser: last two spare monitors in Denver at 390 and 1440 raise a CDW request for 10 at $2,499.90 labelled not sent; order reference recorded and received into stock');
}
