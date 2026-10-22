import { columns, contentJson, json, object, type Row } from './types';
import type { ContentSubjects } from './subjects';

/** Only identity.create has declared personal payload fields. Deployment
 * payloads are exact effect configuration; unknown payloads must pass the full
 * scanner rather than silently becoming a different business effect. */
export function personalStep(value: unknown): unknown {
    const step = object(value);
    if (step?.action !== 'identity.create') return value;
    const payload = object(step.payload);
    if (!payload) return value;
    const next = { ...payload };
    for (const field of ['displayName', 'mailNickname']) if (Object.hasOwn(next, field) && next[field] != null) next[field] = '[erased]';
    return { ...step, payload: next };
}

export async function projectExecution(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    if (table === 'execution_plans' && await subjects.plan(row)) {
        const steps = json(row.steps_json);
        if (Array.isArray(steps)) row = { ...row, steps_json: JSON.stringify(steps.map(personalStep)) };
        // Work snapshots contain no effect authority. Change snapshots retain
        // implementationRevision, phase and the exact implementation payload.
        if (row.context_type === 'work') row = columns(row, { context_snapshot_json: '{}' });
        return row;
    }
    if (table === 'execution_operations' && await subjects.operation(row)) {
        const step = json(row.step_json), projected = personalStep(step);
        return JSON.stringify(step) === JSON.stringify(projected) ? row : { ...row, step_json: JSON.stringify(projected) };
    }
    if (table === 'execution_decisions' && await subjects.person(row.actor_id)) return columns(row, { reason: '[erased]' });
    if (table === 'execution_verifications') {
        let affected = await subjects.people(row.beneficiary_id, row.target);
        if (!affected && typeof row.operation_id === 'string') {
            const operation = await subjects.ctx.env.DB.prepare('SELECT actor_id,plan_id,step_json FROM execution_operations WHERE workspace_id=? AND id=?')
                .bind(subjects.ctx.principal.workspaceId, row.operation_id).first<Row>();
            affected = !!operation && await subjects.operation(operation);
        }
        if (affected) return contentJson(row, 'evidence_json', [['displayName'], ['mailNickname'], ['email'],
            ['effect', 'displayName'], ['effect', 'mailNickname'], ['workflow', 'message']]);
    }
    if (['work_execution_bindings', 'work_fulfilment_removals'].includes(table)) {
        const step = json(row.step_json);
        if (await subjects.step(step)) return columns(row, { step_json: JSON.stringify(personalStep(step)) });
    }
    return row;
}
