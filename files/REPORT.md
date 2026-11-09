# sx-linen-c-f30 report

Candidate: db0229b015806e49a9dedd3695184335e1dbd7a1
Repository: https://github.com/just-every/run-linen
Branch: cloud/sx-linen-c-f30
Draft PR: https://github.com/just-every/run-linen/pull/165
Integrated main: 9b7d3512c1bddf163a3e6d81bbce7b57fae76a21
Verify: pull_request run 42545168421 completed SUCCESS on exact head db0229b015806e49a9dedd3695184335e1dbd7a1, observed 2026-11-09 01:36:11 UTC. See candidate-ci.json.

The selected DESK-024 gaps are closed. The existing department journey now submits a Facilities catalog request with six typed answers through the fulfilment route, reads its saved snapshot, edits the catalog to different questions and estimates, and hands the request to IT as the current owner. IT staff and the requester see the identical original item revision, questions, answers, estimates and submission identity. The journey then tries another handoff with the pre-move revision. It receives 409 with revision_conflict and proves the ticket, messages, attachments, submitted snapshot and successful handoff history remain unchanged.

The test Worker previously omitted ApiError codes. Its error response now adds the actual exception code while preserving the existing readable error field. The production error envelope and authority implementation are unchanged. An independent native authenticated browser probe also checks the production error envelope, including error.code, and captures the owner handoff form plus the owner and requester submitted-form screens at 1440 and 390. Assertions run at 1440; the second width is visual evidence.

## Plan and completed work

1. Read the supplied extract, current clause, Status gap, DONE riders and standing rulings. The live gap named exactly stale-revision refusal and missing submitted-form preservation. Existing public journeys covered the retained HR boundaries and the other acceptance points.
2. Extend departmentSpaceChecks in its existing registration, using native catalog creation, form editing, fulfilment, snapshot reads, department handoff and activity reads. Use nonempty text, number, checkbox, select, date and textarea answers. Keep the false checkbox answer. Change the live form after submission to prove that handoff retains the frozen revision.
3. Assert the stale revision error and compare the entire ticket response, saved submission and successful handoff activity before and after refusal. Expose the real exception code in the test transport without changing existing message assertions.
4. Run the touched work runtime, typecheck, first-party check, contract generator write and check, and lock generation and check. Restore generated views. Fetch main and rebase before the first publication; retain its newer KB proof and contract judgments. Regenerate the lock last.
5. Commit with fleet identity and active hooks, inspect every candidate author, committer and message, then push through the fleet guard. Open the single draft PR required to start Verify for this branch. Run the touched runtime again on the committed candidate.
6. Run the existing department browser journey and a temporary native browser probe. Preserve actual receipts and screenshots in the separate evidence packet, inspect the relevant screens, and leave publication scan, status promotion, main advancement and Run site to the guarded fleet lander.

The only plan row to update is DESK-024: selected stale-revision and submitted-form gaps closed; proposed PARTIAL to DONE after the round gate. No campaign reorder and no other target selected. No lane file was read or written in this cloud environment.

## Acceptance rubric

The clause is scoped to native department handoff, comparable to Freshservice workspace transfers with scoped agent access. Existing unrelated provider, custom role and device holds remain unchanged. Verify event for every permanent journey below is pull_request, run 42545168421, head db0229b015806e49a9dedd3695184335e1dbd7a1. Its recorded conclusion is completed SUCCESS in candidate-ci.json. All permanent journeys named in the rubric ran under that successful Verify.

