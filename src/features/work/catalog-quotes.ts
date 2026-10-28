import {fulfilmentRequiresManager,fulfilmentManagerSql} from './fulfilment-configuration';
import { chainStatus } from './approval-stages';
import { managerStageApproved } from './fulfilment-authority';
import { ApiError, id, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { requireCatalogAudience } from './catalog-audience';
import { normalizeCatalogForm } from './catalog-form-schema';
import { safeFileName, sha256Hex } from './mail-attachment';
import { personForMember } from './person-binding';
import { resolveManager } from './delegation';
import type { WorkContext } from './core';

/**
 * CATALOG-008 (ct, 21 October): a vendor quote is a private `catalog_quote` PDF of at most 20 MiB, kept with the
 * request's files so export, erasure and retention reach it. A submission binds it once to the request's
 * fulfilment (its hash is frozen in the snapshot) and it never changes afterwards; replacing it is a fresh
 * submission. Linen never reads the amount from the PDF. A quote grants no approval and no provider authority.
 */
export const QUOTE_VISIBILITY = 'catalog_quote';
export const QUOTE_MAX_BYTES = 20 * 1024 * 1024;
export const quoteTypeMessage = 'Quotes must be PDF files up to 20 MiB.';
export const quoteRequiredMessage = 'Attach the vendor quote (PDF) to submit this request.';

export interface QuoteRow {
  id: string; workspace_id: string; work_id: string; blob_key: string; name: string; content_type: string; size: number;
  sha256: string; created_at: string; catalog_id: string; fulfilment_id: string | null;
}
export type QuoteRelation = 'requester' | 'beneficiary' | 'owner' | 'approver' | 'decided_approver' | 'fulfilment_owner';

const isPdf = (bytes: Uint8Array) => bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === '%PDF-';

/** The requester or beneficiary attaches the quote before submitting; a later upload replaces an unsubmitted one. */
export async function storeCatalogQuote(ctx: WorkContext, workId: string, input: { catalogId: string; name: string; contentType: string; bytes: ArrayBuffer }) {
  await currentWorkPrincipal(ctx);
  const db = ctx.env.DB, w = ctx.principal.workspaceId, userId = ctx.principal.userId;
  const work = await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w, workId).first<any>();
  if (!work || (work.requester_id !== userId && work.beneficiary_id !== userId)) throw new ApiError(404, 'not_found', 'Work not found');
  if (['closed', 'cancelled'].includes(work.state)) throw new ApiError(409, 'work_closed', 'Reopen the request before attaching a quote');
  const catalog = await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w, input.catalogId).first<any>();
  if (!catalog) throw new ApiError(404, 'not_found', 'Catalog item not found');
  if((catalog.department_id??null)!==(work.department_id??null))throw new ApiError(409,'catalog_department_mismatch','Choose a request in the same department as this catalog item');
  if (!normalizeCatalogForm(JSON.parse(catalog.form_json)).quoteRequired) throw new ApiError(422, 'catalog_quote_unneeded', 'This item does not take a quote');
  await requireCatalogAudience(ctx, catalog, work.beneficiary_id);
  if (await db.prepare('SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w, workId, input.catalogId).first())
    throw new ApiError(409, 'catalog_quote_immutable', 'The submitted quote is fixed; replacing it is a fresh submission');
  const bytes = new Uint8Array(input.bytes);
  if (!bytes.length || bytes.length > QUOTE_MAX_BYTES || !isPdf(bytes) || input.contentType.split(';')[0].trim().toLowerCase() !== 'application/pdf')
    throw new ApiError(422, 'catalog_quote_type', quoteTypeMessage);
  const quoteId = id(), key = `${w}/${workId}/${quoteId}`, hash = await sha256Hex(input.bytes);
  await ctx.env.ATTACHMENTS.put(key, input.bytes, { httpMetadata: { contentType: 'application/octet-stream' } });
  const earlier = (await db.prepare('SELECT id,blob_key FROM work_attachments WHERE workspace_id=? AND work_id=? AND catalog_id=? AND visibility=? AND fulfilment_id IS NULL')
    .bind(w, workId, input.catalogId, QUOTE_VISIBILITY).all<{ id: string; blob_key: string }>()).results;
  const results = await db.batch([
    db.prepare(`INSERT INTO work_attachments(id,workspace_id,work_id,visibility,blob_key,name,content_type,size,sha256,created_at,catalog_id)
      SELECT ?,?,?,?,?,?,'application/pdf',?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?)
      AND EXISTS(SELECT 1 FROM work_records WHERE workspace_id=? AND id=? AND state NOT IN ('closed','cancelled'))
      AND EXISTS(SELECT 1 FROM work_catalog c JOIN work_records r ON r.workspace_id=c.workspace_id AND r.id=? WHERE c.workspace_id=? AND c.id=? AND c.revision=? AND c.department_id IS r.department_id AND (c.department_id IS NULL OR EXISTS(SELECT 1 FROM work_departments d WHERE d.workspace_id=c.workspace_id AND d.id=c.department_id AND d.active=1)))`)
      .bind(quoteId, w, workId, QUOTE_VISIBILITY, key, safeFileName(input.name), bytes.length, hash, now(), input.catalogId, w, workId, input.catalogId, w, workId,workId,w,input.catalogId,catalog.revision),
    db.prepare(`DELETE FROM work_attachments WHERE workspace_id=? AND work_id=? AND catalog_id=? AND visibility=? AND fulfilment_id IS NULL AND id<>? AND changes()=1`)
      .bind(w, workId, input.catalogId, QUOTE_VISIBILITY, quoteId),
    // Audits carry ids and size only: never the file name or its contents.
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM work_attachments WHERE id=?)`)
      .bind(id(), w, userId, earlier.length ? 'catalog.quote_replaced' : 'catalog.quote_uploaded', workId,
        JSON.stringify({ catalogId: input.catalogId, attachmentId: quoteId, size: bytes.length, replaced: earlier.map(e => e.id) }), now(), quoteId),
  ]);
  if (!results[0].meta.changes) {
    await ctx.env.ATTACHMENTS.delete(key);
    throw new ApiError(409, 'catalog_changed', 'This item changed while you were filling it in. Review it and submit again.');
  }
  for (const old of earlier) await ctx.env.ATTACHMENTS.delete(old.blob_key);
  return { id: quoteId, catalogId: input.catalogId, sha256: hash, size: bytes.length };
}

/** Exactly the ct-approved readers; anyone else gets no sign of the file. Reads are decided at read time. */
export async function quoteRelation(ctx: WorkContext, quote: Pick<QuoteRow, 'work_id' | 'catalog_id' | 'fulfilment_id'>): Promise<QuoteRelation | null> {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, userId = ctx.principal.userId;
  const work = await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(w, quote.work_id).first<any>();
  if (!work) return null;
  const f = quote.fulfilment_id ? await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND id=?').bind(w, quote.fulfilment_id).first<any>() : null;
  if (work.requester_id === userId) return 'requester';
  if (work.beneficiary_id === userId || f?.beneficiary_id === userId) return 'beneficiary';
  if (ctx.principal.roles.includes('owner')) return 'owner';
  if (!f) return null;
  const catalog = await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w, quote.catalog_id).first<any>();
  if (!catalog) return null;
  if (await db.prepare('SELECT 1 FROM work_fulfilment_approvals WHERE workspace_id=? AND fulfilment_id=? AND holder_id=?').bind(w, f.id, userId).first()) return 'decided_approver';
  if (await db.prepare('SELECT 1 FROM work_approval_decisions WHERE workspace_id=? AND fulfilment_id=? AND approver_id=?').bind(w,f.id,userId).first()) return 'decided_approver';
  const chain=await chainStatus(ctx,work,catalog,f,await managerStageApproved(ctx,work,catalog,f));
  if (!['closed','cancelled'].includes(work.state) && chain.pendingStages.some(stage=>stage.approvers.includes(userId))) return 'approver';
  if (await fulfilmentRequiresManager(ctx,catalog,f) && !['closed', 'cancelled'].includes(work.state) && userId !== f.beneficiary_id) {
    const person = await personForMember(ctx, f.beneficiary_id);
    if (person && await resolveManager(ctx, person.manager_id || null) === userId) return 'approver';
  }
  // Quote custody follows today's fulfillment owner, independently of the saved routing/cost snapshot.
  const fulfillmentOwner = catalog.application_id
    ? (await db.prepare("SELECT owner_id FROM svc_records WHERE workspace_id=? AND id=? AND kind='application'")
      .bind(w, catalog.application_id).first<{ owner_id: string }>())?.owner_id
    : catalog.owner_id;
  if (userId === fulfillmentOwner && ctx.principal.roles.some(r => ['operator', 'owner'].includes(r))) return 'fulfilment_owner';
  return null;
}

export async function quoteById(ctx: WorkContext, quoteId: string) {
  return ctx.env.DB.prepare('SELECT * FROM work_attachments WHERE workspace_id=? AND id=? AND visibility=?')
    .bind(ctx.principal.workspaceId, quoteId, QUOTE_VISIBILITY).first<QuoteRow>();
}

/** A privileged read (anyone but the requester or beneficiary) is audited by id and relation, never by content. */
export async function readCatalogQuote(ctx: WorkContext, quoteId: string) {
  await currentWorkPrincipal(ctx);
  const row = await quoteById(ctx, quoteId);
  const relation = row ? await quoteRelation(ctx, row) : null;
  if (!row || !relation) throw new ApiError(404, 'not_found', 'Attachment not found');
  if (!['requester', 'beneficiary'].includes(relation))
    await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.catalog_quote_read', row.work_id, JSON.stringify({ attachmentId: row.id, relation }), now()).run();
  const blob = await ctx.env.ATTACHMENTS.get(row.blob_key);
  if (!blob) throw new ApiError(503, 'attachment_unavailable', 'Attachment bytes unavailable');
  return { blob, name: row.name };
}

/** Readers see the file's details; everyone else sees only that a quote is attached. */
export async function quotesForRequest(ctx: WorkContext, workId: string) {
  const rows = (await ctx.env.DB.prepare('SELECT * FROM work_attachments WHERE workspace_id=? AND work_id=? AND visibility=? ORDER BY created_at,id')
    .bind(ctx.principal.workspaceId, workId, QUOTE_VISIBILITY).all<QuoteRow>()).results;
  return Promise.all(rows.map(async r => await quoteRelation(ctx, r)
    ? { attached: true as const, id: r.id, catalogId: r.catalog_id, name: r.name, size: r.size, sha256: r.sha256, submitted: r.fulfilment_id !== null }
    : { attached: true as const, catalogId: r.catalog_id, submitted: r.fulfilment_id !== null }));
}

/** A frozen snapshot's quote reference is shown in full to readers and only as "attached" to anyone else. */
export async function projectSnapshot<T extends { quote?: { id: string; sha256: string; size: number } | { attached: true } | null }>(ctx: WorkContext, snapshot: T): Promise<T> {
  const quote = snapshot.quote as { id?: string } | null | undefined;
  if (!quote?.id) return snapshot;
  const row = await quoteById(ctx, quote.id);
  return row && await quoteRelation(ctx, row) ? snapshot : { ...snapshot, quote: { attached: true } };
}
