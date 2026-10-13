# Domain, execution and extension design

The domain, authority and execution sections preserve the accepted design
requirements; they do not certify every feature as implemented. Linen now runs as
an edition on the maintained RER/Base platform. Its integration supplies a Lobby
at `/`, owner confirmation at `/setup`, and the Linen application at `/app`, while
preserving Linen's native account/session data and product identities. Proof
status and remaining gates are in [ACCEPTANCE.md](ACCEPTANCE.md).

## Domain owned by Linen

Keep request, incident, problem, change and lifecycle case identities distinct.
They can share conversations, assignments, calendars and evidence references;
they do not share a mandatory status enum. A request promises fulfilment; an
incident tracks interrupted work; a problem tracks cause and prevention; a change
controls an alteration. Completion rules follow each job's outstanding obligations.

The service graph relates people and employment facts, devices/custody, software
and entitlements, technical services, business services, dependencies, suppliers
and commitments. Every imported or inferred fact/edge carries source identity,
observed/effective time, ingestion time, revision, access scope and freshness
policy. Distinguish observed, owner-asserted and inferred relationships. Conflicts
remain inspectable; new arrivals cannot silently overwrite newer effective facts.
A missing edge is unknown coverage, not evidence of no dependency. Inference can
prioritise a diagnostic; it cannot grant authority or certify recovery.

Plans reference versioned work, evidence, action definitions, target identities,
preconditions, expected effects, compensation and verification criteria. Store
attempts, provider references, receipts, unresolved effects, decisions and cost
as durable linked records. The UI, channel adapters and agents operate on these
same records; a transcript is neither the database nor the permissions system.

Use ordinary modules for identity/policy, work and commitments, graph/evidence,
execution, connectors, verification, channels/knowledge and import/recovery.
Start with a cohesive application and durable workers appropriate to the selected
target. Split services only for measured isolation or operational needs; no
universal workflow kernel or separate platform is a prerequisite.

## Keep orchestration out of the human path

The [six UX journeys](UX.md) share one conversation and a small view of decisions
that require a real person. Service graph, incident command, approvals, evidence,
asset custody, changes and owner controls open contextually when someone owns an
unresolved task. They are not mandatory navigation stops or user-built
workflows. Linen owns known-fact lookup, classification, correlation, routing,
safe follow-up and reconciliation; it asks only for missing facts, current
authority or a human business judgment. It may not manufacture missing grants or
replace an inaccessible physical check with a claimed provider result.

## Authority is checked at the effect boundary

Authenticate the employee, initiator, approver, operator, service owner and
integration principal separately. Scope private access by organisation, service,
record participation and sensitivity. An HR initiator provides necessary lifecycle
facts, not unrelated personnel files. A budget owner is not automatically an
identity administrator; an operator cannot approve their own privilege escalation.

Versioned grants state principal/delegation chain, permitted action/version,
beneficiary/resource scope, conditions, limits, time window, expiry and revocation.
They can preauthorise low-risk work. High-impact actions require the appropriate
explicit scope and any separation of duties. Policy is evaluated from authenticated
state and owner-controlled versions, never instructions in retrieved documents,
tickets, attachments, logs, tool output or model plans.

At each read, action, notification and result admission, recheck the relevant
current authority. Before dispatch, bind the decision to the plan/request revision,
current target state, resource fence and grant versions. A concurrent edit,
revocation, expiry, takeover or policy change invalidates affected permission;
pause or replan without rewriting historical approval. Approval of a plan does
not mint unrestricted provider credentials. Connector credentials are least
privilege, separate from agent context and never embedded in model prompts.

Revocation stops new effects and requests cancellation of in-flight work. It
cannot prove a remote process stopped. Record the last confirmed checkpoint and
unknown effects. Readback after revocation needs a separately authorised
reconciliation principal; absence of that right requires handoff, not a bypass.
A late receipt may be retained as restricted evidence through an authorised
reconciliation path but cannot revive execution authority.

## Durable execution semantics

| Boundary | Required behavior |
|---|---|
| Intent | Persist operation identity, plan/action version, target, preconditions, authority decision and expected effect before a provider write. |
| Concurrency | Conditional revision updates and resource-scoped leases/fences prevent competing workers or human takeover from applying incompatible plans. External target versions are checked when supported. |
| Dispatch | Send the provider idempotency key where supported; correlate the response to the intent. A local database cannot promise exactly-once remote execution. |
| Uncertain effect | Timeout, crash or lost response becomes reconciling/unknown. Inspect operation/target state before any repeat. If the provider cannot establish the outcome, hold the action for explicit reconciliation; never turn uncertainty into a clean failure and automatic resubmission. |
| Resume | Restart from durable checkpoints, recheck authority, and resume only unfinished safe work. Sweep each pending effect independently so one failure cannot strand unrelated work. Record evidence/notifications transactionally with an outbox or equivalent. |
| Partial completion | Expose each confirmed, failed and unknown effect and remaining obligation. Apply compensations only with current authority and known preconditions; rollback is another action with its own failures and verification. |
| Cancellation | Cancel queued work with proof it never started; request stop for running work and retain uncertain outcomes. A new assignee or replacement run receives the exact outstanding effects. |
| Retry | Retry only errors classified safe by the connector contract, with backoff, rate-limit handling and budgets. No semantic retry loop around unknown effects or invalid model output. |

