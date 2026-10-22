import assert from 'node:assert/strict';

/** Independently conditioned application-owner/finance stages and a reviewed manager open as one parallel group. */
export async function approvalParallelChecks({db,ok,api,mf,employee,manager,delegate,finance,second,calendar,stage}){
 const appOwner='synthetic-linen-785';
 await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(appOwner,appOwner+'@example.test',appOwner,'synthetic-linen-786',new Date().toISOString()).run();
 await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('w',appOwner,JSON.stringify(['approver'])).run();
 const application=await ok('/applications',{name:'synthetic-linen-787',ownerId:appOwner,approverIds:[],connector:'synthetic-linen-788',sensitivity:'internal',entitlements:[{name:'synthetic-linen-789',target:'synthetic-linen-790',costCents:180000,billingPeriod:'one-time'}]});
 const catalog=await ok('/catalog',{name:'synthetic-linen-791',kind:'access',applicationId:application.id,entitlementId:application.data.entitlements[0].id,form:{costCents:180000,quoteRequired:true,fields:[{id:'price',label:'synthetic-linen-792',type:'number',required:true}]}});
 const definitions=[
  {...stage,key:'reviewed',name:'synthetic-linen-793',aboveCents:null,approvers:[{type:'reviewed_manager'}]},
  {...stage,key:'application',name:'synthetic-linen-794',withPrevious:true,aboveCents:150000,approvers:[{type:'application_owner'}]},
  {...stage,key:'finance',name:'synthetic-linen-795',withPrevious:true,costField:'price',approvers:[{type:'member',userId:second}]},
  {...stage,key:'release',name:'synthetic-linen-796',aboveCents:null,approvers:[{type:'member',userId:second}]},
 ];
 await ok(`/catalog/${catalog.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:definitions});
 const submit=async(price,n)=>{
  const work=await ok('/work',{title:`synthetic-linen-${n}`,body:`synthetic-linen-${n}`,beneficiaryId:employee,deduplicationKey:crypto.randomUUID()});
  const upload=await mf.dispatchFetch(`http://localhost/work/${work.id}/catalog-quote`,{method:'POST',headers:{'x-user':'owner','x-filename':'synthetic-linen-797.pdf','x-catalog-id':catalog.id,'content-type':'application/pdf'},body:new TextEncoder().encode('%PDF-1.7\n% synthetic-linen-797\n%%EOF')});
  assert.equal(upload.status,201);const quote=await upload.json();
  await ok(`/work/${work.id}/fulfilment`,{catalogId:catalog.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-798',answers:{price}});
  return {work,quote};
 };
 const {work,quote}=await submit(1100,799),chain=()=>ok(`/work/${work.id}/approvals/${catalog.id}`);
 let current=await chain();assert.deepEqual(current.stages.map(s=>s.state),['pending','pending','pending','waiting']);
 assert.equal(new Set(current.stages.slice(0,3).map(s=>s.activeAt)).size,1);assert.ok(current.stages[0].activeAt);assert.equal(current.stages[3].activeAt,null);
 const queued=async(user,key)=>(await ok('/approval-stages',undefined,user)).items.find(x=>x.workId===work.id&&x.stageKey===key);
 assert.ok(await queued(delegate,'reviewed'));assert.equal(await queued(manager,'reviewed'),undefined,'the reviewed manager yields to the current delegate');
 assert.ok(await queued(appOwner,'application'));assert.ok(await queued(second,'finance'));assert.equal(await queued(second,'release'),undefined);
 const read=user=>mf.dispatchFetch(`http://localhost/catalog-quotes/${quote.id}`,{headers:{'x-user':user}});
 for(const user of [delegate,appOwner,second])assert.equal((await read(user)).status,200,'every current parallel holder can read the submitted quote');
 assert.equal((await read(finance)).status,404,'an unrelated ordinary operator gets no quote');
 const oldManager=await queued(delegate,'reviewed');assert.equal((await api(`/work/${work.id}/approval-stage`,{...oldManager,decision:'approved',idempotencyKey:crypto.randomUUID()},manager)).status,403);
 await ok('/test/due',{at:current.stages[0].remindAt});
 current=await chain();for(const s of current.stages.slice(0,3)){assert.ok(s.remindedAt);assert.ok(s.breachedAt);}assert.equal(current.stages[3].remindedAt,null);
 const packets=(await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE ?').bind(`%${work.id}%`).all()).results.map(r=>JSON.parse(r.payload_json));
 for(const [name,user] of [[definitions[0].name,delegate],[definitions[1].name,appOwner],[definitions[2].name,second]])assert.ok(packets.some(p=>p.subject.includes(name)&&p.personalizations[0].to[0].email===user+'@example.test'),'each open parallel stage gets its own authenticated-reply packet');
 assert.ok(!packets.some(p=>p.subject.includes(definitions[3].name)));
 const decide=async(user,key)=>{const q=await queued(user,key);assert.ok(q);return ok(`/work/${work.id}/approval-stage`,{...q,decision:'approved',idempotencyKey:crypto.randomUUID()},user);};
 await decide(delegate,'reviewed');await decide(appOwner,'application');
 assert.equal((await chain()).satisfied,false);assert.equal((await ok(`/test/readiness/${work.id}/${catalog.id}`)).ready,false,'a remaining parallel finance decision keeps fulfilment blocked');
 assert.equal(await queued(second,'release'),undefined,'a later serial stage waits for the whole parallel group');
 await decide(second,'finance');assert.ok(await queued(second,'release'));assert.ok((await chain()).stages[3].activeAt);
 assert.equal((await chain()).satisfied,false);await decide(second,'release');assert.equal((await chain()).satisfied,true);assert.equal((await ok(`/test/readiness/${work.id}/${catalog.id}`)).ready,true,'all parallel and later serial approvals release the business gate only');
 // A different requester-entered amount independently skips finance without skipping the application owner or manager.
 const lower=await submit(900,800);const conditional=await ok(`/work/${lower.work.id}/approvals/${catalog.id}`);
 assert.deepEqual(conditional.stages.map(s=>s.state),['pending','pending','skipped','waiting']);
}
