import { anyIdentity, array, json, object, type ContentContext, type IdentityMatcher, type Row } from './types';

/** Read raw scoped subjects before the caller aliases their archive references. */
export class ContentSubjects {
    constructor(readonly ctx: ContentContext, readonly matches: IdentityMatcher) {}

    async person(value: unknown): Promise<boolean> {
        if (typeof value !== 'string' || !value) return false;
        if (await this.matches(value)) return true;
        const person = await this.ctx.env.DB.prepare('SELECT id,source,source_id,member_id,binding_id FROM work_people WHERE workspace_id=? AND id=?')
            .bind(this.ctx.principal.workspaceId, value).first<Row>();
        return !!person && this.profile(person);
    }
    async profile(row: Row): Promise<boolean> {
        return anyIdentity(this.matches, row.id, row.source && row.source_id ? `${row.source}:${row.source_id}` : null,
            row.binding_id ? row.member_id : null);
    }
    async people(...values: unknown[]): Promise<boolean> {
        return (await Promise.all(values.map(value => this.person(value)))).some(Boolean);
    }
    async workRow(row: Row): Promise<boolean> {
        if (await this.people(row.requester_id, row.beneficiary_id, row.pending_person_id)) return true;
        const context = object(json(row.context_json)), reminder = object(context?.lifecycleTaskReminder);
        if (typeof reminder?.taskId !== 'string') return false;
        const task = await this.ctx.env.DB.prepare('SELECT beneficiary_id,template_json FROM work_obligations WHERE workspace_id=? AND id=?')
            .bind(this.ctx.principal.workspaceId, reminder.taskId).first<Row>();
        return !!task && task.template_json != null && this.person(task.beneficiary_id);
    }
    async work(workId: unknown): Promise<boolean> {
        if (typeof workId !== 'string' || !workId) return false;
        const row = await this.ctx.env.DB.prepare('SELECT requester_id,beneficiary_id,pending_person_id,context_json FROM work_records WHERE workspace_id=? AND id=?')
            .bind(this.ctx.principal.workspaceId, workId).first<Row>();
        return !!row && this.workRow(row);
    }
    async commitmentRow(row: Row): Promise<boolean> {
        const data = object(json(row.data_json));
        return this.people(row.owner_id, ...array(json(row.participants_json)), ...array(data?.cohort));
    }
    async commitment(commitmentId: unknown): Promise<boolean> {
        if (typeof commitmentId !== 'string' || !commitmentId) return false;
        const row = await this.ctx.env.DB.prepare('SELECT owner_id,participants_json,data_json FROM intelligence_commitments WHERE workspace_id=? AND id=?')
            .bind(this.ctx.principal.workspaceId, commitmentId).first<Row>();
        return !!row && this.commitmentRow(row);
    }
    async plan(row: Row): Promise<boolean> {
        if (await this.person(row.actor_id)) return true;
        const steps = array(json(row.steps_json));
        if ((await Promise.all(steps.map(step => this.step(step)))).some(Boolean)) return true;
        return row.context_type === 'work' && this.work(row.work_id);
    }
    async step(value: unknown): Promise<boolean> {
        const step = object(value);
        return !!step && this.people(step.localBeneficiaryId, step.beneficiaryId, step.target, ...array(step.cohort));
    }
    async operation(row: Row): Promise<boolean> {
        if (await this.people(row.actor_id) || await this.step(json(row.step_json))) return true;
        if (typeof row.plan_id !== 'string') return false;
        const plan = await this.ctx.env.DB.prepare('SELECT actor_id,steps_json,context_type,work_id FROM execution_plans WHERE workspace_id=? AND id=?')
            .bind(this.ctx.principal.workspaceId, row.plan_id).first<Row>();
        return !!plan && this.plan(plan);
    }
}
