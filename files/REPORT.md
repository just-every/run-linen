# sx-linen-c-f53 report

CLAIM CHANGE-007 PARTIAL points=7 tests=tests/services/release-cases.mjs#releaseChecks
GAP CHANGE-007: Point 6 ticket-link proof, point 8 independent release-owner proof, CHANGE-011 gaps and all unselected acceptance and existing holds remain owed.

Repository: just-every/run-linen.
Product branch: cloud/sx-linen-c-f53.
Candidate: 4c8dfa45d348a79c60df4135c91e24a3e2dc380c.
PR: https://github.com/just-every/run-linen/pull/186 (draft; required pull_request Verify entry point).
Starting continuation: 86ebd2487d731ddacc3170cd9b8bd787bbb4801a, preserved in candidate ancestry.
Integrated main: e9aa94360d01ae5c8ae48557a61aca3c565f3236.

The supplied f51 continuation already contained the requested absent-build refusal and passed replacement-result proof. This round retains that work and extends its existing releaseChecks journey to failed replacement results. Each of the four phase and outcome combinations starts with genuine current native go decisions from the named owner and approver. Both passed and failed replacements clear those decisions, retain their exact attributed records in priorDecisions, and return the release to planning with awaiting-decision. A replacement build clears the old test; a replacement test retains the passed build. Failed results refuse a new go without changing the release or history. Passed prerequisites are restored through the public phase door before each independent case. Provider write count and member-change reads stay unchanged across the phase and decision exercise.

Only tests/services/release-cases.mjs and the regenerated sources.lock.json differ from main. The new commit adds 17 test lines and replaces four existing lines with the extended outcome table; no existing assertion is deleted, narrowed or skipped. Across the preserved continuation and this commit, the test file gains 54 lines. No application source, workflow, migration, UI, contract judgment, generated view or dependency pin changes. The same integration registration is extended; test registration delta is zero, with no duplicate or pin test introduced or removed.

Counts before and after: 28 DONE, 134 PARTIAL, 37 MISSING, 199 total. CHANGE-007 remains PARTIAL; no Status, Gap or Evidence cell changed. Plan update for the fleet: append this round to the CHANGE-007 point 7 campaign entry; selected point 7 proof is complete locally and the failed-result variants are now included. No other campaign or target row changes.

The full execution plan is in PLAN.md. It was carried out in order: inspect the selected clause and supplied continuation; extend only the missing failed-outcome cases; run the touched checks; fetch and rebase onto current main; generate and check views, restore them from main, regenerate the lock last and check it; commit with fleet identity and preserved hooks; inspect all candidate authors, committers and trailers including inherited parents; push only the named branch; create the required single draft PR; record CI honestly; publish the selected packet separately from product history.

## Selected point 7 proof

All proof rows below are in tests/services/release-cases.mjs, releaseChecks, invoked by tests/services/integration.mjs:102. scripts/verify.mjs includes that integration command in Controlled changes and reporting. The normal Verify workflow already runs it; no CI shape changed. Local invocation exited zero. The exact-SHA CI receipt is recorded separately in candidate-ci-discovery.json and the final CI receipt.

| Item | Outcome through the public door | Assertion lines | Local result |
| --- | --- | --- | --- |
| P7.1 | Owner and operator record a build or test reference through POST phase; GET release returns the same result, reference, outcome and attributed recording actor/time | 107–127 | PASS |
| P7.2 | Recording these results executes no provider effect and leaves member changes untouched | 93–94, 144–145 | PASS |
| P7.3 | Test without any build is refused 409 release_phase; full release, revision and history are unchanged | 95–103 | PASS |
| P7.4 | Test after a failed build is refused identically without mutation | 95–103 | PASS |
| P7.5 | Replacement test, both passed and failed, starts after current go decisions, withdraws every current decision, retains all attributed prior decisions, returns to planning and awaiting-decision, and preserves the passed build | 107–131 | PASS |
| P7.6 | Replacement build, both passed and failed, starts after fresh current go decisions and has the same withdrawal/history/planning effect while clearing the old test | 107–134 | PASS |
| P7.7 | Failed replacement result cannot regain go; refusal changes neither release nor history | 136–141 | PASS |

PROBE CHANGE-007 7: Native release phase route with no build or failed build -> 409 release_phase and identical release/revision/history; current named native go decisions followed separately by passed or failed test/build replacement -> zero current decisions, unchanged attributed prior decision records, planning and awaiting-decision; build clears test; provider writes and member changes remain unchanged.

## Full-clause boundary

This report claims point 7 only. The unchanged journey already exercises grouping three changes, native named decisions, canary then rollout, cohort-only notes and failed-change completion hold. This round does not convert those existing observations into new credit for unselected points.

| Acceptance point | This round's disposition |
| --- | --- |
| 1 | Existing releaseChecks flow retained at lines 27–81; unselected |
| 2 | Existing cohort notice checks retained at lines 64–68; unselected |
| 3 | Existing failed-change hold and compensation retained at lines 70–81; unselected |
| 4 | Native authority routes and currentPrincipal checks unchanged; unselected; independent-owner boundary proof remains owed |
| 5 | Existing creation and grouping proof retained at lines 27–38; unselected |
| 6 | Ticket-link proof remains owed; not attempted under this lease |
| 7 | Selected outcomes above pass locally on unchanged candidate source bytes |
| 8 | Existing named decisions retained; independent release owner without owner role proof remains owed |

