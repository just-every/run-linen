import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { apiFor, finishFirstRun, signIn } from './connected-helpers.mjs';
const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base||!out)throw Error('Use tests/ui/run.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
const password='synthetic-Connected-browser-2026';
try {
 const owner=await browser.newContext({viewport:{width:1440,height:1000}}),page=await owner.newPage();
 await page.goto(base+'/app');
 await page.getByLabel('Your name').fill('Avery Morgan');await page.getByLabel('Workspace name').fill('Northstar Studio');
 await page.getByLabel('Work email').fill('avery@northstar.example');await page.getByLabel('Password',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();await finishFirstRun(page,base);
 const api=apiFor(page),employee=await api('/members',{name:'Erin Walsh',email:'erin@northstar.example',password,roles:['employee']});
 const hardware=await api('/work-groups',{name:'Hardware'}),bot=await api('/automation-principals',{name:'Desk bot',idempotencyKey:'API-003-browser'});
 const work=await api('/work',{title:'Monitor flickers during design reviews',body:'The display goes dark when sharing a design review.',beneficiaryId:employee.id,deduplicationKey:'API-003-display'});
 const placed=await api('/work/'+work.id+'/group',{groupId:hardware.id,revision:work.revision,assigneeId:null});
 const credential=await api('/mcp-credentials',{principalId:bot.id,name:'Desk bot',groupIds:[hardware.id],scopes:['work.read','work.comment'],tools:['work.list','work.get','work.comment'],expiresAt:new Date(Date.now()+30*86400000).toISOString()});
 const rpc=async(name,args={})=>{const r=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credential.secret},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})});const v=await r.json();assert.ok(!v.error,JSON.stringify(v.error));return v.result.structuredContent;};
 const listed=await rpc('work.list');assert.deepEqual(listed.items.map(w=>w.id),[work.id],'API-003 client sees Hardware employee ticket');
 const read=await rpc('work.get',{workId:work.id});
 await rpc('work.comment',{workId:work.id,revision:read.revision,body:'Desk bot: the display team is checking the USB-C connection.',deduplicationKey:'API-003-internal-note'});
 const ec=await browser.newContext({viewport:{width:1440,height:1000}}),ep=await ec.newPage();await signIn(ep,base,'erin@northstar.example',password);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.goto(base+'/app#/work/'+work.id);
  await page.getByRole('heading',{level:2,name:'Monitor flickers during design reviews',exact:true}).waitFor();
  await page.getByText('Desk bot: the display team is checking the USB-C connection.',{exact:true}).waitFor();
  await page.screenshot({path:out+'/API-003-owner-'+width+'.png',fullPage:true});
  await ep.setViewportSize({width,height:1000});await ep.goto(base+'/app#/work/'+work.id);
  await ep.getByRole('heading',{level:2,name:'Monitor flickers during design reviews',exact:true}).waitFor();
  assert.equal(await ep.getByText('Desk bot: the display team is checking the USB-C connection.',{exact:true}).count(),0,'API-003 internal comment never reaches employee');
  await ep.screenshot({path:out+'/API-003-employee-'+width+'.png',fullPage:true});
 }
 console.log('PASS API-003 native owner/employee internal comment at 1440/390 and real MCP client queue/get/comment');
} finally {await browser.close();}
