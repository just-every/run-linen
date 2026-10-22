import { array, columns, contentJson, json, object, type ContentPath, type Row } from './types';
import { personalStep } from './execution';
import type { ContentSubjects } from './subjects';

const commitmentText: readonly ContentPath[] = [['outcome'], ['observations', '*', 'description']];
const researchText: readonly ContentPath[] = [
    ['rounds', '*', 'decision', 'conclusion'], ['rounds', '*', 'decision', 'hypotheses', '*', 'explanation'],
    ['rounds', '*', 'decision', 'hypotheses', '*', 'prediction'], ['rounds', '*', 'decision', 'probes', '*', 'predictedObservation'],
    ['rounds', '*', 'decision', 'probes', '*', 'discriminatesBecause'], ['rounds', '*', 'decision', 'rejectedExplanations', '*'],
    ['rounds', '*', 'decision', 'missingEngineering', '*'], ['lastError'],
];

function commitmentContent(row: Row): Row {
    row = contentJson(row, 'data_json', commitmentText);
    const data = object(json(row.data_json));
    if (!data || !Array.isArray(data.observations)) return row;
    return { ...row, data_json: JSON.stringify({ ...data, observations: data.observations.map(value => {
        const spec = object(value);
        return spec && Object.hasOwn(spec, 'step') ? { ...spec, step: personalStep(spec.step) } : value;
    }) }) };
}

/** Preserve measurement, policy, effect IDs and provenance. Only the declared
 * narrative fields are projected; future model/provider keys stay visible to
 * the caller's scanner instead of being recursively cleared. */
export async function projectIntelligence(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    if (table === 'intelligence_commitments') return await subjects.commitmentRow(row) ? commitmentContent(row) : row;
    if (table === 'intelligence_pending_fulfilments') {
        const input = object(json(row.input_json));
        if (await subjects.people(row.requester_id, input?.beneficiaryId) || await subjects.work(row.work_id))
            return contentJson(columns(row, { error_code: null }), 'input_json', [['purpose']]);
        return row;
    }
    if (table === 'intelligence_investigations')
        return await subjects.people(row.requester_id, row.owner_id) || await subjects.work(row.work_id)
            ? columns(row, { error_code: null }) : row;
    const children = ['intelligence_versions', 'intelligence_observations', 'intelligence_events', 'intelligence_research',
        'intelligence_engineering_jobs', 'intelligence_capabilities', 'intelligence_simplifications'];
    if (!children.includes(table) || !await subjects.commitment(row.commitment_id)) return row;
    switch (table) {
        case 'intelligence_versions': return commitmentContent(row);
        case 'intelligence_research': return contentJson(columns(row, { question: 'Erased' }), 'data_json', researchText);
        case 'intelligence_observations':
            return contentJson(row, 'evidence_json', [['description'], ['message'], ['displayName'], ['email'], ['reason']]);
        case 'intelligence_events':
            return contentJson(row, 'payload_json', [['title'], ['body'], ['message'], ['description'], ['reason']]);
        case 'intelligence_engineering_jobs':
            row = contentJson(row, 'spec_json', [['description'], ['edits', '*', 'content']]);
            return contentJson(row, 'receipt_json', [['summary'], ['reason'], ['error'], ['output']]);
        case 'intelligence_simplifications': return contentJson(row, 'data_json', [['redesign'], ['continuedRepair']]);
        case 'intelligence_capabilities': {
            row = contentJson(row, 'data_json', [['diagnosticQuestions', '*'], ['counterexamples', '*', 'description'], ['verifierSpecs', '*', 'description']]);
            const data = object(json(row.data_json));
            if (!data) return row;
            const next = { ...data };
            if (Array.isArray(data.steps)) next.steps = data.steps.map(personalStep);
            if (Array.isArray(data.verifierSpecs)) next.verifierSpecs = array(data.verifierSpecs).map(value => {
                const spec = object(value);
                return spec && Object.hasOwn(spec, 'step') ? { ...spec, step: personalStep(spec.step) } : value;
            });
            return { ...row, data_json: JSON.stringify(next) };
        }
        default: return row;
    }
}