Inherited boundaries remain unchanged: CHANNEL-008 delivery accounts and consent, D-2 notice rules, separate change execution and compensation grants, ROLE-001 decisions, CHANGE-011 all-clear and erasure gaps, and every existing account, ct, Base and device hold. No provider account, deployment, release completion authority, new role, custody default or erasure policy is selected. The full integration journey still runs its pre-existing execution, restore and privacy cases; those are not new provider receipts from this round.

## DONE-RIDERS assessment

This is a PARTIAL point claim, not a full-clause DONE claim. Rows are scored for the selected work and expose the whole-clause or landing limits honestly.

| Row | Result | Evidence or remaining limit |
| --- | --- | --- |
| 1 | PASS selected point; full clause PARTIAL | Selected public-door outcomes P7.1–P7.7 pass in releaseChecks; points 6 and 8 remain owed. Exact-SHA Verify receipt is separate. |
| 2 | PASS | Seeded current members and decisions; explicit unsafe refusal with identical entire release and history, and supported replacements. Lines 95–145. |
| 3 | PENDING CI | Exact-SHA pull_request Verify 42588077189 is in_progress at the latest receipt. Normal Verify includes tests/services/integration.mjs via scripts/verify.mjs. No result is inferred from f51 or main. |
| 4 | PASS local binding | Relevant test and source bytes did not change between the passing integration and final commit; final rebase was already up to date. Test-source digest is in checks-receipt.json. |
| 5 | INSPECTED | Point 7 states its recording obligation directly. No new Base duty or provider inheritance is introduced; unchanged delivery obligations remain held. |
| 6 | PASS mechanical | Generator write reported zero changed documents, check passed with zero prose errors/warnings; views restored from origin/main. Contract judgments/counts unchanged. |
| 7 | PASS | No acceptance text, count, status, coverage rewrite or contract cell changes. |
| 8 | PASS selected authority; remainder held | Genuine owner and operator phase writes and named approver decisions; failed-result go refusal leaves release and history unchanged. No new authority is granted. Point 8 independent-owner proof is unselected. |
| 9 | PASS boundary | No live-provider, legal, deployment or delivery proof claimed. Recording section has unchanged fixture provider writes and member changes. |
| 10 | NOT APPLICABLE | No policy default adopted and no new ruling needed. |
| 11 | PENDING guarded landing | Main differs from candidate. Candidate scan, exact-SHA Verify and eventual exact-main Run site are fleet gates; this cloud never updates main. |

## Checks and publication custody

Setup exited zero using cloud_run with the requested fleet owner and non-interactive arguments. Local commands ran on Node v24.19.0 and pnpm 10.12.4 under the supplied toolchain; the repository requests Node 22.20.0, and the supplied toolchain retains a newer installed runtime. The pnpm warning is retained in typecheck.log; no pins were edited.

- cloud_run node tests/services/integration.mjs: exit 0, complete output in services-integration.log. Native public requests, real D1 and the existing provider-edge fixture; no real provider writes.
- pnpm typecheck: exit 0, typecheck.log.
- pnpm exec rer check --profile first-party: exit 0, first-party.log (the command emitted no output).
- node src/base/contract-docs.mjs write then check: both exit 0. Zero generated changes, zero prose errors and warnings. Generated views restored from main.
- node scripts/edition-authoring/cli.mjs lock then check: both exit 0. The lock is generated, never hand-edited; full command output is in mechanical.log.
- git diff --check: exit 0. Contract diffs against the index and main are empty.
- All candidate identities and trailers checked, including inherited f51 owner identity: PASS. No AI co-author trailers.
- Fleet product push guard: exit 0 on first attempt, exact head 4c8dfa45d348a79c60df4135c91e24a3e2dc380c. Product ref was verified with ls-remote; full-history clone is not shallow. No force push or default-branch mutation.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check, restored from origin/main exit=0; ledger=none exit=0.

Pre-ready self-check: (1) selected user-visible recording, refusal and invalidation outcomes have native assertions with fixed expected state transitions and before/after comparisons; exact-SHA CI is reported separately. (2) No assertion removed, weakened, hidden behind a width condition or skipped. (3) No credential, erasure, replay or authority implementation changed; native grants and provider dispatch remain untouched by the selected phase exercise. (4) No touched screen; browser proof and tooltip audit do not apply. (5) Source lock fresh and local gates pass; publication scan, candidate CI and landing are not claimed from another SHA. No email-shaped string was added to any product line or fixture.

Publication scan receipt: commit=4c8dfa45d348a79c60df4135c91e24a3e2dc380c; complete=NOT RUN IN CLOUD; historyScanned=UNESTABLISHED; findings=UNESTABLISHED. A cloud scanner is not required for the product branch push. The guarded lander must run its complete full-history exact-tree scan and require zero findings before landing.

Main equality: NOT EQUAL, expected for branch handoff. Remote main was e9aa94360d01ae5c8ae48557a61aca3c565f3236 when checked; candidate product ref matched the full candidate SHA. Main's push Verify 42570589451 and Run site 42570589486 are completed/success, but are not candidate proof. No main or landing result is claimed.

No product blocker was found in the selected point. Remaining clause proof and external holds are gaps, not silently waived. All report and receipt files are selected explicitly for report-only evidence publication; no credentials, local setup environment, sign-in material, held-out gates or symlinks are selected.

Candidate CI observation (2026-11-09T08:49:13Z): pull_request Verify 42588077189, head 4c8dfa45d348a79c60df4135c91e24a3e2dc380c, status in_progress, conclusion null. No run was dispatched or rerun. GitHub API calls used so far: four (main discovery, PR creation, two candidate discoveries), with at least 300 seconds between candidate observations. The exact-head dynamic PR workflow 42588072747 succeeded; it is not a substitute for Verify.
