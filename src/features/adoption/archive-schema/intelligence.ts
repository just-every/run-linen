import { stepReferences } from './execution';
import { json, type JsonPath, type ReferenceSelector } from './types';
const p = (column: string, path: JsonPath) => json(column, path, 'person');
const b = (column: string, path: JsonPath, target: string) => json(column, path, 'business', [target]);
const commitmentData = (column: string): ReferenceSelector[] => [
    b(column, ['serviceId'], 'svc_records'), p(column, ['cohort', '*']), b(column, ['dependencies', '*'], 'intelligence_commitments'),
    ...stepReferences(column, ['observations', '*', 'step']),
];
export const intelligenceReferences: Readonly<Record<string, readonly ReferenceSelector[]>> = {
    intelligence_commitments: [json('participants_json', ['*'], 'person', ['identities', 'work_people']), ...commitmentData('data_json')],
    intelligence_versions: commitmentData('data_json'),
    intelligence_observations: [p('cohort_json', ['*']), p('evidence_json', ['beneficiaryId']), p('evidence_json', ['cohort', '*'])],
    intelligence_research: [
        b('data_json', ['verifiedOperationId'], 'execution_operations'), b('data_json', ['evidenceIds', '*'], 'intelligence_observations'),
        b('data_json', ['rounds', '*', 'modelAttemptId'], 'intelligence_attempts'),
        b('data_json', ['rounds', '*', 'engineeringJobIds', '*'], 'intelligence_engineering_jobs'),
        p('data_json', ['rounds', '*', 'probes', '*', 'cohort', '*']),
        p('data_json', ['rounds', '*', 'probes', '*', 'evidence', 'beneficiaryId']),
        p('data_json', ['rounds', '*', 'probes', '*', 'evidence', 'cohort', '*']),
    ],
    intelligence_capabilities: [
        ...stepReferences('data_json', ['steps', '*']), ...stepReferences('data_json', ['verifierSpecs', '*', 'step']),
        p('data_json', ['conditions', '*', 'cohort']), p('data_json', ['counterexamples', '*', 'conditions', '*', 'cohort']),
        b('data_json', ['provenance', 'researchId'], 'intelligence_research'), b('data_json', ['provenance', 'operationId'], 'execution_operations'),
        b('data_json', ['provenance', 'evidenceIds', '*'], 'intelligence_observations'),
    ],
    intelligence_reuse: [b('data_json', ['researchId'], 'intelligence_research'), b('data_json', ['planId'], 'execution_plans'), b('data_json', ['operationIds', '*'], 'execution_operations')],
    intelligence_simplifications: [b('data_json', ['baselineEvidenceIds', '*'], 'intelligence_observations'), b('data_json', ['measurements', '*', 'evidenceIds', '*'], 'intelligence_observations')],
    intelligence_engineering_grants: [b('config_json', ['commitmentIds', '*'], 'intelligence_commitments')],
    intelligence_engineering_jobs: [b('receipt_json', ['jobId'], 'intelligence_engineering_jobs')],
    intelligence_fulfilment_runs: [b('operations_json', ['*'], 'execution_operations')],
    intelligence_pending_fulfilments: [b('input_json', ['catalogId'], 'work_catalog'), json('input_json', ['beneficiaryId'], 'person', ['identities', 'work_people'])],
    intelligence_protocol_runs: [
        b('input_json', ['binding', 'rootCommitmentId'], 'intelligence_commitments'), b('input_json', ['binding', 'commitments', '*', 'id'], 'intelligence_commitments'),
        b('input_json', ['binding', 'commitments', '*', 'observationIds', '*'], 'intelligence_observations'),
        // Replay actors are arbitrary coordinator labels, not directory people.
        json('input_json', ['events', '*', 'actor'], 'business'),
    ],
};
