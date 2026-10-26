// Developer-only held-key journey. Inject OKTA_ORG_URL and OKTA_API_TOKEN through
// _od08-env.py. Never include credentials in command arguments or saved evidence.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { applyMigrations } from '../sql-migrations.mjs';

class JourneyError extends Error {
  constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
const check = (value, code) => { if (!value) throw new JourneyError(code); };
const safeCode = value => typeof value === 'string' && /^[A-Za-z0-9_]{1,100}$/.test(value) ? value : 'unclassified_error';
const hash = value => createHash('sha256').update(value).digest('hex');
const startedAt = new Date().toISOString();
const seed = 'synthetic-linen-' + randomUUID();
const cohort = { login: seed + '@example.test', stagedLogin: seed + '-staged@example.test' };
const checks = {};
const counts = { providerRequests: 0, nativeRequests: 0, operations: 0, cleanupFailures: 0 };
let org, apiToken, directory, mf, db, failure, appId, groupId, userId, stagedId, sessionId;

async function provider(method, path, body, accepted = [200, 201, 204], authenticated = true) {
  const url = new URL(path, org);
  check(url.origin === org && url.pathname.startsWith('/api/v1/'), 'provider_url_scope');
  counts.providerRequests++;
  const response = await fetch(url, {
    method, redirect: 'manual', signal: AbortSignal.timeout(30000),
    headers: { Accept: 'application/json', ...(authenticated ? { Authorization: `SSWS ${apiToken}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let value; try { value = text ? JSON.parse(text) : null; } catch { throw new JourneyError('provider_invalid_json', response.status); }
  if (!accepted.includes(response.status)) throw new JourneyError(safeCode(value?.errorCode || 'provider_http_error'), response.status);
  return { status: response.status, value, link: response.headers.get('link') };
}
async function items(path) {
  const found = [];
  for (let page = 0; path && page < 20; page++) {
    const response = await provider('GET', path);
    check(Array.isArray(response.value), 'provider_list_shape');
    found.push(...response.value);
    path = response.link?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
  }
  check(!path, 'provider_pagination_limit');
  return found;
}
async function eventually(probe, code, attempts = 24) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await probe()) return;
    if (attempt + 1 < attempts) await delay(5000);
  }
  throw new JourneyError(code);
}
async function native(path, body, actor, expected = 200) {
  counts.nativeRequests++;
  const response = await mf.dispatchFetch('http://localhost/api/v1' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost',
      ...(actor ? { Cookie: actor.cookie, 'X-Linen-CSRF': actor.csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let value; try { value = await response.json(); } catch { throw new JourneyError('native_invalid_json', response.status); }
  if (response.status !== expected) throw new JourneyError(safeCode(value?.error?.code || value?.code || 'native_http_error'), response.status);
  return { value, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(email, password) {
  const response = await native('/login', { email, password });
  check(response.cookie, 'native_session_cookie_missing');
  const actor = { cookie: response.cookie };
  const session = (await native('/session', undefined, actor)).value;
  return { ...actor, csrfToken: session.csrfToken, id: session.principal.userId };
}
async function runEffect(owner, operator, connection, work, action, target, beneficiaryId, payload = {}) {
  console.log(`START native Okta effect ${action}`);
  const scope = { action, target, beneficiaryId, connectionId: connection.id, actionVersion: 1 };
  const grant = (await native('/grants', { ...scope, principalId: operator.id,
    validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: new Date(Date.now() + 3600000).toISOString(),
    maxUses: 1, conditions: { payloadHash: hash(JSON.stringify(payload)) } }, owner, 201)).value;
  const plan = (await native('/plans', { workId: work.id, revision: work.revision,
    idempotencyKey: randomUUID(), steps: [{ ...scope, grantId: grant.id, grantVersion: grant.version, payload }] }, operator, 201)).value;
  const dispatched = (await native(`/plans/${plan.id}/dispatch`, { expectedRevision: plan.revision }, operator)).value;
  check(Array.isArray(dispatched) && dispatched.length === 1, 'native_operation_missing');
  const operationId = dispatched[0].id;
  await native('/execution/process', {}, operator);
  try { await eventually(async () => {
    const operation = (await native('/operations', undefined, operator)).value.find(item => item.id === operationId);
    check(operation, 'native_operation_readback_missing');
    if (operation.state === 'effect_verified') return true;
    check(['submitted', 'unknown', 'running'].includes(operation.state), 'native_effect_' + safeCode(operation.last_error || operation.state));
    await native(`/operations/${operationId}/reconcile`, {}, operator);
    return false;
  }, 'native_effect_unverified', action === 'okta.sessions.clear' ? 60 : 24); }
  catch (error) {
    const attempts = (await db.prepare('SELECT kind,state,http_status,count(*) count FROM execution_provider_attempts WHERE connection_id=? GROUP BY kind,state,http_status').bind(connection.id).all()).results;
    console.log('Provider attempt summary ' + JSON.stringify(attempts));
    if (action === 'okta.sessions.clear') {
      const row = await db.prepare("SELECT evidence_json FROM execution_verifications WHERE operation_id=? AND state='provider_receipt' ORDER BY rowid DESC LIMIT 1").bind(operationId).first();
      if (row) {
        const receipt = JSON.parse(row.evidence_json);
        const filter = `eventType eq "user.session.clear" and target.id eq "${target}"`;
        const events = await items('/api/v1/logs?' + new URLSearchParams({filter,since:new Date(Date.parse(receipt.startedAt)-60000).toISOString(),until:new Date().toISOString(),limit:'100'}));
        console.log('Session event summary ' + JSON.stringify(events.map(event=>({successful:event.outcome?.result==='SUCCESS',requestMatches:event.debugContext?.debugData?.requestId===receipt.requestId,targetMatches:event.target?.some(item=>item.id===target),timeDeltaMs:Date.parse(event.published)-Date.parse(receipt.startedAt)}))));
      }
    }
    throw error;
  }
  counts.operations++;
  console.log(`PASS native Okta effect ${action}`);
  return operationId;
}
async function sessionEvidence(operationId, target) {
  // Read-only receipt inspection ties the independent System Log query to this
  // exact product request; it neither writes a result nor bypasses execution.
  const row = await db.prepare("SELECT evidence_json FROM execution_verifications WHERE operation_id=? AND state='provider_receipt' ORDER BY rowid DESC LIMIT 1")
    .bind(operationId).first();
  check(row, 'session_receipt_missing');
  const receipt = JSON.parse(row.evidence_json);
  check(typeof receipt.requestId === 'string' && Number.isFinite(Date.parse(receipt.startedAt)), 'session_receipt_invalid');
  await eventually(async () => {
    const filter = `eventType eq "user.session.clear" and target.id eq "${target}"`;
    const events = await items('/api/v1/logs?' + new URLSearchParams({ filter, since: receipt.startedAt, until: new Date().toISOString(), limit: '100' }));
    return events.some(event => event.eventType === 'user.session.clear' && event.outcome?.result === 'SUCCESS'
      && event.target?.some(item => item.id === target) && Date.parse(event.published) >= Date.parse(receipt.startedAt)
      && event.debugContext?.debugData?.requestId === receipt.requestId);
  }, 'session_log_not_correlated', 60);
}
async function cleanup() {
  const attempt = async action => { try { await action(); } catch { counts.cleanupFailures++; } };
  if (appId) await attempt(async () => {
    const app = (await provider('GET', `/api/v1/apps/${appId}`, undefined, [200, 404])).value;
    if (!app || app.errorCode) return;
    check(app.label === seed, 'cleanup_app_scope');
    if (app.status === 'ACTIVE') await provider('POST', `/api/v1/apps/${appId}/lifecycle/deactivate`);
    await provider('DELETE', `/api/v1/apps/${appId}`);
    check((await provider('GET', `/api/v1/apps/${appId}`, undefined, [200, 404])).status === 404, 'cleanup_app_remains');
  });
  if (groupId) await attempt(async () => {
    const response = await provider('GET', `/api/v1/groups/${groupId}`, undefined, [200, 404]);
    if (response.status === 404) return;
    check(response.value.profile?.name === seed, 'cleanup_group_scope');
    await provider('DELETE', `/api/v1/groups/${groupId}`);
    check((await provider('GET', `/api/v1/groups/${groupId}`, undefined, [200, 404])).status === 404, 'cleanup_group_remains');
  });
  for (const [knownId, loginName] of [[userId, cohort.login], [stagedId, cohort.stagedLogin]]) await attempt(async () => {
    const response = await provider('GET', `/api/v1/users/${encodeURIComponent(knownId || loginName)}`, undefined, [200, 404]);
    if (response.status === 404) return;
    const account = response.value;
    check(account.profile?.login === loginName, 'cleanup_user_scope');
    if (account.status !== 'DEPROVISIONED') {
      await provider('POST', `/api/v1/users/${account.id}/lifecycle/deactivate?sendEmail=false`);
      await eventually(async () => (await provider('GET', `/api/v1/users/${account.id}`)).value.status === 'DEPROVISIONED', 'cleanup_user_deactivation');
    }
    await provider('DELETE', `/api/v1/users/${account.id}?sendEmail=false`);
    check((await provider('GET', `/api/v1/users/${account.id}`, undefined, [200, 404])).status === 404, 'cleanup_user_remains');
  });
}

try {
  const suppliedOrg = process.env.OKTA_ORG_URL;
  apiToken = process.env.OKTA_API_TOKEN;
  check(suppliedOrg && apiToken, 'held_okta_environment_required');
  const parsed = new URL(suppliedOrg);
  check(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port
    && parsed.origin === suppliedOrg && /^integrator-[a-z0-9-]+\.okta(?:preview)?\.com$/.test(parsed.hostname), 'held_integrator_origin_required');
  org = parsed.origin;
  const require = createRequire(import.meta.url), wr = createRequire(require.resolve('wrangler/package.json'));
  const { build } = wr('esbuild'), { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = wr('miniflare');
  directory = await mkdtemp(join(tmpdir(), 'linen-okta-live-'));
  await build({ entryPoints: ['tests/execution/okta-live-worker.ts'], outfile: join(directory, 'worker.mjs'),
    bundle: true, format: 'esm', platform: 'neutral', logLevel: 'silent' });
  mf = new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0),
    modules: true, script: await readFile(join(directory, 'worker.mjs'), 'utf8'), compatibilityDate: '2026-09-08',
    compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['ATTACHMENTS'],
    bindings: { ENCRYPTION_KEY: randomBytes(32).toString('base64'), SESSION_SECRET: randomBytes(32).toString('hex') },
    log: new Log(LogLevel.NONE) }));
  db = await mf.getD1Database('DB');
  await applyMigrations(db);
  const password = 'Ll!' + randomBytes(30).toString('base64url');
  const ownerEmail = 'synthetic-linen-1@example.test', operatorEmail = 'synthetic-linen-2@example.test';
  await native('/setup', { email: ownerEmail, password, name: 'synthetic-linen-1', workspaceName: seed }, undefined, 201);
  const owner = await login(ownerEmail, password);
  await native('/members', { email: operatorEmail, password, name: 'synthetic-linen-2', roles: ['operator'] }, owner, 201);
  const operator = await login(operatorEmail, password);
  check(owner.id !== operator.id, 'independent_operator_required');
  checks.nativeAuthentication = true;
  const connection = (await native('/connections', { provider: 'okta', name: seed, config: { orgUrl: org },
    secret: JSON.stringify({ apiToken }) }, owner, 201)).value;
  const validated = (await native(`/connections/${connection.id}/test`, { revision: 1 }, owner)).value;
  check(validated.status === 'active', 'connection_not_active');
  checks.nativeConnectionValidation = true;
  const work = (await native('/work', { title: seed, body: 'Held Integrator acceptance cohort', deduplicationKey: seed }, operator, 201)).value;
  groupId = (await provider('POST', '/api/v1/groups', { profile: { name: seed, description: seed } })).value.id;
  appId = (await provider('POST', '/api/v1/apps', { name: 'bookmark', label: seed, signOnMode: 'BOOKMARK',
    settings: { app: { requestIntegration: false, url: 'https://example.test/' } } })).value.id;
  userId = (await provider('POST', '/api/v1/users?activate=true', { profile: { firstName: 'Synthetic', lastName: 'Linen',
    email: cohort.login, login: cohort.login }, credentials: { password: { value: password } } })).value.id;
  check(groupId && appId && userId, 'cohort_setup_incomplete');
  await eventually(async () => (await provider('GET', `/api/v1/users/${userId}`)).value.status === 'ACTIVE', 'cohort_user_not_active');
  const effect = (action, target, beneficiary = target, payload) => runEffect(owner, operator, connection, work, action, target, beneficiary, payload);
  await effect('okta.group.add', groupId, userId);
  await eventually(async () => (await items(`/api/v1/groups/${groupId}/users`)).some(user => user.id === userId), 'group_add_readback');
  checks.groupAdded = true;
  await effect('okta.app.assign', appId, groupId);
  await eventually(async () => {
    const assigned = await provider('GET', `/api/v1/apps/${appId}/users/${userId}`, undefined, [200, 404]);
    return assigned.status === 200 && assigned.value.id === userId && assigned.value.scope === 'GROUP';
  }, 'group_app_user_readback');
  check((await provider('GET', `/api/v1/apps/${appId}/groups/${groupId}`)).value.id === groupId, 'app_group_readback');
  checks.appAssignedThroughGroup = true;
  // Org sign-in policy may require an interactive challenge. That leaves the
  // optional positive-session check false; the correlated product clear is required.
  const authn = await provider('POST', '/api/v1/authn', { username: cohort.login, password }, [200, 400, 401, 403, 404], false);
  checks.positiveSessionAuthenticationAccepted = authn.status === 200;
  if (authn.value?.status === 'SUCCESS' && authn.value.sessionToken) {
    sessionId = (await provider('POST', '/api/v1/sessions', { sessionToken: authn.value.sessionToken })).value.id;
    check(sessionId && (await provider('GET', `/api/v1/sessions/${sessionId}`)).value.status === 'ACTIVE', 'positive_session_readback');
  }
  const clear = await effect('okta.sessions.clear', userId);
  await sessionEvidence(clear, userId);
  checks.activeSessionClearLogCorrelated = true;
  checks.positiveSessionCreated = Boolean(sessionId);
  if (sessionId) {
    check((await provider('GET', `/api/v1/sessions/${sessionId}`, undefined, [200, 404])).status === 404, 'positive_session_remains');
    checks.positiveSessionRevoked = true;
  }
  await effect('okta.user.suspend', userId);
  check((await provider('GET', `/api/v1/users/${userId}`)).value.status === 'SUSPENDED', 'suspended_user_readback');
  checks.userSuspended = true;
  await sessionEvidence(await effect('okta.sessions.clear', userId), userId);
  checks.suspendedSessionClearLogCorrelated = true;
  await effect('okta.user.activate', userId);
  check((await provider('GET', `/api/v1/users/${userId}`)).value.status === 'ACTIVE', 'activated_user_readback');
  checks.userReactivated = true;
  const factor = (await provider('POST', `/api/v1/users/${userId}/factors`, { factorType: 'token:software:totp', provider: 'OKTA' })).value;
  const activation = factor._embedded?.activation;
  check(factor.id && activation?.encoding === 'base32' && typeof activation.sharedSecret === 'string', 'factor_activation_missing');
  let bits = '';
  for (const letter of activation.sharedSecret.replace(/=+$/, '')) {
    const digit = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(letter.toUpperCase());
    check(digit >= 0, 'factor_secret_encoding'); bits += digit.toString(2).padStart(5, '0');
  }
  const secretBytes = Buffer.from((bits.match(/.{8}/g) || []).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / Number(activation.timeStep || 30))));
  const digest = createHmac('sha1', secretBytes).update(counter).digest(), offset = digest[digest.length - 1] & 15;
  const digits = Number(activation.keyLength || 6), passCode = String((digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits)).padStart(digits, '0');
  await provider('POST', `/api/v1/users/${userId}/factors/${factor.id}/lifecycle/activate`, { passCode });
  check((await provider('GET', `/api/v1/users/${userId}/factors/${factor.id}`)).value.status === 'ACTIVE', 'factor_activation_readback');
  check((await items(`/api/v1/users/${userId}/factors`)).length > 0, 'factor_setup_empty');
  await effect('okta.factors.reset', userId);
  check((await items(`/api/v1/users/${userId}/factors`)).length === 0, 'factors_reset_readback');
  checks.factorsReset = true;
  await effect('okta.app.unassign', appId, groupId);
  check((await provider('GET', `/api/v1/apps/${appId}/groups/${groupId}`, undefined, [200, 404])).status === 404, 'app_unassign_readback');
  await eventually(async () => (await provider('GET', `/api/v1/apps/${appId}/users/${userId}`, undefined, [200, 404])).status === 404, 'app_user_remains');
  checks.appUnassigned = true;
  await effect('okta.group.remove', groupId, userId);
  await eventually(async () => !(await items(`/api/v1/groups/${groupId}/users`)).some(user => user.id === userId), 'group_remove_readback');
  checks.groupRemoved = true;
  await effect('okta.user.deactivate', userId);
  check((await provider('GET', `/api/v1/users/${userId}`)).value.status === 'DEPROVISIONED', 'deactivated_user_readback');
  checks.userDeactivated = true;
  await effect('okta.user.create', cohort.stagedLogin, cohort.stagedLogin, { firstName: 'Synthetic', lastName: 'Linen', email: cohort.stagedLogin, login: cohort.stagedLogin });
  const staged = (await provider('GET', `/api/v1/users/${encodeURIComponent(cohort.stagedLogin)}`)).value;
  stagedId = staged.id;
  check(staged.profile?.login === cohort.stagedLogin && staged.status === 'STAGED' && !staged.credentials?.password, 'staged_user_readback');
  checks.userCreatedStagedWithoutPassword = true;
} catch (error) {
  failure = { code: error instanceof JourneyError ? safeCode(error.code) : 'journey_internal_error', status: error instanceof JourneyError ? error.status : 0 };
} finally {
  if (org && apiToken) await cleanup();
  checks.cohortCleanup = counts.cleanupFailures === 0;
  if (counts.cleanupFailures && !failure) failure = { code: 'cohort_cleanup_failed', status: 0 };
  try { await mf?.dispose(); } catch { failure ||= { code: 'worker_disposal_failed', status: 0 }; }
  if (directory) await rm(directory, { recursive: true, force: true });
}
const endedAt = new Date().toISOString();
const evidence = ['# ACCESS-002 Okta live acceptance', '', `PASS: ${!failure}`, `Started: ${startedAt}`, `Ended: ${endedAt}`,
  ...(org ? [`Org fingerprint: ${hash(org)}`] : []), '', ...Object.entries(checks).map(([name, value]) => `${name}: ${value}`), '',
  ...Object.entries(counts).map(([name, value]) => `${name}: ${value}`), ''];
// Evidence contains only booleans, counts, timestamps, and the org fingerprint.
const output = resolve(process.env.LINEN_OKTA_EVIDENCE_PATH || 'evidence/ACCESS-002-okta.md');
await mkdir(dirname(output), { recursive: true });
await writeFile(output, evidence.join('\n'));
if (failure) { console.error(`FAIL Okta live acceptance code=${failure.code} status=${failure.status}`); process.exitCode = 1; }
else console.log(`PASS Okta live acceptance operations=${counts.operations} cleanupFailures=${counts.cleanupFailures}`);
