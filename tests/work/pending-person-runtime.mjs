import assert from 'node:assert/strict';
import { runtimeHarness } from '../intelligence/runtime-harness.mjs';

const h = await runtimeHarness('tests/work/pending-person-worker.ts');
let destination;
const password = 'isolated pending-person test passphrase';
async function request(path, body, auth = {}) {
  return fetch(h.origin + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { Origin: h.origin, 'Content-Type': 'application/json',
      ...(auth.cookie ? { Cookie: auth.cookie } : {}),
      ...(auth.csrf ? { 'X-Linen-CSRF': auth.csrf } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function api(path, body, auth) {
  const response = await request('/api/v1' + path, body, auth);
  return { status: response.status, value: await response.json(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function ok(path, body, auth) {
  const result = await api(path, body, auth);
  assert.ok(result.status >= 200 && result.status < 300, JSON.stringify({ path, ...result }));
  return result;
}
async function session(cookie) {
  const auth = { cookie };
  auth.csrf = (await ok('/session', undefined, auth)).value.csrfToken;
  return auth;
}
async function login(email) {
  return session((await ok('/login', { email, password })).cookie);
}
async function verifiedEmailSignIn(email) {
  const sent = await request('/auth/magic-link', { email, returnTo: '/app' });
  assert.equal(sent.status, 202, await sent.text());
  const messages = await (await request('/test/mail')).json();
  const message = messages.at(-1);
  assert.deepEqual(message.to, [email]);
  const token = /[?&](?:amp;)?token=([^"&<>\s]+)/.exec((message.html ?? '') + (message.text ?? ''))?.[1];
  assert.ok(token, 'The mail provider receives the native sign-in proof');
  const proof = decodeURIComponent(token);
  assert.equal((await request('/auth/confirm?token=' + encodeURIComponent(proof))).status, 200);
  const confirmed = await request('/auth/confirm', { token: proof });
  assert.equal(confirmed.status, 303, await confirmed.text());
  const auth = await session(confirmed.headers.get('set-cookie')?.split(';')[0]);
  assert.equal((await request('/auth/confirm', { token: proof })).status, 400,
    'A consumed sign-in proof cannot bind or release a second time');
  return auth;
}

try {
  const owner = await session((await ok('/setup', { email: 'owner@pending.test',
    name: 'Owner', workspaceName: 'Pending person proof', password })).cookie);
  const ownerPrincipal = (await ok('/session', undefined, owner)).value.principal;
  const db = await h.db;
  const count = async (table, workId) => (await db.prepare(
    `SELECT COUNT(*) n FROM ${table} WHERE workspace_id=?${workId ? table === 'execution_operations' ? ' AND plan_id IN (SELECT id FROM execution_plans WHERE work_id=?)' : ' AND work_id=?' : ''}`,
  ).bind(ownerPrincipal.workspaceId, ...(workId ? [workId] : [])).first()).n;
  const addMember = async (name, email) => (await ok('/members', {
    name, email, password, roles: ['employee'], isPerson: true,
  }, owner)).value;
  await addMember('Unrelated employee', 'unrelated@pending.test');
  const employee = await login('unrelated@pending.test');
  const draft = { name: 'Alex Pending', email: 'alex@pending.test',
    startDate: '2026-11-02', team: 'Engineering', reviewed: true };

  // Review is explicit; invalid input and forbidden roles leave no people behind.
  for (const body of [{ ...draft, reviewed: false }, { ...draft, reviewed: undefined },
    { ...draft, email: 'invalid-address' }, { ...draft, startDate: '2026-02-30' },
    { ...draft, startDate: 'not-a-date' }]) {
    const denied = await api('/pending-people', body, owner);
    assert.ok([400, 422].includes(denied.status), JSON.stringify(denied));
  }
  assert.equal((await api('/pending-people', draft, employee)).status, 403);
  assert.equal((await api('/pending-people', undefined, employee)).status, 403);
  assert.deepEqual((await ok('/pending-people', undefined, owner)).value.items, []);
  let person = (await ok('/pending-people', draft, owner)).value;
  assert.equal(person.state, 'pending');
  assert.equal(person.member_id, null);
  assert.equal(person.email, draft.email);
  assert.ok(!(await ok('/members', undefined, owner)).value.some(m => m.email === draft.email),
    'Recording a future person creates no login account');
  assert.equal(await db.prepare('SELECT id FROM users WHERE email=?').bind(draft.email).first(), null);

  const laptop = (await ok('/catalog', { name: 'Laptop', kind: 'device',
    target: 'pending-laptop-stock', ownerId: ownerPrincipal.userId, capacity: 1 }, owner)).value;
  const figma = (await ok('/catalog', { name: 'Figma', kind: 'software',
    target: 'figma-team-license', ownerId: ownerPrincipal.userId, capacity: 1 }, owner)).value;
  const catalogIds = [laptop.id, figma.id];
  const input = { title: 'Prepare Alex for first day', body: 'Laptop and Figma for design work',
    pendingPersonId: person.id, catalogIds, deduplicationKey: 'pending-alex-services' };
  assert.equal((await api('/work', input, employee)).status, 403);
  const workCount = await count('work_records');
  const invalidServices = await api('/work', { ...input, catalogIds: [laptop.id, 'missing-catalog'],
    deduplicationKey: 'invalid-pending-services' }, owner);
  assert.ok([404, 422].includes(invalidServices.status), JSON.stringify(invalidServices));
  assert.equal(await count('work_records'), workCount, 'Unknown service cannot leave a partial request');
  const work = (await ok('/work', input, owner)).value;
  assert.equal((await ok('/work', input, owner)).value.id, work.id,
    'A retried request retains its original held services');
  let detail = (await ok(`/work/${work.id}`, undefined, owner)).value;
  assert.equal(detail.pendingPerson.id, person.id);
  assert.deepEqual(detail.heldServices.map(s => s.catalog_id).sort(), [...catalogIds].sort());
  assert.ok(detail.heldServices.every(s => s.state === 'held'));
  assert.equal((await ok(`/work/${work.id}/obligations`, undefined, owner)).value.items.length, 0);
  assert.equal(await count('work_catalog_reservations', work.id), 0,
    'Held services consume neither stock nor licenses before authentication');
  assert.equal(await count('work_fulfilments', work.id), 0);
  assert.equal(await count('execution_operations', work.id), 0);
  assert.equal((await api(`/work/${work.id}`, undefined, employee)).status, 404);
  assert.ok(!(await ok('/work', undefined, employee)).value.items.some(w => w.id === work.id));

  const revision = person.revision;
  const edit = { ...draft, name: 'Alex Reviewed', email: 'alex.reviewed@pending.test',
    startDate: '2026-11-09', team: 'Design', expectedRevision: revision };
  assert.equal((await api(`/pending-people/${person.id}/edit`, edit, employee)).status, 403);
  assert.equal((await api(`/pending-people/${person.id}/withdraw`, {
    expectedRevision: revision, reason: 'Forbidden employee change',
  }, employee)).status, 403);
  assert.ok([400, 422].includes((await api(`/pending-people/${person.id}/edit`, {
    ...edit, reviewed: false,
  }, owner)).status));
  person = (await ok(`/pending-people/${person.id}/edit`, edit, owner)).value;
  assert.ok(person.revision > revision);
  assert.equal(person.email, edit.email);
  assert.equal(person.start_date, edit.startDate);
  assert.equal((await api(`/pending-people/${person.id}/edit`, edit, owner)).status, 409);
  assert.equal((await ok(`/work/${work.id}`, undefined, owner)).value.pendingPerson.email, edit.email);

  const member = await addMember(person.name, person.email);
  person = (await ok(`/pending-people/${person.id}/edit`, {
    ...edit, expectedRevision: person.revision, team: 'Product Design',
  }, owner)).value;
  assert.equal(person.team, 'Product Design', 'An unbound person remains editable after their account is created');
  detail = (await ok(`/work/${work.id}`, undefined, owner)).value;
  assert.equal(detail.pendingPerson.state, 'pending', 'Creating an account is not proof of sign-in');
  assert.ok(detail.heldServices.every(s => s.state === 'held'));
  const alex = await verifiedEmailSignIn(person.email);
  detail = (await ok(`/work/${work.id}`, undefined, alex)).value;
  assert.equal(detail.work.beneficiary_id, member.id);
  assert.equal(detail.pendingPerson.state, 'bound');
  assert.equal(detail.pendingPerson.member_id, member.id);
  assert.ok(detail.heldServices.every(s => s.state === 'released'));
  const duties = (await ok(`/work/${work.id}/obligations`, undefined, owner)).value.items;
  assert.deepEqual(duties.map(o => o.kind).sort(), ['access.grant', 'device.deliver']);
  assert.ok(duties.every(o => o.beneficiary_id === member.id && o.state !== 'verified'));
  assert.equal(await count('work_fulfilments', work.id), 2);
  assert.equal(await count('work_catalog_reservations', work.id), 2);
  assert.equal(await count('execution_operations', work.id), 0,
    'Releasing a held service does not invent a provider outcome');
  assert.ok((await ok('/work', undefined, alex)).value.items.some(w => w.id === work.id));
  await ok('/session', undefined, alex);
  await login(person.email);
  assert.deepEqual((await ok(`/work/${work.id}/obligations`, undefined, owner)).value.items.map(o => o.id).sort(),
    duties.map(o => o.id).sort(), 'Repeated verified sessions create no duplicate duties');
  assert.equal(await count('work_catalog_reservations', work.id), 2);
  assert.equal((await api(`/work/${work.id}`, undefined, employee)).status, 404);

  // Withdrawal cancels every held request and remains final after real sign-in.
  let withdrawn = (await ok('/pending-people', { ...draft,
    name: 'Cancelled hire', email: 'cancelled@pending.test' }, owner)).value;
  const cancelledWork = [];
  for (const key of ['cancelled-first', 'cancelled-second']) cancelledWork.push((await ok('/work', {
    ...input, pendingPersonId: withdrawn.id, deduplicationKey: key,
  }, owner)).value);
  withdrawn = (await ok(`/pending-people/${withdrawn.id}/withdraw`, {
    expectedRevision: withdrawn.revision, reason: 'Hire cancelled before the start date',
  }, owner)).value;
  assert.equal(withdrawn.state, 'withdrawn');
  await addMember('Cancelled hire account', withdrawn.email);
  const cancelledAuth = await verifiedEmailSignIn(withdrawn.email);
  for (const cancelled of cancelledWork) {
    const after = (await ok(`/work/${cancelled.id}`, undefined, owner)).value;
    assert.equal(after.work.state, 'cancelled');
    assert.equal(after.pendingPerson.state, 'withdrawn');
    assert.equal(after.pendingPerson.member_id, null);
    assert.ok(after.heldServices.every(s => s.state === 'cancelled'));
    assert.equal((await ok(`/work/${cancelled.id}/obligations`, undefined, owner)).value.items.length, 0);
    assert.equal(await count('work_catalog_reservations', cancelled.id), 0);
    assert.equal((await api(`/work/${cancelled.id}`, undefined, cancelledAuth)).status, 404);
  }
  assert.equal((await api('/work', { ...input, pendingPersonId: withdrawn.id,
    deduplicationKey: 'withdrawn-cannot-request' }, owner)).status, 409);

  const audits = (await db.prepare('SELECT actor_id,action,target,detail_json FROM audit_events WHERE workspace_id=?')
    .bind(ownerPrincipal.workspaceId).all()).results;
  const lifecycleAudit = (action, target, actor) => assert.ok(audits.some(a =>
    a.action === action && a.target === target && a.actor_id === actor), `${action} must retain its actor and person`);
  lifecycleAudit('work.pending_person_created', person.id, ownerPrincipal.userId);
  lifecycleAudit('work.pending_person_edited', person.id, ownerPrincipal.userId);
  lifecycleAudit('work.pending_person_bound', person.id, member.id);
  lifecycleAudit('work.pending_person_withdrawn', withdrawn.id, ownerPrincipal.userId);
  for (const action of ['work.pending_service_held', 'work.pending_service_released'])
    assert.ok(audits.some(a => a.action === action && a.target === work.id), `${action} must identify the request`);
  for (const cancelled of cancelledWork) assert.ok(audits.some(a =>
    a.action === 'work.pending_service_cancelled' && a.target === cancelled.id && a.actor_id === ownerPrincipal.userId),
    'Withdrawal audits the cancellation of each held request');
  assert.equal(audits.filter(a => a.action === 'work.pending_person_bound' && a.target === person.id).length, 1);
  assert.ok(!audits.some(a => a.action === 'work.pending_person_bound' && a.target === withdrawn.id));
  // Native archives preserve pending selections and prior released history, but
  // import neither account authority nor permission to resume selected services.
  const archived = (await ok('/pending-people', { ...draft,
    name: 'Archive starter', email: 'archive-starter@pending.test' }, owner)).value;
  const archivedWork = (await ok('/work', { ...input, title: 'Archive starter setup',
    pendingPersonId: archived.id, deduplicationKey: 'archive-pending-services' }, owner)).value;
  const exported = (await ok('/exports', { idempotencyKey: 'pending-native-roundtrip' }, owner)).value;
  let manifest;
  for (let attempt=0;attempt<100;attempt++) {
    const next=(await ok(`/exports/${exported.id}/advance`,{},owner)).value;
    if(next.state==='ready'){manifest=next;break;}
  }
  assert.ok(manifest,'Native pending-person archive is ready');
  assert.ok(manifest.tables.work_pending_people>0 && manifest.tables.work_pending_services>0);
  destination=await runtimeHarness('tests/work/pending-person-worker.ts');
  async function target(path,body,auth={},method=body===undefined?'GET':'POST',raw=false) {
    const response=await fetch(destination.origin+'/api/v1'+path,{method,redirect:'manual',
      headers:{Origin:destination.origin,'Content-Type':raw?'application/octet-stream':'application/json',
        ...(auth.cookie?{Cookie:auth.cookie}:{}),...(auth.csrf?{'X-Linen-CSRF':auth.csrf}:{})},
      body:body===undefined?undefined:raw?body:JSON.stringify(body)});
    const value=await response.json();
    assert.ok(response.status>=200&&response.status<300,JSON.stringify({path,status:response.status,value}));
    return {value,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const targetOwner={cookie:(await target('/setup',{email:'destination-owner@pending.test',
    name:'Destination owner',workspaceName:'Restored pending proof',password})).cookie};
  targetOwner.csrf=(await target('/session',undefined,targetOwner)).value.csrfToken;
  const imported=(await target('/imports',{manifest,idempotencyKey:'pending-restore'},targetOwner)).value;
  for(const chunk of manifest.chunks) {
    const bytes=await (await request(`/api/v1/exports/${exported.id}/chunks/${chunk.ordinal}`,undefined,owner)).arrayBuffer();
    await target(`/imports/${imported.id}/chunks/${chunk.ordinal}`,bytes,targetOwner,'PUT',true);
  }
  const report=(await target(`/imports/${imported.id}/dry-run`,{},targetOwner)).value;
  assert.equal(report.unknownMappings,0);
  assert.equal(report.unresolvedReferences,0,JSON.stringify(report));
  let importedStatus;
  for(let attempt=0;attempt<100;attempt++) {
    importedStatus=(await target(`/imports/${imported.id}/resume`,{acceptSemanticLoss:true},targetOwner)).value;
    if(importedStatus.state!=='applying')break;
  }
  assert.equal(importedStatus.state,'restored',JSON.stringify(importedStatus));
  const restoredPeople=(await target('/pending-people',undefined,targetOwner)).value.items;
  const restoredStarter=restoredPeople.find(p=>p.email===archived.email);
  assert.ok(restoredStarter && restoredStarter.id!==archived.id);
  assert.equal(restoredStarter.member_id,null);
  const restoredReleasedPerson=restoredPeople.find(p=>p.email===person.email);
  assert.equal(restoredReleasedPerson.member_id,null,'Archived reviewed account links are inert');
  assert.equal(restoredReleasedPerson.state,'pending');
  const restoredWorks=(await target('/work',undefined,targetOwner)).value.items;
  const restoredWork=restoredWorks.find(w=>w.title===archivedWork.title);
  let restoredDetail=(await target(`/work/${restoredWork.id}`,undefined,targetOwner)).value;
  assert.equal(restoredDetail.pendingPerson.id,restoredStarter.id);
  assert.ok(restoredDetail.heldServices.every(s=>s.state==='held'&&s.reason.includes('Restored held service')));
  const historical=restoredWorks.find(w=>w.pending_person_id===restoredReleasedPerson.id);
  assert.deepEqual((await target(`/work/${historical.id}`,undefined,targetOwner)).value.heldServices.map(s=>s.state),['released','released'],
    'Previously released selections stay historical and are never requeued');
  const targetMember=(await target('/members',{name:restoredStarter.name,email:restoredStarter.email,
    password,roles:['employee'],isPerson:true},targetOwner)).value;
  assert.equal(targetMember.personId,restoredStarter.id);
  const targetEmployee={cookie:(await target('/login',{email:restoredStarter.email,password})).cookie};
  targetEmployee.csrf=(await target('/session',undefined,targetEmployee)).value.csrfToken;
  restoredDetail=(await target(`/work/${restoredWork.id}`,undefined,targetEmployee)).value;
  assert.equal(restoredDetail.pendingPerson.member_id,targetMember.id,'Fresh normal authentication proves restored identity');
  assert.ok(restoredDetail.heldServices.every(s=>s.state==='held'&&s.reason.includes('Restored held service')));
  assert.deepEqual((await target(`/work/${restoredWork.id}/obligations`,undefined,targetOwner)).value.items,[]);
  const destinationDb=await destination.db;
  for(const table of ['work_fulfilments','work_catalog_reservations'])
    assert.equal((await destinationDb.prepare(`SELECT COUNT(*) n FROM ${table} WHERE work_id=?`).bind(restoredWork.id).first()).n,0);
  assert.equal((await destinationDb.prepare('SELECT COUNT(*) n FROM execution_operations').first()).n,0);
  console.log('PASS pending native archive roundtrip: mapped people/work/catalogue selections, parent references, inert imported bindings, historical released selections retained, fresh authenticated identity, held imported services create no capacity or effects.');
  console.log('PASS pending person public routes with real D1/workerd: reviewed facts, authority/input denials, no premature account/capacity/effects, atomic held services, reviewed edit, native email-proof binding/replay, beneficiary visibility, employee isolation, withdrawn requests cancelled and never bound, lifecycle audit.');
} finally {
  if(destination)await destination.close();
  await h.close();
}
