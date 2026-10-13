import type { Env, Principal } from "../../platform/types";
export interface CoreContext {
  env: Env;
  principal: Principal;
}
export type Action =
  | "group.add"
  | "group.remove"
  | "license.add"
  | "license.remove"
  | "effect.observe"
  | "identity.create"
  | "identity.disable"
  | "sessions.revoke"
  | "deployment.canary"
  | "deployment.rollout"
  | "deployment.compensate";
export interface Step {
  sourceId?: string;
  sourceRevision?: string;
  sourceFence?: number;
  action: Action;
  actionVersion: 1;
  connectionId: string;
  connectionRevision?: number;
  verifierConnectionRevision?: number;
  target: string;
  beneficiaryId: string;
  localBeneficiaryId?: string;
  mappingId?: string;
  mappingRevision?: number;
  grantId: string;
  grantVersion: number;
  expiresAt?: string;
  revocationGrantId?: string;
  compensationGrantId?: string;
  verifierConnectionId?: string;
  cohort?: string[];
  payload?: Record<string, unknown>;
  payloadHash?: string;
  expectedPresent?: boolean;
}
export interface PlanInput {
  workId: string;
  revision: number;
  steps: Step[];
  idempotencyKey: string;
  contextType?: "work" | "change" | "commitment" | "engineering";
  contextSnapshot?: Record<string, unknown>;
}
export interface Plan {
  id: string;
  workspace_id: string;
  work_id: string;
  work_revision: number;
  revision: number;
  actor_id: string;
  steps_json: string;
  state: string;
  context_type: string;
  context_snapshot_json: string;
}
export interface Operation {
  id: string;
  workspace_id: string;
  plan_id: string;
  step_json: string;
  state: string;
  revision: number;
  fence: number;
  resource: string;
  actor_id: string;
  cancel_requested: number;
  lease_until: string | null;
  due_at: string | null;
  parent_id: string | null;
}
export const actions: Action[] = [
  "group.add",
  "group.remove",
  "license.add",
  "license.remove",
  "effect.observe",
  "identity.create",
  "identity.disable",
  "sessions.revoke",
  "deployment.canary",
  "deployment.rollout",
  "deployment.compensate",
];
