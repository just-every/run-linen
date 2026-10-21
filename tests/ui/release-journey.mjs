import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { action, apiFor, createConnection, fields, finishFirstRun, signIn, requestWork } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';

async function captureRelease(page,options) {
  await captureJourney(page,options);
  const previous=page.viewportSize();
  try {for(const width of [1440,390]) {
    await page.setViewportSize({width,height:width===1440?1000:844});
    await page.evaluate(()=>scrollTo(0,0));
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    await page.screenshot({path:options.path.replace('.png',`-${width}-viewport.png`)});
  }}finally{await page.setViewportSize(previous);}
}

const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
if(!base||!out)throw Error('Run through tests/ui/connected-run.mjs');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']}),errors=[];
try {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/app');await page.getByLabel('Your name').fill('Morgan Hayes');await page.getByLabel('Workspace name').fill('Release proof');
  await page.getByLabel('Work email').fill('release-owner@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-Connected-browser-2026');
  await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  const api=apiFor(page),owner=(await api('/session')).principal.userId;
  const member=async(name,roles)=>({...await api('/members',{name,email:`release-${name.toLowerCase()}@example.test`,password:'synthetic-Connected-browser-2026',roles}),email:`release-${name.toLowerCase()}@example.test`});
  const sales=await member('Sales',['employee']),other=await member('Engineering',['employee']),approver=await member('Reviewer',['approver']),executor=await member('Executor',['operator']);
  const ec=await browser.newContext(),ep=await ec.newPage();ep.on('pageerror',e=>errors.push(String(e)));
  await signIn(ep,base,executor.email);const execute=apiFor(ep);
  const group=await api('/requester-groups',{name:'MFA pilot',memberIds:[sales.id]});
  const cis=[];for(const name of ['Sign-in','VPN','MFA policy'])cis.push(await api('/services',{name,description:'MFA release surface',businessImpact:'Sign-in interrupted',source:'Reviewed register',observedAt:new Date().toISOString(),visibility:'workspace'}));
  const incident=await api('/incidents',{title:'Legacy MFA prompts',serviceId:cis[0].id,impact:'Repeated prompts',cohorts:[sales.id]});
  const problem=await api('/problems',{title:'Legacy MFA factor',serviceId:cis[0].id,incidentIds:[incident.id],symptoms:'Repeated prompts'});
  const probe=await createConnection(page,api,base,'workflow-probe','Release verifier',{baseUrl:'https://probe.example.com/observe',allowedHosts:'probe.example.com',token:'fixture-probe'});
  const deployment=await createConnection(page,api,base,'controlled-deployment','Release deployment',{baseUrl:'https://deploy.example.com/release',allowedHosts:'deploy.example.com',token:'fixture-release',targets:'orders'});
  const implementation={connectionId:deployment.id,connectionRevision:deployment.revision,verifierConnectionRevision:probe.revision,target:'orders',beneficiaryId:sales.id,verifierConnectionId:probe.id,payload:{release:'mfa-number-matching'}},cohorts=[sales.id];
  const window={start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},refs=[];
  for(const phase of ['canary','rollout','compensate']) {
    const payload={...(phase==='compensate'?{release:'prior'}:implementation.payload),phase,cohorts,implementationRevision:1};
    const g=await api('/grants',{principalId:executor.id,beneficiaryId:sales.id,action:'deployment.'+phase,actionVersion:1,target:'orders',connectionId:deployment.id,validFrom:window.start,validUntil:window.end,maxUses:10,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}});
    refs.push({id:g.id,version:g.version,phase});
  }
  const changes=[];
  for(const [n,ci] of cis.entries()) {
    let c=await api('/changes',{title:`MFA release step ${n+1}`,risk:'Bounded change',impact:'Pilot sign-ins',services:[ci.id],window,cohorts,canaryCohorts:cohorts,implementation,compensation:{...implementation,payload:{release:'prior'}},visibility:'workspace'});
    c=await api(`/changes/${c.id}/authorize`,{revision:c.revision,reason:'Exact candidate with separate execution grants',grantReferences:refs});changes.push(c);
  }
  await page.goto(base+'/app#/releases');await page.getByText('Plan a release',{exact:true}).click();
  const form=page.locator('details[data-action-path="/releases"]');
  const values={title:'Okta MFA rollout',plan:'Build the candidate; test the pilot; canary and roll out each member.',changeIds:changes.map(c=>c.id),approverIds:[owner,approver.id],affectedGroupIds:[group.id],problemIds:[problem.id],visibility:'workspace'};
  await fields(form,values);await captureRelease(page,{path:out+'/CHANGE-007-create.png',fullPage:true});
  let release=await action(page,'Plan a release',values,'/releases','Create release',201);
  await page.waitForURL(new RegExp('#/releases/'+release.id+'$'));
  const linked=page.getByRole('region',{name:'Linked problems and configuration items'});
  await linked.getByRole('link',{name:'Legacy MFA factor',exact:true}).waitFor();
  for(const ci of cis)await linked.getByRole('link',{name:ci.data.name,exact:true}).waitFor();
  await action(page,'Record your go/no-go decision',{decision:'go',reason:'Ready'},'/decisions','Save',409);
  await page.getByText('A go decision needs recorded passed build and test phases',{exact:true}).waitFor();
  for(const phase of ['build','test']){await action(page,'Record a build or test result',{phase,outcome:'passed',reference:`Reviewed ${phase} report`},'/phases');await page.getByText(`passed · Reviewed ${phase} report`,{exact:false}).first().waitFor();}
  const ac=await browser.newContext(),ap=await ac.newPage();ap.on('pageerror',e=>errors.push(String(e)));
  await signIn(ap,base,approver.email);await ap.goto(base+'/app#/releases/'+release.id);
  await action(ap,'Record your go/no-go decision',{decision:'no-go',reason:'Brief the service desk first'},'/decisions');
  await page.reload();await action(page,'Record your go/no-go decision',{decision:'go',reason:'Owner ready'},'/decisions');
  await page.getByText('No-go: deployment held',{exact:true}).waitFor();
  await captureRelease(page,{path:out+'/CHANGE-007-no-go.png',fullPage:true});
  await ap.reload();await action(ap,'Record your go/no-go decision',{decision:'go',reason:'Service desk briefed'},'/decisions');
  await page.reload();await page.getByText('Go from every named approver',{exact:true}).waitFor();
  await page.goto(base+'/app#/changes');
  const calendar=page.getByRole('region',{name:'Change calendar',exact:true});await calendar.getByRole('link',{name:'Okta MFA rollout',exact:true}).waitFor();
  const downloadEvent=page.waitForEvent('download');await calendar.getByRole('link',{name:'Download calendar (ICS)',exact:true}).click();
  const download=await downloadEvent;const {readFile}=await import('node:fs/promises');assert.match(await readFile(await download.path(),'utf8'),/Okta MFA rollout/,'Release appears in actual scoped ICS');
  await captureRelease(page,{path:out+'/CHANGE-007-calendar.png',fullPage:true});
  const workId=await requestWork(page,base,'Track the MFA rollout for my pilot team');
  await page.getByText('Related tickets and records',{exact:true}).click();
  await action(page,'Link a record',{kind:'release',targetId:release.id},'/links','Link',200);
  // Linking refreshes the parent ticket and remounts its disclosures. Read the
  // committed relationship after a reload before opening it, rather than racing
  // that refresh with a summary click.
  await page.reload();
  const related=page.locator('details').filter({has:page.locator('summary').getByText('Related tickets and records',{exact:true})});
  await related.getByRole('link',{name:'Okta MFA rollout',exact:true,includeHidden:true}).waitFor({state:'attached'});
  await related.locator(':scope > summary').click();
  await related.getByRole('link',{name:'Okta MFA rollout',exact:true}).waitFor();
  await captureRelease(page,{path:out+'/CHANGE-007-ticket-link.png',fullPage:true});
  await page.goto(base+'/app#/releases/'+release.id);
  await page.getByRole('region',{name:'Linked tickets'}).getByRole('link').waitFor();
  const notes=`/releases/${release.id}/notices`;
  await action(page,'Publish a service notice',{groupId:group.id,message:'Release notes: MFA pilot uses number matching.',cadenceMinutes:1440},notes,'Publish notice',201);
  const sc=await browser.newContext(),sp=await sc.newPage(),oc=await browser.newContext(),op=await oc.newPage();
  for(const p of [sp,op])p.on('pageerror',e=>errors.push(String(e)));
  await signIn(sp,base,sales.email);await signIn(op,base,other.email);
  await sp.getByRole('region',{name:'Service notices'}).getByText('Release notes: MFA pilot uses number matching.',{exact:true}).waitFor();
  assert.equal((await apiFor(op)('/service-notices')).items.length,0,'The outsider receives no release notes');
  await captureRelease(sp,{path:out+'/CHANGE-007-cohort-notes.png',fullPage:true});
  for(const [n,initial] of changes.entries()) {
    await fetch(base+'/__fixture/state',{method:'POST',body:JSON.stringify({failDeployment:n===2})});
    let c=await execute(`/changes/${initial.id}/dispatch`,{revision:initial.revision,phase:'canary',idempotencyKey:`browser-${n}-canary`});
    c=await execute(`/changes/${c.id}/verify`,{revision:c.revision,invocationId:c.data.invocations.at(-1).id});
    if(n<2) {
      assert.equal(c.data.state,'canary-verified');
      c=await execute(`/changes/${c.id}/dispatch`,{revision:c.revision,phase:'rollout',idempotencyKey:`browser-${n}-rollout`});
      c=await execute(`/changes/${c.id}/verify`,{revision:c.revision,invocationId:c.data.invocations.at(-1).id});assert.equal(c.data.state,'verified');
    } else assert.equal(c.data.state,'failed');
    changes[n]=c;
  }
  await page.reload();await page.getByText('Held by a change that failed or is unresolved',{exact:true}).waitFor();
  await action(page,'Complete this release',{},'/complete','Complete release',409);
  await captureRelease(page,{path:out+'/CHANGE-007-failed-member.png',fullPage:true});
  await fetch(base+'/__fixture/state',{method:'POST',body:JSON.stringify({failDeployment:false})});
  let failed=await execute(`/changes/${changes[2].id}/dispatch`,{revision:changes[2].revision,phase:'compensate',idempotencyKey:'browser-backout'});
  failed=await execute(`/changes/${failed.id}/verify`,{revision:failed.revision,invocationId:failed.data.invocations.at(-1).id});assert.equal(failed.data.state,'compensated');
  await page.reload();release=await action(page,'Complete this release',{},'/complete','Complete release');assert.equal(release.data.state,'completed');assert.equal(release.data.goNoGo,'go','Completion retains the recorded approval instead of asking for another');
  await page.getByText('Every change successful or backed out',{exact:true}).waitFor();
  await captureRelease(page,{path:out+'/CHANGE-007-completed.png',fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS CHANGE-007 native 1440/390/320 creation, phase refusal, named no-go/go, calendar/ICS, ticket link, cohort-only notes, actual canary/rollout, failed member and verified backout/completion.');
} catch(error) {
  for(const [i,c]of browser.contexts().entries())for(const [j,p]of c.pages().entries())await p.screenshot({path:`${out}/CHANGE-007-failure-${i}-${j}.png`,fullPage:true}).catch(()=>{});
  throw error;
} finally {await browser.close();}