| Row | Acceptance sentence and observed outcome | Public proof on the candidate | Local result |
| --- | --- | --- | --- |
| R1 | Point 1: Facilities to IT retains history; owner only, current revision, reason and audit | tests/work/department-space-cases.mjs departmentSpaceChecks lines 58 to 120; tests/ui/department-browser.mjs lines 184 to 219; native browser-probe.mjs | PASS. Current owner succeeds once; nonowner and missing reason refuse; stale retry gives 409 revision_conflict with no changes. |
| R2 | Point 2: identity, messages, attachments, sensitivity, submitted form and frozen SLA survive; incompatible assignments clear | tests/work/department-space-cases.mjs departmentSpaceChecks lines 60 to 118; tests/ui/department-browser.mjs line 169; carried audit docs/contract/DONE-AUDIT.md lines 351 to 356 | PASS. Six typed answers, original form revision and estimates survive a live catalog edit and handoff; private attachment remains accessible to receiving staff; clock remains frozen. Existing native browser clears incompatible HR assignment. |
| R3 | Point 3: retained HR workspace stays required after IT, another department and legacy moves | tests/work/department-space-cases.mjs departmentSpaceChecks lines 132 to 176; tests/ui/department-browser.mjs lines 155 to 180 | PASS. Retained source memberships are live, multiple HR sources accumulate, and later placement cannot clear them. |
| R4 | Point 4: current receiving and all retained HR memberships gate staff doors; requester keeps public normal view | tests/work/department-space-cases.mjs departmentSpaceChecks lines 32 to 52 and 135 to 176; tests/work/department-ops-cases.mjs departmentOpsChecks lines 121 to 149 | PASS. Denied staff reads and mutations, successful dual membership and requester-only public history all execute. |
| R5 | Point 5: HR service grants no employee-record authority | tests/ui/department-browser.mjs lines 149 to 151 and 179 | PASS in existing browser journey. A genuine restricted employee record remains 404 for HR service staff and dual service members. |
| R6 | Point 6: relationships and MCP queue grants cannot recover HR work; normal public manager and sharing paths remain | tests/work/department-space-cases.mjs departmentSpaceChecks lines 32 to 56 and 121 to 150; tests/work/relationship-cases.mjs sharingChecks; tests/platform/mcp-tools-cases.mjs mcpToolCases lines 210 to 241 | Local work and browser PASS. MCP proof is retained unchanged and is loaded by exact-head Verify through tests/platform/base-auth-runtime.mjs. It mints real credentials, tries reads, queue lists and search before and after IT and legacy moves, and checks empty protected results and counts. |
| R7 | Point 7: withdrawal reaches reads, writes, assignments, scenarios, tasks, knowledge, derived views and reports before aggregation; HR scenario cannot copy to global project | tests/work/department-ops-cases.mjs departmentOpsChecks lines 123 to 172; tests/work/department-report-cases.mjs departmentReportChecks lines 24 to 49; tests/services/department-source-cases.mjs departmentSourceChecks lines 22 to 61 | Local work PASS. Derived service proof is retained unchanged and loaded by Verify through tests/services/integration.mjs. Public doors exercise admission followed by withdrawal and refusal; aggregation drops protected counts. |
| R8 | Point 8: native archives retain department and HR restrictions, restore memberships inert and require fresh owner confirmation | tests/platform/base-auth-transfer.mjs Native archive and recovery lines 244 to 251 and 312 to 327; tests/adoption/runtime.mjs Archive restore and erasure; tests/work/department-space-cases.mjs lines 192 to 201 | Existing archive journeys retained unchanged and loaded by exact-head Verify. Native transfer verifies retained metadata and all restored memberships inactive; a fresh staff sign-in still receives 404. Owner confirmation uses the already tested department membership door. |

No new acceptance point, status cell, Gap cell or Evidence cell was edited. The fixed rubric is the existing eight sentences and their named inherited boundaries, with the two selected missing outcomes added to the existing sanity journey. No new policy default was adopted.

## Inherited duties

| Duty | Receiving clause text and proof | Result |
| --- | --- | --- |
| D-4 live department and retained HR boundaries | CONTRACT.md line 43 and DESK-024 points 3, 4, 6 and 7; departmentSpaceChecks, departmentOpsChecks, departmentReportChecks, departmentSourceChecks and mcpToolCases | Retained unchanged; allowed and refused paths are in the named Verify journeys. |
| Existing CATALOG-001 audience and exact quote readership | tests/work/application-cases.mjs catalogAudienceChecks; tests/work/catalog-quote-cases.mjs catalogQuoteChecks; tests/ui/department-browser.mjs lines 238 to 252 | PASS in local work and department browser. Staff placement does not add quote readership and crafted requests cannot bypass audience. |
| Erasure and replay cannot revive staff authority or form content | tests/work/department-space-cases.mjs lines 192 to 201; tests/work/application-cases.mjs applicationChecks lines 154 to 161; tests/work/runtime.mjs final erasure and archive-replay checks | PASS in the exact-candidate work runtime; source logic unchanged. |

## DONE-RIDERS

