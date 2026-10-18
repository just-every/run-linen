import assert from 'node:assert/strict';
import { action, signIn } from './connected-helpers.mjs';

export async function pendingPersonJourney({ browser, page, api, base, out, width, catalogIds }) {
  const name = width === 1440 ? 'Wes Calloway' : 'Nora Bennett',
    email = width === 1440 ? 'wes@northstar.example' : 'nora@northstar.example',
    startDate = '2026-10-26', team = width === 1440 ? 'Sales' : 'Design';
  async function capture(suffix, target = page) {
    assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow: ${suffix} at ${width}`);
    await target.evaluate(() => window.scrollTo(0, 0));
    await target.screenshot({ path: `${out}/${width}-${suffix}.png`, fullPage: true });
  }
  async function createPerson(personName, personEmail) {
    await page.goto(base + '/app#/lifecycle');
    const create = page.locator('details[data-action-path="/pending-people"]');
    await create.locator('summary').click();
    await create.locator('[name="name"]').fill(personName);
    await create.locator('[name="email"]').fill(personEmail);
    await create.locator('[name="startDate"]').fill(startDate);
    await create.locator('[name="team"]').fill(team);
    await create.getByRole('checkbox').check();
    await capture(personName === name ? 'review-person' : 'review-withdrawn-person');
    const saved = page.waitForResponse(r => r.url().endsWith('/pending-people') && r.request().method() === 'POST');
    await create.getByRole('button', { name: 'Add person', exact: true }).click();
    const response = await saved;
    assert.equal(response.status(), 201, await response.text());
    const person = await response.json();
    await page.getByRole('region', { name: personName, exact: true }).waitFor();
    return person;
  }
  let person = await createPerson(name, email);
  const card = page.getByRole('region', { name, exact: true });
  await card.getByText('Edit this person', { exact: true }).click();
  await capture('edit-person');
  await action(page, 'Edit this person', { name, email, startDate, team: `${team} Operations`, reviewed: true }, `/pending-people/${person.id}/edit`, 'Save person');
  await card.getByText(`${team} Operations`, { exact: true }).waitFor();
  await capture('person-edited');
  await card.getByRole('link', { name: `Request services for ${name}`, exact: true }).click();
  await page.getByLabel('Request for').waitFor();
  await page.getByRole('checkbox', { name: 'Work laptop', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Figma seat', exact: true }).check();
  await page.getByLabel('What would make work easier?').fill(`${name} starts Monday and needs a laptop and a Figma seat.`);
  await capture('prepare-services');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await page.waitForURL(/#\/work\/.+/);
  const workId = page.url().split('/').at(-1);
  await page.getByRole('heading', { name: 'Services waiting for an account', exact: true }).waitFor();
  await page.locator('.meta-strip').getByText(name, { exact: true }).waitFor();
  const held = await api(`/work/${workId}`);
  assert.equal(held.work.pending_person_id, person.id);
  assert.deepEqual(held.heldServices.map(s => s.catalog_id).sort(), [...catalogIds].sort());
  assert.ok(held.heldServices.every(s => s.state === 'held' && s.reason));
  assert.equal((await api(`/work/${workId}/obligations`)).items.length, 0);
  await capture('services-held');

  // Create the account through the normal owner form. Services remain held until the person signs in.
  await page.goto(base + '/app#/members');
  const memberForm = page.locator('details[data-action-path="/members"]');
  await memberForm.locator('[name="name"]').fill(name);
  await memberForm.locator('[name="email"]').fill(email);
  await memberForm.locator('[name="password"]').fill('synthetic-Pending-browser-2026');
  await memberForm.getByRole('checkbox', { name: 'Employee', exact: true }).check();
  const added = page.waitForResponse(r => r.url().endsWith('/members') && r.request().method() === 'POST');
  await memberForm.getByRole('button', { name: 'Save', exact: true }).click();
  const addedResponse = await added;
  assert.equal(addedResponse.status(), 201, await addedResponse.text());
  assert.ok((await api(`/work/${workId}`)).heldServices.every(s => s.state === 'held'));
  const employee = await browser.newContext({ viewport: { width, height: 1000 }, timezoneId: 'UTC' });
  try {
    const employeePage = await employee.newPage();
    await signIn(employeePage, base, email, 'synthetic-Pending-browser-2026');
    await employeePage.goto(base + `/app#/work/${workId}`);
    await employeePage.getByRole('heading', { name: 'Account linked', exact: true }).waitFor();
    await employeePage.getByRole('heading', { name: 'What’s ready, and what remains', exact: true }).waitFor();
    await capture('employee-request', employeePage);
    const released = await api(`/work/${workId}`);
    assert.equal(released.pendingPerson.state, 'bound');
    assert.ok(released.heldServices.every(s => s.state === 'released'));
    const duties = (await api(`/work/${workId}/obligations`)).items;
    assert.ok(duties.some(d => d.kind === 'device.deliver'));
    assert.ok(duties.some(d => d.kind === 'access.grant'));
    assert.ok(duties.every(d => d.state !== 'verified'));
    await page.goto(base + `/app#/work/${workId}`);
    await page.getByRole('heading', { name: 'Account linked', exact: true }).waitFor();
    await capture('services-released');
  } finally { await employee.close(); }

  const withdrawnName = width === 1440 ? 'Elliot Harper' : 'Maya Chen';
  person = await createPerson(withdrawnName, `cancel-${width}@northstar.example`);
  const waiting = await api('/work', { title: `${withdrawnName} onboarding`, body: 'Prepare the work laptop before the start date.', deduplicationKey: crypto.randomUUID(), pendingPersonId: person.id, catalogIds: [catalogIds[0]] });
  await page.getByRole('region', { name: withdrawnName, exact: true }).getByText('Withdraw this person', { exact: true }).click();
  await capture('withdraw-person');
  await action(page, 'Withdraw this person', { reason: 'The start has been cancelled.' }, `/pending-people/${person.id}/withdraw`, 'Withdraw person and cancel requests');
  await page.getByRole('region', { name: withdrawnName, exact: true }).getByText('This person was withdrawn.', { exact: false }).waitFor();
  await capture('person-withdrawn');
  await page.goto(base + `/app#/work/${waiting.id}`);
  await page.getByRole('heading', { name: 'Waiting services cancelled', exact: true }).waitFor();
  assert.equal((await api(`/work/${waiting.id}`)).work.state, 'cancelled');
  await capture('request-cancelled');
}
