import { conversation, appendMessage, getWork } from '../work/core';
import { queueFulfilment } from './pending-fulfilments';
import { getFulfilment, amendFulfilment } from '../work/fulfilment-amend';
import { intakeServices } from '../services/intake';
import { queueInvestigation } from './investigations';
import { assert, current, errorCode } from './access';
import { callModel, objectSchema, textSchema, textsSchema } from './models';
import { demoIntakeAssessment } from './demo-assessment';
import { holdForNamedPerson, recordedForName } from './intake-person';
import { workIntakePort, type IntakeEvent } from './intake-port';
import type { IntelligenceContext } from './types';
export async function enqueueWorkIntake(ctx: IntelligenceContext, workId: string) {
    ctx = await current(ctx);
    await getWork(ctx, workId);
    return (await workIntakePort().list(ctx, workId))[0] || null;
}
const schema = objectSchema({ kind: { type: 'string', enum: ['catalog_request', 'necessary_question', 'investigation'] }, summary: textSchema, catalogId: textSchema, serviceId: textSchema, purpose: textSchema, expiresAt: { type: ['string', 'null'] }, question: textSchema, requestedFor: textSchema, evidenceIds: textsSchema });
export async function processIntakeEvent(ctx: IntelligenceContext, event: IntakeEvent) {
    ctx = await current(ctx);
    await getWork(ctx, event.work_id);
    assert(event.sender === ctx.principal.userId, 'intake_actor_mismatch', 403);
    if (!await workIntakePort().claim(ctx, event.id))
        return { id: event.id, state: event.state };
    try {
        const settings: any = await ctx.env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(ctx.principal.workspaceId).first(), config = JSON.parse(settings?.settings_json || '{}');
        assert(config.defaultModelConnectionId, 'model_configuration_required', 503);
        const before: any = await conversation(ctx, event.work_id), catalog = await workIntakePort().catalog(ctx);
        const services = await intakeServices(ctx), beneficiaryName = await recordedForName(ctx, before.work.beneficiary_id);
        const fulfilments = (await Promise.all(catalog.map(c => getFulfilment(ctx,event.work_id,c.id)))).filter(Boolean);
        const messages = (before.messages || []).filter((m: any) => m.visibility === 'public' && !String(m.source_key || '').startsWith('interpretation:')).slice(-30).map((m: any) => ({ id: m.id, body: m.body, at: m.created_at }));
        const result = await callModel(ctx, { connectionId: config.defaultModelConnectionId, runId: event.id, workId: event.work_id, purpose: 'employee_intake', prompt: 'Resolve the conversation against known catalog and visible services only. For an access request or correction use catalog_request; retain the existing purpose and catalog when only the expiry changes. Resolve dates against current time and conversation; never invent an expiry. For a service fault use investigation and its known serviceId; leave unrelated IDs empty. If the service cannot be identified ask only the necessary application question. Beneficiary is fixed by authenticated work: set requestedFor to the name of the one person the request is for when the conversation names someone other than work.beneficiaryName, else leave it empty. Model text never grants authority or establishes recovery. Current time ' + new Date().toISOString() + JSON.stringify({ work: { id: before.work.id, title: before.work.title, beneficiaryId: before.work.beneficiary_id, beneficiaryName }, catalog, services, fulfilments, messages }), schema, demoValue: () => demoIntakeAssessment({ title: before.work.title, catalog, services, messages }) });
        const v: any = result.value;
        await getWork(ctx, event.work_id);
        let state = 'proposed', effect: unknown = null, body = v.kind === 'necessary_question' ? v.question : v.summary;
        if (v.kind === 'catalog_request') {
            assert(catalog.some(c => c.id === v.catalogId), 'unknown_model_catalog', 502);
            assert(v.purpose?.trim(), 'missing_request_purpose', 502);
            if (v.expiresAt)
                assert(Number.isFinite(Date.parse(v.expiresAt)) && Date.parse(v.expiresAt) > Date.now(), 'invalid_model_expiry', 502);
            const work = await getWork(ctx, event.work_id);
            const existing = await getFulfilment(ctx,work.id,v.catalogId);
            // A request whose words name someone else never becomes a service for the account it is recorded for.
            const held = await holdForNamedPerson(ctx, work.id, v.requestedFor);
            if (held) {
                effect = held;state = held.state;body = held.message;
            } else if (existing) {
                const amended = await amendFulfilment(ctx,work.id,{catalogId:v.catalogId,
                    expectedWorkRevision:existing.workRevision,expectedFulfilmentRevision:existing.revision,
                    idempotencyKey:event.id,beneficiaryId:work.beneficiary_id,purpose:v.purpose,expiresAt:v.expiresAt});
                effect = amended;
                state = amended.state;
                body = amended.state === 'amended'
                    ? 'Your access expiry is now '+amended.expiresAt+'. The existing access remains linked to its independent verification and scheduled removal.'
                    : 'Your correction needs a decision from its fulfillment owner. '+amended.reason;
            } else {
                const queued = await queueFulfilment(ctx,event.id,work.id,{catalogId:v.catalogId,beneficiaryId:work.beneficiary_id,purpose:v.purpose,expiresAt:v.expiresAt||undefined});
                effect=queued;state=queued.state;body=queued.message;
            }
        }
        if (v.kind === 'investigation') {
            if (!v.serviceId) {state='necessary_question';body='Which application or service is affected?';}
            else {
                assert(services.some(s => s.id === v.serviceId),'unknown_model_service',502);
                const investigation = await queueInvestigation(ctx,event.work_id,v.serviceId);
                effect = investigation;state = investigation.state;body = investigation.message;
            }
        }
        await appendMessage(ctx, { workId: event.work_id, visibility: 'public', sourceMessageId: 'interpretation:' + event.id, body });
        await workIntakePort().finish(ctx, event.id, { state: 'interpreted', result: { model: result, effect, outcomeState: state } });
        return { id: event.id, state, proposal: v, effect };
    }
    catch (e) {
        const code = errorCode(e), state = code.includes('budget') ? 'budget_held' : code.includes('configuration') ? 'needs_configuration' : 'failed';
        await workIntakePort().finish(ctx, event.id, { state, error: code });
        return { id: event.id, state, error: code };
    }
}
export async function processWorkIntake(ctx: IntelligenceContext, workId: string) {
    ctx = await current(ctx);
    const events = await workIntakePort().list(ctx, workId), results = [];
    for (const event of events)
        results.push(await processIntakeEvent(ctx, event));
    return results.at(-1) || { state: 'already_interpreted' };
}
export async function discoverWorkIntake(ctx: IntelligenceContext) {
    ctx = await current(ctx, ['owner', 'operator']);
    const results = [];
    for (const event of await workIntakePort().list(ctx)) {
        try {
            const actor = await current({ ...ctx, principal: { ...ctx.principal, userId: event.sender, roles: [] } });
            results.push(await processIntakeEvent(actor, event));
        }
        catch (e) {
            results.push({ id: event.id, state: 'blocked', error: errorCode(e) });
        }
    }
    return results;
}
