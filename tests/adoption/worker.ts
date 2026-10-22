import { installFreshserviceNetworkFixture,registerFreshserviceNetworkFixture } from './freshservice-network-fixture';
import { archiveRaceFetch } from './archive-race-fixture';
import { registerWorkRoutes } from "../../src/features/work";
import './knowledge-model-edge';
import { registerConnectionRoutes } from '../../src/features/connections';
import { registerIntelligenceRoutes } from '../../src/features/intelligence';
import { registerServiceRoutes } from "../../src/features/services";
import { recordTime } from '../../src/features/work/time';
import {registerPrivacyFixture} from './privacy-worker';
import {nativeTables,excludedTables,historyOnly} from '../../src/features/adoption/schema';
import {registerCoexistenceFixture} from './coexistence-worker';
import {proposePlan,dispatchPlan} from '../../src/features/execution/plans';
import {authorize} from '../../src/features/execution/authority';
import type {Step} from '../../src/features/execution/types';
import { Hono } from 'hono';
import { platformApp } from '../../src/platform/routes';
import { ApiError, id, now } from '../../src/platform/http';
import type { AppEnv } from '../../src/platform/types';
import { registerAdoptionRoutes, assertAdoptionEffectAllowed, processDueAdoption } from '../../src/features/adoption';
import { processDueRetention } from '../../src/features/work/retention';
import { createWork, appendMessage, conversation, listWork } from '../../src/features/work/core';
import { storeAttachment, readAttachment } from '../../src/features/work/attachments';
import {eraseServicePerson} from '../../src/features/services/privacy';
import {identityHash} from '../../src/features/adoption/core';
import { passwordHash } from '../../src/platform/crypto';
import { Freshservice } from '../../src/features/adoption/freshservice';
import { ingestSourceRecord, establishOwnership, pollSource, validateSourceAuthority, beginCutover, completeCutover, writebackEvidence, reconcileWriteback } from '../../src/features/adoption/coexistence';
installFreshserviceNetworkFixture();
const app = new Hono<AppEnv>();
app.onError((e, c) => e instanceof ApiError ? c.json({ error: { code: e.code, message: e.message } }, e.status as 400) : c.json({ error: { code: 'internal', message: e.message } }, 500));
app.get('/health', c => c.text('ok'));
const api = platformApp();
registerAdoptionRoutes(api);
registerFreshserviceNetworkFixture(api);
registerWorkRoutes(api);
registerConnectionRoutes(api);
registerIntelligenceRoutes(api);
registerServiceRoutes(api);
registerCoexistenceFixture(api);
registerPrivacyFixture(api);
api.get('/fixtures/restored-history',async c=>{const w=c.get('principal').workspaceId;return c.json({fulfilmentRuns:(await c.env.DB.prepare('SELECT * FROM intelligence_fulfilment_runs WHERE workspace_id=?').bind(w).all()).results,amendments:(await c.env.DB.prepare("SELECT state,row_json FROM adoption_history WHERE workspace_id=? AND table_name='work_fulfilment_amendments'").bind(w).all()).results,activeAmendments:(await c.env.DB.prepare('SELECT COUNT(*) n FROM work_fulfilment_amendments WHERE workspace_id=?').bind(w).first<any>()).n,sessions:(await c.env.DB.prepare('SELECT COUNT(*) n FROM sessions WHERE workspace_id=?').bind(w).first<any>()).n})});
// Synthetic persisted provider-edge state proves archives do not carry local email approval authority.
api.post('/fixtures/approval-archive',async c=>{
 const p=c.get('principal'),w=p.workspaceId,t=now(),b=await c.req.json<any>();
 const f=await c.env.DB.prepare('SELECT id,revision FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w,b.workId,b.catalogId).first<any>();
 const work=await c.env.DB.prepare('SELECT revision FROM work_records WHERE workspace_id=? AND id=?').bind(w,b.workId).first<any>();
 await c.env.DB.batch([
  c.env.DB.prepare('UPDATE work_fulfilment_amendments SET fulfilment_id=? WHERE workspace_id=? AND work_id=?').bind(f.id,w,b.workId),
  c.env.DB.prepare(`INSERT INTO work_approval_tokens(id,workspace_id,work_id,fulfilment_id,stage_key,approver_id,token_hash,work_revision,fulfilment_revision,catalog_revision,sent_to,state,config_revision,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'issued',1,'2099-01-01',?)`).bind(id(),w,b.workId,f.id,'synthetic_linen_212',b.approverId,'synthetic-linen-216',work.revision,f.revision,2,'synthetic-linen-210@example.test',t),
  c.env.DB.prepare('INSERT INTO work_approval_mail VALUES(?,?,?,?,?)').bind(w,'synthetic-linen-217','synthetic-linen-218','accepted',t),
  c.env.DB.prepare('INSERT INTO work_approval_mail_config VALUES(?,1,?,1,?,?,?,?,?,?)').bind(w,p.userId,'synthetic-linen-219','synthetic-linen-220@example.test','synthetic-linen-221','synthetic-linen-222','synthetic-linen-223',t),
  c.env.DB.prepare('INSERT INTO work_approval_mail_subscriptions VALUES(?,1,?,?)').bind(w,'synthetic-linen-224','2099-01-01'),
 ]);return c.json({seeded:true});
});
api.get('/fixtures/approval-archive',async c=>{
 const w=c.get('principal').workspaceId,db=c.env.DB;
 const count=async(table:string)=>(await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE workspace_id=?`).bind(w).first<any>()).n;
 const history=async(table:string)=>(await db.prepare('SELECT state,row_json FROM adoption_history WHERE workspace_id=? AND table_name=?').bind(w,table).all()).results;
 return c.json({decisions:await history('work_approval_decisions'),mail:await history('work_approval_mail'),liveDecisions:await count('work_approval_decisions'),tokens:await count('work_approval_tokens'),configs:await count('work_approval_mail_config'),subscriptions:await count('work_approval_mail_subscriptions')});
});
api.get('/fixtures/schema',async c=>{const tables=(await c.env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%'").all<{name:string}>()).results.map(x=>x.name);return c.json({unclassified:tables.filter(t=>!(nativeTables as readonly string[]).includes(t)&&!(t in excludedTables)),missing:nativeTables.filter(t=>!tables.includes(t)),history:[...historyOnly]})});
api.post('/fixtures', async (c) => {
    const p = c.get('principal'), ctx = { env: c.env, principal: p }, w = p.workspaceId, t = now(), person = id();
    const work = await createWork(ctx, { title: 'Restricted laptop fault', body: 'Employee public message', deduplicationKey: 'fixture-work' });
    await appendMessage(ctx, { workId: work.id, body: 'PRIVATE diagnosis', visibility: 'private', sourceMessageId: 'private-fixture' });
    const attachment = await storeAttachment(ctx, work.id, { name: 'private.txt', contentType: 'text/plain', visibility: 'private', bytes: new TextEncoder().encode('PRIVATE attachment bytes').buffer });
    const plan = id(), operation = id(), grant = id(), service = id(), commitment = id(), dependency = id();
    await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO work_people(id,workspace_id,source,source_id,name,observed_at,effective_at) VALUES(?,?,?,?,?,?,?)').bind(person, w, 'fixture', 'person-1', 'Sensitive Person', t, t),
        c.env.DB.prepare("INSERT INTO work_assets(id,workspace_id,serial,state,person_id,source,observed_at,asset_tag) VALUES(?,?,?,'assigned',?,'fixture',?,'DEN-IT-042')").bind(id(), w, 'fixture-serial', person, t),
        c.env.DB.prepare("INSERT INTO work_knowledge(id,workspace_id,title,body,scope,expires_at,updated_at) VALUES(?,?,?,?,'operators','2099-01-01T00:00:00.000Z',?)").bind(id(), w, 'Private knowledge', 'Private remedy', t),
        c.env.DB.prepare("INSERT INTO work_calendars(id,workspace_id,name,timezone,weekdays_json,start_hour,end_hour,holidays_json) VALUES(?,?,'Business hours','Australia/Brisbane','[1,2,3,4,5]',9,17,'[\"2026-12-25\"]')").bind(id(), w),
        c.env.DB.prepare("INSERT INTO intelligence_attempts(id,workspace_id,actor_id,kind,provider,state,cost_usd,charge_status,usage_json,elapsed_ms,created_at) VALUES(?,?,?,'fixture','fixture','completed',0.125,'known','{\"total_tokens\":42}',12,?)").bind(id(), w, p.userId, t),
        c.env.DB.prepare('INSERT INTO execution_grants(id,workspace_id,version,issuer_id,principal_id,parent_id,parent_version,action,action_version,target,beneficiary_id,connection_id,valid_from,valid_until,max_uses,conditions_json,created_at) VALUES(?,?,1,?,?,NULL,NULL,?,1,?,?,?, ?,?,3,?,?)').bind(grant, w, p.userId, p.userId, 'fixture.action', 'target', p.userId, id(), t, '2099-01-01T00:00:00.000Z', '{}', t),
        c.env.DB.prepare("INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at) VALUES(?,?,?,1,?,'[]','fixture',?)").bind(plan, w, work.id, p.userId, t),
        c.env.DB.prepare("INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,created_at) VALUES(?,?,?,'{}','unknown','target',?,?)").bind(operation, w, plan, p.userId, t),
        c.env.DB.prepare("INSERT INTO intelligence_fulfilment_runs VALUES(?,?,?,?,?,?,?,'running',?,?)").bind(id(),w,work.id,p.userId,p.userId,plan,JSON.stringify([operation]),t,t),
        c.env.DB.prepare("INSERT INTO work_fulfilment_amendments(id,workspace_id,work_id,fulfilment_id,event_key,requester_id,request_json,prior_json,state,owner_id,created_at) VALUES(?,?,?,?,?,?,?,?,'pending_decision',?,?)").bind(id(),w,work.id,id(),'history-fixture',p.userId,'{"purpose":"Retained correction"}','{"purpose":"Original request"}',p.userId,t),
        c.env.DB.prepare("INSERT INTO svc_records VALUES(?,?,'service',?,'restricted',?, ?,1,?,?)").bind(service, w, p.userId, JSON.stringify([p.userId]), JSON.stringify({ title: 'Private service', ownerId: p.userId }), t, t),
        c.env.DB.prepare("INSERT INTO intelligence_commitments VALUES(?,?,?,?,? ,?,1,?,NULL,?,?)").bind(dependency,w,p.userId,JSON.stringify([p.userId]),'restricted',JSON.stringify({outcome:'Private prerequisite',cohort:[p.userId],observations:[],freshnessSeconds:60,dependencies:[],effectiveAt:t,expiresAt:null,intervalSeconds:60,modelConnectionId:null}),t,t,t),
        c.env.DB.prepare("INSERT INTO intelligence_commitments VALUES(?,?,?,?,? ,?,1,?,NULL,?,?)").bind(commitment, w, p.userId, JSON.stringify([p.userId]), 'restricted', JSON.stringify({ outcome: 'Private commitment', cohort: [p.userId], observations: [], freshnessSeconds: 60, dependencies: [dependency], effectiveAt: t, expiresAt: null, intervalSeconds: 60, modelConnectionId: null }), t, t, t)
    ]);
    await recordTime(ctx,work.id,{source:'manual',minutes:15,deduplicationKey:'portable-manual',note:'Private human effort'});
    await recordTime(ctx,work.id,{source:'measured',deduplicationKey:'portable-active'});
    return c.json({ workId: work.id, attachmentId: attachment.id, personId: person, operationId: operation });
});
api.post('/fixtures/late/:id', async (c) => { await appendMessage({ env: c.env, principal: c.get('principal') }, { workId: c.req.param('id'), body: 'Arrived after snapshot', visibility: 'private', sourceMessageId: 'late-after-snapshot' }); return c.json({ appended: true }); });
api.post('/fixtures/person-work', async (c) => { const { userId } = await c.req.json<{
    userId: string;
}>(); const ctx = { env: c.env, principal: c.get('principal') }; const work = await createWork(ctx, { title: 'Personal request', body: 'PERSONAL message', beneficiaryId: userId, deduplicationKey: 'personal:' + userId }); const attachment = await storeAttachment(ctx, work.id, { name: 'personal.txt', contentType: 'text/plain', visibility: 'private', bytes: new TextEncoder().encode('PERSONAL bytes').buffer }); return c.json({ workId: work.id, attachmentId: attachment.id }); });
api.get('/fixtures/object-exists/:work/:attachment', async (c) => c.json({ exists: !!await c.env.ATTACHMENTS.head(`${c.get('principal').workspaceId}/${c.req.param('work')}/${c.req.param('attachment')}`) }));
api.post('/fixtures/historical-erasure',async c=>{const p=c.get('principal'),subject=id(),local=id(),foreign=id(),foreignWorkspace=id(),event=id(),time=now();await c.env.DB.batch([c.env.DB.prepare('INSERT INTO adoption_tombstones VALUES(?,?,?)').bind(p.workspaceId,await identityHash(subject),time),c.env.DB.prepare("INSERT INTO svc_records VALUES(?,?,'service',?,'restricted','[]',?,1,?,?)").bind(local,p.workspaceId,subject,JSON.stringify({title:'Historic private name',email:'historic@example.test',relatedId:foreign}),time,time),c.env.DB.prepare("INSERT INTO svc_records VALUES(?,?,'service',?,'restricted','[]',?,1,?,?)").bind(foreign,foreignWorkspace,subject,JSON.stringify({title:'Foreign private name'}),time,time),c.env.DB.prepare("INSERT INTO svc_events VALUES(?,?,?,?,?,?,?)").bind(event,p.workspaceId,local,p.userId,'source-observation',JSON.stringify({private:'Historical secret',email:'historic@example.test'}),time)]);await c.env.DB.batch([c.env.DB.prepare("INSERT INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at) VALUES(?,?,?,?,?,?,?)").bind(id(),p.workspaceId,local,p.userId,'notice','{"text":"Historical secret"}',time),c.env.DB.prepare('INSERT INTO svc_commands VALUES(?,?,?,?)').bind(p.workspaceId,local,'historic','{"text":"Historical secret"}')]);await eraseServicePerson({env:c.env,principal:p},{userId:subject,reason:'Historical privacy fixture'});const rows=(await c.env.DB.prepare('SELECT id,owner_id,data_json FROM svc_records WHERE id IN (?,?)').bind(local,foreign).all()).results;const kept=await c.env.DB.prepare('SELECT * FROM svc_events WHERE id=?').bind(event).first();let denied=false;try{await eraseServicePerson({env:c.env,principal:p},{userId:id(),reason:'No tombstone'})}catch{denied=true}const outbox=await c.env.DB.prepare('SELECT payload_json,state FROM svc_outbox WHERE workspace_id=? AND record_id=?').bind(p.workspaceId,local).first();const command=await c.env.DB.prepare('SELECT result_json FROM svc_commands WHERE workspace_id=? AND record_id=?').bind(p.workspaceId,local).first();return c.json({rows,local,foreign,event:kept,denied,outbox,command})});
api.post('/fixtures/tenant', async (c) => { const uid = id(), wid = id(), t = now(), email = `${uid}@test.invalid`; await c.env.DB.batch([c.env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(uid, email, 'Destination', await passwordHash('destination secure password'), t), c.env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(wid, 'Destination', t), c.env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(wid, uid, '["owner"]'), c.env.DB.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind(wid)]); return c.json({ email, workspaceId: wid }); });
api.get('/fixtures/records', async (c) => { const ctx = { env: c.env, principal: c.get('principal') }; const work = await listWork(ctx); return c.json({ knowledgeDrafts:(await c.env.DB.prepare('SELECT * FROM work_knowledge_drafts WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, articleVersions:(await c.env.DB.prepare('SELECT * FROM work_article_versions WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, time: (await c.env.DB.prepare('SELECT * FROM work_time_entries WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, assets: (await c.env.DB.prepare('SELECT * FROM work_assets WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, knowledge: (await c.env.DB.prepare('SELECT * FROM work_knowledge WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, calendars: (await c.env.DB.prepare('SELECT * FROM work_calendars WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, costs: (await c.env.DB.prepare('SELECT cost_usd,usage_json FROM intelligence_attempts WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, work, conversations: await Promise.all(work.map(r => conversation(ctx, String(r.id)))), grants: (await c.env.DB.prepare('SELECT COUNT(*) n FROM execution_grants WHERE workspace_id=?').bind(ctx.principal.workspaceId).first<any>()).n, operations: (await c.env.DB.prepare('SELECT * FROM execution_operations WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, services: (await c.env.DB.prepare('SELECT * FROM svc_records WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results, commitments: (await c.env.DB.prepare('SELECT * FROM intelligence_commitments WHERE workspace_id=?').bind(ctx.principal.workspaceId).all()).results }); });
api.get('/fixtures/attachment/:id', async (c) => { const r = await readAttachment({ env: c.env, principal: c.get('principal') }, c.req.param('id')); return new Response(r.blob.body); });
api.post('/fixtures/corrupt/:id', async (c) => { const row: any = await c.env.DB.prepare('SELECT blob_key FROM work_attachments WHERE id=? AND workspace_id=?').bind(c.req.param('id'), c.get('principal').workspaceId).first(); await c.env.ATTACHMENTS.put(row.blob_key, 'corrupt'); return c.json({ corrupt: true }); });
api.post('/fixtures/effect', async (c) => { await assertAdoptionEffectAllowed({ env: c.env, principal: c.get('principal') }, { resource: 'target', action: 'fixture.action' }); return c.json({ permitted: true }); });
api.get('/fixtures/archive-objects', async (c) => { const objects = await c.env.ATTACHMENTS.list({ prefix: c.get('principal').workspaceId + '/adoption/exports/' }); return c.json({ count: objects.objects.length }); });
api.post('/fixtures/sweep', async (c) => c.json(await processDueAdoption(c.env)));
api.post('/fixtures/backdate-closed/:id', async (c) => { const { days } = await c.req.json<{ days: number }>(); await c.env.DB.prepare('UPDATE work_records SET closed_at=? WHERE workspace_id=? AND id=?').bind(new Date(Date.now() - days * 86400000).toISOString(), c.get('principal').workspaceId, c.req.param('id')).run(); return c.json({ ok: true }); });
api.post('/fixtures/retention-run', async (c) => c.json(await processDueRetention(c.env)));
api.post('/fixtures/coexistence', async (c) => {
    const p = c.get('principal'), ctx = { env: c.env, principal: p }, source = id(), at = now();
    await c.env.DB.prepare("INSERT INTO adoption_sources(id,workspace_id,connection_id,provider,source_workspace,state,checkpoint,last_seen_at) VALUES(?,?,?,'freshservice',1,'current',?,?)").bind(source, p.workspaceId, id(), at, at).run();
    let approved = true, revision = at, posted = 0, notes: any[] = [];
    const fake = new Freshservice('fixture.freshservice.com', 'test-only', async (url: any, init: any) => {
        if(init.redirect!=='manual')throw Error('Provider redirects must not be followed');const path = new URL(String(url)).pathname;
        let data: any;
        if (path.endsWith('/approval-groups'))
            data = { approval_groups: [{ id: 7, approval_status: { id: approved ? 1 : 2, name: approved ? 'approved' : 'rejected' } }] };
        else if (path.endsWith('/notes')) {
            posted++;
            notes.push({ id: 99, private: true, body: JSON.parse(init.body).body });
            data = { conversation: notes[0] };
        }
        else if (path.endsWith('/conversations'))
            data = { conversations: notes };
        else if (path === '/api/v2/tickets')
            data = { tickets: [{ id: 42, workspace_id: 1, updated_at: revision, subject: 'fixture' }] };
        else
            data = { ticket: { id: 42, workspace_id: 1, updated_at: revision } };
        return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    });
    const poll = await pollSource(ctx, source, fake);
    const connectionId=id(),grantId=id(),issuer=id(),resource=`${connectionId}:group:${p.userId}`;
    const work=await createWork(ctx,{title:'Coexistent request',body:'Scoped operation',deduplicationKey:'coexistent:'+source});
    await c.env.DB.batch([c.env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(issuer,issuer+'@test.invalid','Independent fixture issuer','!fixture',at),c.env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(p.workspaceId,issuer,'["owner"]'),c.env.DB.prepare("INSERT INTO connections VALUES(?,?,?,'Fixture','{}',NULL,'unverified',1,?,?)").bind(connectionId,p.workspaceId,'microsoft-graph',at,at),c.env.DB.prepare('INSERT INTO execution_grants(id,workspace_id,version,issuer_id,principal_id,action,action_version,target,beneficiary_id,connection_id,valid_from,valid_until,max_uses,conditions_json,created_at,connection_revision) VALUES(?,?,1,?,?,?,1,?,?,?,?,?,10,?,?,1)').bind(grantId,p.workspaceId,issuer,p.userId,'group.add','group',p.userId,connectionId,at,'2099-01-01T00:00:00.000Z','{}',at)]);
    const owned = await establishOwnership(ctx, { resource, action: 'group.add', sourceId: source,sourceTicketId:42, approvalId: 7, incumbentDisabledEvidence: 'fixture incumbent executor disabled' }, fake);
    const plan=await proposePlan(ctx,{workId:work.id,revision:work.revision,idempotencyKey:'coexistent:'+source,steps:[{action:'group.add',actionVersion:1,connectionId,target:'group',beneficiaryId:p.userId,grantId,grantVersion:1}]});const bound:Step=JSON.parse(plan.steps_json)[0];let forged=false;try{await proposePlan(ctx,{workId:work.id,revision:work.revision,idempotencyKey:'forged:'+source,steps:[{...bound,sourceFence:owned.fence+1}]})}catch{forged=true}
    const operations:any[]=await dispatchPlan(ctx,{planId:plan.id,expectedRevision:plan.revision});const op=operations[0].id;const persisted:Step=JSON.parse(operations[0].step_json);const boundContext=persisted.sourceId===source&&persisted.sourceRevision===owned.sourceRevision&&persisted.sourceFence===owned.fence;

    await validateSourceAuthority(ctx, owned.id, fake);
    await assertAdoptionEffectAllowed(ctx, { resource, action: 'group.add', sourceId: persisted.sourceId, sourceRevision: persisted.sourceRevision, fence:persisted.sourceFence }, fake);
    let dual = false, conflict = false, stale = false;
    try {
        await establishOwnership(ctx, { resource, action: 'group.add', sourceId: source,sourceTicketId:42, approvalId: 7, incumbentDisabledEvidence: 'fixture incumbent executor disabled' }, fake);
    }
    catch {
        dual = true;
    }
    try {
        await ingestSourceRecord(ctx, source, '42', revision, { different: true });
    }
    catch {
        conflict = true;
    }
    await writebackEvidence(ctx, { ownershipId: owned.id, operationId: op, body: 'fixture evidence' }, async () => {await authorize(ctx,persisted,plan.id,op)}, fake);
    await writebackEvidence(ctx, { ownershipId: owned.id, operationId: op, body: 'fixture evidence' }, async () => {await authorize(ctx,persisted,plan.id,op)}, fake);
    const current: any = await c.env.DB.prepare('SELECT * FROM adoption_ownership WHERE id=?').bind(owned.id).first();
    const cutoff = await beginCutover(ctx, owned.id, current.revision, revision);
    revision = new Date(Date.parse(revision) + 1000).toISOString();
    await ingestSourceRecord(ctx, source, '42', revision, { ticket: { id: 42 }, late: true });
    let late = false;
    try {
        await completeCutover(ctx, owned.id, cutoff.revision);
    }
    catch {
        late = true;
    }
    approved = false;
    try {
        await validateSourceAuthority(ctx, owned.id, fake);
    }
    catch {
        stale = true;
    }
    const state: any = await c.env.DB.prepare('SELECT * FROM adoption_ownership WHERE id=?').bind(owned.id).first();
    await c.env.DB.prepare('DELETE FROM memberships WHERE workspace_id=? AND user_id=?').bind(p.workspaceId,issuer).run();
    return c.json({ poll, dual, conflict, stale, posted, late, boundContext,forged,state: state.state });
});
app.route('/api/v1', api);
export default {fetch:(request:Request,env:any,execution:any)=>archiveRaceFetch(request,env,execution,app)};
