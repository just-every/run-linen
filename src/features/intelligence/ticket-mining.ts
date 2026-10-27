import type { Context, Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { jobContext } from '../adoption/freshservice-import/context';
import { stored, boundary } from '../../modules/import-kit/src/d1/jobs';
import { readOriginals } from '../../modules/import-kit/src/d1/originals';
import { custodyGuards } from '../../modules/import-kit/src/d1/original-storage';
import { readAtomic, guard, sql } from '../../modules/import-kit/src/d1/database';
import { sha256, canonicalJson } from '../../modules/import-kit/src/d1/index';
import { assert } from './access';

type Ticket = { identity: string; words: string[]; createdAt: string; source: { importId: string; ticketId: string; artifactHash: string; location: unknown } };
const stop = new Set('a an and are as at be by can for from help i in is it me my of on or please request the this to with need ticket user'.split(' '));
function words(title: string) {
    return [...new Set((title.toLowerCase().match(/[a-z]{3,32}/g) ?? []).filter(word => !stop.has(word)))].sort().slice(0, 64);
}
const similarity = (a: string[], b: string[]) => {
    const common = a.filter(word => b.includes(word)).length;
    return common / (new Set([...a, ...b]).size || 1);
};

/** Analysis is read-only. Source text is never sent to a model or retained in a derivative store. */
export async function mineTicketHistory(c: Context<AppEnv>, body: Record<string, unknown>) {
    assert(c.get('principal').roles.includes('owner'), 'owner_required', 403);
    const ids = body.importIds;
    assert(typeof body.recentSince === 'string' && /^\d{4}-\d\d-\d\dT/.test(body.recentSince) && /(?:Z|[+-]\d\d:\d\d)$/.test(body.recentSince) && Number.isFinite(Date.parse(body.recentSince)), 'recent_boundary_required');
    const recentSince = new Date(body.recentSince).toISOString();
    assert(Array.isArray(ids) && ids.length > 0 && ids.length <= 20 && ids.every(value => typeof value === 'string' && value.length <= 100), 'import_ids_required');
    assert(new Set(ids).size === ids.length, 'duplicate_import_id');
    // The request selects custody, never supplies ticket text, completion facts or authority.
    assert(Object.keys(body).every(key => ['importIds', 'recentSince'].includes(key)), 'unsupported_mining_input');
    const tickets: Ticket[] = [], seen = new Set<string>(), snapshots: any[] = [];
    let firstContext: Awaited<ReturnType<typeof jobContext>> | undefined;
    for (const importId of [...ids].sort()) {
        const context = await jobContext(c, importId);
        firstContext ??= context;
        // Capture both monotonic custody revisions before loading any source bytes.
        const revision = await c.env.DB.prepare(`SELECT j.id,j.fence,s.revision state_revision,r.revision custody_revision
            FROM ik_jobs j JOIN ik_d1_custody_states s ON s.job_id=j.id
            JOIN ik_d1_custody_revisions r ON r.job_id=j.id WHERE j.id=?`).bind(importId).first<any>();
        assert(revision, 'source_custody_unavailable', 409);
        snapshots.push(revision);
        const { job, plan } = await stored(importId, context);
        assert(job.state === 'completed' && job.checkpoint === job.total && !job.erasedRecords && !plan.erasure, 'completed_unerased_import_required', 409);
        const originals = await readOriginals(plan, importId, context);
        assert(originals.length > 0 && originals.every(item => item.original.status === 'retained'), 'source_original_required', 409);
        await readAtomic(context, [...boundary(job, plan), ...custodyGuards(plan, importId)]);
        for (const entry of plan.entries) {
            assert(!seen.has(entry.identity), 'duplicate_source_ticket', 409);
            seen.add(entry.identity);
            const payload = entry.source.payload as any, raw = payload?.ticket;
            assert(!entry.rejection && !entry.erased && entry.source.kind === 'ticket' && entry.effects.length === 1 && entry.effects[0].targetKind === 'work', 'unsupported_source_ticket', 409);
            const title = raw?.Subject ?? raw?.subject, createdAt = raw?.['Created Time'] ?? raw?.created_at;
            assert(typeof title === 'string' && typeof createdAt === 'string' && Number.isFinite(Date.parse(createdAt)), 'source_ticket_fields_required', 409);
            assert(originals.some(item => item.sha256 === entry.source.artifactHash), 'source_artifact_missing', 409);
            tickets.push({ identity: entry.identity, words: words(title), createdAt: new Date(createdAt).toISOString(), source: { importId, ticketId: entry.source.sourceId, artifactHash: entry.source.artifactHash, location: entry.source.location } });
            assert(tickets.length <= 1000, 'mining_corpus_too_large', 413);
        }
    }
    // Read every selected job under one final authority and privacy fence. No source
    // analysis escapes if erasure, undo, role withdrawal or restore moved custody.
    await readAtomic(firstContext!, [guard(sql(`NOT EXISTS(SELECT 1 FROM json_each(?) e WHERE NOT EXISTS(
        SELECT 1 FROM ik_jobs j JOIN ik_d1_custody_states s ON s.job_id=j.id JOIN ik_d1_custody_revisions r ON r.job_id=j.id
        WHERE j.id=json_extract(e.value,'$.id') AND j.fence=json_extract(e.value,'$.fence')
        AND s.revision=json_extract(e.value,'$.state_revision') AND r.revision=json_extract(e.value,'$.custody_revision')))`, JSON.stringify(snapshots)))]);
    tickets.sort((a, b) => a.identity.localeCompare(b.identity));
    const clusters: { seed: string[]; tickets: Ticket[] }[] = [];
    for (const ticket of tickets) {
        if (!ticket.words.length) continue;
        const match = clusters.map(cluster => ({ cluster, score: similarity(cluster.seed, ticket.words) })).sort((a, b) => b.score - a.score)[0];
        if (match && match.score >= 0.5) match.cluster.tickets.push(ticket);
        else clusters.push({ seed: ticket.words, tickets: [ticket] });
    }
    const repeated = clusters.filter(cluster => cluster.tickets.length >= 2).sort((a, b) => b.tickets.length - a.tickets.length || a.seed.join(' ').localeCompare(b.seed.join(' '))).slice(0, 3);
    const proposals = repeated.map(cluster => {
        const count = cluster.tickets.length;
        const frequency = new Map<string, number>();
        for (const ticket of cluster.tickets) for (const word of ticket.words) frequency.set(word, (frequency.get(word) ?? 0) + 1);
        const sharedWords = [...frequency].filter(([, occurrences]) => occurrences === count).map(([word]) => word).sort();
        const label = (sharedWords.length ? sharedWords : cluster.seed).join(' ');
        return {
            id: sha256(canonicalJson(cluster.tickets.map(ticket => ticket.identity))), state: 'draft', label,
            matchedTickets: count, historicTickets: cluster.tickets.filter(ticket => ticket.createdAt < recentSince).length, recentTickets: cluster.tickets.filter(ticket => ticket.createdAt >= recentSince).length, sources: cluster.tickets.map(ticket => ticket.source),
            expectedWorkSaved: { unit: 'manual ticket handlings', upperBound: count, minutes: null, basis: 'At most one avoided handling per matched source ticket, if an approved automation fully replaces that work; not measured savings.' },
            risks: ['Lexical overlap is a candidate pattern, not a verified common cause.', 'Historic demand may differ from recent demand.', 'Source history does not establish permission, safe execution or successful resolution.'],
            drafts: {
                catalogItem: { title: `Help with ${label}`, state: 'draft', audience: null },
                workflow: { state: 'draft', steps: ['Check the current request and applicable policy', 'Resolve the missing execution and verification design', 'Request existing authority before any effect', 'Independently verify the outcome'], executable: false },
                standingGrant: { state: 'proposed', issued: false, principalId: null, action: null, scope: null, reason: 'An independent authority holder must define and issue a scoped grant through the normal grant door.' },
                article: { title: `Repeated work: ${label}`, state: 'draft', body: 'Review the cited source tickets, establish a supported resolution and verify it before publishing instructions.' },
            },
            publication: { state: 'admin_review_required', published: false },
            effect: { state: 'not_observed', observationDays: 14, measuredSavings: null, reason: 'No publication or elapsed observation window is established by source analysis.' },
        };
    });
    return { state: proposals.length === 3 ? 'proposed' : 'insufficient_patterns', corpus: { tickets: tickets.length, imports: ids.length, recentSince, historicTickets: tickets.filter(ticket => ticket.createdAt < recentSince).length, recentTickets: tickets.filter(ticket => ticket.createdAt >= recentSince).length, fingerprint: sha256(canonicalJson(snapshots)), earliest: tickets.map(ticket => ticket.createdAt).sort()[0] ?? null, latest: tickets.map(ticket => ticket.createdAt).sort().at(-1) ?? null }, method: 'Deterministic title token overlap; no semantic or causal diagnosis is claimed.', proposals, unclusteredTickets: tickets.length - proposals.reduce((count, proposal) => count + proposal.matchedTickets, 0) };
}

export function registerTicketMiningRoutes(app: Hono<AppEnv>) {
    app.post('/intelligence/ticket-mining', async c => {
        c.header('Cache-Control', 'private, no-store');
        try { return c.json(await mineTicketHistory(c, await jsonBody(c))); }
        catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError(409, 'mining_source_changed', 'Source custody or current authority changed; review the selected imports again');
        }
    });
}
