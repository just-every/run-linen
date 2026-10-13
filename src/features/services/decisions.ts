import type { Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { create, date, getService, mutate, strings, type ServiceRecord } from './store';
export async function newDecision(db: D1Database, p: Principal, b: Record<string, any>) {
    const context = await getService(db, p, requiredString(b.contextId, 'contextId'));
    if (!['supplier', 'change', 'asset', 'service'].includes(context.kind))
        throw new ApiError(400, 'context', 'Business service context required');
    const holder = requiredString(b.holderId, 'holderId');
    const member = await db.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, holder).first<{
        roles_json: string;
    }>();
    if (!member)
        throw new ApiError(400, 'holder', 'Active decision holder required');
    const roles = strings(b.holderRoles, 'holderRoles');
    if (!roles.some(role => JSON.parse(member.roles_json).includes(role)))
        throw new ApiError(400, 'holder', 'Decision holder lacks required role');
    const options = b.options;
    if (!Array.isArray(options) || options.length < 2 || options.some((o: any) => !o.id || !o.label || !o.consequences))
        throw new ApiError(400, 'options', 'At least two concrete options with consequences required');
    if (new Set(options.map((o: any) => o.id)).size !== options.length || !options.some((o: any) => o.id === b.recommendation))
        throw new ApiError(400, 'options', 'Unique options and a matching recommendation required');
    const executorId = b.executorId || p.userId;
    const executor = await db.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, executorId).first<{
        roles_json: string;
    }>();
    if (!executor || !JSON.parse(executor.roles_json).some((role: string) => ['owner', 'operator'].includes(role)))
        throw new ApiError(400, 'executor', 'Active service executor required');
    for (const option of options) {
        if (option.effect) {
            if (option.effect.kind !== 'change' || !['release', 'compensate'].includes(option.effect.phase))
                throw new ApiError(400, 'effect', 'Declared release or compensation required');
            const change = await getService(db, p, option.effect.changeId, 'change');
            if (option.effect.implementationRevision !== change.data.implementationRevision)
                throw new ApiError(409, 'effect_revision', 'Current exact implementation required');
        }
    }
    return create(db, p, 'decision', { title: requiredString(b.title, 'title'), contextId: context.id, contextRevision: context.revision, executorId, holderId: holder, holderRoles: roles, options, recommendation: b.recommendation, quote: requiredString(b.quote, 'quote', 10000), quoteSource: requiredString(b.quoteSource, 'quoteSource'), terms: requiredString(b.terms, 'terms', 10000), cohorts: strings(b.cohorts, 'cohorts'), impact: requiredString(b.impact, 'impact'), reversibility: requiredString(b.reversibility, 'reversibility'), deadline: date(b.deadline, 'deadline'), uncertainty: requiredString(b.uncertainty, 'uncertainty'), state: 'needs-decision', history: [], nextDueAt: date(b.deadline, 'deadline') }, { visibility: 'restricted', participants: [...new Set([holder, executorId, p.userId, ...context.participants])] });
}
export async function decide(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>, command: string) {
    if (r.data.holderId !== p.userId || !r.data.holderRoles.some((role: string) => p.roles.includes(role as any)))
        throw new ApiError(403, 'decision_holder', 'Current named decision holder required');
    if (!['needs-decision', 'deferred'].includes(r.data.state))
        throw new ApiError(409, 'decision_state', 'Decision already settled; amend the packet');
    const context = await getService(db, p, r.data.contextId);
    if (context.revision !== r.data.contextRevision)
        throw new ApiError(409, 'decision_stale', 'Context changed; amend the packet before deciding');
    let state = command === 'choose' ? 'chosen' : command === 'reject' ? 'rejected' : 'deferred';
    let choice: string | null = null, nextDueAt: string | null = null;
    if (command === 'choose') {
        choice = requiredString(b.optionId, 'optionId');
        if (!r.data.options.some((o: any) => o.id === choice))
            throw new ApiError(400, 'option', 'Choose a published option');
    }
    if (command === 'defer') {
        nextDueAt = date(b.nextDueAt, 'nextDueAt');
        if (Date.parse(nextDueAt) <= Date.now())
            throw new ApiError(400, 'defer', 'Future accountable follow-up required');
    }
    const decision = { id: id(), command, choice, reason: requiredString(b.reason, 'reason'), at: now(), actor: p.userId, packetRevision: r.revision };
    return mutate(db, p, r, b.revision, { ...r.data, state, choice, nextDueAt, history: [...r.data.history, decision], authority: 'Business choice only; execution requires a separate current grant' }, `decision-${command}`);
}
export async function amendDecision(db: D1Database, p: Principal, r: ServiceRecord, b: Record<string, any>) {
    if (p.userId !== r.ownerId && p.userId !== r.data.holderId && !p.roles.includes('owner'))
        throw new ApiError(403, 'decision_holder', 'Packet author or decision holder required');
    const context = await getService(db, p, r.data.contextId);
    const allowed = ['title', 'quote', 'quoteSource', 'terms', 'impact', 'reversibility', 'uncertainty'];
    const updates: Record<string, any> = {};
    for (const k of allowed)
        if (b[k] !== undefined)
            updates[k] = requiredString(b[k], k, 10000);
    if (b.deadline)
        updates.deadline = date(b.deadline, 'deadline');
    if (b.options) {
        if (!Array.isArray(b.options) || b.options.length < 2 || b.options.some((o: any) => !o.id || !o.label || !o.consequences))
            throw new ApiError(400, 'options', 'Concrete options required');
        updates.options = b.options;
    }
    if (b.recommendation)
        updates.recommendation = b.recommendation;
    const merged = { ...r.data, ...updates };
    if (!merged.options.some((o: any) => o.id === merged.recommendation))
        throw new ApiError(400, 'recommendation', 'Recommendation must be an option');
    return mutate(db, p, r, b.revision, { ...merged, state: 'needs-decision', choice: null, contextRevision: context.revision, nextDueAt: merged.deadline, history: [...r.data.history, { id: id(), command: 'amend', actor: p.userId, at: now(), priorPacketRevision: r.revision }] }, 'decision-amended');
}
/** A selected commercial option may request a release, but cannot manufacture grants. */
export async function advanceDecision(env: import('../../platform/types').Env, p: Principal, r: ServiceRecord) { if (r.data.state !== 'chosen')
    throw new ApiError(409, 'decision_state', 'Chosen decision required'); const option = r.data.options.find((o: any) => o.id === r.data.choice), effect = option?.effect; if (!effect)
    return r; if (effect.kind !== 'change')
    throw new ApiError(422, 'decision_effect', 'Only declared controlled-change effects are supported'); const executorId = r.data.executorId || p.userId; if (p.userId !== executorId && p.userId !== r.data.holderId && !p.roles.includes('owner'))
    throw new ApiError(403, 'decision_executor', 'Named executor or owner scheduler required'); const member = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, executorId).first<{
    roles_json: string;
}>(); if (!member)
    throw new ApiError(403, 'executor_inactive', 'Execution owner is inactive'); const actor: Principal = { userId: executorId, workspaceId: p.workspaceId, roles: JSON.parse(member.roles_json) }; let state = 'pending', changeId = effect.changeId, error: string | null = null; try {
    const { dispatchChange, verifyChange } = await import('./changes');
    let change = await getService(env.DB, actor, changeId, 'change');
    if (effect.implementationRevision !== change.data.implementationRevision)
        throw new ApiError(409, 'decision_stale', 'Chosen implementation changed; amend business decision');
    const phase = effect.phase === 'compensate' ? 'compensate' : change.data.invocations.some((i: any) => i.phase === 'canary' && i.state === 'verified' && i.implementationRevision === effect.implementationRevision) ? 'rollout' : 'canary';
    let invocation = change.data.invocations.find((i: any) => i.idempotencyKey === `decision:${r.id}:${r.data.choice}:${effect.implementationRevision}:${phase}`);
    if (!invocation) {
        change = await dispatchChange(env, actor, change, { revision: change.revision, phase, idempotencyKey: `decision:${r.id}:${r.data.choice}:${effect.implementationRevision}:${phase}` });
        invocation = change.data.invocations.at(-1);
    }
    if (invocation?.executionId)
        change = await verifyChange(env, actor, change, { revision: change.revision, invocationId: invocation.id });
    state = change.data.state === 'verified' || change.data.state === 'compensated' ? 'verified' : change.data.state;
}
catch (e) {
    state = 'needs-authority-or-evidence';
    error = e instanceof ApiError ? e.code : 'execution-unavailable';
} const fulfilment = { state, changeId, implementationRevision: effect.implementationRevision, executorId, error, checkedAt: now() }; return mutate(env.DB, p, r, r.revision, { ...r.data, fulfilment }, 'decision-effect-advanced', true); }
