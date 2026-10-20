import assert from 'node:assert/strict';
import { requestWork } from './connected-helpers.mjs';
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
