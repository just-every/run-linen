# Linen staged acceptance and measurement

**Local checks:** `rer verify` runs the mapped public flows: native browser
checks, connected journeys, setup checks, emitted HTTP checks and intelligence
HTTP checks. An archived native-data upgrade was checked to retain all prior rows
and migration entries before applying additive migrations. These bounded local
results do not establish full release acceptance. No live-provider action,
hosted deployment or owner acceptance is claimed; those full-clause dimensions
remain unproven. O1–O3 and F1–F7 remain wider requirements.

## Evidence by stage

| Gate | Required evidence | What it establishes |
|---|---|---|
| UX | Editable prototype and walkthroughs for all six UX.md journeys: discovery-led setup, one request, distinct join/move/leave, reported or proactively detected unfamiliar incident and repair, material business choice, and continuing improvement. Include scope/consent, physical custody, denial, partial and ambiguous effects, changed authority, deferral, takeover, “still not working”, unresolved recovery, and correction/cancellation with available reversal or compensation, current-grant checks, automatic action when already authorised, and clear stopped, reversible, irreversible and uncertain effects with material consequences. Demonstrate that machine-verifiable outcomes do not wait on routine human confirmation. | The proposed human path is understandable and its effort can be measured; no execution or provider claim |
| Connected proof | Exact source/action/verifier versions; real selected provider and scoped test principals; temporary entitlement, expiry/revocation, useful application probe and negative privilege check; timeout/crash/reconciliation and changed-authority evidence | One declared connected outcome, with its limits; not a complete product |
| Complete employee release | All E1–E7 paths and exceptions, A1–A7, real native sessions/channel outcomes, responsive accessible screens, genuine migration or evidenced greenfield setup, install/redeploy/export/restore, owner acceptance | A usable desk for the declared owner environment; no arbitrary provider claim |
| Service operations | O1–O2 multi-user SSO/order outage: competing hypotheses, parallel diagnostics, conflicting change, appropriate authority, rollback failure path, cohort recovery, known-error/prevention follow-through and supplier communication | Supported service operations across selected systems; no universal autonomous IT claim |
| Adaptive flagship | O3 full asset/software and supplier lifecycles, a measured preventive intervention, a new connector authored through the change lane, update on existing data and owner source adaptation | Continuing extensibility and measured outcomes, with ongoing economics |
| Wider rollout | Exact release/build and declared target; real coexistence or replacement, late-arrival reconciliation, recovery drill, operational monitoring and representative load; subsequent owner usage | The bounded deployment claim actually made; earlier local evidence remains distinct |

Capture source revision, selected module/action/model/policy/verifier versions,
configuration scope, data provenance, actual commands, timestamps, observed
results and remaining failures with each record. Record failed/skipped/uncovered
obligations explicitly. A named test or mapped clause is not evidence by itself.

Use evidence labels consistently: **fixture** means a controlled test boundary;
**local runtime/browser** means real local application behavior; **provider** means
a real configured external effect/readback; **hosted** means the exact deployed
candidate; **owner** means actual usage/acceptance. One label cannot substitute
for another.

## Complete employee first-release floor and safeguards

The requirement text below preserves the complete clauses from
[CONTRACT.md](CONTRACT.md). The primary-flow column names the local check mapped
to each clause in [tests/acceptance/README.md](tests/acceptance/README.md). PASS
records only the mapped bounded local flow; each release head needs its own
verification. Real-provider, hosted and owner acceptance for the full clauses
remain unproven.

