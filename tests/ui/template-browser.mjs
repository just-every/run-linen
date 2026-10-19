import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {finishFirstRun} from './connected-helpers.mjs';
import {templateJourney} from './template-journey.mjs';
import {seedSetupFixtures} from './setup-fixtures.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base||!out) throw Error('Run through tests/ui/setup-run.mjs tests/ui/template-browser.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Morgan Hayes');
  await page.getByLabel('Workspace name').fill('Denver Service Desk');
  await page.getByLabel('Work email').fill('morgan@example.test');
  await page.getByLabel('Password',{exact:true}).fill('Browser-proof-2026');
  await page.getByRole('button',{name:'Create workspace'}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  const api=(path,body)=>page.evaluate(async({path,body})=>{
    const session=await(await fetch('/api/v1/session')).json();
    const r=await fetch('/api/v1'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Linen-CSRF':session.csrfToken},body:body?JSON.stringify(body):undefined});
    const d=await r.json();if(!r.ok)throw Error(path+' '+JSON.stringify(d));return d;
  },{path,body});
  const owner=(await api('/session')).principal.userId;
  const employee=await api('/members',{name:'Template Colleague',email:'template-colleague@example.test',password:'Template-colleague-proof-2026',roles:['employee']});
  await seedSetupFixtures(owner,employee.id);
  await templateJourney({page,api,base,out});
  assert.deepEqual(errors,[],'CHANGE-001 has no browser application errors');
  console.log('PASS CHANGE-001 native template editor, exact-version preapproval, standard chooser/CAB bypass, separate grants, inactive amended template, normal and ECAB decisions at 1440/390');
} catch(error) {await page.screenshot({path:out+'/CHANGE-001-failure.png',fullPage:true});throw error;} finally {await context.close();await browser.close();}
