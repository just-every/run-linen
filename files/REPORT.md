# sx-linen-c-f39 — DESK-025

Selected work: close point 5's no-provider-authority proof and persisted audit-to-plan identity. The implementation already existed. The change extends deskScenarioChecks in ./tests/work/desk-scenario-cases.mjs, invoked by ./tests/work/runtime.mjs. It adds no test registration, product capability, grant, role, approval action or UI change. Production source and every contract cell remain unchanged.

The completed plan is in PLAN.md. Local development failures and their corrections are recorded in LOCAL-DEVELOPMENT.md. Provider baseline records are synthetic, historical test fixtures. They establish that comparison is nonempty; they do not claim a real provider effect or receipt. The full record snapshots include memberships, grants and revocations, execution plans and decisions, operations, outbox, dispatch attempts, provider attempts, receipts, verifications, fences and existing approval tables. Eight relevant authority and dispatch tables must be nonempty before the scenario runs. Every row remains unchanged after starting and reading the plan, linking the existing project and refusing unsafe plans. Only the completed operation fixture is cleaned up after those comparisons because a later pre-existing runtime assertion counts operations globally.

## Acceptance map

Each row names a public-door sanity journey. Existing unaffected proof is retained; the new selected proof is point 5. Verify runs the runtime via ./scripts/verify.mjs, Service desk and lifecycle, and the change-template journey via Service operations.

| Point | Outcome and proof |
| --- | --- |
| 1 | New laptop template pre-fills ticket fields: ./tests/work/desk-scenario-cases.mjs deskScenarioChecks lines 79–85; POST and GET work-templates, then ordinary work creation. |
| 2 | Type, title, body and details; employee edits draft before sending: same journey lines 79–85. Existing native editable draft also remains in ./tests/ui/desk-console-journeys.mjs deskScenarioJourney lines 390–408. |
| 3 | Named project, local duty with active operator owner and UTC date, and existing-project linking: deskScenarioChecks lines 122–127 and 158–185. Product validation of 1 to 30 duties is retained in ./src/features/work/desk-scenario-plans.ts prepareScenarioPlan. |
| 4 | Existing operator succeeds; restricted-ticket link, HR task-plan step and invalid employee duty owner refuse before ticket field changes: deskScenarioChecks lines 183–200. |
| 5 | Current-revision POST scenario-runs; GET persisted run history and project. One successful audit records the same scenario, actor and project id; duties and ticket link persist under that id. Full populated authority and dispatch snapshots stay unchanged after allowed and refused paths: deskScenarioChecks lines 128–202. Project, duties, task creation history and link are written by one guarded D1 batch in ./src/features/work/desk-scenario-plans.ts applyScenarioPlan, inspected unchanged. |
| 6 | Task template pre-fills editable title, owner and due date, refuses employee and foreign-workspace readers, submits through ordinary task route: deskScenarioChecks lines 205–212. Existing UI form proof: deskScenarioJourney lines 333–350. |
| 7 | Exact-version change template approval, unapproved and inactive version refusal, immutable content snapshot, separate grant binding, current role checks and withdrawn approval dispatch refusal: ./tests/services/template-cases.mjs templateChecks lines 9–69, invoked by ./tests/services/run.mjs line 174. No provider execution claim. |

## Inherited duties

PROJECT-001 is explicitly named in DESK-025's requirement and points 3, 4 and 6. Its normal-ticket boundary, active agent duty owner and owner or operator writes are exercised by deskScenarioChecks. The date fixture is fixed and no wall-clock-sensitive value is asserted. CHANGE-001 exact-version approval and separate grant rules are explicitly named in point 7 and exercised by templateChecks. No new inherited duty, permission default, capability or policy ruling is introduced. The supplied ROLE-001 hold and all account, Base, ct and device holds remain unchanged and are not promoted by this proof.

## DONE-RIDERS

