# Intelligence API (actual foundation contract)

`registerIntelligenceRoutes(app: Hono<AppEnv>)` mounts relative routes on authenticated `/api/v1`; X-Linen-CSRF applies. Every service function takes `IntelligenceContext = {env, principal}` and reloads current membership. UUID identities; ISO UTC dates. `processDueIntelligence(env)` is the scheduled entry, executing each commitment under its stored current owner; failures are isolated.

- GET/POST `/commitments`; GET/PATCH `/commitments/:id`; POST `/commitments/:id/observe`; GET `/commitments/:id/coverage`.
- POST `/intelligence/events` `{commitmentId,sourceId,eventId,sourceRevision,observedAt,payload}`; sourceId must be an owner-configured observation connection. Exact event and unchanged payload deduplication are deterministic.
- POST `/intelligence/intake` `{text,commitmentId?,connectionId}` returns a model proposal/question, never a grant.
- POST `/research` `{commitmentId,connectionId,question}`; GET `/research`; GET `/research/:id`; POST `/research/:id/advance` runs a bounded research round with parallel scoped probes; POST `/research/:id/verify` `{operationId}` uses execution verification.
- GET `/intelligence/attempts`; GET/PUT `/intelligence/budget` `{limitUsd}` owner only. Unknown-charge attempts retain their reserved maximum; exhaustion holds discretionary research only.
- POST `/intelligence/models/validate` `{connectionId}` verifies the configured model against the real provider models endpoint.
- GET/POST `/engineering/grants`; POST `/engineering/grants/:id/revoke`; GET/POST `/engineering/jobs`; engineering jobs cannot authorize themselves. Separate bearer companion API mounting is documented in engineering-agent/README.md.
- POST `/intelligence/protocol/check` `{assumptions,events,mutation?,binding?}`; durable bounded-model replay, no external-service proof. Optional binding: `{rootCommitmentId,commitments:[{id,revision,observationIds:string[]}]}` includes the complete transitive dependency closure. Obtain observation IDs from each commitment's existing coverage door after observing it. Re-submit the same binding to check its current validity. `replayValid` describes the supplied model trace; `valid` also requires every declared binding to remain current. `evidenceBasis` distinguishes supplied trace from persisted probe bindings; `invalidations`, `checkedAt` and `expiresAt` describe the dated check. Historical stored results are never a current-validity claim. Binding readers use the existing commitment doors and probes retain current connection provenance. No effects execute from this check.
- GET/POST `/capabilities`; POST `/capabilities/:id/apply` `{commitmentId,plan,versions}`; real execution, strict applicability and drift checks.
- GET/POST `/simplifications`; POST `/simplifications/:id/execute` `{phase,idempotencyKey}`; POST `/simplifications/:id/measure` collects fresh commitment observations.

Commitment input: `{outcome,cohort:string[],observations:ObservationSpec[],freshnessSeconds,dependencies:string[],ownerId?,participants:string[],sensitivity:'internal'|'restricted'|'hr',effectiveAt,expiresAt?,intervalSeconds,modelConnectionId?}`. PATCH additionally requires `revision`. ObservationSpec `{id,description,step:execution.Step}` binds an existing scoped workflow verifier, exact target, beneficiary and cohort; no arbitrary model-chosen URL or credential. Coverage reports each observation/cohort as absent/stale/uncertain/failed/verified independently. Edits preserve immutable historical versions.

Model connection provider `openai`, encrypted secret `{"apiKey":"..."}`; config `{model, inputUsdPerMillion, cachedInputUsdPerMillion, outputUsdPerMillion, maxOutputTokens, maxAttemptUsd, contextCharacters?, reasoningEffort?}`. Prices are owner-provided estimates; raw provider usage and unknown charges are retained. Provider URL is fixed to OpenAI; no credential forwarding to custom endpoints. No default model name is guessed.

Integration dependencies: execution `observeWorkflow` currently provides the read-only workflow adapter; `proposePlan/dispatchPlan/verifyOutcome` provide real effects/reuse. Service `getService/dispatchChange/verifyChange` supply controlled redesign. Root must mount routes, companion bearer routes separately from cookie middleware, and invoke scheduled processing. Model output cannot modify grants, observations, budgets or engineering allowlists.

`enqueueWorkIntake(ctx,workId)` and `processWorkIntake(ctx,workId)` integrate the existing employee conversation. Scheduler discovers open work through the work service; settings `defaultModelConnectionId` selects the owner-configured model. Employee never chooses model settings. Public employee-visible conversation is the only conversation context; private operator messages are excluded. Proposals alone confer no authority. Catalog fulfilments may execute through the execution-owned standing grant resolver; the same conversation receives actual verification or truthful unresolved status.

`restoreAdoptionRecord(ctx,{table,row,sourceId,sourceKey})` restores allowlisted intelligence tables (exported `restoreTables`) with an active owner and `workspace_settings.executionHeld=true`. Stable source identities deduplicate replay. Parent commitments must be restored first. Grants/budgets are not importable authority; engineering credentials cleared, fulfilment runs imported as unknown, interrupted operations unknown, capabilities invalidated pending fresh verification. Export must omit engineering tokens/claim hashes.

