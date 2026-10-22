import { array, columns, contentJson, json, object, type ContentPath, type Row } from './types';
import type { ContentSubjects } from './subjects';

// Text authored for a service record. Scheduling, configuration, versioned
// approvals, effect records and graph links are deliberately absent.
const text: Record<string, readonly ContentPath[]> = {
    service: [['name'], ['description']],
    person: [['name']],
    'calendar-window': [['title']],
    incident: [['title'], ['impact'], ['updates', '*', 'message'], ['diagnostics', '*', 'scope'], ['diagnostics', '*', 'hypothesis']],
    problem: [['title'], ['symptoms'], ['cause'], ['workarounds', '*', 'title'], ['workarounds', '*', 'body']],
    'problem-proposal': [['title'], ['reason']],
    change: [['title'], ['risk'], ['impact'], ['implementationPlan'], ['testPlan'], ['backoutPlan'], ['emergencyReason'],
        ['exception'], ['authorizations', '*', 'reason'], ['priorAuthorizations', '*', 'reason'], ['invocations', '*', 'error']],
    'change-template': [['title'], ['risk'], ['impact'], ['implementationPlan'], ['testPlan'], ['backoutPlan'],
        ['approval', 'reason'], ['priorApprovals', '*', 'reason'], ['withdrawals', '*', 'reason']],
    release: [['title'], ['plan'], ['decisions', '*', 'reason'], ['priorDecisions', '*', 'reason']],
    supplier: [['name'], ['contract'], ['commitments', '*', 'outcome'], ['handoffs', '*', 'summary'], ['handoffs', '*', 'outstanding', '*']],
    asset: [['name'], ['assignments', '*', 'receipt'], ['assignments', '*', 'returnReceipt'], ['history', '*', 'evidence'], ['decisions', '*', 'reason']],
    monitor: [['name']],
    oncall: [['name']],
    decision: [['title'], ['quote'], ['terms'], ['impact'], ['reversibility'], ['uncertainty'],
        ['options', '*', 'label'], ['options', '*', 'consequences'], ['history', '*', 'reason']],
};

export async function serviceSubject(row: Row, subjects: ContentSubjects): Promise<boolean> {
    const data = object(json(row.data_json));
    if (!data) return false;
    if (await subjects.people(row.owner_id, ...array(json(row.participants_json)), data.holderId, data.executorId, data.reviewedBy)) return true;
    if (row.kind === 'person' && await subjects.people(data.externalId, data.source && data.externalId ? `${data.source}:${data.externalId}` : null)) return true;
    return subjects.people(...array(data.assignments).map(value => object(value)?.personId),
        ...array(data.commitments).map(value => object(value)?.ownerId),
        ...array(data.decisions).flatMap(value => array(object(value)?.affectedPeople)));
}

export async function projectService(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    if (table === 'svc_records') {
        if (await serviceSubject(row, subjects)) return contentJson(row, 'data_json', text[String(row.kind)] ?? []);
        return row;
    }
    if (table === 'svc_outbox' || table === 'svc_commands') {
        let affected = table === 'svc_outbox' && await subjects.person(row.recipient_id);
        if (!affected && typeof row.record_id === 'string') {
            const parent = await subjects.ctx.env.DB.prepare('SELECT kind,owner_id,participants_json,data_json FROM svc_records WHERE workspace_id=? AND id=?')
                .bind(subjects.ctx.principal.workspaceId, row.record_id).first<Row>();
            affected = !!parent && await serviceSubject(parent, subjects);
        }
        if (affected) {
            const column = table === 'svc_outbox' ? 'payload_json' : 'result_json';
            row = contentJson(row, column, [['message'], ['title'], ['body'], ['reason'], ['error']]);
            return table === 'svc_outbox' ? columns(row, { error: null }) : row;
        }
    }
    return row;
}
