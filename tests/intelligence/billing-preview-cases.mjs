import assert from 'node:assert/strict';
// COST-001 point 5: an invoice preview is an estimate only. It issues no invoice, dispatches no payment,
// leaves the saved plan and budget untouched, and writes nothing but its own audit entry.
export async function billingPreviewChecks({api, ok, owner, employee, harness, origin, workspaceId, invoiceInput}) {
  const db = await harness.db, base = origin();
  const outbound = async () => (await (await fetch(base + '/fixture/outbound')).json());
  const tables = async () => (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).results.map(r => r.name);
  const rows = async sql => (await db.prepare(sql).bind(workspaceId).all()).results;
  const snapshot = async () => ({
    plan: ok(await api('/billing/plan', 'GET', undefined, owner)),
    budget: ok(await api('/intelligence/budget', 'GET', undefined, owner)),
    planRows: await rows('SELECT * FROM billing_plans WHERE workspace_id=?'),
    budgetRows: await rows('SELECT * FROM intelligence_budgets WHERE workspace_id=?'),
    tables: await tables(),
    audit: (await rows('SELECT action FROM audit_events WHERE workspace_id=? ORDER BY rowid')).map(r => r.action),
    outbound: await outbound(),
  });
  assert.ok(!(await tables()).some(t => /invoice|payment|charge_request|stripe/i.test(t)), 'The product holds no invoice or payment table');
  const before = await snapshot();
  const first = ok(await api('/billing/invoice-preview', 'POST', invoiceInput, owner));
  const repeat = ok(await api('/billing/invoice-preview', 'POST', invoiceInput, owner));
  assert.deepEqual(repeat, first, 'Repeating the same preview returns the same estimate');
  assert.equal(first.status, 'preview');
  assert.match(first.note, /No payment, invoice issuance or tax filing/);
  for (const key of ['invoiceId', 'invoiceNumber', 'paymentId', 'paymentUrl', 'checkoutUrl', 'dueAt', 'issuedAt']) assert.equal(first[key], undefined, 'The preview carries no ' + key);
  for (const key of ['subtotalCents', 'taxableCents', 'taxCents', 'totalCents']) assert.ok(Number.isSafeInteger(first[key]), key + ' is integer cents');
  // A refused attempt (not the owner, or no explicit tax determination) leaves no preview audit either.
  ok(await api('/billing/invoice-preview', 'POST', invoiceInput, employee), 403);
  ok(await api('/billing/invoice-preview', 'POST', {...invoiceInput, tax: undefined}, owner), 422);
  const after = await snapshot();
  assert.deepEqual(after.plan, before.plan, 'Saved plan is unchanged');
  assert.deepEqual(after.budget, before.budget, 'Saved budget is unchanged');
  assert.deepEqual(after.planRows, before.planRows);
  assert.deepEqual(after.budgetRows, before.budgetRows);
  assert.deepEqual(after.tables, before.tables, 'No table is created');
  assert.deepEqual(after.outbound, before.outbound, 'No outbound invoice or payment request leaves the product');
  assert.deepEqual(after.audit.slice(before.audit.length), ['billing.invoice.previewed', 'billing.invoice.previewed'], 'Only the two preview audit entries are added');
  assert.deepEqual(after.audit.slice(0, before.audit.length), before.audit);
}
