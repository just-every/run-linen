# sx-linen-c-f54: CHANGE-009 calendar proof

Repository: https://github.com/just-every/run-linen
Branch: cloud/sx-linen-c-f54

## Plan and scope

1. Read the launcher and repository instructions, full CHANGE-009 acceptance, live Status gap, planner extract, ct rulings and DONE riders supplied in the task. Preserve all contract judgments and held work.
2. Continue full-history commit 2f8b89f09def3e73bbd5ebfa24994fc8818b0f0d from the previous calendar round. Map its existing assertions to selected points 2 and 6. They already exercise attributed audit rows and the active window lifecycle, but the principal came from test headers.
3. Extend the existing services journey, without a new test registration, to mount the native platform application and calendar routes. Seed isolated native password-session custody, cross production session authentication and CSRF for calendar GET and window POST doors, and deliberately supply false principal headers. Prove missing-session and revoked-session refusals. Populate both workspaces so tenant checks cannot pass on an empty list.
4. Retain and run the existing owner-managed active, deactivated and explicitly reactivated maintenance window flow, including operator refusal, stable ICS UID, revision sequence and exact preservation of unrelated events.
5. Run the touched services journey, typecheck and first-party check. Regenerate contract views, check them, restore the main views whole, regenerate the source lock last and check freshness. Rebase unpublished work on current main, inspect every candidate identity and full commit message, push only the named cloud branch, and open its single draft PR to start Verify.
6. Record exact candidate checks, point probes, limitations and CI provenance here; publish this packet only through the separate evidence ref. Leave landing, publication scan and Run site to the maintained fleet.

## Claim boundary

Selected points 2 and 6 are the only points claimed this round. CHANGE-009 remains PARTIAL. Point 3 restored emergency scheduling authority proof and every other unselected obligation remain owed. The Base-held maintained keyed-identity port and coordinated legacy-marker migration for DESK-017, DESK-027 and DESK-028 remain owed. The supplied ROLE-001 hold and all account, Base, device and ct holds remain unchanged. No audit-reader authority, restore-policy semantic, provider execution or screen was changed. No policy default was introduced.

Contract Status, Gap, Evidence and acceptance text are unchanged. Counts before and after: 28 DONE, 134 PARTIAL, 37 MISSING, total 199. No plan file was edited: the CHANGE-009 selected-points row receives only this report of proof; other plan rows are unchanged.

## Acceptance proof and inherited duties

Candidate: 11aacc05e647c853663078d0ffc0caac80afe037. The named journey is `calendarChecks` in `tests/services/calendar-cases.mjs`, invoked by `tests/services/run.mjs` (line 188). `scripts/verify.mjs` includes that runtime as Service operations; the unchanged Verify workflow runs its journeys on PR events.

| Item | Outcome and public door | Proof and claim |
| --- | --- | --- |
| CHANGE-009 point 1 | Current readership and generic hidden-conflict warning | Existing assertions in calendarChecks lines 47–50, 62–64 and 113–114 retained. No new completion claim. |
| CHANGE-009 point 2 | Privileged reads and exports are audited with the session workspace, actor, action and global-calendar target | calendarChecks lines 5–20 and 65–76; native session and CSRF adapter in tests/services/run.mjs lines 173–188; native platform app mounted before the header fixture in tests/services/worker.ts lines 15–17. Both populated tenants are checked. PASS locally; exact-head Verify tracked below. |
| CHANGE-009 point 3 | Inactive restore and restored changes retaining no emergency scheduling authority | Outside this selected lease. Restored emergency-authority proof remains owed. No new restore or emergency-authority claim. |
| CHANGE-009 point 4 | Erasure retains typed freeze policy and scrubs person text and actors | Existing source and adoption journeys unchanged. No new erasure completion claim. |
| CHANGE-009 point 5 | Stable UIDs, revision sequences, UTC and ICS text format | Existing calendarChecks assertions retained at lines 55–63 and 111–112. The selected lifecycle also checks the same real maintenance-window UID and its new revision at lines 80–109. No wider completion claim. |
| CHANGE-009 point 6 | An inactive window is absent from the ICS feed | calendarChecks lines 80–109: active presence, operator update refusal with unchanged history and feed, current-owner deactivation, absent original UID, exact equality of every unrelated event, explicit owner reactivation with the original UID and current sequence. PASS locally; exact-head Verify tracked below. |
| CHANGE-009 point 7 | Calendar entries never claim provider execution | Existing tentative status assertion retained at line 58; production serialization unchanged. No provider receipt or new completion claim. |
| BASE-ACCESS-002 inherited session duty | Current authenticated custody determines calendar readership | Contract citation retained. Native session middleware runs before calendar routes; deliberately forged actor, workspace and role headers confer no authority. Missing and revoked cookies return 401 and create no successful read audit (calendarChecks lines 16–20 and 124–128). Selected boundary PASS locally; full Base duty not newly claimed. |
| BASE-DATA-003 inherited erasure duty | Preserve business calendar policy without reviving erased authority | Contract citation and source retained. No erasure behavior changed or additional proof claimed; full inherited duty remains under existing held obligations. |

