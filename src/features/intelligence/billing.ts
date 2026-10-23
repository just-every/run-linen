import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody, now, requiredString } from '../../platform/http';
import { current, audit, assert, num } from './access';

const integer = (v: unknown, max: number) => { const n = num(v, 0, max); assert(Number.isSafeInteger(n), 'integer_cents_required', 422); return n; };
export function registerBillingRoutes(app: Hono<AppEnv>) {
  const context = (c: any) => ({ env: c.env, principal: c.get('principal') });
  app.get('/billing/plan', async c => {
    const ctx = await current(context(c), ['owner']);
    return c.json(await c.env.DB.prepare('SELECT * FROM billing_plans WHERE workspace_id=?').bind(ctx.principal.workspaceId).first());
  });
  app.put('/billing/plan', async c => {
    const ctx = await current(context(c), ['owner']), b = await jsonBody(c);
    const cents = integer(b.agentSeatCents, 10000000), revision = integer(b.revision, 1000000000), name = requiredString(b.name, 'name', 100);
    const before = await c.env.DB.prepare('SELECT * FROM billing_plans WHERE workspace_id=?').bind(ctx.principal.workspaceId).first();
    const result = revision === 0
      ? await c.env.DB.prepare('INSERT INTO billing_plans VALUES(?,1,?,?,?) ON CONFLICT(workspace_id) DO NOTHING').bind(ctx.principal.workspaceId,cents,name,now()).run()
      : await c.env.DB.prepare('UPDATE billing_plans SET agent_seat_cents=?,plan_name=?,updated_at=?,revision=revision+1 WHERE workspace_id=? AND revision=?').bind(cents,name,now(),ctx.principal.workspaceId,revision).run();
    assert(result.meta.changes === 1, 'billing_revision_conflict', 409);
    await audit(ctx, 'billing.plan.changed', ctx.principal.workspaceId, { before, after: { name, agentSeatCents: cents, revision: revision + 1 } });
    return c.json({ updated: true, revision: revision + 1 });
  });
  app.post('/billing/invoice-preview', async c => {
    const ctx = await current(context(c), ['owner']), b = await jsonBody(c);
    const plan = await c.env.DB.prepare('SELECT * FROM billing_plans WHERE workspace_id=?').bind(ctx.principal.workspaceId).first<any>();
    assert(plan, 'billing_plan_required', 409);
    const address = b.address;
    assert(address && address.country === 'US' && /^[A-Z]{2}$/.test(address.state) && /^\d{5}(-\d{4})?$/.test(address.postalCode), 'us_billing_address_required', 422);
    const street = requiredString(address.street, 'street', 200), city = requiredString(address.city, 'city', 100);
    // The operator supplies jurisdiction and applicability; no geocoding or invented local rate.
    assert(b.tax && typeof b.tax.applicable === 'boolean', 'tax_determination_required', 422);
    const rateBps = integer(b.tax.rateBps, 10000), taxableBps = integer(b.tax.taxableBps, 10000);
    const jurisdiction = requiredString(b.tax.jurisdiction, 'jurisdiction', 150), basis = requiredString(b.tax.basis, 'basis', 500);
    assert(b.tax.applicable || rateBps === 0, 'nonapplicable_tax_must_be_zero', 422);
    const members = await c.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND active=1').bind(ctx.principal.workspaceId).all<{roles_json:string}>();
    const roles = members.results.map(r => JSON.parse(r.roles_json) as string[]);
    const seats = roles.filter(r => r.some(x => ['owner','operator','hr'].includes(x))).length;
    const freeMembers = roles.length - seats, subtotalCents = seats * plan.agent_seat_cents;
    const taxableCents = Math.round(subtotalCents * taxableBps / 10000);
    const taxCents = b.tax.applicable ? Math.round(taxableCents * rateBps / 10000) : 0;
    const preview = { currency:'USD', plan:plan.plan_name, planRevision:plan.revision, period:now().slice(0,7), seats, agentSeatCents:plan.agent_seat_cents, freeMembers, requesterSeatCents:0, approverSeatCents:0, subtotalCents, taxableCents, taxCents, totalCents:subtotalCents+taxCents, address:{street,city,state:address.state,postalCode:address.postalCode,country:'US'}, tax:{...b.tax,rateBps,taxableBps,jurisdiction,basis}, status:'preview', note:'Owner-configured estimate. No payment, invoice issuance or tax filing.' };
    await audit(ctx, 'billing.invoice.previewed', ctx.principal.workspaceId, {planRevision:plan.revision,seats,subtotalCents,taxCents,jurisdiction});
    return c.json(preview);
  });
}
