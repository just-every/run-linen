import { array, columns, contentJson, json, object, type Row } from './types';
import type { ContentSubjects } from './subjects';

/** Live work privacy subjects are requester/beneficiary, not every assignee. */
export async function projectWork(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    switch (table) {
        case 'work_records':
            return await subjects.workRow(row) ? columns(row, { title: '[erased]', context_json: '{}' }) : row;
        case 'work_messages':
            return await subjects.person(row.author_id) || await subjects.work(row.work_id)
                ? columns(row, { body: '[erased]' }) : row;
        case 'work_time_entries':
            return await subjects.person(row.actor_id) || await subjects.work(row.work_id)
                ? columns(row, { note: '[erased]' }) : row;
        case 'work_pending_services':
            return await subjects.person(row.person_id) ? columns(row, { purpose: '[erased]', reason: 'Identity erased' }) : row;
        case 'work_fulfilments': {
            const snapshot = object(json(row.catalog_snapshot_json));
            if (!await subjects.work(row.work_id) && !await subjects.person(snapshot?.submittedBy)) return row;
            // Answers are submitted content; retain catalog/form/quote business identities.
            return contentJson(columns(row, { purpose: '[erased]' }), 'catalog_snapshot_json', [['answers']], {});
        }
        case 'work_fulfilment_approvals': {
            const affected = await subjects.work(row.work_id);
            if (affected) return columns(row, { purpose: '[erased]', comment: null });
            return await subjects.person(row.holder_id) ? columns(row, { comment: null }) : row;
        }
        case 'work_approval_decisions':
            return await subjects.person(row.approver_id) || await subjects.work(row.work_id)
                ? columns(row, { comment: null }) : row;
        case 'work_classifications':
            return await subjects.work(row.work_id)
                ? columns(row, { current_json: null, proposal_json: null, reason: null, error: null }) : row;
        case 'work_fulfilment_amendments': {
            if (!await subjects.work(row.work_id)) return row;
            row = columns(row, { reason: 'Identity erased' });
            row = contentJson(row, 'request_json', [['purpose']]);
            row = contentJson(row, 'prior_json', [['fulfilment', 'purpose'], ['work', 'title']]);
            return contentJson(row, 'result_json', [['reason']]);
        }
        case 'work_intake_events':
            return await subjects.person(row.sender) || await subjects.work(row.work_id)
                ? contentJson(columns(row, { error: 'Identity erased', subject: null, rfc_message_id: null }), 'result_json', [['title'], ['body'], ['message']]) : row;
        case 'work_mail_deliveries':
            return await subjects.work(row.work_id) ? columns(row, { provider_ref: null, error: 'erased' }) : row;
        case 'work_recurring_plans': {
            const tasks = array(json(row.tasks_json));
            if (!await subjects.people(row.creator_id, row.owner_id, ...tasks.map(task => object(task)?.ownerId))) return row;
            return contentJson(columns(row, { title: '[erased]', body: '[erased]', enabled: 0 }), 'tasks_json', [['*', 'title']]);
        }
        case 'work_recurring_tasks':
            return await subjects.people(row.owner_id, row.completed_by) || await subjects.work(row.work_id)
                ? columns(row, { title: '[erased]' }) : row;
        case 'work_obligations':
            return row.template_json != null && await subjects.person(row.beneficiary_id)
                ? columns(row, { title: '[erased]', last_error: null }) : row;
        case 'work_side_conversations':
            return await subjects.person(row.actor_id) || await subjects.work(row.work_id)
                ? columns(row, { vendor_email: '[erased]' }) : row;
        case 'work_side_deliveries': {
            const conversation = typeof row.conversation_id === 'string' ? await subjects.ctx.env.DB.prepare(
                'SELECT actor_id,work_id FROM work_side_conversations WHERE workspace_id=? AND id=?')
                .bind(subjects.ctx.principal.workspaceId, row.conversation_id).first<Row>() : null;
            return conversation && (await subjects.person(conversation.actor_id) || await subjects.work(conversation.work_id))
                ? columns(row, { provider_ref: null, error: 'erased' }) : row;
        }
        case 'work_field_values': return projectCustomValue(row, subjects);
        default: return row;
    }
}

async function projectCustomValue(row: Row, subjects: ContentSubjects): Promise<Row> {
    const affectedWork = await subjects.work(row.work_id);
    if (!affectedWork && !await subjects.person(row.updated_by)) return row;
    const field = await subjects.ctx.env.DB.prepare('SELECT privacy_class,field_type FROM work_custom_fields WHERE workspace_id=? AND id=?')
        .bind(subjects.ctx.principal.workspaceId, row.field_id).first<Row>();
    let sensitive = false;
    if (affectedWork) {
        const work = await subjects.ctx.env.DB.prepare(`SELECT sensitivity,protected_departments_json,
            (SELECT kind FROM work_departments WHERE workspace_id=r.workspace_id AND id=r.department_id) department_kind
            FROM work_records r WHERE workspace_id=? AND id=?`)
            .bind(subjects.ctx.principal.workspaceId, row.work_id).first<Row>();
        sensitive = !!work && (['hr', 'restricted'].includes(String(work.sensitivity)) ||
            array(json(work.protected_departments_json)).length > 0 || work.department_kind === 'hr');
    }
    if (field?.privacy_class === 'nonpersonal' && ['dropdown', 'multiselect', 'number', 'boolean', 'date'].includes(String(field.field_type)) && !sensitive) return row;
    return columns(row, { value: '[erased]' });
}
