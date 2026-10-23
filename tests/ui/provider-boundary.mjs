// TEST ONLY: external provider protocol responses for the emitted, unmodified app.
// Never imported by product code. The wrapper is generated only in isolated temp dist.
let environment;
const original = globalThis.fetch;
const read = async () => JSON.parse((await environment.DB.prepare('SELECT data FROM native_fixture WHERE id=1').first())?.data ?? '{}');
const present = async (target) => !!await environment.DB.prepare('SELECT target FROM native_presence WHERE target=?').bind(target).first();
async function event(kind, data) { await environment.DB.prepare('INSERT INTO native_provider_calls(kind,data) VALUES(?,?)').bind(kind, JSON.stringify(data)).run(); }
export function bind(env) { environment = env; }
export async function fixtureRequest(request, env) {
  if (!new URL(request.url).pathname.startsWith('/__fixture/')) return null;
  environment = env;
  const path = new URL(request.url).pathname;
  if (path === '/__fixture/init') {
    await env.DB.exec('CREATE TABLE IF NOT EXISTS native_fixture(id INTEGER PRIMARY KEY,data TEXT); CREATE TABLE IF NOT EXISTS native_presence(target TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS native_provider_calls(kind TEXT,data TEXT);');
    await env.DB.prepare('INSERT OR IGNORE INTO native_fixture VALUES(1,?)').bind('{}').run();
    return Response.json({ initialized: true });
  }
  if (path === '/__fixture/state' && request.method === 'POST') {
    await env.DB.prepare('UPDATE native_fixture SET data=? WHERE id=1').bind(JSON.stringify({ ...await read(), ...await request.json() })).run();
    return Response.json(await read());
  }
  if (path === '/__fixture/evidence') return Response.json({ state: await read(), presence: (await env.DB.prepare('SELECT * FROM native_presence').all()).results, calls: (await env.DB.prepare('SELECT * FROM native_provider_calls').all()).results.map(r => ({ ...r, data: JSON.parse(r.data) })) });
  return new Response('Unknown fixture endpoint', { status: 404 });
}
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), config = await read();
  const host = url.hostname;
  if(host==='api.sendgrid.com') {
    if(url.pathname==='/v3/scopes')return Response.json({scopes:['mail.send']});
    if(url.pathname==='/v3/user/username')return Response.json({user_id:1,username:'synthetic-linen-42'});
    if(url.pathname==='/v3/verified_senders')return Response.json({results:[{id:1,from_email:'synthetic-linen-43@example.test',verified:true}]});
    if(url.pathname==='/v3/mail/send' && init.method==='POST') {
      await event('side-email',JSON.parse(init.body));
      return new Response(null,{status:202,headers:{'x-message-id':'synthetic-linen-44'}});
    }
    throw Error('Unexpected synthetic-linen-45 provider path');
  }
  // CHANNEL-003: Gmail, its OAuth token endpoint and public DNS. Mailbox content and DNS answers come from the fixture state; every send is recorded.
  if (host === 'oauth2.googleapis.com') return Response.json({ access_token: 'synthetic-linen-token' });
  if (host === 'cloudflare-dns.com') {
    const name = url.searchParams.get('name'), type = url.searchParams.get('type'), values = config.mailbox?.dns?.[type + ':' + name];
    return values ? Response.json({ Status: 0, Answer: values.map(data => ({ name: name + '.', type: type === 'TXT' ? 16 : 5, data: type === 'TXT' ? JSON.stringify(data) : data })) }) : Response.json({ Status: 3 });
  }
  if (host === 'gmail.googleapis.com') {
    const mailbox = config.mailbox ?? {}, path = url.pathname;
    if (path.endsWith('/profile')) return Response.json({ emailAddress: mailbox.profile });
    if (path.endsWith('/messages/send')) { await event('mail-send', { raw: JSON.parse(init.body).raw }); return Response.json({ id: 'synthetic-linen-sent' }); }
    if (path.endsWith('/messages')) return Response.json({ messages: Object.keys(mailbox.gmail ?? {}).reverse().map(id => ({ id })) });
    const id = path.split('/messages/')[1];
    return mailbox.gmail?.[id] ? Response.json({ id, raw: mailbox.gmail[id] }) : new Response('missing', { status: 404 });
  }
  if (host === 'login.microsoftonline.com') { await event('token', {}); return Response.json({ access_token: 'test-only-token' }); }
  if (host === 'graph.microsoft.com') {
    await event('directory', { path: url.pathname, method: init.method || 'GET' });
    const kind = url.pathname.split('/')[2];
    if (config.directoryUnavailable) return new Response('Test external outage', { status: 503 });
    if (url.pathname === '/v1.0/users') return Response.json({ value: [{ id: 'provider-colleague', displayName: 'Avery Colleague', userPrincipalName: 'avery@example.test' }] });
    if (url.pathname === '/v1.0/groups') return Response.json({ value: [{ id: 'design-group', displayName: 'Design workspace' }] });
    if (url.pathname === '/v1.0/subscribedSkus') return Response.json({ value: [{ id: 'design-license', skuPartNumber: 'Design editor' }] });
    if (url.pathname === '/v1.0/devices') return Response.json({ value: [{ id: 'laptop-source', displayName: 'Avery laptop' }] });
    if (url.pathname === '/v1.0/applications') return Response.json({ value: [{ id: 'orders-app', displayName: 'Orders', appId: 'orders-app' }] });
    if (kind === 'users') {
      if (init.method === 'PATCH' || init.method === 'POST') {
        await event('identity-write', {path:url.pathname,method:init.method});
        const next = {...config, ...(init.method === 'PATCH' ? {disabled:true} : {sessionsRevokedAt:new Date().toISOString()})};
        await environment.DB.prepare('UPDATE native_fixture SET data=? WHERE id=1').bind(JSON.stringify(next)).run();
        return Response.json({value:true});
      }
      return Response.json({ id: url.pathname.split('/')[3], userPrincipalName: 'avery@example.test', accountEnabled: !config.disabled, signInSessionsValidFromDateTime:config.sessionsRevokedAt });
    }
    const target = url.pathname.split('/')[3];
    if (init.method === 'POST' || init.method === 'DELETE') {
      await event('entitlement-write', { target, method: init.method });
      if (init.method === 'POST') await environment.DB.prepare('INSERT OR IGNORE INTO native_presence VALUES(?)').bind(target).run();
      else await environment.DB.prepare('DELETE FROM native_presence WHERE target=?').bind(target).run();
      if (config.lostReceipt) throw new Error('Test provider lost receipt after effect');
      return new Response(null, { status: 204 });
    }
    return await present(target) ? Response.json({ id: url.pathname.split('/').at(-1) }) : new Response(null, { status: 404 });
  }
  if (host === 'probe.example.com' || host === 'deploy.example.com' || host === 'notify.example.com') {
    if (url.pathname.endsWith('/health')) {
      const provider = host.startsWith('probe') ? 'workflow-probe' : host.startsWith('deploy') ? 'controlled-deployment' : 'notification-webhook';
      return Response.json({ protocol: 'linen-connection-health', version: 1, provider, nonce: url.searchParams.get('nonce'), origin: url.origin, endpoint: url.origin + url.pathname.replace(/\/health$/, ''), readOnly: true, observedAt: new Date().toISOString() });
    }
    if (host.startsWith('probe')) {
      const beneficiary = url.searchParams.get('beneficiary'), target = url.searchParams.get('target');
      await event('workflow-observation', { target, beneficiary, desired: url.searchParams.get('desired') });
      if (config.probeUnknown) throw new Error('Test independent verifier unavailable');
      const usable = target === 'orders' ? (config.repaired || beneficiary === config.healthyCohort) : (await present(target)) === (url.searchParams.get('desired') === 'usable');
      return Response.json({ nonce: url.searchParams.get('nonce'), target, beneficiaryId: beneficiary, verifierVersion: 1, actionVersion: 1, observedAt: new Date().toISOString(), expectedOutcome: url.searchParams.get('desired'), negativeControl: true, usableWorkflow: Boolean(usable), cohort: [beneficiary] });
    }
    if (host.startsWith('deploy')) {
      if (init.method === 'POST') {
        const body = JSON.parse(init.body);
        if (config.failDeployment) { await event('deployment-rejected', body); return Response.json({accepted:false}, {status:409}); }
        await event('deployment-write', body);
        if (config.failedRollback && (body.phase === 'compensate' || body.payload?.phase === 'compensate')) throw new Error('Test rollback result unknown');
        await environment.DB.prepare('UPDATE native_fixture SET data=? WHERE id=1').bind(JSON.stringify({ ...config, repaired: !config.partial })).run();
        return Response.json({ accepted: true });
      }
      const applied = await environment.DB.prepare("SELECT data FROM native_provider_calls WHERE kind='deployment-write' AND json_extract(data,'$.operationId')=? LIMIT 1").bind(url.searchParams.get('operationId')).first();
      const uncertain = applied && config.failedRollback && JSON.parse(applied.data).action === 'deployment.compensate';
      return Response.json({ operationId: url.searchParams.get('operationId'), target: url.searchParams.get('target'), nonce: url.searchParams.get('nonce'), observedAt: new Date().toISOString(), state: uncertain ? 'unknown' : applied ? 'applied' : 'not_applied', terminal: !applied });
    }
    if (init.method === 'POST') { const body = JSON.parse(init.body); await event('notification-write', body); return Response.json({ id: body.id, deliveryId: 'fixture-' + body.id }); }
    await event('notification-readback', { id: url.searchParams.get('id') });
    return Response.json({ id: url.searchParams.get('id'), nonce: url.searchParams.get('nonce'), state: 'delivered', observedAt: new Date().toISOString() });
  }
  if (host === 'api.openai.com') {
    if (url.pathname.startsWith('/v1/models/')) return Response.json({ id: decodeURIComponent(url.pathname.split('/').at(-1)) });
    const body = JSON.parse(init.body), packet = JSON.parse(body.input), schema = body.text.format.schema;
    await event('model', { purpose: packet.purpose, schema: Object.keys(schema.properties) });
    let value;
    if (packet.purpose === 'knowledge_article_draft') {
      value={title:'Recover network access',body:'Open a fresh network session. Use this guidance for the recorded symptoms and check the result; closure alone does not verify recovery.',citations:schema.properties.citations.items.enum};
    } else if (['ticket_reply','ticket_summary'].includes(packet.purpose)) {
      const sources=JSON.parse(packet.request.slice(packet.request.indexOf('\n')+1));
      await event('response-sources',{purpose:packet.purpose,sources});
      value={text:packet.purpose==='ticket_summary'?'Twenty VPN reports describe repeated disconnections. Reviewed knowledge recommends restarting the VPN client; recovery remains unverified.':'Please restart the VPN client using the reviewed guidance and reply here if it still disconnects.',citations:sources.map(source=>source.id)};
    } else if (schema.properties.edits) {
      const raw = packet.request, data = JSON.parse(raw.slice(raw.indexOf('{"need"'))), file = data.files.find(f => f.path === 'claims.mjs');
      value = { edits: [{ path: 'claims.mjs', beforeSha256: file.sha256, content: 'export function groups(claims) { return claims.groups ?? claims.roles ?? [] }\n' }], explanation: 'Support rotated group claims and preserve legacy staff roles' };
    } else if (schema.properties.hypotheses) {
      value = { hypotheses: [{ id: 'claims', explanation: 'Claims mismatch', prediction: 'New sessions fail', evidenceIds: [], status: 'open' }, { id: 'routing', explanation: 'Routing mismatch', prediction: 'Both cohorts fail', evidenceIds: [], status: 'open' }], probes: ['a', 'b'].map(probeId => ({ probeId, hypothesisIds: ['claims', 'routing'], predictedObservation: 'Compare independent workflows', discriminatesBecause: 'Separate cohorts distinguish routing and rotated identities' })), rejectedExplanations: [], missingEngineering: config.engineering ? ['Repair owned claims adapter to support rotated groups'] : [], conclusion: 'Retain rival explanations until observations distinguish them', next: 'probe', evidenceIds: [] };
    } else if (schema.properties.catalogId) {
      const raw = packet.request, intake = JSON.parse(raw.slice(raw.indexOf('{"work"')));
      const text = intake.messages.map(m => m.body).join('\n');
      value = config.serviceId && intake.work.title.includes('renewal orders fail')
        ? {kind:'investigation',summary:'Investigate the known renewal service',catalogId:'',serviceId:config.serviceId,purpose:'',expiresAt:null,question:'',requestedFor:'',evidenceIds:[]}
        : config.catalogId && intake.work.title.includes('temporary access')
        ? { kind: 'catalog_request', summary: 'Temporary project access', catalogId: config.catalogId, serviceId: '', purpose: intake.fulfilments[0]?.purpose || 'Project review', expiresAt: [...text.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g)].at(-1)?.[0] || null, question: '', requestedFor: '', evidenceIds: [] }
        : { kind: 'necessary_question', summary: 'A material fact is missing', catalogId: '', serviceId: '', purpose: '', expiresAt: null, question: 'Which application do you need?', requestedFor: '', evidenceIds: [] };
    } else throw Error('Unrecognised test model contract');
    return Response.json({ status: 'completed', model: body.model, usage: { input_tokens: 100, output_tokens: 30, total_tokens: 130, input_tokens_details: { cached_tokens: 0 } }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  }
  // No uncontrolled external effects can leave this fixture run.
  if (!['127.0.0.1', 'localhost'].includes(host)) throw Error('External host outside declared fixture: ' + host);
  return original(input, init);
};
