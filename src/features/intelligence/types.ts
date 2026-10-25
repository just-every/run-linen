import type { Env, Principal } from '../../platform/types';
import type { Step } from '../execution/types';
export interface IntelligenceContext {
    env: Env;
    principal: Principal;
}
export interface ObservationSpec {
    id: string;
    description: string;
    step: Step | GitHubObservationStep;
}
export interface GitHubObservationStep {
    action: 'github.repository.read';
    actionVersion: 1;
    verifierConnectionId: string;
    verifierConnectionRevision?: number;
    target: string;
    beneficiaryId: string;
    cohort?: string[];
    connectionId?: never;
}
export interface CommitmentData {
    serviceId?: string;
    outcome: string;
    cohort: string[];
    observations: ObservationSpec[];
    freshnessSeconds: number;
    dependencies: string[];
    effectiveAt: string;
    expiresAt: string | null;
    intervalSeconds: number;
    modelConnectionId: string | null;
}
export interface Commitment {
    id: string;
    workspaceId: string;
    ownerId: string;
    participants: string[];
    sensitivity: 'internal' | 'restricted' | 'hr';
    data: CommitmentData;
    revision: number;
    dueAt: string;
    createdAt: string;
    updatedAt: string;
}
export interface Fact {
    id: string;
    specId: string;
    state: string;
    observedAt: string;
    cohort: string[];
    evidence: unknown;
}
export interface Research {
    id: string;
    workspace_id: string;
    commitment_id: string;
    actor_id: string;
    connection_id: string;
    question: string;
    state: string;
    round: number;
    data_json: string;
    lease_until: string | null;
}
