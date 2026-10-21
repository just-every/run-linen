import { normalizeCatalogForm, validateCatalogAnswers } from './catalog-form-schema';
/**
 * CATALOG-004: a bundle names existing catalog items pinned at their revisions. Requesting it opens one
 * ticket with one child fulfilment per item; one manager decision records every manager-gated child's
 * exact approval atomically; the bundle is complete only when every child's delivery is verified.
 * Capacity, stock and execution grants stay per child; a bundle never creates a grant.
 */
import { ApiError, id, now, requiredString } from '../../platform/http';
import { createWork, getWork, permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { requestFulfilment } from './requests';
import { prepareFulfilmentApproval, type FulfilmentApprovalInput } from './fulfilment-authority';

interface BundleItem { catalogId: string; revision: number; name: string; kind: string; requiresManager: boolean }
interface BundleRow { id: string; name: string; items_json: string; owner_id: string; revision: number }
const deliveryKinds = ['device.deliver', 'access.grant'];

async function bundleRow(ctx: WorkContext, bundleId: string) {
  const row = await ctx.env.DB.prepare('SELECT * FROM work_catalog_bundles WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, bundleId).first<BundleRow>();
  if (!row) throw new ApiError(404, 'not_found', 'Bundle not found');
  return row;
}
const project = (r: BundleRow) => ({ id: r.id, name: r.name, ownerId: r.owner_id, revision: r.revision, items: JSON.parse(r.items_json) as BundleItem[] });

export async function createBundle(ctx: WorkContext, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const ids = input.catalogIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 30 || new Set(ids).size !== ids.length || !ids.every(x => typeof x === 'string'))
    throw new ApiError(422, 'bundle_items', 'Choose 2 to 30 different catalog items');
  const rows = (await ctx.env.DB.prepare('SELECT id,name,kind,requires_manager,revision FROM work_catalog WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?))')
    .bind(ctx.principal.workspaceId, JSON.stringify(ids)).all<{ id: string; name: string; kind: string; requires_manager: number; revision: number }>()).results;
  if (rows.length !== ids.length) throw new ApiError(404, 'catalog_unavailable', 'A bundled catalog item is unavailable');
  const items: BundleItem[] = ids.map(cid => { const r = rows.find(x => x.id === cid)!; return { catalogId: r.id, revision: r.revision, name: r.name, kind: r.kind, requiresManager: !!r.requires_manager }; });
  const bundleId = id(), t = now();
  await ctx.env.DB.prepare('INSERT INTO work_catalog_bundles VALUES(?,?,?,?,?,1,?,?)').bind(bundleId, ctx.principal.workspaceId, requiredString(input.name, 'name', 200), JSON.stringify(items), ctx.principal.userId, t, t).run();
  return project(await bundleRow(ctx, bundleId));
}
export async function listBundles(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  return { items: (await ctx.env.DB.prepare('SELECT * FROM work_catalog_bundles WHERE workspace_id=? ORDER BY name').bind(ctx.principal.workspaceId).all<BundleRow>()).results.map(project) };
}

/** Opens one ticket for the bundle snapshot; a changed bundle or item refuses the old snapshot. */
export async function requestBundle(ctx: WorkContext, bundleId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  const bundle = project(await bundleRow(ctx, bundleId));
  if (Number(input.expectedRevision) !== bundle.revision) throw new ApiError(409, 'bundle_changed', 'This bundle changed; review it again before requesting');
  const current = (await ctx.env.DB.prepare('SELECT id,revision,form_json FROM work_catalog WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?))')
    .bind(ctx.principal.workspaceId, JSON.stringify(bundle.items.map(i => i.catalogId))).all<{ id: string; revision: number; form_json: string }>()).results;
  if (bundle.items.some(i => current.find(c => c.id === i.catalogId)?.revision !== i.revision))
    throw new ApiError(409, 'bundle_changed', 'A bundled item changed after the bundle was built; the owner must rebuild the bundle');
  // Validate every child before opening any work. Bundle input has no form answers.
  for(const row of current)validateCatalogAnswers(normalizeCatalogForm(JSON.parse(row.form_json)),{});
  const beneficiaryId = typeof input.beneficiaryId === 'string' ? input.beneficiaryId : ctx.principal.userId;
  if (beneficiaryId !== ctx.principal.userId) permit(ctx, ['owner', 'operator', 'hr']);
  const purpose = requiredString(input.purpose, 'purpose', 2000), expiresAt = typeof input.expiresAt === 'string' ? input.expiresAt : undefined;
  const work = await createWork(ctx, { title: `${bundle.name} bundle`, body: purpose, deduplicationKey: requiredString(input.deduplicationKey, 'deduplicationKey'), kind: 'request', beneficiaryId: beneficiaryId === ctx.principal.userId ? undefined : beneficiaryId }) as { id: string };
  await ctx.env.DB.prepare('INSERT OR IGNORE INTO work_bundle_requests VALUES(?,?,?,?,?,?)').bind(ctx.principal.workspaceId, work.id, bundle.id, bundle.revision, JSON.stringify(bundle.items), now()).run();
  for (const item of bundle.items) await requestFulfilment(ctx, work.id, { catalogId: item.catalogId, catalogRevision:item.revision, beneficiaryId, purpose, expiresAt });
  return bundleStatus(ctx, work.id);
}

/** One manager decision: the request must name exactly the bundle's manager-gated children, all recorded or none. */
export async function approveBundle(ctx: WorkContext, workId: string, input: { idempotencyKey?: unknown; approvals?: unknown }) {
  await currentWorkPrincipal(ctx);
  const request = await bundleRequest(ctx, workId), key = requiredString(input.idempotencyKey, 'idempotencyKey');
  const gated = request.items.filter(i => i.requiresManager).map(i => i.catalogId).sort();
  const approvals = Array.isArray(input.approvals) ? input.approvals as FulfilmentApprovalInput[] : [];
  if (!gated.length || JSON.stringify(approvals.map(a => a?.catalogId).sort()) !== JSON.stringify(gated))
    throw new ApiError(422, 'bundle_approval_scope', 'One bundle decision covers exactly every child that needs manager approval');
  const statements: D1PreparedStatement[] = [], ids: string[] = [];
  for (const a of approvals) {
    const prepared = await prepareFulfilmentApproval(ctx, workId, { ...a, idempotencyKey: `${key}:${a.catalogId}` });
    statements.push(...prepared.statements); ids.push(prepared.approvalId);
  }
  if (statements.length) await ctx.env.DB.batch([...statements, ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.bundle_approved', workId, JSON.stringify({ bundleId: request.bundleId, bundleRevision: request.bundleRevision, approvalIds: ids, decisionKey: key }), now())]);
  return { decisionKey: key, approvalIds: ids, ...await bundleStatus(ctx, workId) };
}

async function bundleRequest(ctx: WorkContext, workId: string) {
  await getWork(ctx, workId);
  const row = await ctx.env.DB.prepare('SELECT * FROM work_bundle_requests WHERE workspace_id=? AND work_id=?').bind(ctx.principal.workspaceId, workId)
    .first<{ bundle_id: string; bundle_revision: number; items_json: string }>();
  if (!row) throw new ApiError(404, 'not_found', 'This request is not a bundle');
  return { bundleId: row.bundle_id, bundleRevision: row.bundle_revision, items: JSON.parse(row.items_json) as BundleItem[] };
}
/** Per-child delivery state; complete only when every child's delivery obligation is verified. */
export async function bundleStatus(ctx: WorkContext, workId: string) {
  await currentWorkPrincipal(ctx);
  const request = await bundleRequest(ctx, workId), w = ctx.principal.workspaceId;
  const obligations = (await ctx.env.DB.prepare(`SELECT o.id,o.kind,o.state,o.target,o.revision,f.catalog_id FROM work_obligations o JOIN work_fulfilments f ON f.workspace_id=o.workspace_id AND f.work_id=o.work_id
    JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id AND c.target=o.target WHERE o.workspace_id=? AND o.work_id=? AND o.kind IN ('device.deliver','access.grant')`)
    .bind(w, workId).all<{ id: string; kind: string; state: string; target: string; revision: number; catalog_id: string }>()).results;
  const approved = new Set((await ctx.env.DB.prepare('SELECT f.catalog_id FROM work_fulfilment_approvals a JOIN work_fulfilments f ON f.workspace_id=a.workspace_id AND f.id=a.fulfilment_id WHERE a.workspace_id=? AND a.work_id=?')
    .bind(w, workId).all<{ catalog_id: string }>()).results.map(r => r.catalog_id));
  const decisions = (await ctx.env.DB.prepare("SELECT COUNT(*) n FROM audit_events WHERE workspace_id=? AND action='work.bundle_approved' AND target=?").bind(w, workId).first<{ n: number }>())?.n ?? 0;
  const children = request.items.map(i => {
    const o = obligations.find(x => x.catalog_id === i.catalogId && deliveryKinds.includes(x.kind));
    return { catalogId: i.catalogId, name: i.name, kind: i.kind, obligationId: o?.id ?? null, obligationRevision: o?.revision ?? null, target: o?.target ?? null,
      delivery: o?.state ?? 'missing', approval: !i.requiresManager ? 'not_required' : approved.has(i.catalogId) ? 'recorded' : 'needed' };
  });
  return { workId, bundleId: request.bundleId, bundleRevision: request.bundleRevision, decisions, children,
    state: children.every(c => c.delivery === 'verified') ? 'complete' : 'in_progress' };
}
