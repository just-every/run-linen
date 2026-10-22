import {approvalChainJourney} from './approval-chain-journey.mjs';
import assert from 'node:assert/strict';

export async function fulfilmentDecisionJourney(page, api, base, managerId) {
  const member = await api('/members', {
    name:'Synthetic beneficiary', email:`approval-${crypto.randomUUID()}@example.test`,
    password:'Browser-proof-2026', roles:['employee'], isPerson:true,
  });
  let person = (await api('/people')).items.find(item => item.id === member.personId);
  assert.notEqual(person.id, member.id);
  person = await api(`/people/${person.id}/binding`, {
    expectedRevision:person.revision, memberId:member.id, managerId,
  });
  const catalog = await api('/catalog', {name:'Synthetic managed service',kind:'access',target:'synthetic-managed-service',ownerId:managerId,requiresManager:true});
  const work = await api('/work', {title:'Synthetic catalogue decision',body:'Synthetic request',beneficiaryId:member.id,deduplicationKey:crypto.randomUUID()});
  // The owner chooses the service on the request's own form: it is recorded for the request's person, not the owner.
  await page.goto(`${base}/app#/work/${work.id}`);
  const chooser = page.locator('details').filter({has:page.getByText('Or choose a known service',{exact:true})});
  await chooser.getByText('Or choose a known service',{exact:true}).click();
  await chooser.getByLabel(/^Service/).selectOption(catalog.id);
  await chooser.getByLabel(/What do you need it for/).fill('Synthetic approval check');
  await chooser.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByText('What’s ready, and what remains',{exact:true}).waitFor();
  assert.equal((await api(`/work/${work.id}/fulfilments/${catalog.id}`)).beneficiaryId, member.id,
    'a service chosen for a request is recorded for the person the request is for');
  const grantsBefore = (await api('/grants')).length;
  const currentDecision = async () => (await api('/fulfilment-decisions')).items.find(item => item.workId === work.id);
  async function replacePerson() {
    await api(`/people/${person.id}/binding`, {expectedRevision:person.revision,memberId:null});
    const stamp = new Date().toISOString();
    const next = await api('/people', {source:'synthetic-progress',sourceId:crypto.randomUUID(),name:'Synthetic beneficiary',managerId,effectiveAt:stamp,observedAt:stamp});
    const bound = await api(`/people/${next.id}/binding`, {expectedRevision:next.revision,memberId:member.id});
    assert.equal(bound.revision, person.revision, 'replacement has the same numeric person revision');
    person = bound;
  }
  await page.goto(base+'/app#/decisions');
  await page.getByRole('heading',{name:'Catalog approvals',exact:true}).waitFor();
  const card = page.locator('article.decision').filter({has:page.getByRole('heading',{name:'Synthetic catalogue decision',exact:true})});
  const approve = card.getByRole('button',{name:'Approve this request',exact:true});
  async function submit() {
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith(`/work/${work.id}/fulfilment/approve`) && r.request().method() === 'POST'),
      approve.click(),
    ]);
    return response;
  }
  await replacePerson();
  assert.equal((await submit()).status(), 409, 'a stale displayed binding cannot silently approve its replacement');
  const reviewed = card.getByRole('checkbox');
  await reviewed.waitFor();
  assert.equal(await approve.isDisabled(), true, 'changed details require review');
  await reviewed.check();
  const first = await submit();
  assert.equal(first.status(), 200, await first.text());
  await page.getByText('Business approval recorded.',{exact:false}).waitFor();
  assert.equal(await currentDecision(), undefined);
  assert.equal((await api('/grants')).length, grantsBefore);
  await replacePerson();
  await page.reload();
  await approve.waitFor();
  const second = await submit();
  assert.equal(second.status(), 200, await second.text());
  assert.notEqual(second.request().postDataJSON().idempotencyKey, first.request().postDataJSON().idempotencyKey,
    'refreshed binding gets a fresh decision identity without changing work or fulfilment revisions');
  await page.getByText('Business approval recorded.',{exact:false}).waitFor();
  assert.equal(await currentDecision(), undefined);
  assert.equal((await api('/grants')).length, grantsBefore);
  await approvalChainJourney(page,api,base,managerId);
}
