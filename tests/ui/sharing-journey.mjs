import assert from 'node:assert/strict';
import { requestWork, apiFor, createConnection, signIn } from './connected-helpers.mjs';
// CHANNEL-009: Ana shares a request with Ben, who reads and replies without seeing the private note; Mia sees it in
// "My team's requests" until the HRIS moves Ana to Noah. Each person signs in in their own browser context.
export async function sharingJourney({browser,api,base,out,errors}) {
  const stamp=Date.now(),password='Browser-proof-2026';
  const member=async name=>{const email=`${name.split(' ')[0].toLowerCase()}-${stamp}@example.test`;return {...await api('/members',{name,email,password,roles:['employee']}),name,email};};
  const ana=await member('Ana Reyes'),ben=await member('Ben Okafor'),mia=await member('Mia Chen'),noah=await member('Noah Park');
  const hris=async(m,managerId,effectiveAt)=>api('/people',{source:'browser-hris',sourceId:m.email,name:m.name,...(managerId?{managerId}:{}),effectiveAt,observedAt:new Date().toISOString()});
  for (const [m,manager] of [[ana,mia.id],[mia,null],[noah,null]]) {
    const person=await hris(m,manager,'2026-01-01T00:00:00Z');
    await api(`/people/${person.id}/binding`,{expectedRevision:person.revision,memberId:m.id});
  }
  const signIn=async(m,width)=>{
    const context=await browser.newContext({timezoneId:'UTC',viewport:{width,height:900}}),page=await context.newPage();
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/app');await page.getByLabel('Work email').fill(m.email);await page.getByLabel('Password',{exact:true}).fill(password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
    return {context,page};
  };
  const fits=async(page,label)=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`CHANNEL-009 ${label} fits`);
  const a=await signIn(ana,390),b=await signIn(ben,1440),m=await signIn(mia,390),n=await signIn(noah,1440);
  try {
    await a.page.goto(base+'/app#/work');
    await a.page.getByText('Your direct and indirect managers can read the public messages of your requests.',{exact:false}).first().waitFor();
    const workId=await requestWork(a.page,base,'My laptop fan runs loudly all day.');
    await api(`/work/${workId}/messages`,{body:'Internal: warranty case 5521',visibility:'private',sourceMessageId:crypto.randomUUID()});
    await a.page.reload();
    const shares=a.page.getByRole('region',{name:'Shared with'});
    await shares.getByText('Not shared with anyone.').waitFor();
    await shares.getByText('Your direct and indirect managers can read the public messages of your requests.',{exact:false}).waitFor();
    await shares.locator('summary').getByText('Share this request',{exact:true}).click();
    await shares.getByLabel("Colleague's work email").fill(ben.email.toUpperCase());
    await shares.getByRole('button',{name:'Share',exact:true}).click();
    await shares.getByText(`${ben.name} since`,{exact:false}).waitFor();
    await fits(a.page,'requester share at 390');
    await shares.screenshot({path:`${out}/CHANNEL-009-shared-390.png`});
    // Ben reads the public thread, never the private note, and replies.
    await b.page.goto(base+'/app#/work');
    await b.page.getByText('My laptop fan runs loudly all day.',{exact:false}).first().waitFor();
    await b.page.goto(base+'/app#/work/'+workId);
    await b.page.getByText('Shared with you. You can read and reply to its public messages.').waitFor();
    assert.equal(await b.page.getByText('warranty case 5521',{exact:false}).count(),0,'CHANNEL-009 the colleague never sees the private note');
    assert.equal(await b.page.getByRole('button',{name:'Cancel this request'}).count(),0,'CHANNEL-009 a shared colleague cannot act for the requester');
    await b.page.locator('#conversation-message').fill('Mine did this too; a BIOS update fixed it.');
    const replied=b.page.waitForResponse(r=>r.url().endsWith(`/work/${workId}/messages`)&&r.request().method()==='POST');
    await b.page.getByRole('button',{name:'Send message'}).click();
    assert.equal((await replied).status(),201,'CHANNEL-009 the colleague replies');
    await b.page.getByText('Mine did this too; a BIOS update fixed it.').first().waitFor();
    await fits(b.page,'shared colleague at 1440');
    await b.page.screenshot({path:`${out}/CHANNEL-009-colleague-1440.png`});
    // Mia sees her report's request in "My team's requests", read-only, without the private note.
    await m.page.goto(base+'/app#/work');await m.page.reload();
    const team=m.page.getByRole('region',{name:"My team's requests"});
    await team.getByRole('link').first().click();
    await m.page.getByText('It is read-only',{exact:false}).waitFor();
    await m.page.locator('.meta-strip').getByText(ana.name,{exact:true}).waitFor();
    assert.equal(await m.page.locator('#conversation-message').count(),0,'CHANNEL-009 the manager view has no composer');
    assert.equal(await m.page.getByText('warranty case 5521',{exact:false}).count(),0,'CHANNEL-009 a manager never sees private notes');
    await m.page.getByText('Mine did this too; a BIOS update fixed it.').first().waitFor();
    await fits(m.page,'manager view at 390');
    await m.page.screenshot({path:`${out}/CHANNEL-009-manager-390.png`});
    // Ana stops sharing; Ben loses the request.
    await a.page.getByRole('button',{name:`Stop sharing with ${ben.name}`}).click();
    await shares.getByText('Not shared with anyone.').waitFor();
    assert.equal(await b.page.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,workId),404,'CHANNEL-009 a revoked share loses access');
    // The HRIS moves Ana to Noah: Mia loses visibility, Noah gains it.
    await hris(ana,noah.id,'2026-06-01T00:00:00Z');
    await m.page.goto(base+'/app#/work');await m.page.reload();
    await m.page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
    assert.equal(await m.page.evaluate(async id=>(await fetch('/api/v1/work/'+id)).status,workId),404,'CHANNEL-009 the old manager loses visibility');
    assert.equal(await m.page.getByRole('region',{name:"My team's requests"}).count(),0);
    await n.page.goto(base+'/app#/work');await n.page.reload();
    await n.page.getByRole('region',{name:"My team's requests"}).getByRole('link').first().waitFor();
    await fits(n.page,'new manager at 1440');
    await n.page.screenshot({path:`${out}/CHANNEL-009-new-manager-1440.png`});
  } finally { for (const s of [a,b,m,n]) await s.context.close(); }
  console.log('PASS CHANNEL-009 browser: share by email at 390, colleague reads and replies at 1440 without the private note, manager read-only team view at 390, revoke, HRIS manager change moves visibility');
}


