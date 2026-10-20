import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { apiFor, action, createConnection, finishFirstRun, signIn } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';

// Full-page captures retain keyboard and overflow assertions. Add real viewport proof as well,
// placing sticky app chrome at the viewport top instead of over a scrolled full-page stitch.
async function captureNotice(page, options) {
  await captureJourney(page, options);
  const previous=page.viewportSize();
  try {
    for(const width of [1440,390]) {
      await page.setViewportSize({width,height:width===1440?1000:844});
      if(options.path.includes('controls')||options.path.includes('planned-change')) {
        await page.getByRole('heading',{name:'Employee service notices',exact:true}).scrollIntoViewIfNeeded();
        await page.evaluate(()=>scrollBy(0,-160));
      } else await page.evaluate(()=>scrollTo(0,0));
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:options.path.replace('.png',`-${width}-viewport.png`)});
    }
  } finally {await page.setViewportSize(previous);}
}

/** CHANNEL-008: native owner, Sales employee and outsider; only the external deployment/probe are fixtures. */
export async function serviceNoticeJourney({browser,page,api,base,out,errors}) {
  const stamp=Date.now(),password='synthetic-Connected-browser-2026';
  const make=async(name,roles)=>{const email=`notice-${name}-${stamp}@example.test`;return {...await api('/members',{name,email,password,roles}),email};};
  const sales=await make('Sales',['employee']),other=await make('Engineering',['employee']),operator=await make('Casey',['operator']);
  const group=await api('/requester-groups',{name:`Sales ${stamp}`,memberIds:[sales.id]});
  const service=await api('/services',{name:'Sales Console',description:'Enter sales orders',businessImpact:'Sales cannot enter orders',source:'Service register',observedAt:new Date().toISOString(),visibility:'workspace'});
  let incident=await api('/incidents',{title:'Sales Console sign-in interruption',serviceId:service.id,impact:'Sales new sessions fail',cohorts:[sales.id],visibility:'workspace'});
  const path=`/incidents/${incident.id}/notices`;
  await page.goto(base+'/app#/incidents/'+incident.id);
  await action(page,'Publish a service notice',{groupId:group.id,message:'New sessions in Sales Console are failing. We are investigating.',cadenceMinutes:30},path,'Publish notice',201);
  let notice=(await api(path)).items[0];
  await action(page,'Update this service notice',{message:'Sales Console sign-in is interrupted. Use an existing session while we investigate.'},`${path}/${notice.id}/update`);
  await action(page,'Record verified recovery and publish all-clear',{message:'Service restored',verification:'An unverified assertion'},`${path}/${notice.id}/all-clear`,'Save',422);
  await page.getByText('Independently verified source recovery is required before recording an all-clear',{exact:true}).waitFor();
  await captureNotice(page,{path:out+'/CHANNEL-008-publisher-controls.png',fullPage:true});
  const salesContext=await browser.newContext({timezoneId:'UTC',viewport:{width:1440,height:1000}}),sp=await salesContext.newPage();
  const otherContext=await browser.newContext({timezoneId:'UTC',viewport:{width:390,height:844}}),op=await otherContext.newPage();
  const executorContext=await browser.newContext(),executor=await executorContext.newPage();
  for(const p of [sp,op,executor])p.on('pageerror',e=>errors.push(String(e)));
  try {
    await signIn(sp,base,sales.email,password);await signIn(op,base,other.email,password);
    const employeeApi=apiFor(sp);
    await sp.getByRole('region',{name:'Service notices',exact:true}).getByText('Sales Console sign-in is interrupted.',{exact:false}).waitFor();
    assert.equal((await apiFor(op)('/service-notices')).items.length,0,'CHANNEL-008 outsider sees no notice');
    assert.equal(await op.getByText('Sales Console sign-in is interrupted.',{exact:false}).count(),0);
    await captureNotice(sp,{path:out+'/CHANNEL-008-sales-banner.png',fullPage:true});
    await captureNotice(op,{path:out+'/CHANNEL-008-outside-cohort.png',fullPage:true});
    await sp.getByLabel('What would make work easier?').fill('I cannot open Sales Console to enter an order.');
    const offered=sp.waitForResponse(r=>r.url().endsWith('/service-notices/suggestions'));
    await sp.getByRole('button',{name:'Send message',exact:true}).click();
    assert.equal((await offered).status(),200);
    await sp.getByRole('region',{name:'A matching service notice'}).getByText('Sales Console sign-in is interrupted.',{exact:false}).waitFor();
    assert.ok(!sp.url().includes('/work/'),'CHANNEL-008 matching notice is offered before filing');
    await captureNotice(sp,{path:out+'/CHANNEL-008-matching-ticket-offer.png',fullPage:true});
    await sp.getByRole('button',{name:'Send message',exact:true}).click();await sp.waitForURL(/#\/work\/.+/);
    const workId=sp.url().split('/').at(-1);assert.equal((await employeeApi('/work/'+workId)).work.state,'open');
    // Real change execution and independent provider observations establish source recovery.
    const probe=await createConnection(page,api,base,'workflow-probe',`Notice verifier ${stamp}`,{baseUrl:'https://probe.example.com/observe',allowedHosts:'probe.example.com',token:'fixture-probe'});
    const deployment=await createConnection(page,api,base,'controlled-deployment',`Notice release ${stamp}`,{baseUrl:'https://deploy.example.com/release',allowedHosts:'deploy.example.com',token:'fixture-release',targets:'orders'});
    const implementation={connectionId:deployment.id,connectionRevision:deployment.revision,verifierConnectionRevision:probe.revision,target:'orders',beneficiaryId:sales.id,verifierConnectionId:probe.id,payload:{release:'notice-recovery'}};
    const cohorts=[sales.id],references=[];
    let change=await api('/changes',{title:'Restore Sales Console',visibility:'workspace',services:[service.id],risk:'Bounded fixture recovery',impact:'Sales new sessions',emergency:true,emergencyReason:'Owner authorizes bounded recovery under separate grants',window:{start:new Date(Date.now()-60000).toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts,canaryCohorts:cohorts,implementation,compensation:{...implementation,payload:{release:'prior'}}});
    for(const phase of ['canary','rollout']) {
      const payload={...implementation.payload,phase,cohorts,implementationRevision:1};
      const grant=await api('/grants',{principalId:operator.id,beneficiaryId:sales.id,action:'deployment.'+phase,actionVersion:1,target:'orders',connectionId:deployment.id,validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:5,conditions:{payloadHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex')}});
      references.push({id:grant.id,version:grant.version,phase});
    }
    change=await api(`/changes/${change.id}/authorize`,{revision:change.revision,reason:'Approve exact fixture release; separate execution grants',grantReferences:references});
    await signIn(executor,base,operator.email,password);const execApi=apiFor(executor);
    for(const phase of ['canary','rollout']) {
      change=await execApi(`/changes/${change.id}/dispatch`,{revision:change.revision,phase,idempotencyKey:`notice-${phase}-${stamp}`});
      change=await execApi(`/changes/${change.id}/verify`,{revision:change.revision,invocationId:change.data.invocations.at(-1).id});
    }
    assert.equal(change.data.state,'verified');
    await api('/services/process-due',{});incident=await api('/incidents/'+incident.id);
    assert.equal(incident.data.status,'restored','CHANNEL-008 real source admission uses independent fixture observations');
    await page.goto(base+'/app#/incidents/'+incident.id);await page.reload();
    await action(page,'Record verified recovery and publish all-clear',{message:'Sales Console new sign-ins independently verified. All-clear.',verification:'Canary and rollout independent workflow observations'},`${path}/${notice.id}/all-clear`);
    const owner=(await api('/session')).user.name;
    await sp.goto(base+'/app#/work');await sp.reload();
    await sp.getByRole('region',{name:'Service notices',exact:true}).getByText('All-clear ·',{exact:false}).waitFor();
    await sp.getByText('Recovery recorded by '+owner,{exact:false}).waitFor();
    assert.equal((await employeeApi('/work/'+workId)).work.state,'open','CHANNEL-008 all-clear never closes an individual ticket');
    await captureNotice(sp,{path:out+'/CHANNEL-008-verified-all-clear.png',fullPage:true});
    await captureNotice(page,{path:out+'/CHANNEL-008-retained-recovery-controls.png',fullPage:true});
    await action(page,'Withdraw this notice',{},`${path}/${notice.id}/withdraw`,'Withdraw notice');
    await sp.reload();await sp.getByRole('heading',{name:'Requests',exact:true}).waitFor();
    assert.equal((await employeeApi('/service-notices')).items.length,0,'CHANNEL-008 named verifier withdrawal removes the banner');
    // A planned change uses the same cohort and independently verified source gate.
    await page.goto(base+'/app#/changes/'+change.id);
    const changePath=`/changes/${change.id}/notices`;
    await action(page,'Publish a service notice',{groupId:group.id,message:'Sales Console maintenance complete; existing sessions were preserved.',cadenceMinutes:30},changePath,'Publish notice',201);
    const changeNotice=(await api(changePath)).items[0];
    await action(page,'Record verified recovery and publish all-clear',{message:'Planned Sales Console change independently verified.',verification:'Verified rollout of notice-recovery'},`${changePath}/${changeNotice.id}/all-clear`);
    await captureNotice(page,{path:out+'/CHANNEL-008-planned-change-notice.png',fullPage:true});
  } finally {await salesContext.close();await otherContext.close();await executorContext.close();}
  console.log('PASS CHANNEL-008 native 1440/390/320: publisher controls, pre-recovery refusal, Sales-only banner, matching ticket offer and filing, independently admitted all-clear, individual ticket stays open, named withdrawal and planned change notice.');
}
if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
  if(!base||!out)throw Error('Run through tests/ui/connected-run.mjs');
  await mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']}),errors=[];
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/app');await page.getByLabel('Your name').fill('Morgan Hayes');await page.getByLabel('Workspace name').fill('Service notices proof');
    await page.getByLabel('Work email').fill('notice-owner@example.test');await page.getByLabel('Password',{exact:true}).fill('synthetic-Connected-browser-2026');
    await page.getByRole('button',{name:'Create workspace'}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
    await finishFirstRun(page,base);
    await serviceNoticeJourney({browser,page,api:apiFor(page),base,out,errors});assert.deepEqual(errors,[]);
  } catch(error) {
    for(const [i,c]of browser.contexts().entries())for(const [j,p]of c.pages().entries())await p.screenshot({path:`${out}/CHANNEL-008-failure-${i}-${j}.png`,fullPage:true}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
}
