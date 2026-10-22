import { json, type JsonPath, type ReferenceSelector } from './types';
const kinds = (...values: string[]) => ({ row }: { row: Record<string, unknown> }) => values.includes(String(row.kind));
const p = (path: JsonPath, ...kind: string[]) => ({ ...json('data_json', path, 'person', ['identities', 'work_people']), applies: kinds(...kind) });
const b = (path: JsonPath, target: string, ...kind: string[]) => ({ ...json('data_json', path, 'business', target ? [target] : []), applies: kinds(...kind) });
export const serviceReferences: readonly ReferenceSelector[] = [
    json('participants_json', ['*'], 'person', ['identities', 'work_people']),
    p(['approverIds', '*'], 'application', 'release'), b(['departmentId'], 'work_departments', 'application'),
    { ...json('data_json', ['entitlements', '*', 'id'], 'business'), applies: kinds('application') },
    b(['from'], 'svc_records', 'edge'), b(['to'], 'svc_records', 'edge'),
    b(['serviceId'], 'svc_records', 'incident', 'monitor', 'oncall', 'problem', 'problem-proposal'),
    p(['commander'], 'incident'), p(['acknowledgedBy'], 'incident'), p(['onCallRecipients', '*'], 'incident'),
    p(['links', '*', 'linkedBy'], 'incident'), b(['links', '*', 'employeeIncidentId'], 'work_records', 'incident'),
    p(['diagnostics', '*', 'assignee'], 'incident'), p(['updates', '*', 'author'], 'incident'), p(['updates', '*', 'audience', '*'], 'incident'),
    b(['recoveries', '*', 'incidentId'], 'svc_records', 'incident'), b(['recoveries', '*', 'serviceId'], 'svc_records', 'incident'),
    b(['ticketIds', '*'], 'work_records', 'problem', 'problem-proposal'),
    b(['alertIncidentIds', '*'], 'svc_records', 'problem', 'problem-proposal'),
    json('data_json', ['evidence', '*', 'id'], 'business', ['work_records'], ({ row, parent }) => kinds('problem', 'problem-proposal')({ row }) && (parent as any)?.type === 'ticket'),
    json('data_json', ['evidence', '*', 'id'], 'business', ['svc_records'], ({ row, parent }) => kinds('problem', 'problem-proposal')({ row }) && (parent as any)?.type !== 'ticket'),
    b(['evidence', '*', 'serviceId'], 'svc_records', 'problem', 'problem-proposal'),
    json('data_json', ['cluster', 'value'], 'business', ['svc_records'], ({ row, root }) => kinds('problem', 'problem-proposal')({ row }) && (root as any)?.cluster?.facet === 'service'),
    b(['workarounds', '*', 'articleId'], 'work_knowledge', 'problem', 'problem-proposal'),
    b(['preventionChangeId'], 'svc_records', 'problem'),
    b(['services', '*'], 'svc_records', 'calendar-window', 'change', 'change-template', 'release'),
    b(['dependencies', '*'], 'svc_records', 'change', 'change-template'),
    b(['cabBypass', 'templateId'], 'svc_records', 'change'), b(['calendarId'], 'svc_records', 'change'),
    p(['emergencySchedulingActor'], 'change'), p(['authorizations', '*', 'actor'], 'change'), p(['priorAuthorizations', '*', 'actor'], 'change'),
    p(['approval', 'actor'], 'change-template'), p(['priorApprovals', '*', 'actor'], 'change-template'), p(['withdrawals', '*', 'actor'], 'change-template'),
    b(['changeIds', '*'], 'svc_records', 'release'), b(['problemIds', '*'], 'svc_records', 'release'),
    b(['affectedGroupIds', '*'], 'work_requester_groups', 'release'), p(['decisions', '*', 'actor'], 'release'), p(['priorDecisions', '*', 'actor'], 'release'),
    p(['phases', 'build', 'recordedBy'], 'release'), p(['phases', 'test', 'recordedBy'], 'release'),
    b(['contextId'], 'svc_records', 'decision'), p(['executorId'], 'decision'), p(['holderId'], 'decision'), p(['history', '*', 'actor'], 'decision'),
    b(['options', '*', 'effect', 'changeId'], 'svc_records', 'decision'), b(['fulfilment', 'changeId'], 'svc_records', 'decision'), p(['fulfilment', 'executorId'], 'decision'),
    p(['recipientIds', '*'], 'oncall'), b(['connectionId'], '', 'monitor'),
];
