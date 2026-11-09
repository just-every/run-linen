# sx-linen-c-f61 — DESK-016 selected search proof

Repository: just-every/run-linen  
Product branch: cloud/sx-linen-c-f61  
Candidate: 085941e54221d87f97f2f1150abe735507067ee3  
Base: 8cbb5da69a36002c032436b861772e8fb3f6247e  
Pull request: https://github.com/just-every/run-linen/pull/194 (draft; native Verify entry point)

CLAIM DESK-016 PARTIAL points=5,6 tests=tests/work/search-cases.mjs#searchChecks

GAP DESK-016: Point 4's complete no-index, model or external-flow proof and all other unselected acceptance remain owed. DESK-017, DESK-027 and DESK-028 history custody and clearing duties, the Base keyed-identity port, ROLE-001 decisions and all account, ct, Base and device holds remain unchanged.

No policy default, acceptance rewrite, readership expansion, external source or retained-value expansion was selected. No contract Status, Gap or Evidence cell changed. Counts before and after remain 31 DONE, 131 PARTIAL and 37 MISSING, total 199. The plan update is this report's DESK-016 selected proof closure; the shipped plan was read only and no further queue target was taken.

## Plan and result

The full initial plan is in PLAN.md. Read the live contract and existing search, knowledge and runtime doors, the Verify definition and inline rulings and DONE riders. Extended the existing searchChecks journey to cover the two selected proof gaps. Ran the work runtime, typecheck, first-party check and mechanical checks. Fetched main and rebased the unpublished branch; main did not change. Generated and checked contract views, restored main's copies, regenerated the lock last and checked it. Committed one candidate and immediately pushed the named product branch with the cloud guard. Opened the required draft PR because Verify does not run on arbitrary cloud branch pushes. Exact-SHA CI status is recorded separately below and in the receipt.

Only tests/work/search-cases.mjs and sources.lock.json changed. No runtime implementation or UI changed. The test-registration delta is zero; this extends the existing searchChecks journey. No assertion was removed, narrowed or put behind a condition, and no pin test was added. No new email-shaped fixture or bare slash token was introduced in the changed test. The one removed line is the previous success log, replaced with a success log describing the extended coverage.

## Selected probes

PROBE DESK-016 5: Authenticated GET /search with a distinct synthetic query for each current owner, operator and HR actor -> success; exactly one new search.privileged_read audit for each request, attributed to workspace a, the current actor and global-search, with a parseable time and payload. Every audit record written by each request omits the unique query marker, full query, URI-encoded query and base64 query.

PROBE DESK-016 6: Owner creates three matching articles through POST /knowledge; employee GET /knowledge?q=synthetic-linen-61%20knowledge -> exactly the reviewed employee article and its actual body, no HR-only or unreviewed article identity. HR reads the same query and finds both reviewed articles, establishing a real matching restricted control. Employee GET /search for that query, with and without an article type filter -> 403.

The runtime uses the seed's existing authenticated-principal request adapter and rechecks current native membership. Storage inspection added by this round is limited to audit non-retention. Article creation, knowledge results and permission refusals all use native HTTP routes.

## Acceptance evidence map

All test references in this section refer to searchChecks in tests/work/search-cases.mjs, called by tests/work/runtime.mjs:781 and included in push or PR Verify through scripts/verify.mjs, check “Service desk and lifecycle.” Only points 5 and 6 are claimed by this lease.

| Acceptance point | Evidence and scope | Result |
| --- | --- | --- |
| 1 serial finds asset, tickets and assigned person | Lines 27–30; existing native assets, ticket context and search | Existing journey passed; unselected |
| 2 requester name finds tickets | Lines 32–34; native ticket and requester search | Existing journey passed; unselected |
| 3 IT search excludes HR ticket and count | Lines 46–49; native HR ticket, operator exclusion and HR positive control | Existing journey passed; unselected |
| 4 current readership before matching, pages and counts; no index, model or external flow | Lines 46–70 and 86–93 cover existing scope, revoked roles and paging. Complete no-index, model and external-flow proof is not supplied | PARTIAL; held remainder |
| 5 audit without query content | Lines 94–110; specific request audit delta, current attribution, payload inspection and raw and encoded query exclusion for all three privileged roles | Local PASS; exact-SHA Verify recorded below |
| 6 owners, operators and HR use global search; employees retain reviewed knowledge search | Lines 71–85 and 94–99; actual employee guidance, matching restricted and unreviewed controls, two employee global-search refusals, privileged role successes | Local PASS; exact-SHA Verify recorded below |
| 7 minimal people projection and reviewed binding | Lines 22–26; member and person searches and no email in the projection | Existing journey passed; unselected |
| 8 native ticket identity and conversation; asset serial and tag | Lines 27–35 and 46–51; identity, requester, serial, tag, readable content and private exclusion | Existing journey passed; unselected |
| Inherited A1 current scope and attributed access | Points 3 and 4 explicitly name current scope and A1 in the clause. Existing lines 46–63 cover unsafe and revoked access; new lines 71–85 cover employee exclusions; lines 94–110 bind privileged audits to current actors | Local PASS for selected boundary; broader inherited custody not claimed |