| Row | Assessment |
| --- | --- |
| 1 | Local public-door proof covers all seven outcomes, as mapped above. Final exact-SHA Verify status is recorded below; acceptance is subject to its success and the fleet gate. |
| 2 | PASS locally: real product-created scenario, saved project, actual duties and persisted audit; populated baseline records; existing unsafe paths refuse without field changes and preserve authority snapshots. No empty-list-only proof. |
| 3 | Verify invokes the committed work runtime and service runtime through the existing commands. Exact-SHA event and conclusion are recorded below. No env flag added. |
| 4 | PASS: final test and production-source bytes match the candidate tree; file hashes and commands are bound in RECEIPT.json. |
| 5 | PASS, INSPECTED: PROJECT-001 and CHANGE-001 inherited duties are named in DESK-025 itself; none are silently substituted. |
| 6 | PASS mechanically: contract generator write and check succeed. Generated views restored from main; no status, gap, evidence, provenance or count edits. Existing gap remains for the lander to update from this claim. |
| 7 | PASS, INSPECTED: no acceptance rewrite, new point or changed ruling. |
| 8 | PASS locally for selected authority boundary: operator plan creation and reading succeeds; restricted link, HR step and invalid owner paths refuse; authority and dispatch state stays unchanged. |
| 9 | PASS, INSPECTED: no provider, device, legal, retention or live account completion claim. Synthetic historical dispatch rows are fixtures only. |
| 10 | PASS, INSPECTED: no policy choice introduced. Retained ROLE-001 hold remains named. |
| 11 | PENDING guarded landing: main equality, candidate publication scan and exact-main Run site belong to the fleet. No completion count is awarded in this product commit. |

## Pre-READY self-check

1. The selected user-visible result is checked through public routes; missing audit, wrong plan id, lost duties or ticket link, and changed authority or dispatch rows fail assertions. Existing template and permission assertions are retained. Exact-SHA Verify status is recorded below.
2. No prior assertion was removed, skipped, narrowed or placed behind a condition. The original scenario request now supplies the revision read through the ordinary ticket door. No test registration was added or deleted.
3. Authority snapshots and existing forbidden plan paths cover the selected boundary. Production revocation, erasure and replay code is untouched; no new capture, credential, data exposure or provider path exists. Existing history and erasure runtime checks remain in Verify.
4. No screen or UI code changed. No new browser proof or tooltip audit is claimed for an unchanged screen.
5. Source lock is regenerated last and check passes; generated views are current. Added text contains no email-shaped fixture values, credential-shaped values or bare prose slash pairs. Cloud publication scan is not run or claimed. Fleet landing scan, main equality and candidate Run site remain pending.

Counts before and after this branch: 27 DONE, 135 PARTIAL, 37 MISSING, total 199. Contract cells remain unchanged. A DESK-025 promotion after independent acceptance would change only that clause from PARTIAL to DONE and produce 28, 134, 37. The plan update proposed is a single completion note for this selected DESK-025 proof, with no other queue, ruling or held-scope change.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none (no migration changed) exit=0.

PROBE DESK-025 5: POST /work/:id/scenario-runs with the current ticket revision, GET run history and project -> one persisted audit links to the same saved project, local duty and ticket; full existing authority, approvals, execution and dispatch rows unchanged.

Publication receipt: candidate scan NOT RUN in cloud; complete=unestablished, historyScanned=unestablished, findings=unestablished. The Mac fleet must scan the exact candidate from full history. This is no claim of landing or live provider success.

## Product provenance and check results

Product candidate: 8c9641899770d1a0b2d320ed37a9931d6524be71
Branch: cloud/sx-linen-c-f39
Draft PR: https://github.com/just-every/run-linen/pull/175

The first real commit was immediately pushed through the fleet guard, on its first attempt. The candidate has a clean product checkout and its branch head was checked against the remote. All candidate authors, committers and trailers were inspected across origin/main..HEAD; the sole candidate commit has fleet identity and no trailers. A fresh main fetch and rebase before this first push found no upstream drift. Main baseline was fcc2e53de937ab2ae17938147920b871b5fe70f5, with successful Verify 42566680535 and Run site 42566680574. Main is not the candidate and was never pushed here.

Local commands all exited 0: work runtime, service runtime, typecheck, first-party check, public rer build, contract write and check, and source lock regeneration and check. RECEIPT.json binds full source hashes to the committed candidate tree and records exact commands. The work log's PROBE line records the selected outcome. The source-check command output is included as SOURCE-CHECK.json. The setup log is excluded because it contains local setup details that are not evidence for this clause.

Exact-SHA Verify 42570142367, event pull_request, was discovered in progress. No duplicate dispatch or workflow rerun was made. Final status is appended below. Candidate publication scan and main-only Run site are not run in this cloud; the fleet owns them.
