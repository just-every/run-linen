import {approvalParallelChecks} from './approval-parallel-cases.mjs';
import {approvalReminderPrivacyChecks} from './approval-reminder-privacy-cases.mjs';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';

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
 let out=await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE ? ORDER BY rowid DESC LIMIT 1').bind('%synthetic-linen-710%').first();
 const packet=JSON.parse(out.payload_json);assert.equal(packet.personalizations[0].to[0].email,finance+'@example.test');assert.equal(packet.reply_to.email,config.recipient);
 const token=/\[approval:([A-Za-z0-9_-]+)\]/.exec(packet.subject)[1];
 const signed=async({sender=finance,subject=`Re: [approval:${token}]`,text='approve\nsynthetic-linen-721',verdict='PASS',spf='PASS',dkim='PASS',sourceDomain='example.test',signingDomain='example.test',messageId=crypto.randomUUID(),alter=false,topic=config.topicArn}={})=>{
  const receipt={notificationType:'Received',mail:{messageId,source:sender+'@'+sourceDomain,headersTruncated:false,headers:[{name:'DKIM-Signature',value:'v=1; d='+signingDomain+'; s=synthetic-linen-722'}]},receipt:{recipients:[config.recipient],action:{type:'SNS',topicArn:config.topicArn},spfVerdict:{status:spf},dkimVerdict:{status:dkim},dmarcVerdict:{status:verdict}},content:`From: ${sender}@example.test\r\nTo: ${config.recipient}\r\nMessage-ID: <${messageId}@example.test>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`};
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
 for(const authentication of [{spf:'FAIL'},{dkim:'FAIL'},{sourceDomain:'other.example.test'},{signingDomain:'other.example.test'}])
  assert.equal((await signed(authentication)).value.code,'approval_mail_unauthenticated','a signed receipt still needs passing and aligned SPF/DKIM/DMARC');
 await ok('/test/due',{at:opened.remindAt});
 const reminded=(await chain()).stages[0];assert.ok(reminded.remindedAt);assert.ok(reminded.breachedAt);assert.equal(reminded.state,'pending','silence is not approval');
 const messageId=crypto.randomUUID(),recorded=await signed({messageId});assert.equal(recorded.status,200);assert.equal(recorded.value.channel,'email');
 const decided=(await chain()).stages[0];assert.equal(decided.state,'approved');assert.equal(decided.decisions[0].comment,'approve\nsynthetic-linen-721');
 assert.equal((await signed({messageId})).value.state,'replayed','provider delivery replay cannot decide twice');
 assert.equal((await signed()).value.code,'approval_token_used');
 await ok(`/work/${request.id}/commands`,{command:'assign',revision:1,assigneeId:'owner',reason:'synthetic-linen-723'});
 assert.equal((await chain()).manager.state,'pending','editing the request invalidates its earlier decisions');
 assert.notEqual((await chain()).stages[0].state,'approved');
 await approveManager();
 await ok('/work/process-due',{});
 out=await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE ? ORDER BY rowid DESC LIMIT 1').bind('%synthetic-linen-710%').first();assert.notEqual(JSON.parse(out.payload_json).subject,packet.subject,'new revision gets a different single-use token');
 const unusedToken=/\[approval:([A-Za-z0-9_-]+)\]/.exec(JSON.parse(out.payload_json).subject)[1];
 const unusedHash=createHash('sha256').update(unusedToken).digest('hex');
 const tokenState=()=>db.prepare('SELECT state,work_revision FROM work_approval_tokens WHERE token_hash=?').bind(unusedHash).first();
 assert.deepEqual(await tokenState(),{state:'issued',work_revision:2},'the earlier-revision token has not been used');
 await ok(`/work/${request.id}/commands`,{command:'assign',revision:2,assigneeId:finance,reason:'synthetic-linen-783'});
 assert.deepEqual(await tokenState(),{state:'expired',work_revision:2},'the edit atomically expires unused authority for the old revision');
 const staleReply=await signed({subject:`Re: [approval:${unusedToken}]`});
 assert.equal(staleReply.status,409);assert.equal(staleReply.value.code,'approval_token_used','an unused token for an earlier revision is refused');
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
 // A final rejection survives its holder's withdrawal, even when every remaining holder approved.
 const refusedWork=await ok('/work',{title:'synthetic-linen-780',body:'synthetic-linen-780',deduplicationKey:'synthetic-linen-780'},employee);
 const refusedInput={catalogId:parallel.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-781'};
 await ok(`/work/${refusedWork.id}/fulfilment`,refusedInput,employee);
 const decisionOnRefused=async(user,decision)=>{
  const q=(await ok('/approval-stages',undefined,user)).items.find(x=>x.workId===refusedWork.id);assert.ok(q);
  return ok(`/work/${refusedWork.id}/approval-stage`,{...q,decision,idempotencyKey:crypto.randomUUID()},user);
 };
 await decisionOnRefused(finance,'approved');await decisionOnRefused(second,'rejected');
 await ok(`/work-groups/${team.id}/members/${second}/remove`,{});
 const afterWithdrawal=await ok(`/work/${refusedWork.id}/approvals/${parallel.id}`,undefined,employee);
 assert.equal(afterWithdrawal.stages[0].state,'rejected');assert.equal(afterWithdrawal.rejected,true);assert.equal(afterWithdrawal.satisfied,false);
 assert.equal((await ok('/approval-stages',undefined,finance)).items.some(x=>x.workId===refusedWork.id),false);
 assert.equal((await ok(`/work/${refusedWork.id}/fulfilment`,refusedInput,employee)).state,'blocked','withdrawing the rejector cannot release fulfilment');
 assert.equal((await ok(`/test/readiness/${refusedWork.id}/${parallel.id}`)).ready,false);
 await ok(`/work-groups/${team.id}/members`,{userId:second});
 assert.equal((await ok(`/work/${refusedWork.id}/approvals/${parallel.id}`,undefined,employee)).rejected,true,'restoring the holder also leaves that revision final');
 await ok(`/work/${refusedWork.id}/commands`,{command:'assign',revision:1,assigneeId:'owner',reason:'synthetic-linen-782'});
 assert.equal((await ok(`/work/${refusedWork.id}/approvals/${parallel.id}`,undefined,employee)).rejected,false,'a revised request starts fresh decisions');
 await decisionOnRefused(finance,'approved');await decisionOnRefused(second,'approved');
 assert.equal((await ok(`/work/${refusedWork.id}/approvals/${parallel.id}`,undefined,employee)).satisfied,true);
 // Quote reader inheritance: current stage holders, replacement withdrawal and decided-holder custody.
 const quoted=await ok('/catalog',{name:'synthetic-linen-731',kind:'service',target:'synthetic-linen-731',ownerId:'owner',form:{quoteRequired:true,fields:[{id:'price',label:'synthetic-linen-732',type:'number',required:true}]}});
 await ok(`/catalog/${quoted.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[{...stage,costField:'price'}]});
 const quoteWork=await ok('/work',{title:'synthetic-linen-733',body:'synthetic-linen-733',deduplicationKey:'synthetic-linen-733'},employee);
 const pdf=new TextEncoder().encode('%PDF-1.7\n% synthetic-linen-734\n%%EOF');
 const upload=await mf.dispatchFetch(`http://localhost/work/${quoteWork.id}/catalog-quote`,{method:'POST',headers:{'x-user':employee,'x-filename':'synthetic-linen-734.pdf','x-catalog-id':quoted.id,'content-type':'application/pdf'},body:pdf});
 assert.equal(upload.status,201);const quote=await upload.json();
 for(const price of [1000.001,-1,10000000.01]){
  const refused=await api(`/work/${quoteWork.id}/fulfilment`,{catalogId:quoted.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-733',answers:{price}},employee);
  assert.equal(refused.status,422);assert.equal(refused.value.code,'catalog_approval_price');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_fulfilments WHERE work_id=?').bind(quoteWork.id).first()).n,0,'invalid USD leaves no fulfilment');
 }
 const submitted=await ok(`/work/${quoteWork.id}/fulfilment`,{catalogId:quoted.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-733',answers:{price:1800.01}},employee);
 assert.deepEqual(submitted.catalogSnapshot.approvalAmounts.finance,{fieldId:'price',cents:180001});
 assert.equal(submitted.catalogSnapshot.form.costCents,null,'quote amount comes from the selected saved answer, not item metadata or PDF');
 const read=user=>mf.dispatchFetch(`http://localhost/catalog-quotes/${quote.id}`,{headers:{'x-user':user}});
 assert.equal((await read(finance)).status,200);assert.equal((await read(manager)).status,404);
 await ok('/work/process-due',{});
 const quotedPacket=(await db.prepare('SELECT payload_json FROM test_approval_mail WHERE payload_json LIKE ? ORDER BY rowid DESC LIMIT 1').bind('%synthetic-linen-731%').first()).payload_json;
 assert.ok(!quotedPacket.includes('synthetic-linen-734')&&!quotedPacket.includes('synthetic-linen-733'),'the approval email excludes quote bytes, filename, purpose and conversation');
 assert.equal((await ok('/approval-stages',undefined,finance)).items.find(x=>x.workId===quoteWork.id).costCents,180001,'the requester-entered USD price routes and appears in the approval packet');
 await ok(`/work-groups/${team.id}/members/${finance}/remove`,{});
 assert.equal((await read(finance)).status,404,'a holder replaced before deciding loses quote access');
 const quoteDecision=(await ok('/approval-stages',undefined,second)).items.find(x=>x.workId===quoteWork.id);
 await ok(`/work/${quoteWork.id}/approval-stage`,{...quoteDecision,decision:'approved',idempotencyKey:'synthetic-linen-735'},second);
 assert.equal((await read(second)).status,200,'a decided holder keeps the quote revision');
 assert.ok(await db.prepare("SELECT 1 FROM audit_events WHERE action='work.catalog_quote_read' AND actor_id=?").bind(second).first());
 const priced=await ok('/catalog',{name:'synthetic-linen-738',kind:'service',target:'synthetic-linen-738',ownerId:'owner',form:{costCents:180000,fields:[{id:'price',label:'synthetic-linen-739',type:'number',required:true}]}});
 await ok(`/catalog/${priced.id}/approvals`,{revision:1,calendarId:calendar.id,approvals:[{...stage,costField:'price'}]});
 for(const [price,expected] of [[1000,'skipped'],[1000.01,'pending']]){
  const p=await ok('/work',{title:'synthetic-linen-738',body:'synthetic-linen-738',deduplicationKey:crypto.randomUUID()},employee);
  const saved=await ok(`/work/${p.id}/fulfilment`,{catalogId:priced.id,catalogRevision:2,beneficiaryId:employee,purpose:'synthetic-linen-738',answers:{price}},employee);
  assert.equal((await ok(`/work/${p.id}/approvals/${priced.id}`,undefined,employee)).stages[0].state,expected,'the selected USD answer overrides item cost at the exact threshold');
  assert.equal(saved.catalogSnapshot.approvalAmounts.finance.cents,price===1000?100000:100001);
 }
 await ok(`/catalog/${quoted.id}/form`,{revision:2,name:'synthetic-linen-731',form:{costCents:900000,quoteRequired:true,fields:[{id:'price',label:'synthetic-linen-732',type:'number',required:true}]}});
 const frozen=(await ok(`/work/${quoteWork.id}/catalog-requests`,undefined,employee)).items[0].catalogSnapshot;
 assert.deepEqual(frozen.approvalAmounts.finance,{fieldId:'price',cents:180001},'item edits retain the submitted routing amount');
 assert.equal(frozen.answers.price,1800.01);
 await approvalParallelChecks({db,ok,api,mf,employee,manager,delegate,finance,second,calendar,stage});
 await approvalReminderPrivacyChecks({db,ok,api,employee,delegate,finance,second,calendar,stage});
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