| Clause | Required behavior, including exceptions | Primary local flow | Local-flow result and remaining acceptance |
|---|---|---|---|
| **E1 Help and incidents** | Authenticated portal/email intake, stable conversation, incident/request classification, accountable routing and reassignment, employee replies/private notes, attachments, impact, service/device context, response/resolution commitments and restoration evidence. Employees can correct, confirm when useful, report “still not working” or reopen; do not require confirmation when fresh independent evidence proves usable work. Handle duplicate messages, unknown sender, attachment failure, wrong classification, absent assignee, holidays/timezones, nonresponse and simultaneous edits. Closure policy is disclosed; closure is distinct from verified recovery. | `tests/ui/run.mjs` (`ui/browser.mjs`; native browser script) | PASS on candidate `9e320f3`: 25 native browser checks; `pageErrors` empty. Full provider/hosted/owner acceptance remains unproven. |
| **E2 Access, device and software requests** | Accept a natural-language request or optional catalog selection; resolve beneficiary, purpose and prerequisites from permitted context, then show exact authority, fulfilment owner, provision/delivery evidence and comprehensible rejection/completion. Ask only for a genuinely missing fact or decision. Missing managers enter an accountable exception; substitutes require actual delegated authority. Material changes invalidate affected approval. Handle partial fulfilment, no stock/licence, cancellation after effects, failed/unknown provider actions, temporary access expiry and independently verified revocation; do not require routine reapproval or confirmation when standing authority and machine evidence suffice. | `connectedRequest()` in `tests/ui/connected-request.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **E3 Join, move and leave** | Authorised HR/manager initiation with effective times, task dependencies, accounts, access and devices; an authoritative HR event may start routine work without a separate employee/IT request. Keep the distinct obligations: join prepares the authorised baseline and physical fulfilment; move compares retained, added and removed access; leave revokes access and preserves separate custody/return duties. Reconcile every obligation. Handle changed dates, cancelled hires, contractor expiry, urgent termination, already-disabled identity, partial revocation, unreturned laptop and ambiguous local times/daylight saving. HR remains authoritative for employment facts; completed subtasks cannot conceal outstanding security/custody work. | `connectedLifecycle()` in `tests/ui/connected-lifecycle.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **E4 Custody and context** | Stable device ID/serial, person, location, lifecycle, receipt/return and service ownership linked to work. Preserve source and freshness. Reconcile conflicting serials, reassignment in progress, missing devices, disposed-but-assigned records, renamed/merged/deactivated people and stale MDM feeds. Imported observation is distinct from verified custody. | `custodyJourney()` in `tests/ui/custody-journey.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **E5 Shared incidents and problems** | Accountable shared interruption, impact, linked employee incidents, update cadence, recurring cause/workaround and follow-up. Linen correlates candidate reports from permitted evidence and preserves separate employee work; people can correct mistaken links without manual triage as the default. Parent recovery does not establish every employee's recovery. Preserve confidential scopes, show stale workarounds and failed notifications, and retain separate restoration and cause/prevention outcomes. | `connectedChanges()` in `tests/ui/connected-change.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **E6 Controlled changes** | Service, owner, risk/impact, dependencies, scheduled window, versioned authorisation, exact implementation, execution and rollback/compensation evidence, success/failure and follow-up. Standard low-risk changes can use standing grants. Handle emergency authority, conflicts, post-approval edits, partial execution, failed rollback and post-change incidents. A change record is not authority in a provider. | `connectedChanges()` in `tests/ui/connected-change.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **E7 Knowledge and management review** | Scoped reviewed articles, explicit expiry, search and escalation into a request with context. Reports cover age, response/resolution commitments, blocked approvals, lifecycle obligations, recurrence and outcomes with definitions, range and timezone. Paused clocks, changed schedules, reopened work, permission changes and failed refreshes remain explicit; closure counts never substitute for fulfilment. | `tests/adoption/prior-data-upgrade.mjs` (native knowledge/report readback) | PASS on candidate `9e320f3` after documented harness corrections; native article and report readbacks passed. Full provider/hosted/owner acceptance remains unproven. |
| **A1 Identity and privacy** | Authenticate scoped principals at every private boundary. Separate requester/beneficiary, approver, HR, service operator, owner, auditor and integration rights. Enforce current scope on records, attachments, search, notifications, exports and AI context. Protect restricted departures and incidents; minimise HR data; support retention and authorised erasure without restoring erased content on replay. Audit privileged read/export and policy changes. | `tests/ui/run.mjs` (`ui/browser.mjs`; native browser script) | PASS on candidate `9e320f3`: 25 native browser checks plus archived privacy/erasure readbacks. Full provider/hosted/owner acceptance remains unproven. |
| **A2 Granted action** | Versioned grants bind action, target, beneficiary, conditions, limits and time. Standing low-risk authority avoids repeated human approvals. Wider-impact action needs appropriate authority. At-action checks reject stale, expired, revoked or concurrently superseded decisions. Retrieved text and model output never confer authority. Source/policy editing cannot silently let the executor expand its own privileges. | `connectedRequest()` in `tests/ui/connected-request.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **A3 Durable effects** | Persist intent and operation identity before dispatch; fence competing execution and human takeover. Reconcile unknown remote effects before repeat. Resume after crash without duplicating confirmed effects. Record partial completion, failed compensation and remaining obligations. Revocation or cancellation request is not proof that a remote action stopped. | `connectedCancellation()` in `tests/ui/connected-cancellation.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **A4 Verifiable outcomes** | Bind each claim to fresh attributed evidence, target/cohort and verifier version. Distinguish submission, effect and usable recovery. Retain unknown/disputed results and negative checks; no false success from sent instructions, tool status, nonresponse or a model's self-assessment. | `connectedRequest()` in `tests/ui/connected-request.mjs` | PASS on candidate `9e320f3` within the seven-journey connected suite. Full provider/hosted/owner acceptance remains unproven. |
| **A5 Legible service** | Employees see truthful status and next action in their conversation; operators see only accountable exceptions in their work context and can take over. Linen owns permitted routing, safe follow-up and escalation; routine acknowledgement is not a gate to machine-verifiable completion. Preserve accessible desktop/mobile paths, private/public separation, real delivery states, calendars/escalation and an audited outage recovery-access procedure. | `tests/ui/run.mjs` (`ui/browser.mjs`; native browser script) | PASS on candidate `9e320f3`: six native journeys inspected at 1440/390; 320 keyboard/overflow checks passed. Bounded evidence only; full accessibility and provider/hosted/owner acceptance remain unproven. |
| **A6 Data and source custody** | Imports preserve identities, relationships, public/private history, attachments and meaningful status/approval history; imported approval is history, not new authority. Reconcile dry run and actual cutover, late arrivals and dual execution. Usable export/restore preserves policy, evidence and intent. Updates preserve applied migration history and test existing data and owner adaptations. Source may diverge deeply without losing eligibility for useful upstream improvements. | `tests/adoption/prior-data-upgrade.mjs` (archived native upgrade) | PASS on candidate `9e320f3` after documented harness corrections: all 164 prior rows across 106 tables and all 46 prior migration entries/SQL retained; six additive migrations applied. Full provider/hosted/owner acceptance remains unproven. |
| **A7 Honest operating and cost boundaries** | Declare actual supported commands, runtime, resources, provider effects and recovery targets. Record every model/tool attempt, failures and uncertain charges, budgets, latency and all human work. Count touches and active minutes for account sign-ins/consents, setup gaps, corrections, physical custody, vendor/technician tasks, takeover and recovery; report unresolved and missed work beside any lower-interruption result. Local/fixture, real provider, hosted and owner evidence stay distinct. Missing configuration cannot produce mock data or successful fallback execution. | `tests/intelligence/runtime.mjs` (script) | PASS on candidate `9e320f3`: 34 HTTP checks including budgets, scope/privacy, invalid evidence, unknown charges and restart persistence. No live model/provider call; full provider/hosted/owner acceptance remains unproven. |

## Flagship service operations remain required

O1–O3 expand the product destination; they do not replace or postpone the E1–E7
employee floor. The full requirements remain:

| Clause | Required behavior | Related source locations (coverage only) | Current evidence and remaining acceptance |
|---|---|---|---|
| **O1 Service graph and major incidents** | Relate business impact, services, technical dependencies, people and suppliers with provenance, freshness and uncertainty. Coordinate incident command, parallel scoped diagnostics, escalation, audience-specific updates and recovery checks across affected cohorts. Integrate actual monitoring/on-call systems under declared authority; do not infer health or dependencies from missing data. | `tests/services/run.mjs`; `tests/services/integration.mjs`; `tests/ui/connected-change.mjs` | Related bounded connected-change coverage passed in the candidate checkpoint, but no full O1 demonstration is established. Real monitoring/on-call, provider, hosted and owner evidence remain unproven. |
| **O2 Change, release and prevention** | Coordinate change windows, dependencies, deployment gates, canaries and compensations with real provider evidence. Connect known errors, recurrence and post-incident learning to owned preventive changes. Measure sustained recovery and effectiveness; a drafted postmortem or prevention suggestion is not a completed improvement. | `tests/services/integration.mjs`; `tests/ui/connected-change.mjs`; `tests/ui/connected-frontier.mjs` | Related bounded connected-change coverage passed in the candidate checkpoint, but no full O2 demonstration is established. Live change, sustained prevention, provider, hosted and owner evidence remain unproven. |
| **O3 Lifecycle and economics** | Extend custody through acquisition, assignment, renewal, repair, return and disposal; manage software entitlements and reclamation with service impact and authority. Track supplier commitments, handoffs and breaches. Show attributed service costs, demand and avoided-work hypotheses with uncertainty. Owners' agents can add integrations and deeply adapt source through the tested change lane, retaining authority and verification guarantees. | `tests/services/run.mjs`; `tests/work/runtime.mjs`; `tests/intelligence/frontier.mjs` | No full O3 demonstration is established by the candidate checkpoint. Real supplier, reclamation, economics, provider, hosted and owner evidence remain unproven. |

The F1–F7 extension evidence table below also remains in full. Its proposed
demonstrations are additional obligations, not a substitute for employee-release,
provider or owner evidence.

## Coverage that must survive implementation

| Clauses | Future checks and adversarial cases |
|---|---|
| E1, E7, A5 | Duplicate intake/reply, unknown sender, private attachment leakage, stale/missing article, inaccurate calendar/paused clock, absent assignee, notification failure, nonresponse, reopen, concurrent edit, mobile/keyboard and IdP outage access |
| E2–E4 | Missing/substitute approver, edited beneficiary/expiry, stock/licence shortage, ambiguous provisioning, cancelled hire, moved date, urgent leaver, already-disabled user, partial revocation, unreturned/disposed device, conflicting serial, merged identity and stale device feed |
| E5–E6, O1–O2 | Incorrect incident linking, confidential cohort, parent resolved with a broken employee, stale workaround, conflicting windows/deployments, modified implementation, emergency grant, failed rollback and sustained recovery/prevention observation |
| A1–A2 | Cross-organisation/role denial across every read/write surface, revoked membership, self-approval escalation, hostile retrieved/tool content, expiring grants between plan and effect, invalid imported approvals and unauthorised source/policy rewrite |
| A3–A4 | Parallel dispatch/takeover, crash before/after provider write, lost receipts, duplicate webhook, uncertain provider charge/effect, compensation failure, restart during due revocation, late result after authority loss; misleading success, wrong environment/user, cached/stale evidence and incomplete cohort |
| A6 | Real import dry run and resumed import; identities/relationships/private threads/attachments and approval history; missing data refusal; source+target counts/hashes/sensitive cases; duplicate executor prevention; late arrivals; restore after new remote work; erasure replay and old-data update |
| A7, O3 | Budget exhaustion with unresolved obligations, request limits, credential rotation, selected provider outage, usable export/restore, real installation/redeployment, declared load/recovery targets, connector release and owner adaptation through update |

Tests may use realistic controlled fixtures; the runtime must never replace
missing configuration or failed actions with mock success. Native screens and
provider verification must exercise the actual product path. Do not alter existing
fixtures/tests solely to make a release pass.

## Outcome and economic definitions

Choose the cohort, service/action mix, observation window and comparator before
a measured run. Report counts with rates, pending cases and exclusions. Do not
pick only cases the agent accepted or completed; record eligible incoming work,
declines and failures. No measured performance results exist yet. UX.md gives
proposed effort budgets; they are design targets, not achieved values or benchmarks.

| Measure | Definition and denominator |
|---|---|
| Verified outcome rate | Cases meeting their predeclared usable-work verifier within the window / all eligible incoming cases in that cohort. Break out self-service, autonomous, assisted, declined, failed and pending; show all incoming volume as well. |
| False completion | Cases declared fulfilled/recovered that independent review or a linked reopening proves were not / all cases declared fulfilled/recovered. Report review coverage and follow-up window, including unreviewed and unverifiable claims. |
| Time to work restored | Elapsed time from first eligible report or service observation (and separately incident onset when known) to verified usable work. Report median/tail for verified cases plus unresolved ages and counts; pausing an SLA does not pause real elapsed time. |
| Recurrence | Verified recovered cases with a linked same-cause failure in the stated follow-up window / recovered cases with a complete follow-up window. Report uncertain cause and loss of follow-up separately; use service exposure for incident-frequency comparisons. |
| Unauthorised actions | Confirmed out-of-grant effects / all attempted external writes, plus raw count and severity. Track denied attempts separately. Target zero; any confirmed unauthorised effect fails the relevant release gate. |
| Intervention and owner attention | Raw human-touch/interrupt count and active minutes by employee, operator, owner, vendor and technician across every attempt, setup, sign-in/consent, missing-configuration task, correction, exception, physical handoff, takeover, recovery and handoff / all eligible cases, and separately / verified outcomes. Report external wait separately. Automatic work withheld by a missing grant, silent misses and unresolved work remain visible; fewer notices alone are not success. |
| Cost per verified outcome | Total model tokens/calls, failed and uncertain attempts, tools/provider, infrastructure, setup/migration and attributable maintenance cost / verified outcomes. Show observed versus estimated/unavailable charges; report total cost when no outcome verifies instead of dividing by zero. |
| Continuing adaptation | All-attempt cost, elapsed time and owner minutes to add a connector/policy change and preserve intent through a later update; include regression/recovery and subsequent upkeep during a declared period. |
| Prevention and service economics | Comparable recurrence/impact before and after an intervention, with workload/exposure changes and attribution uncertainty; asset/software/supplier costs linked to actual entitlement and usage evidence. Suggestions and estimated avoided cost are not realised savings. |

Compare the same outcome/authority/privacy floor in the owner's incumbent suite,
a fitting open-source option such as GLPI, Linen, and an increasingly capable
agent starting from scratch. Reuse actual available systems; do not fabricate
benchmark outputs for untested alternatives. Include implementation, integration,
migration, failed approaches and future upkeep, not just licence fees or successful
LLM calls. When comparable evidence is unavailable, the advantage stays a
hypothesis and product engineering can still proceed.

Evaluate model/tool and verifier quality separately from execution cost. Keep
held-out and adversarial cases, record model/harness versions, inspect false
completion and wrong-authority outcomes, and re-evaluate after meaningful changes.
A cheaper model earns a role through outcome evidence, not a presumed capability
ceiling. Owner acceptance should explain remaining limits and the real service
improvement, with no claim that a green local suite proves the whole product.

## Frontier extension evidence

The [seven extensions](FRONTIER-EXTENSION.md) are new proposed obligations. Begin
their UX and one connected demonstration during phases 1–2 while the access proof
and E1–E7 work proceed. Their gates do not delay all unfamiliar engineering until
desk parity, and a successful demonstration does not release an incomplete desk.
Use the existing evidence labels and A1–A7 requirements throughout.

Bounded connected and intelligence HTTP checks pass locally, but no full F1–F7
demonstration is established. Each extension's provider, hosted and
owner evidence remains unproven even if a related local check passed.

| Scope | Required proposed evidence |
|---|---|
| F1 Persistent commitments | One owner-defined service outcome becomes explicit cohort, observations, dependency assumptions, responsible owner and dated obligations. Demonstrate continuation across case closure/restart and changing staff/service facts; stale or absent observation stays unknown. |
| F2 Semantic observation and help | Real selected events reveal a threatened or broken commitment; employee/operator views provide useful truthful next steps. Compare atomic decisions with a direct capable-model route, including misleading benign events, missing context, wrong confident decisions and provider failure. No event storm creates one model call per log line. |
| F3 Unfamiliar research | Hold out the actual cause and repair from the harness and reusable library. Resolve an unfamiliar multi-system regression with rival explanations, predicted observations and discriminating probes; retain rejected explanations and all attempts. Include an incorrect fast classification that does not suppress an independently warranted deep investigation. |
| F4 Service engineering | An absent diagnostic/connector or substantive service fix is authored against real owned source, independently tested, released under an actual engineering grant and adopted on the selected provider. Demonstrate a preauthorised canary without a manufactured human click, real workflow recovery and the existing failed/unknown-effect paths. |
| F5 Models and experiments | Check one useful bounded policy/protocol property, its assumptions and a counterexample or mutation that the check catches. Run representative replay/experiment evidence and separately verify live effects. A missing dependency or violated assumption invalidates the affected conclusion; the proof cannot certify the whole external service. |
| F6 Reusable capability | Generate a versioned detector/action/verifier package from a verified case; succeed on held-out repetitions. A similar symptom with a different cause rejects reuse and starts fresh investigation. Context/provider/action/model drift invalidates affected decisions and packages until revalidated; report both wrong reuse and unnecessarily rejected valid reuse. |
| F7 Service simplification | Compare at least one substantive redesign with continued repair using service outcomes and total work. Execute a worthwhile granted change and observe subsequent exposure, recurrence, employee impact and net work/cost. Include migration effort, displaced burden and adverse outcomes; proposals or fewer tickets alone do not pass. |

Choose the service, authorised environment, cohort, comparison cases, quality
floor, observation window and success thresholds before each connected run.
Build unfamiliar cases from realistic selected systems with controlled faults in
an authorised environment; keep the cause separate from the investigating agent's
inputs. Label fault-injection/replay evidence distinctly from naturally occurring
incidents and real owner usage. An independent verifier holds recovery evidence.
Neither a fixture solution nor a provider's general latency claim is a Linen result.

Additional measures complement the existing outcome/economic definitions:

| Measure | Definition and denominator |
|---|---|
| Evidence to justified response | Time from first relevant observation being available to Linen to the first response supported by sufficient attributed evidence and authority. Report ingestion delay separately, median/tail, and all unresolved ages/counts; fast unsupported responses do not count. |
| Observation coverage and staleness | Commitment/cohort checks supported by observations within their declared freshness window / all required checks. Show uninstrumented, expired, disputed and missed-event scope separately; show counts and age distributions rather than averaging blind spots away. |
| Unfamiliar-case solution | Held-out unfamiliar cases independently verified within the declared window / all eligible unfamiliar cases, including failed, declined and pending. Record missing capabilities created, useful discriminating probes, total attempts and owner intervention. |
| Repeated-case marginal and amortised cost | Incremental all-attempt cost for later eligible cases, plus total discovery, failed exploration, packaging, verification, invalidation and maintenance cost apportioned over observed reuse. Report both views and volume; no assumed future reuse may make current economics appear positive. |
| Extrapolation failure | Inapplicable/novel cases wrongly admitted to reusable repair / all inapplicable/novel cases, plus count/severity of resulting effects. Report valid cases unnecessarily rejected separately and show test-set prevalence; average decision accuracy cannot hide wrong reuse. |
| Net recurrence and work eliminated | Comparable failures and total agent/human work per declared service exposure before/after simplification, with migration/maintenance cost, shifted work and observation uncertainty. Report employee service quality alongside demand; reduced reporting alone is not prevention. |
| End-to-end latency and total all-attempt cost | From evidence/report to justified help, and separately to verified usable work, including retrieval, queues, model/tool calls, engineering, checks and notifications. Count failed/abandoned branches, provider and infrastructure charges, preparation and owner time across all eligible work; report unresolved work and unavailable charges. |

Evaluate the entire observer/research/engineering/reuse loop against the same
service quality floor with and without semantic observation or compiled reuse.
Where feasible compare incumbent/open-source and agent-from-scratch paths under
the existing matched-outcome rules. Use held-out runs and version every harness;
there is no fixed “fast”/“deep” caste or automatic confidence-to-authority threshold.
A model's schema compliance and distribution confidence are evaluated separately
from correctness, empirical calibration, coverage and whole-service outcomes.