Engineering grants additionally bind `commitmentIds`, `contextPaths` and optional `modelConnectionId`. A standing matching engineering grant automatically queues missing-probe work. The companion reads actual source at the granted pin and asks `/engineering-agent/jobs/:id/design` for real structured model edits when none exist. Server uses the separately configured encrypted model connection, records all attempts/usage, and validates returned paths/preimages. The companion applies/checks them; model prose never counts as executed work.

Erasure port: `eraseIntelligenceIdentity(ctx, identity): Promise<void>`; current owner only. Redacts commitment scope/observations/research/engineering contents and invalidates reuse; retained attempt IDs/costs and receipt job IDs preserve accounting. Running engineering remains unknown; credentials revoked. Root may register `{name:'intelligence',erase:eraseIntelligenceIdentity}` with adoption's erasure registry.

Intake integration now uses ONLY Work's durable atomic outbox: register setWorkIntakePort({list,claim,finish,catalog}) with Work-owned services (interface intake-port.ts). No second ledger. System reply source key interpretation:<eventId> never requeues. Setting defaultModelConnectionId. Natural-language catalog resolution invokes requestFulfilment, then setStandingIntakeExecution({resolve}) selects only an existing authorized service actor + Step. Missing grants remain real assigned obligations. Root/work own outbox writes and execution owns resolution; no caller-supplied role creates authority.

Scheduled frontier advancement automatically dispatches already-authorized redesign canary/rollout phases through services, verifies actual executions, and collects post-intervention observations. It never creates grants. Service change implementation must persist `connectionRevision` and `verifierConnectionRevision`; both are checked at authorization and dispatch. Adoption-bound engineering uses exact `implementation.payload.commit` equality.

Employee investigation intake uses a required model `serviceId` (empty when genuinely unknown), validated against services readable by the original requester. `services/intake.ts` calls the requester-scoped Work classification port, derives the current service owner server-side and links only an unambiguous readable existing incident. It creates no global incident. Owner-authored commitments may bind `serviceId`; automatic research additionally requires the service owner to own the commitment and explicit requester/beneficiary participation. The durable `intelligence_investigations` route pins policy revisions, uses a stable research identity, and posts scoped background findings/owned failures to the original conversation. Model prose cannot establish recovery.

Existing catalogue fulfilments are read through Work `getFulfilment`, then amended through `amendFulfilment` with exact work/fulfilment revisions and intake event identity. Ordinary expiry corrections retain the stored purpose/beneficiary unless the user changes them. The Work result decides whether the change is amended or needs a decision; no duplicate initial access request or grant is dispatched.

Probe provenance errors are uncertain observations with no observed time, never fresh negative evidence. Legitimate bound `usableWorkflow:false` observations remain failures. Historical error-labelled failures are withdrawn by migration 0403; capability compilation requires persisted admitted provenance, and current model context retains unknown latest observations without giving them trusted evidence IDs.

Pending initial requests are durably retained in `intelligence_pending_fulfilments` before calling Work. Scheduler resumes them using the original requester, exact unchanged input/work revision, current Work readiness, then current standing execution authority. An existing fulfilment is never re-requested. Missing manager approval or a grant remains waiting with the fulfilment owner; later approval/grant requires no employee resubmit or model round. Expired/cancelled/changed requests cannot dispatch. The stable execution plan identity and execution reconciliation prevent repeated provider effects after interruption. Imported pending queues are unknown, and identity erasure clears the retained request payload.

Ticket-history analysis: POST `/intelligence/ticket-mining` with
`{importIds:string[],recentSince:string}` selects up to 20 completed Freshservice
file-import jobs, containing at most 1,000 unique tickets. `recentSince` is an
explicit ISO timestamp with timezone; counts distinguish tickets before that
boundary from tickets on or after it. The caller must remain the current owner
who holds each selected import. No ticket text, grants or measured outcomes are
accepted in the request.

The read-only analysis validates the stored plan, retained original bytes,
source identity and current custody, with a final cross-job revision, privacy
and session fence. Queued, reversed, erased, duplicate and corrupt sources
refuse. Title-token overlap produces up to three repeated-work candidates;
insufficient patterns remain explicit rather than fabricated. Every candidate
carries source locations, historic and recent counts, four draft outlines
(catalog item, workflow, standing grant and article), a conditional upper bound
in manual ticket handlings and risks. These are lexical candidates, not a
causal diagnosis or a finished execution design. Minutes and measured savings
remain unknown. The response is private and not cached; no derivative source
text is persisted or sent to a model or provider.

This door cannot publish content, issue grants or execute work. Administrative
review and publication, substantive workflow and grant design, native screens,
and a measured effect after a declared two-week post-publication window remain
open under AGENT-007. `tests/intelligence/ticket-mining-cases.mjs` exercises this
door within the existing native migration check. The separate committed scale
journey is `node tests/intelligence/ticket-mining-scale.mjs`; it imports 1,000
synthetic Freshservice tickets through the actual reviewed migration doors.
That journey proves corpus scale, not an elapsed effect observation.
