import assert from 'node:assert/strict';
import { action } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';

/** DESK-017: native decisions and relationship forms append internal history,
 * while the same employee ticket continues to expose public events only. */
export async function relationshipActivityJourney({ agentPage, ownerApi, employeePage, employeeApi, base, out, managerId, employeeId, workId }) {
  const at = new Date().toISOString();
  const person = await ownerApi('/people', { source: 'Northstar personnel register', sourceId: employeeId,
    name: 'Erin Walsh', managerId, observedAt: at, effectiveAt: at });
  await ownerApi(`/people/${person.id}/binding`, { expectedRevision: person.revision, memberId: employeeId, managerId });
  const catalog = await ownerApi('/catalog', { name: 'VPN diagnostic group', kind: 'access', target: 'vpn-diagnostics', ownerId: managerId, requiresManager: true });
  await employeeApi(`/work/${workId}/fulfilment`, { catalogId: catalog.id, beneficiaryId: employeeId, purpose: 'Troubleshoot the recurring VPN interruption' });
  await agentPage.goto(`${base}/app#/decisions`);
  const card = agentPage.locator('article.decision').filter({ has: agentPage.getByRole('heading', { name: 'Laptop loses VPN connection', exact: true }) });
  const approved = agentPage.waitForResponse(r => r.url().endsWith(`/work/${workId}/fulfilment/approve`) && r.request().method() === 'POST');
  await card.getByRole('button', { name: 'Approve this request', exact: true }).click();
  assert.equal((await approved).status(), 200, 'DESK-017 a real native manager decision succeeds');

  const ask = await employeeApi(`/work/${workId}/messages`, { body: 'I also need a replacement docking cable.', visibility: 'public', sourceMessageId: 'desk017-dock' });
  const duplicate = await ownerApi('/work', { title: 'VPN disconnects during calls', body: 'Same laptop and VPN fault reported again.', beneficiaryId: employeeId, deduplicationKey: crypto.randomUUID() });
  await agentPage.goto(`${base}/app#/work/${workId}`);
  await agentPage.getByRole('heading', { level: 2, name: 'Laptop loses VPN connection', exact: true }).waitFor();
  const relations = agentPage.locator('details').filter({ has: agentPage.locator(':scope > summary').getByText('Related tickets and records', { exact: true }) });
  await relations.locator(':scope > summary').click();
  await action(agentPage, 'Link a record', { kind: 'engineering_issue', targetId: 'https://tracker.northstar.example/issues/NET-218' }, `/work/${workId}/links`, 'Link');
  await agentPage.reload();
  await agentPage.getByRole('heading', { level: 2, name: 'Laptop loses VPN connection', exact: true }).waitFor();
  await agentPage.getByText('Related tickets and records', { exact: true }).click();
  const split = await action(agentPage, 'Split messages into a new ticket', { title: 'Replacement docking cable', messageIds: [ask.id], reason: 'Separate hardware fulfillment' }, `/work/${workId}/split`, 'Split', 201);
  assert.ok(split.workId, 'DESK-017 the native split creates a separate ticket');
  await agentPage.goto(`${base}/app#/work/${split.workId}`);
  await agentPage.getByRole('heading', { level: 2, name: 'Replacement docking cable', exact: true }).waitFor();
  await agentPage.getByText('Related tickets and records', { exact: true }).click();
  await action(agentPage, 'Set a parent ticket', { parentId: workId }, `/work/${split.workId}/parent`, 'Set parent');
  await agentPage.goto(`${base}/app#/work/${duplicate.id}`);
  await agentPage.getByRole('heading', { level: 2, name: 'VPN disconnects during calls', exact: true }).waitFor();
  await agentPage.getByText('Related tickets and records', { exact: true }).click();
  await action(agentPage, 'Merge this ticket into another', { intoId: workId, reason: 'Same employee and VPN fault' }, `/work/${duplicate.id}/merge`, 'Merge duplicate');
  assert.equal((await ownerApi(`/work/${duplicate.id}`)).work.state, 'closed', 'DESK-017 the duplicate is closed');

  for (const [id, name, expected] of [
    [workId, 'survivor', ['Fulfilment approved', 'Engineering issue link: none → https://tracker.northstar.example/issues/NET-218', `Split into: none → ${split.workId}`, `Merged duplicate: none → ${duplicate.id}`]],
    [split.workId, 'split', [`Split from: none → ${workId}`, `Parent: none → ${workId}`]],
    [duplicate.id, 'duplicate', ['State: open → closed', `Merged into: none → ${workId}`]],
  ]) {
    await agentPage.goto(`${base}/app#/work/${id}`);
    const activity = agentPage.getByRole('list', { name: 'Ticket activity', exact: true });
    for (const text of expected) await activity.getByText(text, { exact: false }).first().waitFor();
    for (const width of [1440]) {
      await agentPage.setViewportSize({ width, height: 1000 });
      await activity.scrollIntoViewIfNeeded();
      await captureJourney(agentPage, { path: `${out}/DESK-017-${name}-relationships-${width}.png`, fullPage: true });
    }
  }
  await employeePage.goto(`${base}/app#/work/${workId}`);
  const publicActivity = employeePage.getByRole('list', { name: 'Ticket activity', exact: true });
  await publicActivity.getByText('I also need a replacement docking cable.', { exact: true }).waitFor();
  assert.equal(await publicActivity.getByText('Internal activity', { exact: true }).count(), 0, 'DESK-017 no approval or relationship fields reach the employee');
  assert.ok(!(await publicActivity.innerText()).includes('vpn-diagnostics'), 'DESK-017 the approval payload remains internal');
  for (const width of [1440]) {
    await employeePage.setViewportSize({ width, height: 1000 });
    await captureJourney(employeePage, { path: `${out}/DESK-017-employee-after-relationships-${width}.png`, fullPage: true });
  }
}
