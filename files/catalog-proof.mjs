import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir,writeFile } from 'node:fs/promises';
const repo='/workspace/run-linen';
const require=createRequire(repo+'/package.json');
const {chromium}=require('playwright');
const {catalogFormJourney}=await import(repo+'/tests/ui/application-journey.mjs');
const {finishFirstRun,apiFor}=await import(repo+'/tests/ui/connected-helpers.mjs');
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-mock-keychain','--password-store=basic']});
const context=await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Synthetic Linen owner');
  await page.getByLabel('Workspace name').fill('Synthetic Linen catalog proof');
  await page.getByLabel('Work email').fill(['synthetic-linen-owner','example.test'].join('@'));
  await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-password-910');
  await page.getByRole('button',{name:'Create workspace',exact:true}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  const api=apiFor(page),session=await api('/session');
  const call=async(path,body)=>page.evaluate(async({path,body})=>{
    const session=await (await fetch('/api/v1/session')).json();
    const response=await fetch('/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Linen-CSRF':session.csrfToken},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,value:await response.json()};
  },{path,body});
  const known={fields:[],costCents:25000,deliveryHours:48};
  const item=await api('/catalog',{name:'Synthetic numeric estimate probe',kind:'device',target:'synthetic-linen-911',ownerId:session.user.id,form:known});
  const before=(await api('/catalog')).items;
  const saved=before.find(c=>c.id===item.id),probes=[];
  for(const patch of [{costCents:-1},{costCents:0.5},{deliveryHours:-1},{deliveryHours:0},{deliveryHours:1.5}]) {
    const creation=await call('/catalog',{name:'Synthetic refused estimate',kind:'device',target:'synthetic-linen-912',ownerId:session.user.id,form:{...known,...patch}});
    assert.equal(creation.status,422);
    assert.deepEqual((await api('/catalog')).items,before);
    const edit=await call(`/catalog/${item.id}/form`,{name:'Synthetic refused edit',revision:saved.revision,form:{...known,...patch}});
    assert.equal(edit.status,422);
    assert.deepEqual((await api('/catalog')).items,before);
    probes.push({patch,create:creation.status,edit:edit.status,configurationUnchanged:true,revision:saved.revision});
  }
  for(const form of [{fields:[],costCents:0,deliveryHours:1},{fields:[]},{fields:[],costCents:null,deliveryHours:null},{fields:[],costCents:0},{fields:[],deliveryHours:48}]) {
    const created=await api('/catalog',{name:'Synthetic allowed estimate',kind:'device',target:'synthetic-linen-913',ownerId:session.user.id,form});
    const read=(await api('/catalog')).items.find(c=>c.id===created.id);
    assert.equal(read.form.costCents,form.costCents??null);
    assert.equal(read.form.deliveryHours,form.deliveryHours??null);
    probes.push({form,costCents:read.form.costCents,deliveryHours:read.form.deliveryHours});
  }
  await catalogFormJourney({page,api,base,out});
  assert.deepEqual(errors,[]);
  await writeFile(out+'/catalog-runtime-receipt.json',JSON.stringify({schema:1,door:'Authenticated native session with CSRF at the catalog create, form edit and catalog read routes',probes,journey:'catalogFormJourney',widths:[1440,390],pageErrors:errors,conclusion:'passed'},null,2)+'\n');
  console.log('PASS authenticated catalog estimates: invalid create and edit leave configuration and revision unchanged; zero and unknown read back; native unknown submission persists');
} catch(error) {
  await page.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});
  throw error;
} finally {
  await context.close();
  await browser.close();
}
