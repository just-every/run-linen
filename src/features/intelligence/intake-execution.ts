import { now, id } from '../../platform/http';
import { current, assert } from './access';
import {recordFulfilmentExecution} from '../work/fulfilment-execution';
import { getWork } from '../work/core';
import { dispatchGrantedPlan } from '../execution/automation';
import { standingIntakeExecution } from '../execution/intake';
import { runOperation, verifyOutcome } from '../execution/engine';
import type { Step } from '../execution/types';
import type { IntelligenceContext } from './types';
export interface StandingIntakeExecution {
    resolve(ctx: IntelligenceContext, input: {
        workId: string;
        target: string;
        beneficiaryId: string;
        kind: string;
        expiresAt?: string;
    }): Promise<{
        actorId: string;
        step: Step;
    } | null>;
}
let standing: StandingIntakeExecution = standingIntakeExecution;
export function setStandingIntakeExecution(value: StandingIntakeExecution) {
    standing = value;
}
export async function fulfilKnownRequest(ctx: IntelligenceContext, b: {
    workId: string;
    catalog: {
        id: string;
        kind: string;
        target: string;
        owner_id: string;
    };
    expiresAt?: string;
}) {
    const work = await getWork(ctx, b.workId), bound = await standing.resolve(ctx, { workId: work.id, target: b.catalog.target, beneficiaryId: work.beneficiary_id, kind: b.catalog.kind, expiresAt: b.expiresAt });
    if (!bound)
        return { state: 'authority_required', message: 'Your request is assigned to its fulfilment owner. Linen needs current scoped authority, a reviewed identity mapping or an unambiguous verifier before fulfilment.' };
    assert(bound.step.target === b.catalog.target && bound.step.localBeneficiaryId === work.beneficiary_id && bound.step.expiresAt === b.expiresAt, 'standing_scope_mismatch', 403);
    const dispatched = await dispatchGrantedPlan(ctx, { workId: work.id, revision: work.revision, steps: [bound.step], idempotencyKey: 'intake:' + work.id + ':' + work.revision + ':' + b.catalog.id });
    await recordFulfilmentExecution(ctx,{workId:work.id,planId:dispatched.planId,operationIds:dispatched.operations.map((o:any)=>o.id)});
    const service = await current({ ...ctx, principal: { ...ctx.principal, userId: bound.actorId, roles: [] } }, ['integration']);
    const operations = [];
    for (const raw of dispatched.operations) {
        const op = raw as any;
        if (op.parent_id !== 'initial')
            continue;
        let result: any = await runOperation(service, op.id);
        if (result.state === 'effect_verified')
            try {
                result = await verifyOutcome(service, { operationId: op.id, verifierVersion: 1 });
            }
            catch {
            }
        operations.push({ ...result, operationId: op.id });
    }
    const complete = operations.length > 0 && operations.every(o => o.state === 'verified'), key = id();
    await ctx.env.DB.prepare('INSERT OR IGNORE INTO intelligence_fulfilment_runs VALUES(?,?,?,?,?,?,?,?,?,?)').bind(key, ctx.principal.workspaceId, work.id, ctx.principal.userId, bound.actorId, dispatched.planId, JSON.stringify(dispatched.operations.map((o: any) => o.id)), complete ? 'verified' : 'fulfilling', now(), now()).run();
    return { state: complete ? 'verified' : 'fulfilling', message: complete ? 'Fresh independent checks confirm that the requested workflow is usable.' : 'Linen is fulfilling your request and will reconcile any uncertain provider outcome before another attempt.', planId: dispatched.planId, operations };
}
