import assert from 'node:assert/strict';
export const classificationEncryptionKey = Buffer.alloc(32).toString('base64');
export async function classificationChecks({ api, db }) {
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' };
  const create = async title => {
    const result = await api('/work', { title, body: title, deduplicationKey: crypto.randomUUID() }, employee);
    assert.equal(result.status, 201, JSON.stringify(result)); return result.value;
  };
  const read = async work => {
    const result = await api(`/work/${work.id}/classification`);
    assert.equal(result.status, 200, JSON.stringify(result)); return result.value;
  };
  const propose = async work => { const state = await read(work); return api(`/work/${work.id}/classification/propose`, { revision: state.revision, workRevision: state.workRevision }); };
  const vpn = await create('VPN down for whole Denver office');
  assert.equal((await propose(vpn)).status, 503);
  assert.equal((await read(vpn)).state, 'failed');
  assert.equal((await read(vpn)).current, null, 'missing provider produces no invented classification');
  const key = await crypto.subtle.importKey('raw', Buffer.alloc(32), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ apiKey: 'synthetic-classification-provider-key' })));
  const secret = Buffer.from(iv).toString('base64') + '.' + Buffer.from(ciphertext).toString('base64');
  await db.prepare("INSERT INTO connections VALUES('classification-model','a','openai','Classification fixture',?,?,'active',1,?,?)")
    .bind(JSON.stringify({ model: 'fixture-model', inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 2, maxOutputTokens: 1000, maxAttemptUsd: 1 }), secret, new Date().toISOString(), new Date().toISOString()).run();
  const previousSettings = await db.prepare("SELECT settings_json FROM workspace_settings WHERE workspace_id='a'").first();
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('a',?) ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json")
    .bind(JSON.stringify({ defaultModelConnectionId: 'classification-model' })).run();
  await db.prepare("INSERT INTO intelligence_budgets(workspace_id,limit_usd) VALUES('a',10) ON CONFLICT(workspace_id) DO UPDATE SET limit_usd=10").run();
  const result = await propose(vpn);
  assert.equal(result.status, 200, JSON.stringify(result));
  const proposed = result.value;
  assert.equal(proposed.current.type, 'incident'); assert.equal(proposed.current.category, 'network');
  assert.equal(proposed.current.subcategory, 'vpn'); assert.equal(proposed.current.impact, 'high');
  assert.equal(proposed.current.urgency, 'high'); assert.equal(proposed.current.priority, 'P1');
  assert.ok(proposed.proposal.reason.includes('Denver')); assert.ok(proposed.proposal.reason.includes('Matrix'));
  const override = { ...proposed.current, priority: 'P2', revision: proposed.revision, workRevision: proposed.workRevision, reason: 'Backup VPN restored critical work; use P2 while primary is repaired.' };
  for (const auth of [employee, { ...employee, 'x-roles': '["owner"]' }])
    assert.equal((await api(`/work/${vpn.id}/classification/override`, override, auth)).status, 403);
  assert.equal((await api(`/work/${vpn.id}/classification`, undefined, { 'x-workspace': 'b' })).status, 404);
  assert.equal((await api(`/work/${vpn.id}/classification`, undefined, { 'x-user': 'stranger', 'x-roles': '["employee"]' })).status, 404);
  assert.equal((await api(`/work/${vpn.id}/classification/override`, { ...override, subcategory: 'printer' })).status, 422);
  assert.equal((await api(`/work/${vpn.id}/classification/override`, { ...override, reason: '' })).status, 400);
  assert.equal((await read(vpn)).revision, proposed.revision, 'rejected override changes nothing');
  const overridden = await api(`/work/${vpn.id}/classification/override`, override);
  assert.equal(overridden.status, 200, JSON.stringify(overridden));
  assert.equal(overridden.value.current.priority, 'P2'); assert.equal(overridden.value.proposal.priority, 'P1');
  const audit = overridden.value.history.find(event => event.action === 'work.classification_overridden');
  assert.equal(audit.before.priority, 'P1'); assert.equal(audit.after.priority, 'P2'); assert.equal(audit.actor_id, 'owner');
  assert.equal(audit.reason, override.reason); assert.ok(Number.isFinite(Date.parse(audit.created_at)));
  assert.equal((await api(`/work/${vpn.id}/classification/override`, override)).status, 409);
  assert.equal((await api(`/work/${vpn.id}/classification`, undefined, employee)).value.history.length, 0);
  assert.equal((await api(`/work/${vpn.id}/classification`, undefined, employee)).value.reason, null, 'agent override explanations remain within the service team');
  for (const [title, type] of [['How do I use VPN?', 'question'], ['New laptop for upcoming start', 'service_request']]) {
    const work = await create(title), proposal = await propose(work);
    assert.equal(proposal.status, 200, JSON.stringify(proposal)); assert.equal(proposal.value.current.type, type);
  }
  const question = await create('Manual agent classification');
  let state = await read(question);
  for (const [impact, urgency, priority] of [['high','medium','P2'], ['medium','low','P4'], ['low','high','P3']]) {
    const updated = await api(`/work/${question.id}/classification/override`, { type: 'question', category: 'general', subcategory: 'guidance', impact, urgency, revision: state.revision, workRevision: state.workRevision, reason: 'Agent reviewed reported scope and time sensitivity' });
    assert.equal(updated.status, 200, JSON.stringify(updated)); state = updated.value; assert.equal(state.current.priority, priority);
  }
  const invalid = await create('Invalid provider classification');
  assert.equal((await propose(invalid)).status, 422); assert.equal((await read(invalid)).current, null);
  const lost = await create('Lose provider classification');
  assert.equal((await propose(lost)).status, 500); assert.equal((await read(lost)).state, 'failed');
  const delayed = await create('Delay provider classification');
  const pending = propose(delayed);
  for (let count = 0; count < 100; count++) {
    if ((await api('/test/classification-provider')).value.waiting) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await api('/test/classification-provider')).value.waiting, true);
  const whilePending = await read(delayed);
  const manual = await api(`/work/${delayed.id}/classification/override`, { ...override, revision: whilePending.revision, workRevision: whilePending.workRevision, reason: 'Agent investigated while the model was pending' });
  assert.equal(manual.status, 200, JSON.stringify(manual));
  await api('/test/classification-provider/release', {});
  assert.equal((await pending).status, 409, 'late model proposal cannot overwrite an agent decision');
  assert.equal((await read(delayed)).current.priority, 'P2');
  const corrected = await create('Delay provider after employee correction');
  const outdated = propose(corrected);
  for (let count = 0; count < 100; count++) {
    if ((await api('/test/classification-provider')).value.waiting) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal((await api('/test/classification-provider')).value.waiting, true);
  assert.equal((await api(`/work/${corrected.id}/messages`, { body: 'Correction: only my laptop is affected.', visibility: 'public', sourceMessageId: 'correct-scope' }, employee)).status, 201);
  await api('/test/classification-provider/release', {});
  assert.equal((await outdated).status, 409, 'an employee correction fences the earlier model assessment');
  assert.equal((await read(corrected)).current, null);
  // Restore pre-existing settings so the rest of the work suite keeps its own environment.
  if (previousSettings) await db.prepare("UPDATE workspace_settings SET settings_json=? WHERE workspace_id='a'").bind(previousSettings.settings_json).run();
  else await db.prepare("DELETE FROM workspace_settings WHERE workspace_id='a'").run();
  console.log('DESK-002 passed: real D1/public routes; reasoned office VPN P1 proposal, three types, categories/subcategories and matrix, authorized P2 override with actor/time/before/after, privacy/current role/CAS, unavailable/invalid provider and late proposal fencing.');
  return vpn.id;
}
