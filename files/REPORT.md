# sx-linen-c-f62 report

Repository: just-every/run-linen
Branch: cloud/sx-linen-c-f62
Candidate: e0f4162602973732aa6dfca8da3192f04cbcf7d1
Parent and reviewed main: 8cbb5da69a36002c032436b861772e8fb3f6247e
Draft PR: https://github.com/just-every/run-linen/pull/191

CLAIM CATALOG-003 PARTIAL points=5 tests=tests/work/catalog-task-cases.mjs#catalogTaskChecks; tests/work/amend-manager-runtime.mjs#Manager approval and bundles
GAP CATALOG-003: Point 7's applied or uncertain effect reconciliation rather than waiver remains unproved; all unselected acceptance and inherited provider, channel, role and device duties remain owed.

Counts before and after: 31 DONE, 131 PARTIAL, 37 MISSING, 199 total. CATALOG-003 remains PARTIAL. No Status, Gap or Evidence cell changed, no acceptance text changed, and no generated views were committed. The existing Gap is intentionally left for the guarded landing process to reconcile from this claim.

## Plan and result

1. Read the supplied rules, plan extract, ruling index, Linen rulings and DONE-RIDERS; inspect the current clause, Gap, task journey, capacity readiness, request admission and task completion paths.
2. Map the existing journey to approval, task dependencies, ownership, completion, waiver, close, cancellation and erasure. The Status Gap identified missing capacity proof and the distinct applied or uncertain effect waiver refusal. The lease selects only the former.
3. Extend the existing catalogTaskChecks journey with two native software items having identical independent team tasks, owner, manager gate, beneficiary and purpose, and capacities zero and one. Use native item creation, request submission, current-manager decision, obligation reads, task completion and history reads. No new test registration, provider dispatch or execution grant is introduced by the capacity flow.
4. Run the touched manager runtime, typecheck and first-party check. Reconcile with fresh main using an unpublished autostash rebase; it was already current. Run the contract generator write and check, restore both views from main, then regenerate and check the source lock last.
5. Commit the journey and source lock, inspect every candidate author, committer and message, and push through the supplied guard. Re-run the manager runtime on the committed candidate. Open the one draft PR required by this repository's pull-request Verify entry point.
6. Discover exact-head Verify with the GitHub REST API, respecting the five-minute polling interval and ten-call budget. Publish the actual report, command receipts and logs only on the separate evidence ref. Leave product landing, full-history publication scanning and exact-main site verification to the fleet.

Only product files changed: tests/work/catalog-task-cases.mjs and sources.lock.json. No runtime code change was needed: getFulfilmentReadiness already applies capacity to task availability and completion. The new assertions certify that behavior through the public route adapter. Existing assertions are retained verbatim; the diff adds 49 lines to the existing journey and regenerates one source hash. No new permanent tests, test deletions, workflow edits, dependency changes or UI changes.

## Selected public-door probe

PROBE CATALOG-003 5: POST /catalog with capacities 0 and 1 and an independent Facilities task, POST /work and its fulfilment, current-manager approval, GET obligations, then POST task completion -> both require approval first; after approval capacity 0 exposes can_complete=false and returns 409 task_not_ready with identical duties, ticket, fulfilment and history; capacity 1 exposes can_complete=true and returns 200, records done at the next task revision with the correct team member and one attributed history event. The provider table is unchanged throughout this new segment.

The zero-capacity fixture has no task dependencies, so refusal cannot be attributed to task ordering. Both requests have a recorded current-manager approval and leave that manager's decision queue. The positive control uses the same team member and plan, so refusal cannot be attributed to missing task authority. The comparison includes task completion fields and revisions, work fields and revision, the saved fulfilment and revision, and the full authorized activity list. No clock changes, provider action or scheduler processing are used in this added segment. Existing network-edge execution fixtures elsewhere in the original journey remain unchanged.

## Acceptance map

All line references below name tests/work/catalog-task-cases.mjs at the candidate. The containing runner is tests/work/amend-manager-runtime.mjs, invoked by scripts/verify.mjs as Manager approval and bundles. Local exact-head runtime receipt is runtime-receipt.json. Existing coverage is recorded without enlarging this lease's claim.

| Point | Outcome and route proof | Evidence and disposition |
| --- | --- | --- |
| 1 | Request expands approval, automated licence duty and manual tasks; unfinished automated step is owned and blocks closure. | Lines 17–40 and 130–142, existing journey retained and passed locally. Not newly claimed. |
| 2 | Owner task-plan configuration, real teams, earlier steps and elapsed-hour dates. | Lines 7–19 and 32–35; malformed plan refusals, ordering and parallel-task behavior retained. No new claim of exhaustive plan limits. |
| 3 | Copied obligations survive later item-plan edit. | Lines 163–170, public plan-edit and obligation reads retained and passed. |
| 4 | Item owner accountability; named team or workspace owner completes. | Lines 33 and 42–54, 123–128; new matching control at 92–100. Existing authority refusals retained. |
| 5 | Manager approval and capacity precede team work; task predecessors must settle. | Lines 37–49 retain manager and predecessor refusals. New capacity flow at 57–105 proves zero refusal, unchanged state and a positive completion control. Selected point closed locally. |
| 6 | Completion is recorded as done, with attribution. | Lines 94–100 and 128, not labelled verified. |
| 7 | Owner-only reasoned audited waiver, but applied or uncertain effects require reconciliation. | Existing permitted and refused waiver cases at 143–155. Applied or uncertain-effect reconciliation-versus-waiver proof remains owed and is explicitly outside the selection. No DONE claim. |
| 8 | Waiver releases dependencies; complete only when settled; cancellation cancels open work. | Lines 156–173 retain existing public reads and command assertions. |

