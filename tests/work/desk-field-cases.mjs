import assert from 'node:assert/strict';
/** DESK-010: custom fields per ticket type, a named status mapped to the bound SLA policy's pauses, and the resolution
 * rule on the console/API close, bulk update and automatic merge, counted by code in REPORT-001, through public routes. */
export async function deskFieldChecks(workspaceApi, db) {
  const api = (path, body, headers = {}) => workspaceApi(path, body, { 'x-workspace': 'desk010', ...headers });
  const check = (r, status = 200) => { assert.equal(r.status, status, 'DESK-010 ' + JSON.stringify(r)); return r.value; };
  const employee = { 'x-user': 'employee', 'x-roles': '["employee"]' }, colleague = { 'x-user': 'stranger', 'x-roles': '["employee"]' };
  const agent = { 'x-user': 'desk010-agent', 'x-roles': '["operator"]' };
  await db.exec(`INSERT INTO workspaces VALUES('desk010','Desk 010','2026-01-01'); INSERT INTO users VALUES('desk010-agent','agent010@test','Riley Agent','unused','2026-01-01'); INSERT INTO memberships VALUES('desk010','owner','["owner"]',1); INSERT INTO memberships VALUES('desk010','employee','["employee"]',1); INSERT INTO memberships VALUES('desk010','stranger','["employee"]',1); INSERT INTO memberships VALUES('desk010','desk010-agent','["operator"]',1);`);
  const start = new Date(Date.now() - 60000).toISOString();

  // The owner (acting for admin) adds an Office dropdown and an Awaiting parts status that waits on a vendor.
  const office = { name: 'Office', type: 'dropdown', options: ['Denver', 'Austin'], kinds: ['incident', 'service_request'] };
  check(await api('/desk-fields', office, agent), 403);
  check(await api('/desk-fields', { ...office, options: [] }), 422);
  const officeField = check(await api('/desk-fields', office), 201);
  check(await api('/desk-fields', office), 409);
  check(await api('/desk-statuses', { name: 'Closed', waitingOn: 'vendor' }), 422);
  check(await api('/desk-statuses', { name: 'Awaiting parts', waitingOn: 'vendor' }, agent), 403);
  const parts = check(await api('/desk-statuses', { name: 'Awaiting parts', waitingOn: 'vendor' }), 201);
  let settings = check(await api('/desk-settings', undefined, agent));
  assert.deepEqual(settings.resolutionCodes.codes, ['Solved (workaround)', 'Solved (permanent fix)', 'Not reproducible', 'Duplicate', 'No response']);
  check(await api('/desk-settings', undefined, employee), 403);

  // One policy pauses for vendors (P2), the other only for requesters (P3).
  check(await api('/sla-policies', { name: 'P2 vendor pauses', position: 1, priority: 'P2', firstResponseMinutes: 60, nextResponseMinutes: 120, resolutionMinutes: 480, pauseOn: ['vendor'] }), 201);
  check(await api('/sla-policies', { name: 'P3 requester pauses', position: 2, priority: 'P3', firstResponseMinutes: 60, nextResponseMinutes: 120, resolutionMinutes: 480, pauseOn: ['requester'] }), 201);
  async function ticket(key, kind, priority) {
    const work = check(await api('/work', { title: `Laptop ${key}`, body: 'The laptop will not charge.', kind, deduplicationKey: `desk010-${key}` }, employee), 201);
    if (priority) check(await api(`/work/${work.id}/classification/override`, { type: kind, category: 'hardware', subcategory: 'laptop', impact: 'low', urgency: 'high', priority, revision: 0, workRevision: work.revision, reason: 'One person cannot work.' }));
    return check(await api(`/work/${work.id}`)).work;
  }
  const command = async (work, body, headers = agent, status = 200) => {
    const current = check(await api(`/work/${work.id}`)).work;
    return check(await api(`/work/${work.id}/commands`, { revision: current.revision, ...body }, headers), status);
  };

  // Agents set the field; the requester reads it with the ticket and cannot write it; other employees cannot read it.
  const a = await ticket('a', 'incident', 'P2');
  check(await api(`/work/${a.id}/fields`, { fieldId: officeField.id, value: 'Boston' }, agent), 422);
  check(await api(`/work/${a.id}/fields`, { fieldId: officeField.id, value: 'Denver' }, employee), 403);
  check(await api(`/work/${a.id}/fields`, { fieldId: officeField.id, value: 'Denver' }, agent));
  assert.deepEqual(check(await api(`/work/${a.id}/desk`, undefined, employee)).fields.map(f => [f.name, f.value]), [['Office', 'Denver']]);
  check(await api(`/work/${a.id}/desk`, undefined, colleague), 404);
  // Typed values survive the public door and history stores the original native values.
  const typed=[];
  for(const [type,value] of [['number',42.75],['boolean',false],['date','2026-10-20'],['multiselect',['one','two']]]){
    const f=check(await api('/desk-fields',{name:`synthetic-linen-${type}`,type,options:type==='multiselect'?['one','two']:[],kinds:['incident']}),201);
    check(await api(`/work/${a.id}/fields`,{fieldId:f.id,value},agent));typed.push({f,value});
    assert.deepEqual(check(await api(`/work/${a.id}/desk`,undefined,employee)).fields.find(x=>x.id===f.id).value,value);
  }
  check(await api(`/work/${a.id}/fields`,{fieldId:typed[2].f.id,value:'2026-02-30'},agent),422);
  const fieldHistory=check(await api(`/work/${a.id}/activity`,undefined,agent)).items;
  for(const {f,value} of typed)assert.ok(fieldHistory.some(e=>e.changes.some(c=>c.field===f.name&&c.before===null&&JSON.stringify(c.after)===JSON.stringify(value))));
  check(await api(`/work/${a.id}/fields`,{fieldId:typed[0].f.id,value:42.75},agent));
  assert.equal(check(await api(`/work/${a.id}/activity`,undefined,agent)).items.filter(e=>e.action==='field set').length,fieldHistory.filter(e=>e.action==='field set').length,'No-op field save creates no change');
  check(await api(`/work/${a.id}/fields`,{fieldId:typed[0].f.id,value:43},agent));
  const edited=check(await api(`/work/${a.id}/activity`,undefined,agent)).items;
  assert.ok(edited.some(e=>e.changes.some(c=>c.field===typed[0].f.name&&c.before===42.75&&c.after===43)));
  assert.ok(edited.some(e=>e.changes.some(c=>c.field===typed[0].f.name&&c.before===null&&c.after===42.75)),'Earlier value remains original after a later edit');


  // Awaiting parts pauses the SLA under the vendor-pausing policy; under the requester-only policy the clock keeps running.
  await command(a, { command: 'pause', reason: 'Replacement charger ordered', statusId: parts.id });
  let sla = check(await api(`/work/${a.id}/sla`));
  assert.deepEqual([sla.pauses.at(-1).status, sla.pauses.at(-1).waiting_on, sla.pauses.at(-1).stopsClock, sla.resolution.state], ['Awaiting parts', 'vendor', true, 'paused'], 'DESK-010 Awaiting parts pauses the SLA');
  assert.equal(check(await api(`/work/${a.id}/desk`, undefined, employee)).status.name, 'Awaiting parts');
  const b = await ticket('b', 'incident', 'P3');
  await command(b, { command: 'pause', reason: 'Replacement charger ordered', statusId: parts.id, waitingOn: 'requester' }, agent, 422);
  await command(b, { command: 'pause', reason: 'Replacement charger ordered', statusId: parts.id });
  sla = check(await api(`/work/${b.id}/sla`));
  assert.deepEqual([sla.pauses.at(-1).stopsClock, sla.resolution.state], [false, 'running'], 'DESK-010 the status obeys the bound policy and never overrides it');

  // An incident is refused without a resolution code from the API and from a bulk update; a service request closes with close notes.
  const c = await ticket('c', 'service_request');
  await command(a, { command: 'close', reason: 'Charger replaced' }, agent, 422);
  await command(a, { command: 'close', reason: 'Charger replaced', resolutionCode: 'Fixed somehow' }, agent, 422);
  await command(c, { command: 'pause', reason: 'x', resolutionCode: 'Duplicate' }, agent, 422);
  check(await api('/work/bulk-commands', { workIds: [a.id], command: 'close', reason: 'Bulk tidy' }, employee), 403);
  const bulk = check(await api('/work/bulk-commands', { workIds: [a.id, c.id], command: 'close', reason: 'Charger replaced at the desk' }));
  assert.deepEqual(bulk.items.map(i => [i.workId, i.ok]), [[a.id, false], [c.id, true]], 'DESK-010 the bulk update refuses the incident without a code and closes the service request');
  assert.match(bulk.items[0].error.message, /resolution code/);
  assert.equal(check(await api(`/work/${a.id}`)).work.state, 'paused');
  assert.deepEqual(check(await api(`/work/${c.id}/desk`, undefined, employee)).resolution.closeNotes, 'Charger replaced at the desk');

  // With a code and close notes the incident closes; both show on the record to the agent and the requester.
  await command(a, { command: 'close', reason: 'Charger replaced; battery health normal', resolutionCode: 'Solved (permanent fix)' });
  const resolved = check(await api(`/work/${a.id}/desk`, undefined, employee)).resolution;
  assert.deepEqual([resolved.code, resolved.closeNotes, resolved.resolvedBy], ['Solved (permanent fix)', 'Charger replaced; battery health normal', 'Riley Agent']);

  // A field required on close for incidents holds on every close; bulk closes then succeed with a code.
  check(await api('/desk-fields', { name: 'Root cause', type: 'text', kinds: ['incident'], requiredOn: ['closed'] }), 201);
  const d = await ticket('d', 'incident', 'P2');
  const bulkD = check(await api('/work/bulk-commands', { workIds: [d.id], command: 'close', reason: 'Fixed', resolutionCode: 'Solved (workaround)' }));
  assert.match(bulkD.items[0].error.message, /Root cause/);
  const rootCause = check(await api('/desk-settings')).fields.find(f => f.name === 'Root cause');
  check(await api(`/work/${d.id}/fields`, { fieldId: rootCause.id, value: 'Worn charging port' }, agent));
  assert.equal(check(await api('/work/bulk-commands', { workIds: [d.id], command: 'close', reason: 'Loaner issued while the port is replaced', resolutionCode: 'Solved (workaround)' })).changed, 1);
  // A field can be required on a named status too: Awaiting parts needs the vendor case on service requests.
  check(await api('/desk-fields', { name: 'Vendor case', type: 'text', kinds: ['service_request'], requiredOn: ['awaiting'] }), 422);
  const vendorCase = check(await api('/desk-fields', { name: 'Vendor case', type: 'text', kinds: ['service_request'], requiredOn: [parts.id] }), 201);
  const i = await ticket('i', 'service_request');
  assert.match((await command(i, { command: 'pause', reason: 'Dock ordered', statusId: parts.id }, agent, 422)).error, /Vendor case/);
  check(await api(`/work/${i.id}/fields`, { fieldId: vendorCase.id, value: 'DELL-5521' }, agent));
  await command(i, { command: 'pause', reason: 'Dock ordered', statusId: parts.id });

  // A merge is an automatic close: it records Duplicate and its closing line, and is refused while a required field is empty.
  const e = await ticket('e', 'service_request'), f = await ticket('f', 'service_request');
  check(await api(`/work/${e.id}/merge`, { intoId: f.id, reason: 'Same charger' }, agent));
  const duplicate = check(await api(`/work/${e.id}/desk`, undefined, employee)).resolution;
  assert.equal(duplicate.code, 'Duplicate', 'DESK-010 a merged duplicate records the Duplicate code');
  assert.match(duplicate.closeNotes, /merged into ticket/);
  const g = await ticket('g', 'incident', 'P2'), h = await ticket('h', 'incident', 'P2');
  check(await api(`/work/${g.id}/merge`, { intoId: h.id, reason: 'Same charger' }, agent), 422);

  // The owner edits the list; the system codes stay; a stale save is refused.
  check(await api('/resolution-codes', { codes: ['Hardware replaced'], revision: 0 }, agent), 403);
  settings = check(await api('/resolution-codes', { codes: ['Solved (workaround)', 'Solved (permanent fix)', 'Hardware replaced'], revision: 0 }));
  assert.deepEqual(settings.codes, ['Solved (workaround)', 'Solved (permanent fix)', 'Hardware replaced', 'Duplicate', 'No response']);
  check(await api('/resolution-codes', { codes: ['Other'], revision: 0 }), 409);
  check(await api(`/work/${h.id}/fields`, { fieldId: rootCause.id, value: 'Firmware' }, agent));
  await command(h, { command: 'close', reason: 'Firmware updated', resolutionCode: 'Not reproducible' }, agent, 422);
  await command(h, { command: 'close', reason: 'Charger swapped', resolutionCode: 'Hardware replaced' });

  // REPORT-001 counts the closed tickets by their recorded code.
  const report = check(await api(`/reports/work?from=${encodeURIComponent(start)}&to=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}&timezone=UTC`));
  const counts = Object.fromEntries(report.resolutions.counts.map(r => [r.code ?? 'none', r.count]));
  assert.deepEqual(counts, { 'Solved (permanent fix)': 1, 'Solved (workaround)': 1, 'Hardware replaced': 1, Duplicate: 1, none: 1 }, 'DESK-010 REPORT-001 counts resolutions by code');
  assert.equal(report.resolutions.denominator, 5);
  console.log('PASS DESK-010 public routes: Office dropdown per ticket type, Awaiting parts as a vendor wait under the bound policy, resolution code and close notes required on API, bulk and merge closes, owner-edited codes, REPORT-001 counts by code');
}
