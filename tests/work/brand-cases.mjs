import assert from 'node:assert/strict';
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic-linen-9810 logo bytes')]);
export const logoPng = () => ({ type: 'image/png', base64: png.toString('base64') });
/** CHANNEL-004 through public routes: owner-only branding with readable colors and a safe logo, and an employee's own devices. */
export async function brandChecks(api, db) {
  const ok = (r, status = 200) => { assert.equal(r.status, status, 'CHANNEL-004 ' + JSON.stringify(r)); return r.value; };
  const eve = { 'x-user': 'synthetic-linen-9801', 'x-roles': '["employee"]' }, other = { 'x-user': 'synthetic-linen-9802', 'x-roles': '["employee"]' };
  for (const [id, name] of [['synthetic-linen-9801', 'Eve Marsh'], ['synthetic-linen-9802', 'Otto Vale']])
    await db.batch([db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(id, id + '@example.test', name, 'unused', '2026-01-01'), db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a', id, '["employee"]')]);
  // The mail flow earlier in this suite already branded the portal once (revision 1).
  const start = ok(await api('/branding', undefined, eve)).brand.revision, good = { portalName: 'Acme Help', primaryColor: '#f5a623', accentColor: '#1d4f91', revision: start };
  ok(await api('/branding', good, eve), 403);
  for (const bad of [{ portalName: '' }, { portalName: 'x'.repeat(61) }, { portalName: '<b>x</b>' }, { primaryColor: 'orange' }, { primaryColor: '#101010' }, { accentColor: '#ffff88' }, { logo: { type: 'image/svg+xml', base64: Buffer.from('<svg onload="x()"/>').toString('base64') } },
    { logo: { type: 'image/png', base64: Buffer.from('not a png at all, just text').toString('base64') } }, { logo: { type: 'image/png', base64: Buffer.concat([png, Buffer.alloc(151 * 1024)]).toString('base64') } }])
    ok(await api('/branding', { ...good, ...bad }), 422);
  const saved = ok(await api('/branding', { ...good, logo: logoPng() }));
  assert.deepEqual([saved.portalName, saved.primaryColor, saved.accentColor, saved.revision], ['Acme Help', '#f5a623', '#1d4f91', start + 1]);
  assert.equal(saved.logoUrl, `https://help.example.test/api/v1/branding/a/logo?v=${start + 1}`);
  ok(await api('/branding', { ...good, portalName: 'Stale' }), 409);
  assert.equal(ok(await api('/branding', undefined, eve)).brand.portalName, 'Acme Help', 'every employee sees the branding');
  const updated = ok(await api('/branding', { ...good, portalName: 'Acme IT', revision: start + 1 })); assert.equal(updated.logoUrl !== null, true, 'a save without a logo keeps the stored one');
  assert.equal(ok(await api('/branding', { ...good, portalName: 'Acme IT', revision: start + 2, removeLogo: true })).logoUrl, null);
  ok(await api('/branding', { ...good, revision: start + 3, logo: logoPng() }));
  // An employee sees their own devices through the reviewed account link, and nobody else's.
  const person = ok(await api('/people', { source: 'synthetic-linen-hris', sourceId: 'eve', name: 'Eve Marsh', effectiveAt: '2026-01-01T00:00:00Z', observedAt: new Date().toISOString() }), 201);
  assert.deepEqual(ok(await api('/my/devices', undefined, eve)).items, [], 'no reviewed link, no devices');
  ok(await api(`/people/${person.id}/binding`, { expectedRevision: person.revision, memberId: 'synthetic-linen-9801' }));
  const asset = ok(await api('/assets', { serial: 'SYNTHETIC-LINEN-9803', source: 'synthetic purchase', location: 'Denver stockroom', procured: true }), 201);
  let revision = 1;
  for (const [command, extra] of [['receive', {}], ['assign', { personId: person.id }], ['receive', { personId: person.id }]]) revision = ok(await api(`/assets/${asset.id}/commands`, { revision, command, evidence: 'synthetic receipt', ...extra })).revision;
  assert.deepEqual(ok(await api('/my/devices', undefined, eve)).items.map(d => [d.serial, d.state]), [['SYNTHETIC-LINEN-9803', 'received']]);
  assert.deepEqual(ok(await api('/my/devices', undefined, other)).items, []);
  revision = ok(await api(`/assets/${asset.id}/commands`, { revision, command: 'return', evidence: 'synthetic return', personId: person.id })).revision;
  assert.deepEqual(ok(await api('/my/devices', undefined, eve)).items, [], 'a returned device leaves the list');
}
