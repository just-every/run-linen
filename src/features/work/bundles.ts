import { audienceEvaluation } from './catalog-audience';
/**
 * CATALOG-004: a bundle names existing catalog items pinned at their revisions. Requesting it opens one
 * ticket with one child fulfilment per item; one manager decision records every manager-gated child's
 * exact approval atomically; the bundle is complete only when every child's delivery is verified.
 * Capacity, stock and execution grants stay per child; a bundle never creates a grant.
 */
import { ApiError, id, now, requiredString } from '../../platform/http';
import { createWork, getWork, permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { requestFulfilment, evaluateFulfilment, fulfilmentStatements, finishFulfilment, type Evaluation } from './requests';
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
  const rows=(await ctx.env.DB.prepare('SELECT * FROM work_catalog_bundles WHERE workspace_id=? ORDER BY name').bind(ctx.principal.workspaceId).all<BundleRow>()).results;
  const items=[];
  for(const row of rows) {
    const bundle=project(row);
    if(!ctx.principal.roles.some(r=>['owner','operator','hr'].includes(r))) {
      let allowed=true;
      for(const item of bundle.items) {
        const catalog=await ctx.env.DB.prepare('SELECT audience_json FROM work_catalog WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,item.catalogId).first<{audience_json:string}>();
        if(!catalog || !(await audienceEvaluation(ctx,catalog,ctx.principal.userId)).allowed){allowed=false;break;}
      }
      if(!allowed)continue;
    }
    items.push(bundle);
  }
  return {items};
}

/**
 * Opens one ticket for the bundle snapshot, all or nothing (ct, 21 October): every child is evaluated (audience,
 * form, quote) before any work opens, a refusal names each failing child, and the ticket and every child's
 * fulfilment are one atomic write that rechecks the evaluated item, person and membership revisions.
 */
export async function requestBundle(ctx: WorkContext, bundleId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  const bundle = project(await bundleRow(ctx, bundleId));
  if (Number(input.expectedRevision) !== bundle.revision) throw new ApiError(409, 'bundle_changed', 'This bundle changed; review it again before requesting');
  const current = (await ctx.env.DB.prepare('SELECT id,revision FROM work_catalog WHERE workspace_id=? AND id IN (SELECT value FROM json_each(?))')
    .bind(ctx.principal.workspaceId, JSON.stringify(bundle.items.map(i => i.catalogId))).all<{ id: string; revision: number }>()).results;
  if (bundle.items.some(i => current.find(c => c.id === i.catalogId)?.revision !== i.revision))
    throw new ApiError(409, 'bundle_changed', 'A bundled item changed after the bundle was built; the owner must rebuild the bundle');
  const beneficiaryId = typeof input.beneficiaryId === 'string' ? input.beneficiaryId : ctx.principal.userId;
  if (beneficiaryId !== ctx.principal.userId) permit(ctx, ['owner', 'operator', 'hr']);
  const purpose = requiredString(input.purpose, 'purpose', 2000), expiresAt = typeof input.expiresAt === 'string' ? input.expiresAt : undefined;
  const key = requiredString(input.deduplicationKey, 'deduplicationKey');
  const workInput = { title: `${bundle.name} bundle`, body: purpose, deduplicationKey: key, kind: 'request', beneficiaryId: beneficiaryId === ctx.principal.userId ? undefined : beneficiaryId };
  const replay = await ctx.env.DB.prepare('SELECT id FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?').bind(ctx.principal.workspaceId, ctx.principal.userId, key).first();
  const children = bundle.items.map(item => ({ catalogId: item.catalogId, catalogRevision: item.revision, beneficiaryId, purpose, expiresAt }));
  if (replay) {
    // The same request again: createWork refuses a different one, and each child is recorded once.
    const work = await createWork(ctx, workInput) as { id: string };
    for (const child of children) await requestFulfilment(ctx, work.id, child);
    return bundleStatus(ctx, work.id);
  }
  const staff = ctx.principal.roles.some(r => ['owner', 'operator', 'hr'].includes(r)), lines: string[] = [], evaluations: Evaluation[] = [];
  for (const [index, child] of children.entries()) {
    try { evaluations.push(await evaluateFulfilment(ctx, { id: 'new-bundle-request', revision: 1, state: 'open' }, child, true)); }
    catch (error) {
      if (!(error instanceof ApiError) || error.status >= 500) throw error;
      const row = await ctx.env.DB.prepare('SELECT audience_json FROM work_catalog WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, child.catalogId).first<{ audience_json: string }>();
      // An item the filer cannot see is not named; the others are.
      const visible = staff || !row || (await audienceEvaluation(ctx, row, ctx.principal.userId)).allowed;
      lines.push(`${visible ? bundle.items[index].name : 'Unavailable item'}: ${error.message}`);
    }
  }
  if (lines.length) throw new ApiError(422, 'bundle_child_refused', lines.join('\n'));
  let work: { id: string };
  try {
    work = await createWork(ctx, workInput, { statements: workId => [
      ctx.env.DB.prepare('INSERT OR IGNORE INTO work_bundle_requests VALUES(?,?,?,?,?,?)').bind(ctx.principal.workspaceId, workId, bundle.id, bundle.revision, JSON.stringify(bundle.items), now()),
      ...evaluations.flatMap(e => fulfilmentStatements(ctx, e, workId, 1)),
    ] }) as { id: string };
  } catch (error) {
    // Nothing was written: an item, person or membership changed between evaluation and the atomic write.
    if (error instanceof ApiError && error.code === 'idempotency_conflict') throw new ApiError(409, 'catalog_changed', 'A bundled item or person changed while you were filling it in. Review the bundle and submit again.');
    throw error;
  }
  for (const e of evaluations) await finishFulfilment(ctx, e, work.id);
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
