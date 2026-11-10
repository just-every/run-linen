import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const E3 = '6fd2c87f-b296-42f0-b197-1e91e994b900';
const E5 = 'c7df2760-2c81-4ef7-b578-5b5392b571df';

/** ACCESS-001 point 3: native grant, plan, dispatch, process and operations doors; only the Graph license network edge is faked. */
export async function licenseChecks({ call, db }) {
  const operate = async (beneficiaryId) => {
    const payload = { skuId: E3 };
    const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const grant = await call('/grants', {
      principalId: 'actor', beneficiaryId, action: 'license.add', actionVersion: 1, target: E3,
      connectionId: 'graph', maxUses: 1, conditions: { payloadHash },
      validFrom: new Date(Date.now() - 60000).toISOString(),
      validUntil: new Date(Date.now() + 3600000).toISOString(),
    }, 'issuer');
    assert.equal(grant.status, 201, JSON.stringify(grant));
    const plan = await call('/plans', {
      workId: 'work', revision: 1, idempotencyKey: crypto.randomUUID(),
      steps: [{ action: 'license.add', actionVersion: 1, target: E3, beneficiaryId, connectionId: 'graph', grantId: grant.body.id, grantVersion: grant.body.version, payload }],
    });
    assert.equal(plan.status, 201, JSON.stringify(plan));
    const dispatched = await call(`/plans/${plan.body.id}/dispatch`, { expectedRevision: 1 });
    assert.equal(dispatched.status, 200, JSON.stringify(dispatched));
    await call('/execution/process', {});
    const op = (await call('/operations')).body.find((o) => o.id === dispatched.body[0].id);
    const verification = await db
      .prepare('SELECT state,evidence_json FROM execution_verifications WHERE operation_id=? ORDER BY rowid DESC LIMIT 1')
      .bind(op.id).first();
    return { op, verification };
  };
  const events = async () => (await call('/fixture', { graphLicense: {} })).body.log;

  // The named beneficiary holds no E3 license, the write is accepted, and a separate licenseDetails read shows it.
  await call('/fixture', { graphLicense: { reset: true, readback: 'faithful' } });
  const named = 'synthetic-linen-e3-user';
  const { op, verification } = await operate(named);
  assert.equal(op.state, 'effect_verified', JSON.stringify(op));
  const log = (await events()).filter((e) => e.user === named);
  assert.deepEqual(log.map((e) => e.op), ['read', 'assign', 'read'], 'absent read, then assignLicense, then a separate licenseDetails read');
  assert.deepEqual(log[0].skus, [], 'the E3 SKU is absent before assignLicense');
  assert.deepEqual(log[1].skus, [E3]);
  assert.deepEqual(log[2].skus, [E3], 'the E3 SKU is present afterwards');
  assert.equal(verification.state, 'effect_verified');
  assert.equal(JSON.parse(verification.evidence_json).present, true);

  // An accepted write followed by a different SKU on readback is never verified.
  await call('/fixture', { graphLicense: { reset: true, readback: 'wrong-sku' } });
  const wrong = 'synthetic-linen-e3-wrong';
  const bad = await operate(wrong);
  assert.notEqual(bad.op.state, 'effect_verified', 'wrong-SKU readback stays unverified');
  assert.equal(bad.op.state, 'unknown');
  const badLog = (await events()).filter((e) => e.user === wrong);
  assert.deepEqual(badLog.map((e) => e.op), ['read', 'assign', 'read']);
  assert.deepEqual(badLog[2].skus, [E5]);
  const rows = await db
    .prepare("SELECT state FROM execution_verifications WHERE operation_id=?")
    .bind(bad.op.id).all();
  assert.ok(rows.results.length > 0 && rows.results.every((r) => r.state !== 'effect_verified'), 'no effect_verified row for the wrong SKU');
  await call('/fixture', { graphLicense: { reset: true, readback: 'faithful' } });
}