## DONE riders against the candidate

This is a PARTIAL claim. Rows are reported to avoid implying full-clause completion.

| Rider | Result | Evidence or limit |
| --- | --- | --- |
| 1 every acceptance outcome reached | FAIL for a DONE claim | Point 4's complete no-index, model and external-flow proof remains owed. Selected points 5 and 6 pass the native runtime journey |
| 2 non-vacuous data and dangerous path both ways | PASS for selected scope | Three real matching articles, actual visible body, HR positive control and employee refusals; per-request new audit required, not just an old audit-presence check |
| 3 exact-SHA Verify recorded | PASS for selected proof | Pull request Verify 42616935454 completed successfully on 085941e54221d87f97f2f1150abe735507067ee3; the extended runtime is in shard 6 |
| 4 fresh relevant bytes | PASS | Work runtime passed with the candidate test bytes; subsequent operations only restored unchanged views and refreshed the lock. RECEIPT.json records the matching test hash |
| 5 inheritance written | PASS for selected duty | DESK-016 requirement names current scope and A1; no new inherited duty is claimed |
| 6 generated views and provenance | PASS mechanical; judgments unchanged | Generator write and check exit 0; generated views restored from main. Existing Status, Gap and Evidence cells stay owned by the lander |
| 7 no unauthorized acceptance rewrite | PASS | CONTRACT.md and generated views have zero candidate diff |
| 8 authority both ways | PASS for selected scope | Current owner, operator and HR searches succeed. Employee knowledge succeeds while global and article-filtered global search refuse; matching HR guidance remains unavailable to the employee |
| 9 honest provider and legal boundary | PASS | No provider, legal, erasure, native-device or broader retention completion is claimed |
| 10 policy default | PASS; not applicable | Existing authority and retention semantics only; no new policy decision |
| 11 landing conditions | Pending fleet lander | Candidate is branch-only. Main equality, exact-candidate Run site and publication scan are not claimed |

## Pre-ready self-check

1. Selected outcomes are exercised through native routes and assertions fail on missing audit, retained marker, absent employee guidance, leaked HR or draft article, or allowed employee global search. Full-clause point 4 remains unproved. Exact-SHA Verify is recorded below.
2. No existing assertion was deleted, narrowed, skipped or conditionally excluded.
3. No runtime authority, erasure or replay path changed. Existing revoked-membership and stale-role checks in searchChecks, and the work runtime's restart, native restore, member erasure and replay-denial checks, passed. Broader DESK-017, DESK-027 and DESK-028 custody and clearing proof is not claimed.
4. No UI file or screen changed; browser proof, font and tooltip changes are not applicable to this test-only lease. No new browser proof is claimed.
5. Source lock is fresh. Publication scan and candidate Run site remain fleet landing duties. No cloud scan result is fabricated.

## Local validation and custody

- cloud_run timeout 1200 node tests/work/runtime.mjs: exit 0, including the new DESK-016 pass line and final runtime completion.
- pnpm typecheck: exit 0.
- pnpm exec rer check --profile first-party: exit 0.
- node src/base/contract-docs.mjs write and check: both exit 0, zero contract prose errors or warnings. Both generated views restored from origin/main.
- node scripts/edition-authoring/cli.mjs lock and check: both exit 0. Only this test's generated hash changed.
- git diff --check: exit 0.
- No migration changed; ledger check not applicable.
- All candidate commits, including side parents, inspected with the required origin/main range. Fleet author and committer identity; no trailers. No published history rewrite.
- Product push succeeded on the first guard attempt; exact remote branch head independently read back as 085941e54221d87f97f2f1150abe735507067ee3. Full history clone retained for the landing process until task cleanup; no main push.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0

Baseline main 8cbb5da69a36002c032436b861772e8fb3f6247e had Verify 42614672051 and 42612972689 success and Run site 42614672049 success. Candidate Run site is main-only and is not dispatched from cloud. Exact-candidate publication scan: commit=085941e54221d87f97f2f1150abe735507067ee3, complete=unestablished, historyScanned=unestablished, findings=unestablished; cloud scan is explicitly deferred to the maintained fleet lander.

No local blocker, failing assertion or repair round occurred. Product readiness, independent acceptance and landing remain separate from report publication.

## Final exact-SHA CI observation

Verify 42616935454, event pull_request, completed with conclusion success on 085941e54221d87f97f2f1150abe735507067ee3. URL: https://github.com/just-every/run-linen/actions/runs/42616935454. The status snapshots and timestamps are in this packet. The extended runtime is assigned to journey shard 6. GitHub API calls used: 5 of ten. No rerun, workflow dispatch or repair was needed. Main equality, publication scanning, landing and exact-main Run site remain fleet duties.

POST lanes/sx/INBOX.md: sx-linen-c-f61 DESK-016 remains PARTIAL; selected points 5 and 6 proof closed; candidate 085941e54221d87f97f2f1150abe735507067ee3; PR 194; exact-SHA pull_request Verify 42616935454 success; counts unchanged at 31 DONE, 131 PARTIAL, 37 MISSING; point 4 and all unselected obligations and existing holds remain owed.