PROBE CHANGE-009 2: native-session GET /api/v1/change-calendar and GET /api/v1/change-calendar.ics as owner and operator in w1 and owner in populated w2 -> 200, exactly one new audit per checked request with the expected workspace, actor, read or export action and global-calendar target. False principal headers do not affect custody; missing or revoked sessions -> 401, no successful audit.
PROBE CHANGE-009 6: current-owner POST /api/v1/change-windows/:id active false, then explicit active true at the current revision -> the real maintenance UID is present, absent, then present unchanged; all unrelated event blocks remain byte-for-byte equal; operator deactivation -> 403 with unchanged history and feed.

## DONE riders

No whole-clause DONE claim is made. Each row is assessed only to avoid overstating selected proof.

| Rider | Result | Evidence or remaining obligation |
| --- | --- | --- |
| 1 | PARTIAL overall; selected points locally PASS | Points 2 and 6 reach real populated calendar and policy records through native routes, as mapped above. Restored emergency-authority proof and unselected obligations remain owed. |
| 2 | PASS for selected points | calendarChecks lines 80–109 compares nonempty real ICS event maps, checks unsafe operator refusal and exact preservation of unrelated events. Lines 16–20 and 124–128 exercise missing and revoked sessions. |
| 3 | Pending exact-head Verify | Service operations is loaded by scripts/verify.mjs line 24. PR Verify must be checked at the exact full candidate SHA; no earlier SHA supplies green proof. |
| 4 | PASS locally | Exact candidate checks recorded in VALIDATION.json; the relevant source and tests are unchanged after that run. |
| 5 | PASS by inspection | CHANGE-009 retains its BASE-ACCESS-002 and BASE-DATA-003 citations. No inheritance or acceptance text changed. |
| 6 | PASS mechanically; judgments retained | Contract generator write and check pass. Main's generated views restored whole. No Status, Gap or Evidence cell changed; counts stay 28, 134, 37. |
| 7 | PASS by inspection | No acceptance text, coverage mapping or ct rider changed. |
| 8 | PASS for selected authority boundary | Native current-owner window updates succeed; operator deactivation returns 403 and preserves the event history and feed; revoked-session calendar reads return 401. Existing current-owner checks and stale-revision refusals remain. |
| 9 | PASS for claim boundary | No live provider, legal, retention or restore completion claimed. All named holds remain. |
| 10 | PASS by inspection | No new policy default or reader authority introduced. |
| 11 | PENDING guarded landing | Main differs from the candidate. Publication scan, exact-main equality and Run site are fleet duties; no cloud receipt substitutes for them. |

## Pre-ready self-check

