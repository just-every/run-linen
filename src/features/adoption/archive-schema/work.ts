import { json, type JsonPath, type ReferenceSelector } from './types';
const p = (column: string, path: JsonPath) => json(column, path, 'person', ['identities', 'work_people']);
const b = (column: string, path: JsonPath, table: string) => json(column, path, 'business', [table]);
function approvals(column: string, prefix: JsonPath = []): ReferenceSelector[] {
    return [p(column, [...prefix, 'approvers', '*', 'userId']), b(column, [...prefix, 'approvers', '*', 'groupId'], 'work_groups'), b(column, [...prefix, 'calendarId'], 'work_calendars')];
}
const application = [b('application_json', ['applicationId'], 'svc_records'), b('application_json', ['departmentId'], 'work_departments'),
    json('application_json', ['entitlementId'], 'business'), p('application_json', ['ownerId']), p('application_json', ['approverIds', '*'])];
export const workReferences: Readonly<Record<string, readonly ReferenceSelector[]>> = {
    work_records: [
        b('protected_departments_json', ['*'], 'work_departments'),
        b('context_json', ['serviceId'], 'svc_records'), b('context_json', ['articleId'], 'work_knowledge'),
        b('context_json', ['recurringPlanId'], 'work_recurring_plans'), b('context_json', ['recurringOccurrenceId'], 'work_recurring_occurrences'),
        ...['personId', 'ownerId', 'identityTarget', 'sponsorId'].map(field => ({ ...p('context_json', [field]), applies: ({ root }: { root: unknown }) => ['join', 'move', 'leave'].includes((root as any)?.kind) })),
        b('context_json', ['deviceIds', '*'], 'work_assets'), b('context_json', ['templates', 'applied', '*', 'id'], 'work_lifecycle_templates'),
        b('context_json', ['templates', 'tasks', '*', 'templateId'], 'work_lifecycle_templates'),
        b('context_json', ['lifecycleTaskReminder', 'taskId'], 'work_obligations'), b('context_json', ['sponsorReminder', 'lifecycleId'], 'work_lifecycle'),
        b('context_json', ['knowledgeSuggestionId'], 'work_knowledge_suggestions'),
    ],
    work_recurring_plans: [p('tasks_json', ['*', 'ownerId'])],
    work_obligations: [b('after_json', ['*'], 'work_obligations'), b('template_json', ['templateId'], 'work_lifecycle_templates')],
    work_people: [...['department', 'location', 'employmentType', 'title'].map(field => b('attributes_json', [field], 'work_catalog_values'))],
    work_catalog: [...['department', 'location', 'employmentType'].map(field => b('audience_json', [field, '*'], 'work_catalog_values')), b('tasks_json', ['*', 'groupId'], 'work_groups'), ...approvals('approvals_json', ['*'])],
    work_approval_stages: approvals('definition_json'),
    work_lifecycle_templates: [b('tasks_json', ['*', 'assignee', 'groupId'], 'work_groups')],
    work_fulfilments: [...application, b('catalog_snapshot_json', ['catalogId'], 'work_catalog'),
        b('catalog_snapshot_json', ['departmentId'], 'work_departments'), p('catalog_snapshot_json', ['submittedBy']),
        b('catalog_snapshot_json', ['quote', 'id'], 'work_attachments')],
    work_catalog_bundles: [b('items_json', ['*', 'catalogId'], 'work_catalog')],
    work_bundle_requests: [b('items_json', ['*', 'catalogId'], 'work_catalog')],
    work_requester_groups: [p('members_json', ['*'])],
    work_project_tasks: [b('depends_on_json', ['*'], 'work_project_tasks')],
    work_views: [b('filters_json', ['groupId'], 'work_groups')],
    work_asset_audits: [b('expected_json', ['*', 'assetId'], 'work_assets')],
    work_scenarios: [b('steps_json', ['group', 'groupId'], 'work_groups'), p('steps_json', ['group', 'assigneeId']),
        b('steps_json', ['fields', '*', 'fieldId'], 'work_custom_fields'), b('steps_json', ['message', 'templateId'], 'work_canned_responses'),
        b('steps_json', ['status', 'statusId'], 'work_custom_statuses'), b('steps_json', ['taskPlan', 'projectId'], 'work_projects'),
        p('steps_json', ['taskPlan', 'tasks', '*', 'ownerId'])],
    work_knowledge_drafts: [
        json('sources_json', ['*', 'id'], 'business', ['work_records'], ({ parent }) => (parent as any)?.type === 'ticket'),
        json('sources_json', ['*', 'id'], 'business', ['svc_records'], ({ parent }) => (parent as any)?.type === 'known-error'),
        ...['work_records', 'svc_records'].map(table => json('sources_json', ['*', 'guards', '*', 'id'], 'business', [table], ({ parent }) => (parent as any)?.table === table)),
        json('group_json', ['value'], 'business', ['svc_records'], ({ root }) => (root as any)?.type === 'known-error' || (root as any)?.facet === 'serviceId'),
    ],
    work_knowledge_suggestions: [b('articles_json', ['*', 'id'], 'work_knowledge')],
    work_classifications: [b('proposal_json', ['attemptId'], 'intelligence_attempts')],
    mcp_credentials: [b('queue_groups_json', ['*'], 'work_groups')],
};