| Rider | Result | Evidence and boundary |
| --- | --- | --- |
| 1 | PASS | R1 to R8 name public journeys; the two missing outcomes now execute on real seeded requests. All are loaded by scripts/verify.mjs. |
| 2 | PASS | The form is nonempty and typed; a changed live catalog cannot substitute for its old snapshot. Supported handoff succeeds and unsafe stale and nonowner attempts refuse. Full ticket and form equality and exact handoff history are asserted. |
| 3 | PASS | Run 42545168421 completed SUCCESS, pull_request, exact candidate head; candidate-ci.json holds the actual status and conclusion. Temporary browser probe supplements the permanent journey and does not replace it. |
| 4 | PASS | runtime-receipt.json and browser-receipt.json bind runs to db0229b015806e49a9dedd3695184335e1dbd7a1. No product source, dependency or migration byte changed between the successful build and candidate; product-receipt.json records the comparison. |
| 5 | PASS | DESK-024 explicitly names retained HR, current membership and native archive duties. Its From DESK-011 and Rules D-4 metadata remain unchanged. No new Base inheritance was claimed. |
| 6 | PASS mechanical; status update is lander-owned | Generator write and check pass. Generated views are restored to main and not committed. Existing status and Gap remain untouched, as required. The report names the closed proof gaps for the lander. |
| 7 | PASS | No contract acceptance text, status row, coverage map or ruling was changed. |
| 8 | PASS | The existing owner handoff succeeds; Facilities nonowner handoff is forbidden, missing reason refuses, stale owner move returns 409, and state plus success history remain unchanged. |
| 9 | PASS | No provider, legal, account, device or external delivery result claimed. Native handoff only. |
| 10 | PASS, no new default | Existing owner-only administration, exact quote readership and retained HR boundaries remain. No delegated administration, custom HR role, assignment or approval authority was added. |
| 11 | PENDING guarded landing | Main is integrated base 9b7d3512c1bddf163a3e6d81bbce7b57fae76a21, not the candidate. Candidate scan and Run site are lander duties. No landing or main equality is claimed. |

## Commands and actual results

- cloud_run npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive: exit 0. Private setup output is excluded from evidence.
- cloud_run npx -y @runeditrun/rer build: exit 0. See build.log. The current pinned rer version is unchanged.
- cloud_run node tests/work/runtime.mjs: exit 0 on exact committed candidate; see work-runtime.log and runtime-receipt.json.
- pnpm typecheck: exit 0 after final source changes and main integration; see typecheck.log.
- pnpm exec rer check --profile first-party: exit 0; see first-party.log.
- node src/base/contract-docs.mjs write, then check: both exit 0; see views-write.log and views-check.log. ACCEPTANCE.md and docs/CLAIMS.md restored from origin/main, with no generated view changes in the candidate.
- node scripts/edition-authoring/cli.mjs lock, then check: both exit 0; see lock-write.log and lock-check.log. Generated source lock committed last with the two test files. No migration changed; ledger check is not applicable.
- cloud_run env LINEN_TEST_BUILT=1 LINEN_CHROMIUM_EXECUTABLE=/usr/bin/chromium LINEN_CAPTURE=1 perl -e 'alarm 1200; exec @ARGV' -- node tests/ui/run.mjs tests/ui/department-browser.mjs: exit 0; see department-browser.log. Its product source is byte-identical to the candidate. Relevant changed screens are additionally captured by the next probe.
- cloud_run env LINEN_TEST_BUILT=1 perl -e 'alarm 1200; exec @ARGV' -- node tests/ui/run.mjs ../packet/browser-probe.mjs: exit 0 on candidate; see browser-probe.log, browser-receipt.json and six selected screenshots. Uses Chromium at /usr/bin/chromium with --no-sandbox. The driver closes its browser; the existing runner stops only its own isolated worker.
- Product push through cloud-push.py: success on attempt 1; see product-push.log. Every candidate commit is fleet-authored and fleet-committed, with no co-author trailers.

The first two local attempts failed because the test transport exposed only a readable error string. The assertion was first aimed at the wrong field, then the real exception code was preserved additively by the harness. The completed work runtime and production-envelope probe pass. These were local test development failures, not failed Verify repair rounds. No product guard or assertion was weakened.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0
PROBE DESK-024 1: authenticated current-owner department handoff -> 200; old revision against the reverse move -> 409 revision_conflict, identical ticket and messages, one unchanged successful handoff event.
PROBE DESK-024 2: employee fulfilment with typed Facilities answers, then changed live catalog and IT handoff -> identical frozen item revision, questions, answers and estimates for receiving staff and requester; stale retry leaves it unchanged.

## Pre-ready self-check and custody