/** DESK-007 native UI against the emitted app; only the external SendGrid protocol is a fixture. */
export async function collaborationJourney({browser,page,api,base,out,errors}) {
  const password='synthetic-linen-46-password';
  const staff=await api('/members',{name:'Maya Chen',email:'synthetic-linen-47@example.test',password,roles:['operator']});
  const employee=await api('/members',{name:'Jordan Lee',email:'synthetic-linen-48@example.test',password,roles:['employee']});
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const webhookPublicKey=Buffer.from(await crypto.subtle.exportKey('spki',pair.publicKey)).toString('base64');
  const mail=await createConnection(page,api,base,'sendgrid','Helpdesk email',{from:'synthetic-linen-43@example.test',webhookPublicKey,apiKey:'synthetic-linen-50'});
  const sc=await browser.newContext({viewport:{width:1440,height:1000}}),ec=await browser.newContext({viewport:{width:1440,height:1000}});
  const sp=await sc.newPage(),ep=await ec.newPage();
  for(const p of [sp,ep])p.on('pageerror',error=>errors.push(String(error)));
  try {
    await signIn(sp,base,'synthetic-linen-47@example.test',password);await signIn(ep,base,'synthetic-linen-48@example.test',password);
    for(const width of [1440,390]) {
      const n=width===1440?60:90,label=i=>({0:width===1440?'VPN drops during client calls':'VPN drops when switching networks',1:'The VPN disconnects every few minutes during customer calls.',3:'Coordinate the network diagnosis with the existing ticket readers.',4:'Packet loss starts at the office firewall; internal address details stay private.',5:'We are checking the VPN path with our network team.',7:'Please check packet loss for the VPN gateway during the morning call window.',9:'VPN packet-loss investigation',10:'We found a failing upstream link and are scheduling its replacement.'}[i]??`synthetic-linen-${n+i}`);
      for(const p of [page,sp,ep])await p.setViewportSize({width,height:1000});
      const work=await api('/work',{title:label(0),body:label(1),beneficiaryId:employee.id,deduplicationKey:label(2)}),path='/work/'+work.id;
      await page.goto(base+'/app#'+path);
      const panel=page.locator('details').filter({has:page.locator(':scope > summary').getByText('Private collaboration',{exact:true})});
      const open=async()=>{await panel.locator(':scope > summary').waitFor();if(!await panel.evaluate(e=>e.open))await panel.locator(':scope > summary').click();await panel.getByLabel('Colleague',{exact:true}).waitFor();};
      const approve=async form=>{await form.getByLabel('Reason for this collaboration',{exact:true}).fill(label(3));await form.getByRole('checkbox').check();};
      await open();
      let form=panel.locator('form').first();
      await form.getByLabel('Colleague',{exact:true}).selectOption(staff.id);await form.getByLabel('Private note',{exact:true}).fill(label(4));await approve(form);
      await form.getByRole('button',{name:'Save private note and notify',exact:true}).focus();
      const mentioned=page.waitForResponse(r=>r.url().endsWith(path+'/mentions')&&r.request().method()==='POST');
      await page.keyboard.press('Enter');assert.equal((await mentioned).status(),201);
      await page.locator('.message-body').getByText(label(4),{exact:true}).waitFor();
      await sp.goto(base+'/app#'+path);await sp.reload();
      const inbox=sp.getByRole('region',{name:'Collaboration notifications'});
      await inbox.locator(`a[href^="#/work/${work.id}?message="]`).filter({hasText:'You were mentioned in a private note'}).waitFor();
      await sp.locator('.message-body').getByText(label(4),{exact:true}).waitFor();
      await sp.screenshot({path:`${out}/DESK-007-mentioned-${width}.png`,fullPage:true});
      await open();form=panel.locator('form').first();
      await form.getByLabel('Action',{exact:true}).selectOption('watch');await form.getByLabel('Colleague',{exact:true}).selectOption(employee.id);await approve(form);
      const watched=page.waitForResponse(r=>r.url().endsWith(path+'/watchers')&&r.request().method()==='POST');
      await form.getByRole('button',{name:'Save watcher',exact:true}).click();assert.equal((await watched).status(),200);
      await api(path+'/messages',{body:label(5),visibility:'public',sourceMessageId:label(6)});
      await open();
      const vendor=panel.getByRole('region',{name:'Vendor email side conversations'}),mailForm=vendor.locator('form');
      await mailForm.getByLabel('Vendor email',{exact:true}).fill('network-vendor@example.test');
      await mailForm.getByLabel('Mail connection',{exact:true}).selectOption(mail.id);
      await mailForm.getByLabel('Exact email message',{exact:true}).fill(label(7));await approve(mailForm);
      const sending=page.waitForResponse(r=>r.url().endsWith(path+'/side-conversations')&&r.request().method()==='POST');
      await mailForm.getByRole('button',{name:'Send private email',exact:true}).click();const response=await sending;
      assert.equal(response.status(),201);const sent=await response.json();assert.equal(sent.state,'accepted');
      const wire=(await (await fetch(base+'/__fixture/evidence')).json()).calls.filter(c=>c.kind==='side-email').at(-1).data;
      assert.deepEqual(wire.content,[{type:'text/plain',value:label(7)}]);
      await api('/mail/intake',{connectionId:mail.id,sourceMessageId:label(8),sender:'network-vendor@example.test',subject:label(9),text:label(10),inReplyTo:wire.headers['Message-ID']});
      await page.reload();await open();await page.locator('.message-body').getByText(`Email from network-vendor@example.test:\n${label(10)}`,{exact:true}).waitFor();
      await panel.screenshot({path:`${out}/DESK-007-private-email-${width}.png`});
      await page.screenshot({path:`${out}/DESK-007-vendor-reply-${width}.png`,fullPage:true});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'DESK-007 owner controls fit');
      await sp.reload();await sp.locator('.message-body').getByText(`Email from network-vendor@example.test:\n${label(10)}`,{exact:true}).waitFor();
      await ep.goto(base+'/app#'+path);await ep.reload();
      await ep.getByRole('region',{name:'Collaboration notifications'}).getByRole('link',{name:'A request you watch has a public update',exact:true}).last().waitFor();
      await ep.locator('.message-body').getByText(label(5),{exact:true}).waitFor();
      for(const hidden of [label(4),label(7),label(10),'network-vendor@example.test'])assert.ok(!(await ep.locator('body').innerText()).includes(hidden),'DESK-007 employee sees no private collaboration');
      assert.equal(await ep.getByText('Private collaboration',{exact:true}).count(),0);
      assert.ok(await ep.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'DESK-007 employee view fits');
      await ep.screenshot({path:`${out}/DESK-007-employee-${width}.png`,fullPage:true});
      const employeeApi=apiFor(ep);assert.ok((await employeeApi('/collaboration/inbox')).items.every(i=>i.kind!=='mention'));
    }
  } finally {await sc.close();await ec.close();}
  console.log('PASS DESK-007 native mention, colleague notification, watcher and email side reply as private notes, employee isolation at 1440/390. Slack remains blocked by CHANNEL-001.');
}

// Focus the existing collaboration journey against the connected worker during development.
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
 const {chromium}=await import('playwright');
 const {finishFirstRun}=await import('./connected-helpers.mjs');
 const base=process.env.LINEN_TEST_URL,out=process.env.LINEN_TEST_OUTPUT;
 if(!base || !out)throw Error('Use tests/ui/connected-run.mjs');
 const browser=await chromium.launch({headless:true,args:['--use-mock-keychain','--password-store=basic']});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(base+'/app');
  await page.getByLabel('Your name').fill('Collaboration owner');
  await page.getByLabel('Workspace name').fill('Collaboration proof');
  await page.getByLabel('Work email').fill('synthetic-linen-140@example.test');
  await page.getByLabel('Password',{exact:true}).fill('synthetic-linen-141');
  await page.getByRole('button',{name:'Create workspace'}).click();
  await page.getByRole('heading',{name:'Requests',exact:true}).waitFor();
  await finishFirstRun(page,base);
  await collaborationJourney({browser,page,api:apiFor(page),base,out,errors});
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
}