Parallel diagnostics get distinct scopes and budgets and normally read only.
Their findings are merged with provenance and disagreement intact. Overlapping
writes share a resource fence and a single accountable change coordinator.
Reconciliation, grant expiry and due revocation remain durable scheduled
obligations; infrastructure outages must not make them disappear.

## Verification is a separate responsibility

An action definition supplies a verifier contract: desired state, observation
method, beneficiary/cohort, freshness, negative checks, observation window and
known limits. Provider acceptance proves submission; readback proves a technical
effect; an application probe or employee observation addresses usable work.
Define which combination establishes the promised outcome. Administrative closure,
nonresponse and successful notification remain separate from verified fulfilment.

Use independently obtained evidence for the verifier where possible. A model's
own narrative or an executor's success flag cannot certify its result. Test
verifiers against false positives: cached sessions, wrong user/environment,
partial cohorts, stale reads, unchanged broken state, misleading logs and a
successful API response with an unusable application. Retain disagreement and
“insufficient evidence”; do not manufacture a confidence score into authority.
When fresh independent evidence establishes the declared usable outcome, do not
wait for an employee acknowledgement. Ask for a person's observation only when
the relevant fact is genuinely inaccessible to permitted machine checks; preserve
“still not working” as a context-rich correction path.

An operator handoff carries outcome, active principal, scope, facts, hypotheses,
actions/effects, unresolved state, current grants, verifier gaps, costs and next
safe decision. The receiving human or agent must explicitly take ownership;
fenced takeover prevents the former worker continuing to write. Employees see a
useful explanation and next update, not the model's private chain of thought.

## Context and model/tool quality

Retrieve only data the current principal can read. Recheck source access at
retrieval/result use; do not leak private notes through summaries, notifications,
search indexes, exports or model logs. Retain source IDs, versions and scoped
citations. Minimise or redact secrets/personnel content, bound retention, and
record configured model data handling against the owner's requirements.

Treat provider content and retrieved text as untrusted data. Tools expose typed,
bounded operations; schema validation, allowed evidence IDs, target validation
and policy precede effects. Injection tests include instructions embedded in
knowledge, email, telemetry, attachments and connector error messages. An agent
can propose a new tool but cannot install it in its own active run.

Evaluate current models and harnesses on complete and adversarial journeys,
including recovery/verifier quality and all-attempt cost. Start with capable
models and improve context, schema, normalisation and tool design when results
fail. Select cheaper models only with measured retained outcome quality; no fixed
model ceiling or magic autonomy confidence threshold is part of this design.
Budget ceilings may stop new investigation while preserving evidence and urgent
obligations. Reserve explicit capacity for reconciliation/revocation or route to
an authorised responder; never silently abandon those jobs when a model budget
runs out.

## Owner-agent extension lane

A missing connector or useful preventive fix becomes a development change with
requirements, declared effects, a source diff, adversarial tests, a provider probe
under explicit test authority and a versioned release. The owner's agent may
change deep schema/UI/core behavior and bring useful improvements upstream.
Production execution adopts the accepted version through ordinary deployment;
in-flight plans retain their action/verifier versions or migrate explicitly.

Keep engineering credentials and authority-policy publication separate from
service credentials. A service agent may open a proposed change under a grant;
it cannot self-approve, loosen its validator or rewrite its grants. A new connector
needs actual adoption checks in Linen and any other consumer before calling it
shared capability. Preserve existing products and applied migration history;
verify existing owner data and intent through later updates, not merely new
installations or clean merges.

## Persistent commitments and the learning loop

The [frontier extension](FRONTIER-EXTENSION.md) adds versioned commitments above
individual cases: outcome/cohort, effective period, required observations,
coverage/freshness, dependency assumptions, responsible owner and grant references.
Commitments link to existing incident/change/lifecycle records without replacing
them. Durable event subscriptions and scheduled obligations wake bounded work;
context and responsibility persist while model calls stop between useful tasks.

Normalise, deduplicate and filter events deterministically. Retrieve scoped context
and ask independent atomic semantic questions against a versioned snapshot where
that helps. Changed sources, context or model versions invalidate affected cached
decisions. Schedule fresh checks for stale/unobserved scope; silence is not health.
Serious signals and unfamiliar situations can directly start deep investigation,
concurrently with fast help. Route by evaluated outcome quality and total cost.

Research tasks retain rival hypotheses, predictions, probe results and uncertainty.
A missing probe or repair enters the separate engineering lane. Standing engineering
grants may authorise independently checked canaries/releases without a fresh human
click; they cannot be minted by service execution. This clarifies “accepted version”
as satisfaction of declared release conditions, which may be preauthorised.

Solved cases can publish ordinary versioned detector/action/verifier modules with
applicability, counterexamples and provenance. Test held-out repeats and novel
near-matches, and invalidate on material context/version drift. Replay uses captured
observations; executable models and bounded proofs state their assumptions. None
substitutes for provider and employee-work verification. Start with one commitment,
one real service and its useful modules; do not build a universal simulation system.
