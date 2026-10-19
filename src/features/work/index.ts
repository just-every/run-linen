import { registerApplicationRoutes } from './application-routes';
import { registerSearchRoutes } from './search';
import { registerRetentionRoutes } from './retention-routes';
import { registerBundleRoutes } from './bundle-routes';
import { registerSlaRoutes } from './sla-routes';
import { registerProjectRoutes } from './project-routes';
import { registerRecurrenceRoutes } from './recurrence-routes';
import { registerResponseRoutes } from './response-routes';
import { registerKnowledgeDraftRoutes } from './knowledge-draft-routes';
import { setWorkIntakePort } from "../intelligence/intake-port";
import { workIntakePort } from "./intelligence-port";
import type { Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { registerConversationRoutes } from "./conversation-routes";
import { registerLifecycleRoutes } from "./lifecycle-routes";
import { registerTimeRoutes } from "./time-routes";
import { registerKnowledgeRoutes } from "./knowledge-routes";
import { registerClassificationRoutes } from "./classification-routes";
export * from "./core";
export * from "./lifecycle";
export * from "./resources";
export * from "./knowledge";
export * from "./attachments";
export * from "./requests";
export * from "./calendar";
export * from "./execution";
export * from "./intake";
export { restoreAdoptionRecord } from "./restore";
export { erasePerson, processBlobErasure } from "./privacy";
export { processDueRetention } from "./retention";
export function registerWorkRoutes(app: Hono<AppEnv>) {
  setWorkIntakePort(workIntakePort);
  // Before /work/:id so the literal retention paths win.
  registerRetentionRoutes(app);
  registerBundleRoutes(app);
  registerSlaRoutes(app);
  registerProjectRoutes(app);
  registerApplicationRoutes(app);
  registerSearchRoutes(app);
  registerConversationRoutes(app);
  registerLifecycleRoutes(app);
  registerKnowledgeRoutes(app);
  registerClassificationRoutes(app);
  registerTimeRoutes(app);
  registerRecurrenceRoutes(app);
  registerResponseRoutes(app);
  registerKnowledgeDraftRoutes(app);
}

export * from "./delegation";

export { workIntakePort } from "./intelligence-port";

export { recordFulfilmentExecution } from "./fulfilment-execution";
export type { FulfilmentExecutionInput } from "./fulfilment-execution";

export { getFulfilment, amendFulfilment } from "./fulfilment-amend";
export type { FulfilmentSnapshot, FulfilmentAmendInput, FulfilmentAmendResult } from "./fulfilment-amend";

export { approveFulfilment, assertWorkFulfilmentAuthority, recordWorkManagerGrantApproval } from "./fulfilment-authority";

export { listFulfilmentDecisions } from "./fulfilment-decisions";
export type { FulfilmentDecision } from "./fulfilment-decisions";
export { getFulfilmentReadiness } from "./fulfilment-readiness";