1. Every named outcome has existing public-door proof; the two selected gaps now have committed assertions that fail on lost snapshots or accepted stale revisions. The latest exact-head Verify state is recorded in candidate-ci.json.
2. No existing assertion was removed, narrowed, skipped or put behind a width or branch condition. No new permanent registration was added. The existing runtime journey and CI entry point are unchanged. There is no test-budget.json in this checkout; the registration delta is zero.
3. Retained HR access, membership withdrawal, erasure and replay checks remain. No authority or storage code changed. Native stale handoff is refused without changes and exact quote readership remains covered.
4. No product screen, copy, configuration navigation, font, border or icon control changed. Existing native department journey passes. Supplemental owner and requester screens were captured at both widths; their preserved values are readable and no new control was introduced.
5. Lock check passes. Branch Verify is recorded separately. Publication scan and exact-main Run site are pending the maintained Mac lander. Added product lines contain no email-shaped value, provider-shaped key or bare prose repository token. All screenshots use synthetic data. Credentials, environment dumps, private setup output and worker logs are excluded from evidence.

Publication scan: commit=db0229b015806e49a9dedd3695184335e1dbd7a1; complete=NOT_RUN_CLOUD; historyScanned=NOT_ESTABLISHED; findings=NOT_ESTABLISHED. The cloud adaptation reserves the publication scan to the fleet lander. This report does not claim a zero finding result.

Main equality: not landed. Integrated base is 9b7d3512c1bddf163a3e6d81bbce7b57fae76a21. Its Run site 42544698436 was successful at inspection; the previous base ce86a9413f41103d066aa66c3db8d43fb40da248 had green Verify 42541594885 and Run site 42541594942. No exact-candidate main Run site exists because cloud is not authorized to land.

Counts at integrated main and on the candidate: 22 DONE, 140 PARTIAL, 37 MISSING, 199 total. No status count changes committed. DESK-024 remains PARTIAL in the source table until the gate and lander apply the DONE claim. If accepted, its promotion alone yields 23 DONE, 139 PARTIAL, 37 MISSING.

No remaining native DESK-024 proof gap is identified in the fixed rubric. ROLE-001 held acting-role grants, revision reconfirmation and seat decisions from the supplied plan were not retargeted. Delegated workspace administration, custom HR roles, new assignment and approval authority, other department campaigns and all account, Base and device holds stay outside this lease. No new policy default or scope ask is required.

CLAIM DESK-024 DONE points=1,2,3,4,5,6,7,8 tests=tests/work/department-space-cases.mjs#departmentSpaceChecks; tests/work/department-ops-cases.mjs#departmentOpsChecks; tests/work/department-report-cases.mjs#departmentReportChecks; tests/services/department-source-cases.mjs#departmentSourceChecks; tests/platform/mcp-tools-cases.mjs#mcpToolCases; tests/platform/base-auth-transfer.mjs#Native archive and recovery; tests/ui/department-browser.mjs#Department privacy browser

Initial checkout counts were 21 DONE, 141 PARTIAL and 37 MISSING. Main advanced KB-001 while this round ran; integrating its already judged change produced 22, 140 and 37. This candidate adds no status change of its own.

Operational note: the first follow-up CI status read was made 253 seconds after discovery, 47 seconds earlier than the specified 300-second minimum. No dispatch or rerun was issued. Later reads use the full minimum interval.

Final diff inspection confirms every previous line in departmentSpaceChecks remains in order. Product scope is exactly the two test files and their generated source-lock hashes. No new test registration, workflow, product source, contract text or generated view is present in the candidate diff.

Evidence custody: the first complete packet was published to refs/heads/evidence/sx-linen-c-f30 at 063d6f6b2933295a30ab7a6a82f802ff17e23514. A separate readback verified its manifest and all 28 selected file hashes, bound to the candidate product SHA; evidence-transfer-receipt.json contains that actual receipt. The final evidence publication additionally carries this receipt and the final observed CI state. Evidence transport grants no product landing or acceptance signal.

Final CI receipt: Verify run 42545168421, event=pull_request, status=completed, conclusion=success, head=db0229b015806e49a9dedd3695184335e1dbd7a1, URL=https://github.com/just-every/run-linen/actions/runs/42545168421. Six GitHub CLI calls were used in total; no workflow dispatch or rerun was made. DONE-RIDERS rows 1 to 10 are satisfied by the retained and extended public journeys plus this exact-head Verify; row 11 awaits guarded landing. Local proof and CI support the full DONE claim; counts remain unchanged until the lander applies it.
