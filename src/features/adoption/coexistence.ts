import { id, now } from '../../platform/http';
import { check, owner, statement, sha, encode, type AdoptionContext } from './core';
import { configuredFreshservice, type Freshservice } from './freshservice';
import { assertAdoptionEffectAllowed } from './authority';
export async function createSource(ctx: AdoptionContext, input: {
    connectionId: string;
    sourceWorkspace: number;
    since?: string;
}) { await owner(ctx); check(Number.isInteger(input.sourceWorkspace) && input.sourceWorkspace > 0 && (input.since === undefined || Number.isFinite(Date.parse(input.since)) && Date.parse(input.since) <= Date.now()), 'invalid_source_scope'); await configuredFreshservice(ctx, input.connectionId); const sourceId = id(); await ctx.env.DB.batch([ctx.env.DB.prepare("INSERT INTO adoption_sources(id,workspace_id,connection_id,provider,source_workspace,state,checkpoint) VALUES(?,?,?,'freshservice',?,'unverified',?)").bind(sourceId, ctx.principal.workspaceId, input.connectionId, input.sourceWorkspace, new Date(input.since ?? 0).toISOString()), statement(ctx, 'adoption.source.create', sourceId)]); return { id: sourceId, state: 'unverified' }; }
async function source(ctx: AdoptionContext, sourceId: string, effect = false) {
    if (effect) {
        const m = await ctx.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(ctx.principal.workspaceId, ctx.principal.userId).first<{
            roles_json: string;
        }>();
        check(m && JSON.parse(m.roles_json).some((r: string) => ['owner', 'operator', 'integration'].includes(r)), 'effect_role_required', 403);
    }
    else
        await owner(ctx);
    const s = await ctx.env.DB.prepare('SELECT * FROM adoption_sources WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, sourceId).first<any>();
    check(s, 'source_not_found', 404);
    return s;
}
export async function ingestSourceRecord(ctx: AdoptionContext, sourceId: string, externalId: string, revision: string, payload: unknown) {
    await owner(ctx);
    check(Number.isFinite(Date.parse(revision)), 'source_revision_invalid');
    const encoded = encode(payload);
    check(encoded.byteLength <= 2 * 1024 * 1024, 'source_payload_limit', 413);
    const digest = await sha(encoded);
    const prior = await ctx.env.DB.prepare('SELECT * FROM adoption_source_records WHERE workspace_id=? AND source_id=? AND external_id=? ORDER BY revision DESC LIMIT 1').bind(ctx.principal.workspaceId, sourceId, externalId).first<any>();
    if (prior?.revision === revision) {
        check(prior.digest === digest, 'source_revision_conflict', 409);
        return { state: 'replay', id: prior.id };
    }
    if (prior && prior.revision > revision)
        return { state: 'stale', id: prior.id };
    const rid = id();
    await ctx.env.DB.batch([ctx.env.DB.prepare("INSERT INTO adoption_source_records VALUES(?,?,?,?,?,?,?,'unresolved',?)").bind(rid, ctx.principal.workspaceId, sourceId, externalId, revision, digest, JSON.stringify(payload), now()), ctx.env.DB.prepare("UPDATE adoption_ownership SET state='reconciling',fence=fence+1,revision=revision+1 WHERE workspace_id=? AND source_id=? AND (source_ticket_id=? OR resource=?) AND source_revision<>?").bind(ctx.principal.workspaceId, sourceId, Number(externalId), `ticket:${externalId}`, revision)]);
    return { state: 'unresolved', id: rid };
}
export async function pollSource(ctx: AdoptionContext, sourceId: string, adapter?: Freshservice) {
    const s = await source(ctx, sourceId), client = adapter || await configuredFreshservice(ctx, s.connection_id);
    try {
        const tickets = await client.tickets(s.source_workspace, s.checkpoint, s.page);
        let latest = s.checkpoint;
        for (const t of tickets) {
            const conversations = [];
            for (let page = 1; page <= 100; page++) {
                const rows = await client.conversations(t.id, page);
                conversations.push(...rows);
                if (rows.length < 100)
                    break;
                check(page < 100, 'conversation_page_limit', 409);
            }
            const approvals = await client.approvals(t.id);
            await ingestSourceRecord(ctx, sourceId, String(t.id), new Date(t.updated_at).toISOString(), { ticket: t, conversations, approvalGroups: approvals, attachmentState: conversations.some((x: any) => x.attachments?.length) ? 'requires_scoped_attachment_import' : 'none', source: 'freshservice-v2' });
            if (t.updated_at > latest)
                latest = t.updated_at;
        }
        // Keep lower-bound checkpoint until all pages drained; overlap timestamp on next sweep prevents lost equal-time edits.
        const complete = tickets.length < 25;
        await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_sources SET state=?,page=?,checkpoint=?,last_seen_at=?,error=NULL,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?").bind(complete ? 'current' : 'polling', complete ? 1 : s.page + 1, complete ? latest : s.checkpoint, now(), ctx.principal.workspaceId, sourceId, s.revision), statement(ctx, 'adoption.source.poll', sourceId, { count: tickets.length, complete })]);
        return { id: sourceId, state: complete ? 'current' : 'polling', count: tickets.length };
    }
    catch (e) {
        await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_sources SET state='unavailable',error='source_poll_failed',revision=revision+1 WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, sourceId), ctx.env.DB.prepare("UPDATE adoption_ownership SET state='held',fence=fence+1,revision=revision+1 WHERE workspace_id=? AND source_id=?").bind(ctx.principal.workspaceId, sourceId)]);
        throw e;
    }
}
export async function establishOwnership(ctx: AdoptionContext, input: {
    resource: string;
    action: string;
    sourceId?: string;
    sourceTicketId?: number;
    approvalId?: number;
    expectedRevision?: number;
    incumbentDisabledEvidence?: string;
}, adapter?: Freshservice) {
    await owner(ctx);
    check(input.resource && input.action, 'ownership_scope_required');
    let sourceRevision: string | null = null, approvalRevision: string | null = null, approvalExpires: string | null = null, feedExpires: string | null = null;
    if (input.sourceId) {
        check(input.incumbentDisabledEvidence && input.incumbentDisabledEvidence.length >= 10, 'incumbent_executor_evidence_required');
        const s = await source(ctx, input.sourceId);
        check(s.state === 'current', 'source_not_current', 409);
        const ticketId = input.sourceTicketId || (/^ticket:[1-9]\d*$/.test(input.resource) ? Number(input.resource.slice(7)) : 0);
        check(Number.isInteger(ticketId) && ticketId > 0, 'source_ticket_required');
        const client = adapter || await configuredFreshservice(ctx, s.connection_id);
        const t = await client.ticket(ticketId, s.source_workspace);
        const groups = await client.approvals(ticketId);
        check(groups.length && groups.every(g => g.approval_status.id === 1) && groups.some(g => g.id === input.approvalId), 'current_approval_required', 409);
        sourceRevision = new Date(t.updated_at).toISOString();
        approvalRevision = await sha(encode(groups));
        approvalExpires = new Date(Date.now() + 60000).toISOString();
        feedExpires = approvalExpires;
    }
    const prior = await ctx.env.DB.prepare('SELECT * FROM adoption_ownership WHERE workspace_id=? AND resource=? AND action=?').bind(ctx.principal.workspaceId, input.resource, input.action).first<any>();
    if (prior) {
        check(input.expectedRevision === prior.revision, 'ownership_revision_conflict', 409);
        check(!prior.source_id || input.sourceId === prior.source_id, 'fenced_cutover_required', 409);
    }
    const ownershipId = prior?.id || id(), fence = (prior?.fence || 0) + 1;
    const statementSQL = prior ? ctx.env.DB.prepare("UPDATE adoption_ownership SET source_id=?,executor='linen',state='active',fence=?,source_revision=?,approval_id=?,approval_revision=?,approval_expires=?,feed_expires=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?").bind(input.sourceId || null, fence, sourceRevision, String(input.approvalId || ''), approvalRevision, approvalExpires, feedExpires, ctx.principal.workspaceId, ownershipId, prior.revision) : ctx.env.DB.prepare("INSERT INTO adoption_ownership(id,workspace_id,resource,action,source_id,executor,state,fence,source_revision,approval_id,approval_revision,approval_expires,feed_expires) VALUES(?,?,?,?,?,'linen','active',?,?,?,?,?,?)").bind(ownershipId, ctx.principal.workspaceId, input.resource, input.action, input.sourceId || null, fence, sourceRevision, String(input.approvalId || ''), approvalRevision, approvalExpires, feedExpires);
    const result = await ctx.env.DB.batch([statementSQL, ctx.env.DB.prepare('UPDATE adoption_ownership SET source_ticket_id=? WHERE workspace_id=? AND id=? AND fence=? AND changes()>0').bind(input.sourceId ? (input.sourceTicketId || Number(input.resource.slice(7))) : null, ctx.principal.workspaceId, ownershipId, fence), statement(ctx, 'adoption.ownership.establish', ownershipId, { resource: input.resource, action: input.action, incumbentDisabledEvidence: input.incumbentDisabledEvidence || null })]);
    check(result[0].meta.changes, 'ownership_revision_conflict', 409);
    return { id: ownershipId, fence, sourceRevision, revision: (prior?.revision || 0) + 1 };
}
export async function validateSourceAuthority(ctx: AdoptionContext, ownershipId: string, adapter?: Freshservice) {
    const row = await ctx.env.DB.prepare('SELECT * FROM adoption_ownership WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, ownershipId).first<any>();
    check(row && row.source_id, 'ownership_not_found', 404);
    const s = await source(ctx, row.source_id, true), client = adapter || await configuredFreshservice(ctx, s.connection_id);
    try {
        const ticket = await client.ticket(Number(row.source_ticket_id || row.resource.slice(7)), s.source_workspace), groups = await client.approvals(ticket.id);
        check(new Date(ticket.updated_at).toISOString() === row.source_revision && await sha(encode(groups)) === row.approval_revision && groups.every(g => g.approval_status.id === 1), 'approval_changed', 409);
        const expires = new Date(Date.now() + 60000).toISOString();
        const renewed = await ctx.env.DB.prepare('UPDATE adoption_ownership SET approval_expires=?,feed_expires=? WHERE workspace_id=? AND id=? AND fence=?').bind(expires, expires, ctx.principal.workspaceId, ownershipId, row.fence).run();
        check(renewed.meta.changes, 'source_fence_changed', 409);
        return { ...row, approval_expires: expires, feed_expires: expires };
    }
    catch (e) {
        await ctx.env.DB.prepare("UPDATE adoption_ownership SET state='held',fence=fence+1,revision=revision+1 WHERE workspace_id=? AND id=?").bind(ctx.principal.workspaceId, ownershipId).run();
        throw e;
    }
}
export async function beginCutover(ctx: AdoptionContext, ownershipId: string, revision: number, checkpoint: string) { await owner(ctx); const o = await ctx.env.DB.prepare('SELECT * FROM adoption_ownership WHERE workspace_id=? AND id=? AND revision=?').bind(ctx.principal.workspaceId, ownershipId, revision).first<any>(); check(o, 'ownership_revision_conflict', 409); check(o.source_id, 'native_cutover_not_required'); const s = await source(ctx, o.source_id); check(s.state === 'current' && s.checkpoint === checkpoint, 'delta_checkpoint_changed', 409); const result = await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_ownership SET state='cutover_held',executor='none',fence=fence+1,cutover_checkpoint=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?").bind(checkpoint, ctx.principal.workspaceId, ownershipId, revision), statement(ctx, 'adoption.cutover.fence', ownershipId, { checkpoint })]); check(result[0].meta.changes, 'ownership_revision_conflict', 409); return { state: 'cutover_held', fence: o.fence + 1, revision: revision + 1 }; }
export async function completeCutover(ctx: AdoptionContext, ownershipId: string, revision: number) { await owner(ctx); const o = await ctx.env.DB.prepare('SELECT * FROM adoption_ownership WHERE workspace_id=? AND id=? AND revision=?').bind(ctx.principal.workspaceId, ownershipId, revision).first<any>(); check(o?.state === 'cutover_held', 'cutover_not_held', 409); const s = await source(ctx, o.source_id); check(s.state === 'current' && s.checkpoint === o.cutover_checkpoint, 'late_arrivals_require_reconciliation', 409); const unresolved = await ctx.env.DB.prepare("SELECT 1 FROM execution_operations WHERE workspace_id=? AND resource=? AND state NOT IN ('cancelled','failed','verified') LIMIT 1").bind(ctx.principal.workspaceId, o.resource).first(); check(!unresolved, 'running_effects_require_reconciliation', 409); check(!await ctx.env.DB.prepare("SELECT 1 FROM adoption_source_records WHERE workspace_id=? AND source_id=? AND state='unresolved' LIMIT 1").bind(ctx.principal.workspaceId, o.source_id).first(), 'source_records_require_reconciliation', 409); await ctx.env.DB.batch([ctx.env.DB.prepare("UPDATE adoption_ownership SET source_id=NULL,executor='linen',state='active',fence=fence+1,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?").bind(ctx.principal.workspaceId, ownershipId, revision), statement(ctx, 'adoption.cutover.complete', ownershipId)]); return { state: 'active', fence: o.fence + 1 }; }
/** Execution owns dispatch authorization. A missing validator cannot produce a provider write. */
export async function writebackEvidence(ctx: AdoptionContext, input: {
    ownershipId: string;
    operationId: string;
    body: string;
}, authorizeCurrent: () => Promise<void>, adapter?: Freshservice) {
    check(typeof authorizeCurrent === 'function', 'current_grant_validator_required');
    await authorizeCurrent();
    const o = await validateSourceAuthority(ctx, input.ownershipId, adapter);
    await assertAdoptionEffectAllowed(ctx, { resource: o.resource, action: o.action, sourceId: o.source_id, sourceRevision: o.source_revision, fence: o.fence }, adapter);
    const s = await source(ctx, o.source_id, true), client = adapter || await configuredFreshservice(ctx, s.connection_id);
    const existing = await ctx.env.DB.prepare('SELECT * FROM adoption_writebacks WHERE workspace_id=? AND source_id=? AND operation_id=?').bind(ctx.principal.workspaceId, o.source_id, input.operationId).first<any>();
    if (existing) {
        if (existing.state === 'sent')
            return existing;
        throw new (await import('../../platform/http')).ApiError(409, 'writeback_reconciliation_required', 'Unknown writeback must be reconciled before repeat');
    }
    const wid = id(), marker = `linen:${wid}`;
    await ctx.env.DB.prepare("INSERT INTO adoption_writebacks VALUES(?,?,?,?,?,?, 'unknown',NULL,?)").bind(wid, ctx.principal.workspaceId, o.source_id, String(o.source_ticket_id || o.resource.slice(7)), input.operationId, marker, now()).run();
    await authorizeCurrent();
    await assertAdoptionEffectAllowed(ctx, { resource: o.resource, action: o.action, sourceId: o.source_id, sourceRevision: o.source_revision, fence: o.fence }, adapter);
    const ref = await client.note(Number(o.source_ticket_id || o.resource.slice(7)), `${input.body}\n\n[${marker}]`);
    await ctx.env.DB.prepare("UPDATE adoption_writebacks SET state='sent',provider_ref=? WHERE workspace_id=? AND id=?").bind(ref, ctx.principal.workspaceId, wid).run();
    return { id: wid, state: 'sent', providerRef: ref };
}
export async function reconcileWriteback(ctx: AdoptionContext, writebackId: string, adapter?: Freshservice) {
    await owner(ctx);
    const row = await ctx.env.DB.prepare('SELECT * FROM adoption_writebacks WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId, writebackId).first<any>();
    check(row, 'not_found', 404);
    const s = await source(ctx, row.source_id, true), client = adapter || await configuredFreshservice(ctx, s.connection_id);
    for (let page = 1; page <= 100; page++) {
        const notes = await client.conversations(Number(row.external_id), page);
        const found = notes.find(x => String(x.body || '').includes(`[${row.marker}]`));
        if (found) {
            await ctx.env.DB.prepare("UPDATE adoption_writebacks SET state='sent',provider_ref=? WHERE workspace_id=? AND id=?").bind(String(found.id), ctx.principal.workspaceId, writebackId).run();
            return { state: 'sent', providerRef: String(found.id) };
        }
        if (notes.length < 100)
            break;
    }
    return { state: 'unknown', reason: 'absence does not establish safe retry' };
}
