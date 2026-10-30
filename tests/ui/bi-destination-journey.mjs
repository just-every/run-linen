import { captureScreens } from './screen-proof.mjs';
import assert from 'node:assert/strict';
import {fields} from './connected-helpers.mjs';
/** Configure each real destination through its native form; never dispatch fixture credentials. */
export async function biDestinationJourney({page,bi,api,out,width}) {
 const disclosure=bi.locator('details').filter({has:page.getByText('Configure another BI destination',{exact:true})});
 if(!await disclosure.evaluate(e=>e.open))await disclosure.locator(':scope > summary').click();
 const form=bi.getByRole('form',{name:'Warehouse and storage setup',exact:true});
 const configurations=[
  ['gcs',{bucket:'northstar-ticket-reports',prefix:['linen','tickets'].join('/')}],
  ['azure',{account:'northstarreports',container:'tickets',prefix:['linen','tickets'].join('/')}],
  ['snowflake',{account:'northstar-service',database:'SERVICE_DESK',schema:'PUBLIC',table:'TICKETS',warehouse:'REPORTING'}],
  ['bigquery',{project:'northstar-service',dataset:'service_desk',table:'tickets',location:'US'}],
 ];
 for(const [provider,values]of configurations){
  await form.getByRole('combobox',{name:/^Provider/}).selectOption(provider);
  if(['gcs','bigquery'].includes(provider))await form.getByRole('combobox',{name:/^Google authentication/}).selectOption('oauth');
  await fields(form,{name:`Northstar ${provider} · ${width}`,...values,accessToken:'synthetic-linen-9130'});
  assert.equal(await form.getByLabel('Provider access token').getAttribute('type'),'password');
  await form.getByLabel('I authorize nightly exports to this destination under my current permissions.').check();
  await captureScreens(page,{path:`${out}/bi-setup-${provider}-${width}.png`});
  const response=page.waitForResponse(r=>r.url().endsWith('/bi/exports')&&r.request().method()==='POST');
  await form.getByRole('button',{name:'Save BI destination',exact:true}).click();
  const r=await response;assert.equal(r.status(),201);const destination=await r.json();
  assert.equal(destination.destination.provider,provider);assert.ok(!JSON.stringify(destination).includes('synthetic-linen-9130'));
  assert.deepEqual((await api(`/bi/exports/${destination.id}`)).runs,[]);
  await api(`/bi/exports/${destination.id}`,{revision:destination.revision,active:false});
  await form.getByText('Destination saved. No delivery is claimed until a provider receipt is recorded.',{exact:true}).waitFor();
 }
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
