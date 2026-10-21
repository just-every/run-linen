import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const quoteName = 'synthetic-linen-quote-v2.pdf';
export const quoteBytes = new TextEncoder().encode('%PDF-1.7\n% synthetic-linen-quote-body-marker\n%%EOF\n');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const future = ms => new Date(Date.now() + ms).toISOString();

/** CATALOG-001 (ct, 21 October): vendor quote PDFs, exact readers, frozen snapshot, exclusions, accounts and services. */
export async function catalogQuoteChecks(api, db, upload, r2) {
  const as = (user, role = 'employee') => ({ 'x-user': user, 'x-roles': JSON.stringify([role]) });
  const ok = async (path, body, headers = {}, status = body === undefined ? 200 : 201) => {
    const r = await api(path, body, headers); assert.equal(r.status, status, `${path}: ${JSON.stringify(r.value)}`); return r.value;
  };
  const people = [['q-req', 'employee'], ['q-ben', 'employee'], ['q-out', 'employee'], ['q-mgr', 'approver'], ['q-mgr2', 'approver'],
    ['q-fulfil', 'operator'], ['q-op', 'operator'], ['q-aud', 'auditor'], ['q-bot', 'integration'], ['q-hr', 'hr']];
  for (const [user, role] of people) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user, `${user}@example.test`, user, 'unused', '2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', user, JSON.stringify([role])).run();
  }
  const sales = await ok('/catalog-values', { dimension: 'department', label: 'Quote Sales' });
  for (const [user, attributes] of [['q-req', { department: sales.id }], ['q-ben', { department: sales.id }]])
    await db.prepare(`INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,merged_into,revision,observed_at,effective_at,member_id,binding_id,attributes_json)
      VALUES(?,?,?,?,?,?,1,NULL,1,'2026-01-01','2026-01-01',?,?,?)`).bind(`${user}-person`, 'a', 'hr', user, user, 'q-mgr', user, `${user}-binding`, JSON.stringify(attributes)).run();
  const software = await ok('/catalog', { name: 'Software purchase', kind: 'software', target: 'quote-software', ownerId: 'q-fulfil', requiresManager: true,
    form: { quoteRequired: true, fields: [{ id: 'price', label: 'Quoted price in USD', type: 'number', required: true }] } });
  const service = await ok('/catalog', { name: 'Facilities service', kind: 'service', target: 'quote-service', ownerId: 'q-fulfil', form: { quoteRequired: true } });
  const plain = await ok('/catalog', { name: 'Plain account', kind: 'account', target: 'quote-account', ownerId: 'q-fulfil' });
  assert.equal((await api('/catalog', { name: 'Unknown kind', kind: 'gadget', target: 'x', ownerId: 'owner' })).status, 422, 'CATALOG-001 item kinds are access, software, hardware, account and general service');
  const restricted = await ok('/catalog', { name: 'Sales software purchase', kind: 'software', target: 'quote-restricted', ownerId: 'q-fulfil', audience: { department: [sales.id] }, form: { quoteRequired: true } });
  const newWork = (user, key, extra = {}) => ok('/work', { title: 'Buy ' + key, body: 'Studio licences', deduplicationKey: key, ...extra }, as(user, user === 'q-op' ? 'operator' : 'employee'));
  const put = (work, item, who, bytes = quoteBytes, headers = {}) => upload(`/work/${work.id}/catalog-quote`, bytes,
    { ...as(who, who === 'q-op' ? 'operator' : 'employee'), 'x-filename': quoteName, 'x-catalog-id': item.id, 'content-type': 'application/pdf', ...headers });
  const submit = (work, item, who = 'q-req', extra = {}) => api(`/work/${work.id}/fulfilment`, { catalogId: item.id, catalogRevision: 1, beneficiaryId: extra.beneficiaryId ?? who,
    purpose: 'Studio licences', answers: item === software ? { price: 1800 } : {}, ...extra }, as(who, who === 'q-op' ? 'operator' : 'employee'));
  const read = (id, who, role = 'employee') => api(`/catalog-quotes/${id}`, undefined, as(who, role));

  // A quote-required item refuses submission without the PDF, in the ruling's words, and before and after wrong files.
  const work = await newWork('q-req', 'q-software');
  const missing = await submit(work, software);
  assert.equal(missing.status, 422); assert.equal(missing.value.error, 'Attach the vendor quote (PDF) to submit this request.', 'CATALOG-001 a quote-required item refuses submission without its quote');
  const notPdf = await put(work, software, 'q-req', new TextEncoder().encode('not a pdf'));
  assert.equal(notPdf.status, 422); assert.equal(notPdf.value.error, 'Quotes must be PDF files up to 20 MiB.', 'CATALOG-001 quotes must be PDF files');
  assert.equal((await put(work, software, 'q-req', quoteBytes, { 'content-type': 'text/plain' })).status, 422, 'CATALOG-001 a quote must be sent as a PDF');
  const huge = new Uint8Array(20 * 1024 * 1024 + 1); huge.set(new TextEncoder().encode('%PDF-1.7'));
  assert.equal((await put(work, software, 'q-req', huge)).status, 422, 'CATALOG-001 quotes are at most 20 MiB');
  assert.equal((await put(work, plain, 'q-req')).status, 422, 'CATALOG-001 an item that takes no quote refuses one');
  assert.equal((await put(work, software, 'q-out')).status, 404, 'CATALOG-001 only the requester or beneficiary attaches a quote');
  assert.equal((await db.prepare("SELECT count(*) n FROM work_attachments WHERE visibility='catalog_quote'").first()).n, 0, 'CATALOG-001 refused uploads store nothing');
  const first = await put(work, software, 'q-req', new TextEncoder().encode('%PDF-1.7 first draft'), { 'x-filename': 'synthetic-linen-quote-v1.pdf' });
  assert.equal(first.status, 201, JSON.stringify(first));
  const replaced = await put(work, software, 'q-req');
  assert.equal(replaced.status, 201);
  const unbound = (await db.prepare("SELECT id,fulfilment_id FROM work_attachments WHERE work_id=? AND visibility='catalog_quote'").bind(work.id).all()).results;
  assert.deepEqual(unbound, [{ id: replaced.value.id, fulfilment_id: null }], 'CATALOG-001 a later upload replaces an unsubmitted quote');
  assert.equal(await r2.head(`a/${work.id}/${first.value.id}`), null, 'CATALOG-001 the replaced quote bytes are deleted');
  assert.equal(replaced.value.sha256, sha(quoteBytes), 'CATALOG-001 the quote is fingerprinted by SHA-256');

  // Submission freezes id and hash, binds the file once, and the quote is immutable afterwards.
  const submitted = await submit(work, software);
  assert.equal(submitted.status, 201, JSON.stringify(submitted.value));
  assert.deepEqual(submitted.value.catalogSnapshot.quote, { id: replaced.value.id, sha256: sha(quoteBytes), size: quoteBytes.length }, 'CATALOG-001 the snapshot freezes the quote id, hash and size, never an amount');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_attachments WHERE id=? AND fulfilment_id IS NOT NULL').bind(replaced.value.id).first()).n, 1, 'CATALOG-001 the submission binds the quote to its fulfilment');
  assert.equal((await put(work, software, 'q-req', new TextEncoder().encode('%PDF-1.7 swapped'))).status, 409, 'CATALOG-001 a submitted quote cannot be replaced');
  const workRecord = await ok(`/work/${work.id}`, undefined, as('q-req'));
  const amend = await api(`/work/${work.id}/fulfilment`, { catalogId: software.id, expectedWorkRevision: workRecord.work.revision, expectedFulfilmentRevision: 1,
    idempotencyKey: 'q-amend', beneficiaryId: 'q-req', purpose: 'Studio licences', expiresAt: future(86400000) }, as('q-req'));
  assert.equal(amend.status, 409); assert.match(amend.value.error, /fresh catalog submission/, 'CATALOG-001 replacing the quote is an amendment, which is a fresh submission');
  const audits = (await db.prepare("SELECT action,detail_json FROM audit_events WHERE target=? AND action LIKE 'catalog.quote%'").bind(work.id).all()).results;
  assert.deepEqual(audits.map(a => a.action).sort(), ['catalog.quote_attached', 'catalog.quote_replaced', 'catalog.quote_uploaded'], 'CATALOG-001 uploads, replacements and attachment are audited');
  assert.ok(audits.every(a => !a.detail_json.includes('synthetic-linen-quote')), 'CATALOG-001 audits never carry the file name');

  // Exact readers; everyone else gets a 404 with no sign of the file.
  const quoteId = replaced.value.id, relations = async () => (await db.prepare("SELECT detail_json FROM audit_events WHERE action='work.catalog_quote_read' AND target=?").bind(work.id).all()).results.map(r => JSON.parse(r.detail_json).relation);
  const download = await read(quoteId, 'q-req');
  assert.equal(download.status, 200); assert.equal(download.value, new TextDecoder().decode(quoteBytes), 'CATALOG-001 the requester downloads the exact file');
  assert.match(download.headers.get('content-disposition'), /^attachment/, 'CATALOG-001 a quote is served as a download, never inline');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await relations()).length, 0, 'CATALOG-001 the requester reads without a privileged-read audit');
  assert.equal((await read(quoteId, 'owner', 'owner')).status, 200, 'CATALOG-001 the owner reads the quote');
  assert.equal((await read(quoteId, 'q-mgr', 'approver')).status, 200, 'CATALOG-001 the current approver reads the quote');
  assert.equal((await read(quoteId, 'q-fulfil', 'operator')).status, 200, 'CATALOG-001 the item fulfilment owner reads the quote');
  assert.deepEqual((await relations()).sort(), ['approver', 'fulfilment_owner', 'owner'], 'CATALOG-001 every read by someone but the requester or beneficiary is audited by relation');
  for (const [user, role] of [['q-op', 'operator'], ['q-aud', 'auditor'], ['q-bot', 'integration'], ['q-out', 'employee'], ['q-hr', 'hr'], ['q-mgr2', 'approver']]) {
    const denied = await read(quoteId, user, role);
    assert.equal(denied.status, 404, `CATALOG-001 ${role} ${user} gets a 404 for another request's quote`);
    assert.ok(!JSON.stringify(denied.value).includes('synthetic-linen-quote'));
  }
  const share = await api(`/work/${work.id}/shares`, { email: 'q-out@example.test' }, as('q-req')); assert.equal(share.status, 201);
  assert.equal((await read(quoteId, 'q-out')).status, 404, 'CATALOG-001 a shared colleague does not read the quote');
  assert.equal((await api(`/attachments/${quoteId}`, undefined, as('q-op', 'operator'))).status, 404, 'CATALOG-001 the generic attachment door never serves a quote to an operator');
  assert.equal((await api(`/attachments/${quoteId}`, undefined, as('q-req'))).status, 200);

  // Non-readers see only that a quote is attached; readers see its details.
  const operatorView = await ok(`/work/${work.id}`, undefined, as('q-op', 'operator'));
  assert.deepEqual(operatorView.quotes, [{ attached: true, catalogId: software.id, submitted: true }], 'CATALOG-001 non-readers see only that a quote is attached');
  assert.ok(!JSON.stringify(operatorView).includes('synthetic-linen-quote') && !operatorView.attachments.length, 'CATALOG-001 the operator conversation shows no quote name or file');
  const requesterView = await ok(`/work/${work.id}`, undefined, as('q-req'));
  assert.equal(requesterView.quotes[0].name, quoteName); assert.ok(!requesterView.attachments.length, 'CATALOG-001 a quote is not an ordinary attachment');
  assert.deepEqual((await ok(`/work/${work.id}/catalog-requests`, undefined, as('q-op', 'operator'))).items[0].catalogSnapshot.quote, { attached: true }, 'CATALOG-001 request history shows non-readers only "quote attached"');
  assert.equal((await ok(`/work/${work.id}/catalog-requests`, undefined, as('q-req'))).items[0].catalogSnapshot.quote.id, quoteId);
  const history = (await ok(`/work/${work.id}/activity`, undefined, as('q-op', 'operator'))).items;
  assert.ok(history.some(h => h.action === 'Quote attached'), 'CATALOG-001 ticket history records that a quote was attached');
  assert.ok(!JSON.stringify(history).includes('synthetic-linen-quote'), 'CATALOG-001 ticket history never names the quote');
  assert.ok(!JSON.stringify((await ok(`/work/${work.id}/activity`, undefined, as('q-req'))).items).includes('synthetic-linen-quote'));
  for (const [user, role] of [['owner', 'owner'], ['q-op', 'operator']])
    assert.ok(!JSON.stringify((await ok(`/search?q=${encodeURIComponent('synthetic-linen-quote')}`, undefined, as(user, role))).items).includes('synthetic-linen-quote'), `CATALOG-001 ${role} search never matches a quote`);
  const holders = [];
  for (const { name } of (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all()).results)
    if (JSON.stringify((await db.prepare(`SELECT * FROM "${name}"`).all()).results).includes(quoteName)) holders.push(name);
  assert.deepEqual(holders, ['work_attachments'], 'CATALOG-001 the quote name and contents exist nowhere but its private file record: no notification, search, AI context, audit or history store');

  // The approver decides in the approval view, with the quote; a decided approver keeps read, a replaced undecided one loses it.
  const queue = (await ok('/fulfilment-decisions', undefined, as('q-mgr', 'approver'))).items.find(i => i.workId === work.id);
  assert.equal(queue.quote.id, quoteId, 'CATALOG-001 the approval view carries the quote the approver reads');
  assert.equal(queue.quote.sha256, sha(quoteBytes));
  await ok(`/work/${work.id}/fulfilment/approve`, { ...queue, expectedHolderId: queue.holderId, idempotencyKey: 'q-decision' }, as('q-mgr', 'approver'), 200);
  assert.equal((await db.prepare("SELECT detail_json FROM audit_events WHERE action='work.fulfilment_approved' AND instr(detail_json,?)>0").bind(sha(quoteBytes)).first()) !== null, true, 'CATALOG-001 the decision records the quote hash it covered');
  await db.exec("UPDATE work_people SET manager_id='q-mgr2',revision=2 WHERE id='q-req-person'");
  assert.equal((await read(quoteId, 'q-mgr', 'approver')).status, 200, 'CATALOG-001 an approver who recorded a decision keeps read of that quote revision');
  assert.equal((await read(quoteId, 'q-mgr2', 'approver')).status, 200, 'CATALOG-001 the new current approver reads the quote');
  await db.exec("UPDATE work_people SET manager_id='q-mgr',revision=3 WHERE id='q-req-person'");

  const second = await newWork('q-ben', 'q-software-two');
  const secondQuote = await put(second, software, 'q-ben'); assert.equal(secondQuote.status, 201);
  const secondSubmit = await submit(second, software, 'q-ben'); assert.equal(secondSubmit.status, 201);
  assert.equal((await db.prepare('SELECT count(*) n FROM work_fulfilment_approvals WHERE work_id=?').bind(second.id).first()).n, 0, 'CATALOG-001 a fresh submission carries no earlier approval');
  assert.equal((await read(secondQuote.value.id, 'q-mgr', 'approver')).status, 200);
  await db.exec("UPDATE work_people SET manager_id='q-mgr2',revision=2 WHERE id='q-ben-person'");
  assert.equal((await read(secondQuote.value.id, 'q-mgr', 'approver')).status, 404, 'CATALOG-001 an approver replaced before deciding loses the quote');
  assert.equal((await read(secondQuote.value.id, 'q-mgr2', 'approver')).status, 200);
  assert.equal((await read(secondQuote.value.id, 'q-req')).status, 404, 'CATALOG-001 another employee never reads it');

  // Staff on behalf: the requester is staff, the beneficiary reads, and a team-view manager does not (the item needs no approval).
  const behalf = await newWork('q-op', 'q-on-behalf', { beneficiaryId: 'q-ben' });
  const behalfQuote = await put(behalf, service, 'q-op'); assert.equal(behalfQuote.status, 201);
  assert.equal((await submit(behalf, service, 'q-op', { beneficiaryId: 'q-ben' })).status, 201, 'CATALOG-001 staff file a quote-backed item on someone\'s behalf');
  assert.equal((await read(behalfQuote.value.id, 'q-ben')).status, 200, 'CATALOG-001 the beneficiary reads the quote');
  assert.equal((await read(behalfQuote.value.id, 'q-op', 'operator')).status, 200);
  assert.equal((await read(behalfQuote.value.id, 'q-mgr', 'approver')).status, 404, 'CATALOG-001 a team-view manager outside the approval gets a 404');
  assert.equal((await read(behalfQuote.value.id, 'q-req')).status, 404);

  // Accounts and general services are tasks their owner completes, with no provider authority.
  const task = (await ok(`/work/${behalf.id}/obligations`, undefined, as('q-ben'))).items.find(d => d.kind === 'task.manual');
  assert.equal(task.owner_id, 'q-fulfil', 'CATALOG-001 a general-service item routes to its owner as a task');
  assert.equal((await db.prepare("SELECT count(*) n FROM execution_grants WHERE target IN ('quote-software','quote-service','quote-account')").first()).n, 0, 'CATALOG-001 quotes, forms and tasks grant no provider authority');
  assert.equal((await api(`/work/${behalf.id}/tasks/${task.id}/complete`, { revision: task.revision }, as('q-op', 'operator'))).status, 403, 'CATALOG-001 only the item owner completes an owner task');
  await ok(`/work/${behalf.id}/tasks/${task.id}/complete`, { revision: task.revision }, as('q-fulfil', 'operator'), 200);
  const accountWork = await newWork('q-req', 'q-account');
  const account = await api(`/work/${accountWork.id}/fulfilment`, { catalogId: plain.id, beneficiaryId: 'q-req', purpose: 'New mailbox' }, as('q-req'));
  assert.equal(account.status, 201, 'CATALOG-001 an account item submits without a quote or form');
  assert.equal((await db.prepare("SELECT count(*) n FROM work_obligations WHERE work_id=? AND kind='task.manual'").bind(accountWork.id).first()).n, 1);

  // The beneficiary's audience gates the quote door too.
  const salesWork = await newWork('q-req', 'q-restricted');
  assert.equal((await put(salesWork, restricted, 'q-req')).status, 201, 'CATALOG-001 an eligible requester attaches a quote to an audience-controlled item');
  const outWork = await newWork('q-out', 'q-restricted-out');
  const refused = await put(outWork, restricted, 'q-out');
  assert.equal(refused.status, 403); assert.equal(refused.value.error, "This item isn't available for you. If you think that's wrong, ask the service desk.", 'CATALOG-001 an ineligible employee cannot attach a quote to the item');
  assert.equal((await db.prepare('SELECT count(*) n FROM work_attachments WHERE work_id=?').bind(outWork.id).first()).n, 0);

  // Erasure removes the quote record and its bytes with the request's content.
  const erasedKey = `a/${second.id}/${secondQuote.value.id}`;
  assert.ok(await r2.head(erasedKey), 'the quote bytes exist before erasure');
  await ok('/people/q-ben/erase', { revision: 0, reason: 'CATALOG-001 erase the requester and beneficiary of a quote-backed request' }, {}, 200);
  assert.equal((await db.prepare('SELECT count(*) n FROM work_attachments WHERE id=?').bind(secondQuote.value.id).first()).n, 0, 'CATALOG-001 erasure removes the quote record');
  assert.equal(await r2.head(erasedKey), null, 'CATALOG-001 erasure deletes the quote bytes');
  assert.equal((await read(secondQuote.value.id, 'owner', 'owner')).status, 404);
  console.log('PASS CATALOG-001 vendor quote PDFs: type/size, required quote, frozen hash, immutability, exact readers with 404s, audited privileged reads, no search/history/notification/AI exposure, approver custody, accounts/services, audience at upload, erasure');
}
