import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

/** Public catalog, decision, scheduler and signed SES SNS doors; only paid mail edge is faked. */
export async function approvalChainChecks({db,ok,api,mf}){
 const employee='synthetic-linen-701',manager='synthetic-linen-702',delegate='synthetic-linen-703',finance='synthetic-linen-704',second='synthetic-linen-705';
 for(const [user,roles] of [[employee,['employee']],[manager,['approver']],[delegate,['approver']],[finance,['operator','approver']],[second,['operator','approver']]]){
  await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@example.test',user,'synthetic-linen-706',new Date().toISOString()).run();
  await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('w',user,JSON.stringify(roles)).run();
 }
 const person=await ok('/people',{source:'synthetic-linen-707',sourceId:employee,name:employee,managerId:manager,observedAt:new Date().toISOString(),effectiveAt:new Date().toISOString()});
 await ok(`/people/${person.id}/binding`,{expectedRevision:person.revision,memberId:employee,managerId:manager});
 const calendar=await ok('/calendars',{name:'synthetic-linen-708',timezone:'America/New_York',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[],holidayCatalog:'us-federal'});
 const team=await ok('/work-groups',{name:'synthetic-linen-709'});
 await ok(`/work-groups/${team.id}/members`,{userId:finance});
 const catalog=await ok('/catalog',{name:'synthetic-linen-710',kind:'device',target:'synthetic-linen-711',ownerId:'owner',requiresManager:true,form:{costCents:180000}});
 const stage={key:'finance',name:'synthetic-linen-712',mode:'any',approvers:[{type:'group',groupId:team.id}],aboveCents:100000,remindHours:24,slaHours:24};
 assert.equal((await api(`/catalog/${catalog.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[stage]},employee)).status,403);
 await ok(`/catalog/${catalog.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[stage]});
 await ok('/people/delegations',{managerId:manager,delegateId:delegate,startsAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()},manager);
 const request=await ok('/work',{title:'synthetic-linen-713',body:'synthetic-linen-714',deduplicationKey:'synthetic-linen-715'},employee);
 const input={catalogId:catalog.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-716'};
 assert.equal((await ok(`/work/${request.id}/fulfilment`,input,employee)).state,'blocked');
 assert.equal((await ok('/fulfilment-decisions',undefined,manager)).items.some(x=>x.workId===request.id),false,'OOO holder yields to delegate');
 assert.equal((await ok('/approval-stages',undefined,finance)).items.some(x=>x.workId===request.id),false,'finance waits for manager');
 const approveManager=async()=>{
  const q=(await ok('/fulfilment-decisions',undefined,delegate)).items.find(x=>x.workId===request.id);assert.ok(q,'delegate receives exact manager decision');
  return ok(`/work/${request.id}/fulfilment/approve`,{...q,expectedHolderId:q.holderId,idempotencyKey:crypto.randomUUID()},delegate);
 };
 await approveManager();
 const chain=()=>ok(`/work/${request.id}/approvals/${catalog.id}`,undefined,employee);
 const opened=(await chain()).stages[0];assert.equal(opened.state,'pending');assert.ok(opened.remindAt&&opened.slaAt);
 assert.ok(Date.parse(opened.remindAt)-Date.parse(opened.activeAt)>24*3600000,'24 business hours spans multiple workdays');
 const q=(await ok('/approval-stages',undefined,finance)).items.find(x=>x.workId===request.id);assert.equal(q.costCents,180000);assert.equal(JSON.stringify(q).includes('synthetic-linen-714'),false);
 assert.equal((await api(`/work/${request.id}/approval-stage`,{...q,decision:'approved',idempotencyKey:'synthetic-linen-717'},employee)).status,403);
 await ok('/test/approval-mail-connection',{});
 const pair=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const publicKey=Buffer.from(await webcrypto.subtle.exportKey('spki',pair.publicKey)).toString('base64');
 const config={revision:0,enabled:true,consent:true,sendingConnectionId:'synthetic-linen-718',recipient:'synthetic-linen-719@example.test',topicArn:'arn:aws:sns:us-east-1:000000000000:synthetic-linen-720',signingCertUrl:'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-00000000000000000000000000000000.pem',publicKey};
 assert.equal((await api('/approval-mail/config',{...config,consent:false})).status,422);
 await ok('/approval-mail/config',config);
 await ok('/work/process-due',{});
 let out=await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE '%synthetic-linen-710%' ORDER BY rowid DESC LIMIT 1').first();
 const packet=JSON.parse(out.payload_json);assert.equal(packet.personalizations[0].to[0].email,finance+'@example.test');assert.equal(packet.reply_to.email,config.recipient);
 const token=/\[approval:([A-Za-z0-9_-]+)\]/.exec(packet.subject)[1];
 const signed=async({sender=finance,subject=`Re: [approval:${token}]`,text='approve\nsynthetic-linen-721',verdict='PASS',messageId=crypto.randomUUID(),alter=false,topic=config.topicArn}={})=>{
  const receipt={notificationType:'Received',mail:{messageId,source:sender+'@example.test',headersTruncated:false,headers:[{name:'DKIM-Signature',value:'v=1; d=example.test; s=synthetic-linen-722'}]},receipt:{recipients:[config.recipient],action:{type:'SNS',topicArn:config.topicArn},spfVerdict:{status:'PASS'},dkimVerdict:{status:'PASS'},dmarcVerdict:{status:verdict}},content:`From: ${sender}@example.test\r\nTo: ${config.recipient}\r\nMessage-ID: <${messageId}@example.test>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`};
  const envelope={Type:'Notification',MessageId:crypto.randomUUID(),TopicArn:topic,Timestamp:new Date().toISOString(),Message:JSON.stringify(receipt),SignatureVersion:'2',SigningCertURL:config.signingCertUrl};
  const canonical=['Message','MessageId','Timestamp','TopicArn','Type'].map(k=>`${k}\n${envelope[k]}\n`).join('');
  envelope.Signature=Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(canonical))).toString('base64');
  if(alter)envelope.Message+=' ';
  return api('/approval-mail/webhooks/w',envelope);
 };
 assert.equal((await mf.dispatchFetch('http://localhost/approval-mail',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connectionId:config.sendingConnectionId,from:finance+'@example.test',authentication:{spf:'pass',dkim:'pass',dmarc:'pass',aligned:true}})})).status,404,'no JSON verdict claim door');
 assert.equal((await signed({alter:true})).status,403,'signature binds original receipt');
 assert.equal((await signed({sender:second})).value.code,'approval_sender_mismatch');
 assert.equal((await signed({subject:`Fwd: [approval:${token}]`})).value.code,'approval_forwarded');
 assert.equal((await signed({verdict:'FAIL'})).value.code,'approval_mail_unauthenticated','signed transport does not bless failed DMARC');
 await ok('/test/due',{at:opened.remindAt});
 const reminded=(await chain()).stages[0];assert.ok(reminded.remindedAt);assert.ok(reminded.breachedAt);assert.equal(reminded.state,'pending','silence is not approval');
 const messageId=crypto.randomUUID(),recorded=await signed({messageId});assert.equal(recorded.status,200);assert.equal(recorded.value.channel,'email');
 const decided=(await chain()).stages[0];assert.equal(decided.state,'approved');assert.equal(decided.decisions[0].comment,'approve\nsynthetic-linen-721');
 assert.equal((await signed({messageId})).value.state,'replayed','provider delivery replay cannot decide twice');
 assert.equal((await signed()).value.code,'approval_token_used');
 await ok(`/work/${request.id}/commands`,{command:'pause',revision:1,reason:'synthetic-linen-723'},employee);
 assert.equal((await chain()).manager.state,'pending','editing the request invalidates its earlier decisions');
 assert.notEqual((await chain()).stages[0].state,'approved');
 await approveManager();
 await ok('/work/process-due',{});
 out=await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE '%synthetic-linen-710%' ORDER BY rowid DESC LIMIT 1').first();assert.notEqual(JSON.parse(out.payload_json).subject,packet.subject,'new revision gets a different single-use token');
 assert.ok((await signed()).status>=400,'earlier revision email is refused');
 // A lower cost skips finance, while a missing amount never silently bypasses its threshold.
 for(const [n,cost,expected] of [[724,100000,'skipped'],[725,null,'pending']]){
  const c=await ok('/catalog',{name:`synthetic-linen-${n}`,kind:'service',target:`synthetic-linen-${n}`,ownerId:'owner',form:{costCents:cost}});
  await ok(`/catalog/${c.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[stage]});
  const work=await ok('/work',{title:`synthetic-linen-${n}`,body:`synthetic-linen-${n}`,deduplicationKey:`synthetic-linen-${n}`},employee);
  await ok(`/work/${work.id}/fulfilment`,{catalogId:c.id,catalogRevision:2,beneficiaryId:employee,purpose:`synthetic-linen-${n}`},employee);
  assert.equal((await ok(`/work/${work.id}/approvals/${c.id}`,undefined,employee)).stages[0].state,expected);
 }
 // Parallel all-of holders: one response cannot release work, and withdrawn authority cannot decide.
 await ok(`/work-groups/${team.id}/members`,{userId:second});
 const parallel=await ok('/catalog',{name:'synthetic-linen-726',kind:'service',target:'synthetic-linen-726',ownerId:'owner'});
 await ok(`/catalog/${parallel.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[{...stage,mode:'all',aboveCents:null}]});
 const work=await ok('/work',{title:'synthetic-linen-727',body:'synthetic-linen-727',deduplicationKey:'synthetic-linen-727'},employee);
 await ok(`/work/${work.id}/fulfilment`,{catalogId:parallel.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-727'},employee);
 const decide=async user=>{const q=(await ok('/approval-stages',undefined,user)).items.find(x=>x.workId===work.id);return ok(`/work/${work.id}/approval-stage`,{...q,decision:'approved',idempotencyKey:crypto.randomUUID()},user);};
 await decide(finance);assert.equal((await ok(`/work/${work.id}/approvals/${parallel.id}`,undefined,employee)).satisfied,false);
 const withdrawn=(await ok('/approval-stages',undefined,second)).items.find(x=>x.workId===work.id);
 await ok(`/work-groups/${team.id}/members/${second}/remove`,{});
 assert.equal((await api(`/work/${work.id}/approval-stage`,{...withdrawn,decision:'approved',idempotencyKey:'synthetic-linen-728'},second)).status,403);
 await ok(`/work-groups/${team.id}/members`,{userId:second});await decide(second);assert.equal((await ok(`/work/${work.id}/approvals/${parallel.id}`,undefined,employee)).satisfied,true);
 // Quote reader inheritance: current stage holders, replacement withdrawal and decided-holder custody.
 const quoted=await ok('/catalog',{name:'synthetic-linen-731',kind:'service',target:'synthetic-linen-731',ownerId:'owner',form:{quoteRequired:true,fields:[{id:'price',label:'synthetic-linen-732',type:'number',required:true}]}});
 await ok(`/catalog/${quoted.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[{...stage,costField:'price'}]});
 const quoteWork=await ok('/work',{title:'synthetic-linen-733',body:'synthetic-linen-733',deduplicationKey:'synthetic-linen-733'},employee);
 const pdf=new TextEncoder().encode('%PDF-1.7\n% synthetic-linen-734\n%%EOF');
 const upload=await mf.dispatchFetch(`http://localhost/work/${quoteWork.id}/catalog-quote`,{method:'POST',headers:{'x-user':employee,'x-filename':'synthetic-linen-734.pdf','x-catalog-id':quoted.id,'content-type':'application/pdf'},body:pdf});
 assert.equal(upload.status,201);const quote=await upload.json();
 await ok(`/work/${quoteWork.id}/fulfilment`,{catalogId:quoted.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-733',answers:{price:1800}},employee);
 const read=user=>mf.dispatchFetch(`http://localhost/catalog-quotes/${quote.id}`,{headers:{'x-user':user}});
 assert.equal((await read(finance)).status,200);assert.equal((await read(manager)).status,404);
 assert.equal((await ok('/approval-stages',undefined,finance)).items.find(x=>x.workId===quoteWork.id).costCents,180000,'the requester-entered USD price routes and appears in the approval packet');
 await ok(`/work-groups/${team.id}/members/${finance}/remove`,{});
 assert.equal((await read(finance)).status,404,'a holder replaced before deciding loses quote access');
 const quoteDecision=(await ok('/approval-stages',undefined,second)).items.find(x=>x.workId===quoteWork.id);
 await ok(`/work/${quoteWork.id}/approval-stage`,{...quoteDecision,decision:'approved',idempotencyKey:'synthetic-linen-735'},second);
 assert.equal((await read(second)).status,200,'a decided holder keeps the quote revision');
 assert.ok(await db.prepare("SELECT 1 FROM audit_events WHERE action='work.catalog_quote_read' AND actor_id=?").bind(second).first());
 await ok('/approval-mail/config',{revision:1,enabled:false});
 const managerOnly=await ok('/catalog',{name:'synthetic-linen-736',kind:'service',target:'synthetic-linen-736',ownerId:'owner',requiresManager:true});
 await ok(`/catalog/${managerOnly.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[],manager:{remindHours:24,slaHours:24}});
 const timed=await ok('/work',{title:'synthetic-linen-737',body:'synthetic-linen-737',deduplicationKey:'synthetic-linen-737'},employee);
 await ok(`/work/${timed.id}/fulfilment`,{catalogId:managerOnly.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-737'},employee);
 const managerTimer=(await ok(`/work/${timed.id}/approvals/${managerOnly.id}`,undefined,employee)).manager.timer;
 assert.ok(managerTimer.remind_at&&managerTimer.sla_at,'standalone manager timing requires an explicit owner-selected calendar/config');
 await ok('/test/due',{at:managerTimer.remind_at});
 const timedDecision=(await ok('/fulfilment-decisions',undefined,delegate)).items.find(x=>x.workId===timed.id);
 assert.ok(timedDecision.approvalTimer.reminded_at);assert.ok(timedDecision.approvalTimer.breached_at);
 assert.equal((await ok(`/work/${timed.id}/approvals/${managerOnly.id}`,undefined,employee)).manager.state,'pending');
 console.log('APPROVAL CHAINS: delegate -> finance, 24 business-hour reminder/SLA, signed SES reply attribution/replay/refusals, request-edit invalidation, thresholds and parallel all-of.');
}