1. Selected outcomes are asserted against real records through native authenticated routes. Point 2's exact audit rows and point 6's complete event-map comparisons fail when those outcomes are wrong. Full Verify provenance is reported separately.
2. No existing assertion removed, narrowed, skipped or moved behind an environment or viewport branch. No permanent test registration added; the existing services journey was extended. No test-cap increase requested.
3. Allowed owner updates and forbidden operator updates are both exercised. Missing and revoked session reads refuse access. Existing hidden-record, cross-workspace and stale-update assertions remain. Production erasure and replay paths were not changed, and no restoration authority is claimed.
4. No UI source or screen touched; browser proof and tooltip audit do not apply to this test-only calendar lease.
5. Source lock and generated-view checks pass locally. Scan status for commit 11aacc05e647c853663078d0ffc0caac80afe037: complete=unestablished, historyScanned=unestablished, findings=unestablished; scan not run in cloud under the cloud landing route. Main equality=false. Run site not run; it is main-only and stays with the guarded lander. No new email-shaped text or provider-key fixture was added.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0 (no migration changed).

The only product changes are the selected calendar proof, its native test adapter and generated source lock. Source pins, runtime code, homepage, workflows, contract text and generated views are unchanged. No blocker is identified for landing this selected partial proof.

## Exact candidate local results and custody

The full 40-character candidate SHA is 11aacc05e647c853663078d0ffc0caac80afe037. Product push succeeded on attempt 1. Draft PR: https://github.com/just-every/run-linen/pull/189. The branch is not landed; observed base main is e9aa94360d01ae5c8ae48557a61aca3c565f3236. A fetch and unpublished rebase immediately before push reported the branch up to date. All candidate parents beyond main have fleet author and committer identity and no trailers; complete commit messages were inspected. No force push or default-branch push occurred.

VALIDATION.json records the five commands, actual zero exits, durations and logs on this exact committed head: services runtime (130.13 seconds), typecheck (33.56 seconds), first-party check (3.44 seconds), source freshness check (2.01 seconds), and contract-docs check (1.96 seconds). The source and test bytes are unchanged since this run. The installed dependencies retain the repository pins. Local command shells used the required toolchain setup; the actual shell Node was v24.19.0 with pnpm 10.12.4, and the engine warning is recorded honestly in the typecheck log. Native build setup completed successfully before these checks; no dependency pin was changed.

No local service or browser process remains from these checks. Miniflare cleanup ran in the journey's finally block. After evidence transfer the cloud clone and its installed dependencies are removed as required; product custody stays at the pushed branch and PR, and this report packet remains outside the clone.

## Workflow provenance

PR #189 is draft and targets main. Exact-head discovery found pull_request Verify run 42589644294 at https://github.com/just-every/run-linen/actions/runs/42589644294 with head 11aacc05e647c853663078d0ffc0caac80afe037. It was in progress at discovery; the separate completed dynamic PR metadata run 42589640529 is not treated as Verify. No workflow was dispatched or rerun. A single watcher observes the 300-second minimum between discovery and status calls. Terminal workflow status is recorded below.

Final observed Verify status: run 42589644294, event pull_request, status=in_progress, conclusion=null, head_sha=11aacc05e647c853663078d0ffc0caac80afe037. Four GitHub calls were used: create the single draft PR, immediate exact-head discovery, repeat discovery after at least 300 seconds, then one status read after at least 300 seconds. No failed run was observed and no CI repair was attempted. The dynamic PR metadata run's success supplies no Verify credit. Rider 3 remains pending. The explicit cloud handoff rule applies: the fleet waits for this exact-head Verify, runs the full-history publication scan and performs guarded landing; this report does not claim CI green or landing. Run site and the scan are still unestablished, not waived.

CLAIM CHANGE-009 PARTIAL points=2,6 tests=tests/services/calendar-cases.mjs#calendarChecks
GAP CHANGE-009: Restored emergency-authority proof in point 3 and every unselected calendar obligation remain owed; all named Base, account, ct and device holds remain unchanged.

The selected clause is the only plan entry reported as changed. Clause status and counts remain unchanged. The product branch and evidence transfer are separate custody records. The packet contains actual validation receipts and reports, no credentials, environment dumps, held gate material or symlinks.