## Inherited duties and boundaries

| Duty | Disposition |
| --- | --- |
| CATALOG-005 and CATALOG-012 device install, inventory verification, lease and removal | Unchanged, not exercised or certified by a native capacity test. No enrolled-device or MDM receipt claimed. |
| Independent provider authority and verification | New capacity segment creates no grant or operation and leaves provider writes unchanged (lines 58 and 103–104). Existing network-edge execution segment remains, without a live-provider claim. |
| Channel adapters, accounts, identity mapping and consent | Existing obligations remain; no outbound or downstream channel work selected. |
| ROLE-001 and other ct, account, Base and device holds | Unchanged as directed by the lease; no new policy default or authority is introduced. |
| Erasure and custody | Existing task-completer erasure assertion retained at 175–177. No widening of data exposure or retained-value reconstruction. |

## DONE-RIDERS review

No full-clause DONE claim is made. Results apply to this partial capacity proof unless explicitly marked pending or unproved.

| Rider | Result | Evidence |
| --- | --- | --- |
| 1 | PARTIAL overall; selected outcome passes locally | Point 5 capacity flow lines 57–105 reaches both public outcomes. Point 7 remains unproved. Exact-head pull_request Verify 42616691124 completed successfully. |
| 2 | PASS for selected point | Seeded matching zero and positive controls, real requests and current approvals, explicit refusal and unchanged-state comparison at 79–100. |
| 3 | PASS for selected point | Existing scripts/verify.mjs loads the containing runner; no new flags or nightly-only path. Exact-head pull_request Verify 42616691124 is completed with conclusion success; see ci-receipt.json. |
| 4 | PASS locally | runtime-receipt.json binds the rerun to full candidate SHA; no source edits after the commit. |
| 5 | INSPECTED, unchanged | CATALOG-003's own requirement names the CATALOG-005 MDM obligation and its inherited ordering, ownership, waiver and close duties. No new inherited claim. |
| 6 | PASS mechanically | Generator write and check exited zero; generated views restored from main. Source contract cells unchanged. Counts remain unchanged; Gap update belongs to lander. |
| 7 | PASS | No acceptance text or coverage rewrite, and no Status row removed. |
| 8 | PASS for touched authority path | Current manager approval is explicit, named Facilities member acts, and zero capacity cannot be bypassed by approval. Existing wrong-team and requester completion refusals remain at 43–45. No new permission path. |
| 9 | PASS boundary disclosure | No live provider, device, channel, legal or compliance claim. All listed obligations retained. |
| 10 | NOT APPLICABLE | No policy default or new custody, consent, spending or authority decision. |
| 11 | PENDING guarded landing | Candidate remains on its cloud branch. Main equality, complete publication scan and exact-main Run site are fleet gates. |

## Pre-ready self-check

1. The selected behavior is exercised in both directions with a seeded nonempty request and exact equality after refusal. Existing manager and dependency assertions remain. Exact-head Verify status is recorded separately, never inferred from main's green run.
2. No assertion was removed, weakened, skipped or hidden behind a viewport or branch condition. No new registration was added.
3. No authority, erasure, replay or custody code changed. Existing authorization refusals and erasure coverage remain in the runtime journey. No provider dispatch is added.
4. No screen changed, so no new browser proof, tooltip or typography work is applicable.
5. Contract generation and source lock pass; no new email-shaped fixture values or bare repository-like prose tokens were added to the product diff. The full-history publication scan and candidate main equality are not established in this cloud; the maintained lander owns them. No COMPLETE scan or landing is claimed.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0

## Custody and CI

Push succeeded on the first guard attempt. Product HEAD and index remain unchanged by evidence transport. The product commit uses the fleet author and committer identity, no trailers, and retains the full main history. No main push, force push or published-history rewrite occurred.

Main baseline: 8cbb5da69a36002c032436b861772e8fb3f6247e had completed-success Verify 42614672051 and Run site 42614672049 when read. These runs do not certify the candidate. Candidate PR and CI information are in pr.json and the candidate CI receipts.

Publication scan receipt: commit=e0f4162602973732aa6dfca8da3192f04cbcf7d1 complete=not-run historyScanned=not-established findings=not-established. Cloud branch publication does not run the Mac publication scanner. Exact-main equality and site result remain pending landing.

Plan row result: CATALOG-003 selected capacity-before-team-work proof is closed; clause stays PARTIAL; no plan reconstruction, other target or held campaign was attempted. No local product blocker found. The full clause still owes point 7's applied or uncertain-effect reconciliation proof and every unselected obligation retained by the brief.

## Final candidate result

Exact-head pull_request Verify 42616691124 completed successfully on e0f4162602973732aa6dfca8da3192f04cbcf7d1. See candidate-ci.json and ci-receipt.json for the actual REST response. Six GitHub API calls were used, with one watcher and at least 300 seconds between discovery or polling calls for this run. No CI dispatch, rerun or repair was needed.

The initial report-only evidence head 7bfeae333518cae098ab8298e9dd536dffb43bad was independently fetched and all 16 manifest files passed byte count, blob and SHA-256 verification; see evidence-verification.json. The final publication adds the completed Verify response and this final report, still using only the evidence ref and retaining the same product head.

Selected point 5 is proven; CATALOG-003 remains PARTIAL. Rider 3 is satisfied for the selected proof by the successful exact-head Verify. Rider 11, full-history publication scan, main equality and exact-main Run site remain pending the maintained fleet lander. No acceptance count is promoted by this branch or evidence publication.
