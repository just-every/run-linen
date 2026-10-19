import assert from 'node:assert/strict';

export async function responseChecks({ api, db }) {
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' };
  const check = async (path, body, headers) => { const r = await api(path, body, headers); assert.ok(r.status < 300, JSON.stringify({ path, ...r })); return r.value; };
  const work = await check('/work', { title: 'Denver VPN keeps disconnecting', body: 'VPN disconnected on call 1', deduplicationKey: 'desk-008-twenty' }, employee);
  for (let i = 2; i <= 20; i++) await check(`/work/${work.id}/messages`, { body: `VPN disconnected on call ${i}`, visibility: 'public', sourceMessageId: `desk-008-message-${i}` }, employee);
  await check(`/work/${work.id}/messages`, { body: 'PRIVATE internal escalation details', visibility: 'private', sourceMessageId: 'desk-008-private' });
  const template = await check('/canned-responses', { title: 'VPN follow-up', body: 'Hello {{requester.name}}, about {{ticket.title}} ({{ticket.id}}).' });
  assert.equal((await api('/canned-responses', undefined, employee)).status, 403);
  assert.equal((await api('/canned-responses', { title: 'Forbidden', body: 'Hello' }, { ...employee, 'x-roles': '["owner"]' })).status, 403);
  assert.equal((await api('/canned-responses', { title: 'Unsafe', body: '{{secret.apiKey}}' })).status, 422);
  assert.equal((await api('/canned-responses', { title: 'Malformed', body: '{{requester.name' })).status, 422);
  let inserted = await check(`/work/${work.id}/canned-response`, { templateId: template.id, revision: 1 });
  assert.equal(inserted.text, `Hello Employee, about Denver VPN keeps disconnecting (${work.id}).`); assert.equal(inserted.sent, false);
  assert.equal((await api(`/work/${work.id}/canned-response`, { templateId: template.id, revision: 1 }, employee)).status, 403);
  assert.equal((await api(`/work/${work.id}/canned-response`, { templateId: template.id, revision: 1 }, { 'x-workspace': 'b' })).status, 404);
  const updated = await check('/canned-responses', { id: template.id, revision: 1, title: 'VPN follow-up revised', body: 'Hello {{requester.name}}.' });
  assert.equal(updated.revision, 2); assert.equal((await api('/canned-responses', { id: template.id, revision: 1, title: 'Stale', body: 'Old' })).status, 409);
  assert.equal((await api(`/work/${work.id}/canned-response`, { templateId: template.id, revision: 1 })).status, 409);
  const article = await check('/knowledge', { title: 'VPN restart guidance', body: 'Restart the VPN client. If it fails, keep the request open.', scope: 'employees', expiresAt: '2030-01-01T00:00:00Z', review: true });
  const privateArticle = await check('/knowledge', { title: 'Operator secrets', body: 'Operator-only diagnostics', scope: 'operators', expiresAt: '2030-01-01T00:00:00Z', review: true });
  const assist = (kind = 'summary', articleIds = [article.id], auth) => api(`/work/${work.id}/response-assistance`, { kind, articleIds }, auth);
  assert.equal((await assist()).status, 503, 'DESK-008 missing model does not fabricate a summary');
  const prior = await db.prepare("SELECT settings_json FROM workspace_settings WHERE workspace_id='a'").first();
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('a',?) ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json")
    .bind(JSON.stringify({ defaultModelConnectionId: 'classification-model' })).run();
  try {
    assert.equal((await assist('reply', [privateArticle.id])).status, 404);
    assert.equal((await assist('summary', [], employee)).status, 403);
    const before = (await check(`/work/${work.id}`)).messages;
    const summary = await assist(); assert.equal(summary.status, 200, JSON.stringify(summary));
    assert.equal(summary.value.sent, false); assert.equal(summary.value.citations.filter(c => c.type === 'message').length, 21);
    assert.ok(summary.value.citations.some(c => c.id === `article:${article.id}`));
    assert.ok(summary.value.citations.every(c => c.href.startsWith('#/')));
    assert.equal((await check('/test/response-provider')).last.sources.filter(s => s.type === 'message').length, 21, 'DESK-008 full twenty-message history plus permitted note supplied');
    const reply = await assist('reply'); assert.equal(reply.status, 200, JSON.stringify(reply));
    assert.equal(JSON.stringify((await check('/test/response-provider')).last).includes('PRIVATE'), false, 'DESK-008 public reply model never receives private notes');
    assert.deepEqual((await check(`/work/${work.id}`)).messages, before, 'DESK-008 model drafts and summaries never post');
    assert.equal((await assist('summary', [privateArticle.id])).status, 200, 'DESK-008 agent summary may cite permitted operator knowledge');
    await db.prepare("UPDATE connections SET config_json=json_set(config_json,'$.contextCharacters',1000) WHERE id='classification-model'").run();
    assert.equal((await assist()).status, 413, 'DESK-008 oversized full history is refused, never silently truncated');
    await db.prepare("UPDATE connections SET config_json=json_set(config_json,'$.contextCharacters',24000) WHERE id='classification-model'").run();
    await check(`/work/${work.id}/messages`, { body: reply.value.text, visibility: 'public', sourceMessageId: 'desk-008-agent-sent' });
    assert.equal((await check(`/work/${work.id}`)).messages.length, before.length + 1);
    await check('/test/response-provider', { mode: 'invalid' }); assert.equal((await assist()).status, 502, 'DESK-008 unknown citations refused');
    await check('/test/response-provider', { mode: 'failure' }); assert.equal((await assist()).status, 500);
    async function delayed(change, expected = 409) {
      await check('/test/response-provider', { mode: 'delay' }); const pending = assist();
      for (let i = 0; i < 200 && !(await check('/test/response-provider')).waiting; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal((await check('/test/response-provider')).waiting, true);
      await change(); await check('/test/response-provider/release', {});
      assert.equal((await pending).status, expected, 'DESK-008 changed context or authority fences a late result');
    }
    await delayed(() => check(`/work/${work.id}/messages`, { body: 'Late private correction', visibility: 'private', sourceMessageId: 'desk-008-late-note' }));
    await delayed(() => db.prepare("UPDATE work_knowledge SET revision=revision+1,body='Changed guidance' WHERE id=?").bind(article.id).run());
    await delayed(() => db.prepare("UPDATE work_knowledge SET scope='operators' WHERE id=?").bind(article.id).run());
    await db.prepare("UPDATE work_knowledge SET scope='employees' WHERE id=?").bind(article.id).run();
    await delayed(() => db.prepare("UPDATE work_knowledge SET reviewed_at=NULL WHERE id=?").bind(article.id).run(), 404);
    await db.prepare("UPDATE work_knowledge SET reviewed_at=? WHERE id=?").bind(new Date().toISOString(), article.id).run();
    await delayed(() => db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='owner'").run(), 404);
    await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE workspace_id='a' AND user_id='owner'").run();
    await delayed(() => db.prepare("UPDATE work_knowledge SET expires_at='2020-01-01' WHERE id=?").bind(article.id).run(), 404);
    await check('/test/response-provider', { mode: 'normal' });
    const row = await db.prepare('SELECT * FROM work_canned_responses WHERE id=?').bind(template.id).first();
    await db.prepare('DELETE FROM work_canned_responses WHERE id=?').bind(template.id).run();
    assert.equal((await check('/test/restore', { table: 'work_canned_responses', row, sourceId: 'desk-008-archive', sourceKey: template.id })).state, 'restored_held');
    inserted = await check(`/work/${work.id}/canned-response`, { templateId: template.id, revision: 2 }); assert.equal(inserted.text, 'Hello Employee.');
    await check(`/canned-responses/${template.id}/delete`, { revision: 2 });
    assert.equal((await check('/canned-responses')).items.some(t => t.id === template.id), false);
  } finally {
    await db.prepare("UPDATE memberships SET roles_json='[\"owner\"]' WHERE workspace_id='a' AND user_id='owner'").run();
    if (prior) await db.prepare("UPDATE workspace_settings SET settings_json=? WHERE workspace_id='a'").bind(prior.settings_json).run();
    else await db.prepare("DELETE FROM workspace_settings WHERE workspace_id='a'").run();
  }
  console.log('PASS DESK-008 public routes: canned name/title/id placeholders, CRUD/CAS/scope and native restore; full twenty-message cited model summary and knowledge; unsent reply, private-context isolation, provider/citation failures and late message/article/role/expiry fencing.');
}
