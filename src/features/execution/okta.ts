import { id, now } from '../../platform/http';
import { assert } from './authority';
import { oktaClient, oktaItems } from './okta-client';
import type { CoreContext, Step } from './types';
const segment = (value: string) => encodeURIComponent(value);
export async function oktaObserve(ctx: CoreContext, step: Step, operationId: string) {
  const request = await oktaClient(ctx, step);
  const user = segment(step.beneficiaryId), target = segment(step.target);
  let matches = false, present = false;
  if (step.action.startsWith('okta.group.')) {
    const groups = await oktaItems(request, `/api/v1/users/${user}/groups`);
    present = groups.some(group => group.id === step.target);
    matches = present === step.action.endsWith('.add');
  } else if (step.action.startsWith('okta.app.')) {
    const response = await request(`/api/v1/apps/${target}/groups/${user}`);
    assert(response.ok || response.status === 404, 'provider_observation_failed', 503);
    if (response.ok) {
      const group: any = await response.json();
      assert(group.id === step.beneficiaryId, 'provider_target_mismatch', 502);
      present = true;
    }
    matches = present === step.action.endsWith('.assign');
  } else if (step.action === 'okta.sessions.clear') {
    const receipt: any = await ctx.env.DB.prepare("SELECT evidence_json FROM execution_verifications WHERE workspace_id=? AND operation_id=? AND state='provider_receipt' ORDER BY rowid DESC LIMIT 1")
      .bind(ctx.principal.workspaceId, operationId).first();
    if (receipt) {
      const { requestId, startedAt } = JSON.parse(receipt.evidence_json);
      const filter = `eventType eq "user.session.clear" and target.id eq ${JSON.stringify(step.target)}`;
      const events = await oktaItems(request, '/api/v1/logs?' + new URLSearchParams({ filter, since: startedAt, limit: '100' }));
      matches = events.some(event => event.outcome?.result === 'SUCCESS' &&
        event.debugContext?.debugData?.requestId === requestId &&
        Date.parse(event.published) >= Date.parse(startedAt) &&
        event.target?.some((t: any) => t.id === step.target));
    }
  } else if (step.action === 'okta.factors.reset') {
    present = (await oktaItems(request, `/api/v1/users/${target}/factors`)).length > 0;
    matches = !present;
  } else {
    const response = await request(`/api/v1/users/${target}`);
    assert(response.ok || response.status === 404, 'provider_observation_failed', 503);
    if (response.ok) {
      const account: any = await response.json();
      if (step.action === 'okta.user.create') {
        assert(account.profile?.login?.toLowerCase() === step.target.toLowerCase() && account.profile?.nickName === `linen:${operationId}`, 'preexisting_identity_not_owned', 409);
        matches = true;
      } else {
        assert(account.id === step.target, 'provider_target_mismatch', 502);
        const expected = step.action === 'okta.user.suspend' ? 'SUSPENDED' : step.action === 'okta.user.deactivate' ? 'DEPROVISIONED' : 'ACTIVE';
        matches = account.status === expected;
      }
      present = true;
    } else assert(step.action === 'okta.user.create', 'identity_missing', 409);
  }
  return { matches, present, observedAt: now(), target: step.target, beneficiaryId: step.beneficiaryId };
}
export async function oktaWrite(ctx: CoreContext, step: Step, operationId: string) {
  const request = await oktaClient(ctx, step, operationId);
  const target = segment(step.target), user = segment(step.beneficiaryId);
  let path: string, method = 'POST', body: unknown;
  if (step.action.startsWith('okta.group.')) {
    path = `/api/v1/groups/${target}/users/${user}`;
    method = step.action.endsWith('.add') ? 'PUT' : 'DELETE';
  } else if (step.action.startsWith('okta.app.')) {
    path = `/api/v1/apps/${target}/groups/${user}`;
    method = step.action.endsWith('.assign') ? 'PUT' : 'DELETE';
    if (method === 'PUT') body = {};
  } else if (step.action === 'okta.user.create') {
    const p = step.payload;
    assert(p && ['firstName', 'lastName', 'email', 'login'].every(key => typeof p[key] === 'string' && String(p[key]).length > 0 && String(p[key]).length <= 254) && p.login === step.target, 'identity_profile_required', 422);
    path = '/api/v1/users?activate=false';
    body = { profile: { firstName: p.firstName, lastName: p.lastName, email: p.email, login: p.login, nickName: `linen:${operationId}` } };
  } else if (step.action === 'okta.sessions.clear') {
    path = `/api/v1/users/${target}/sessions?oauthTokens=false&forgetDevices=false`;
    method = 'DELETE';
  } else {
    let lifecycle = step.action === 'okta.user.suspend' ? 'suspend' : step.action === 'okta.user.deactivate' ? 'deactivate' : step.action === 'okta.factors.reset' ? 'reset_factors' : 'activate';
    if (step.action === 'okta.user.activate') {
      const observed = await request(`/api/v1/users/${target}`);
      assert(observed.ok, 'provider_observation_failed', 503);
      const account: any = await observed.json();
      assert(account.id === step.target, 'provider_target_mismatch', 502);
      if (account.status === 'SUSPENDED') lifecycle = 'unsuspend';
    }
    path = `/api/v1/users/${target}/lifecycle/${lifecycle}?sendEmail=false`;
  }
  const startedAt = now(), response = await request(path, method, body);
  if (response.ok && step.action === 'okta.sessions.clear') {
    const requestId = response.headers.get('x-okta-request-id');
    assert(requestId, 'provider_receipt_missing', 503);
    await ctx.env.DB.prepare('INSERT INTO execution_verifications VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(id(), ctx.principal.workspaceId, operationId, 1, 1, step.target, step.beneficiaryId, 'provider_receipt', JSON.stringify({ requestId, startedAt }), now()).run();
  }
  return { accepted: response.ok, status: response.status, unknown: response.status >= 500 || response.status === 408 || (response.status >= 300 && response.status < 400) };
}
