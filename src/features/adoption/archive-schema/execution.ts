import { business, json, person, type JsonPath, type ReferenceSelector, type SelectorContext } from './types';
/** Step.target is a person only for identity/session actions. Group, licence and
 * deployment targets are business identities, even when equal to a person's ID. */
export function stepReferences(column: string, prefix: JsonPath = []): ReferenceSelector[] {
    const at = (field: string) => [...prefix, field];
    const deploymentCohort = ({ root, path }: SelectorContext) => {
        let step: any = root;
        for (const segment of (path ?? []).slice(0, -2)) step = step?.[segment];
        return typeof step?.action === 'string' && step.action.startsWith('deployment.');
    };
    const grant = (field: string): ReferenceSelector => ({ ...json(column, at(field), 'business', ['execution_grants']),
        keyOf: (value, row, { parent }) => JSON.stringify([row.workspace_id, value, (parent as any)?.grantVersion]) });
    return [
        json(column, at('beneficiaryId'), 'person'),
        json(column, at('localBeneficiaryId'), 'person', ['identities', 'work_people']),
        json(column, [...at('cohort'), '*'], 'person', [], context => !deploymentCohort(context)),
        json(column, [...at('cohort'), '*'], 'business', [], deploymentCohort),
        json(column, at('target'), 'person', [], ({ parent }) => ['identity.create', 'identity.disable', 'sessions.revoke'].includes((parent as any)?.action)),
        json(column, at('target'), 'business', [], ({ parent }) => !['identity.create', 'identity.disable', 'sessions.revoke'].includes((parent as any)?.action)),
        ...['grantId', 'revocationGrantId', 'compensationGrantId'].map(grant),
        json(column, at('mappingId'), 'business', ['execution_subject_mappings']),
        json(column, at('sourceId'), 'business', ['adoption_sources']),
        json(column, at('connectionId'), 'business'),
        json(column, at('verifierConnectionId'), 'business'),
    ];
}
export const executionReferences: Readonly<Record<string, readonly ReferenceSelector[]>> = {
    execution_grants: [
        { ...person('target', []), when: ({ row }) => ['identity.create', 'identity.disable', 'sessions.revoke'].includes(String(row.action)) },
        { ...business('target'), when: ({ row }) => !['identity.create', 'identity.disable', 'sessions.revoke'].includes(String(row.action)) },
        business('connection_id'), business('mapping_id', 'execution_subject_mappings'),
    ],
    execution_plans: [
        ...stepReferences('steps_json', ['*']),
        ...['beneficiaryId'].map(field => ({ ...json('context_snapshot_json', ['implementation', field], 'person'), applies: ({ row }: { row: Record<string, unknown> }) => row.context_type === 'change' })),
        { ...business('work_id', 'work_records'), when: ({ row }) => !row.context_type || row.context_type === 'work' },
        { ...business('work_id', 'svc_records'), when: ({ row }) => row.context_type === 'change' },
        { ...business('work_id', 'intelligence_commitments'), when: ({ row }) => row.context_type === 'commitment' },
        { ...business('work_id', 'intelligence_engineering_jobs'), when: ({ row }) => row.context_type === 'engineering' },
    ],
    execution_operations: stepReferences('step_json'),
    execution_verifications: [json('evidence_json', ['beneficiaryId'], 'person'), json('evidence_json', ['cohort', '*'], 'person')],
    execution_subject_mappings: [json('local_source_json', ['userId'], 'person', ['identities']), json('local_source_json', ['personId'], 'person', ['work_people']), json('local_source_json', ['sourceId'], 'person')],
    work_execution_bindings: stepReferences('step_json'),
    work_fulfilment_amendments: stepReferences('step_json'),
    work_fulfilment_removals: stepReferences('step_json'),
};
