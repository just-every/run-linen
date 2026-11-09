# sx-linen-c-f70 results

Repository: just-every/run-linen. Product branch: cloud/sx-linen-c-f70. Candidate: 91014eeb01c9c8e28f03a09711a0aaf549ae5cbe. Base main: c6c7d7d79438ce0a9bfb67327f488d7226438a7b. Draft PR: https://github.com/just-every/run-linen/pull/201.

CLAIM CHANGE-002 PARTIAL points=8 tests=tests/services/risk-cases.mjs#changeRiskChecks
GAP CHANGE-002: This lease closes only acceptance point 8 risk-path precedence. All other CHANGE-002 acceptance remains uncertified by this lease. CHANGE-001 template-erasure proof and CHANGE-003 board, quorum and channel obligations remain owed. The supplied ROLE-001 hold and all account, Base, device and other ct holds remain unchanged.

Counts before and after: 31 DONE, 131 PARTIAL, 37 MISSING, 199 total. No clause status changed. No contract acceptance, Status, Gap or Evidence cells changed. No new policy default or execution authority was introduced.

## Plan and execution

Read the shipped plan extract, rulings and DONE-RIDERS, then the repository rules, contract and native routes. Mapped the existing risk sanity journey to the selected point. The production implementation already gives type precedence over risk band, so extended its existing public-door integration journey without changing runtime code.

Created a low-scored emergency through POST /changes, read it, recorded an independent approver decision through its authorize route and read back ECAB for both the record and decision. Created and owner-approved a real template through the native template routes, raised a high-scored standard change from it, and read back the exact template ID, version, approval ID, implementation revision and snapshot on the catalog path. Refused ordinary CAB authorization with 409 catalog_approval and proved the full record stayed unchanged. Both added changes retain empty invocations and the provider-write counter stays unchanged.

Ran the touched integration journey, typecheck and first-party check. Generated and checked contract views, restored both views from main, fetched main and rebased with fleet identity, then regenerated the source lock last and checked it. Main had not advanced. Committed only the test and its generated source-lock hash. Inspected all candidate authors, committers and trailers, pushed through the fleet guard, and opened the single draft PR required for Verify. Ran the local checks again against the committed SHA and saved their actual logs and a hash-bound receipt.

No UI changed, so browser screenshots and a site build are outside this test-only lease. No test registration was added or removed, and no assertion was removed, narrowed, skipped or made conditional. The existing CHANGE-002 assertions remain intact. No test-budget file exists in this checkout; the integration registration count is unchanged.

Plan row update for the fleet: CHANGE-002 selected point 8 risk-path precedence proof completed on the candidate; retain PARTIAL and every held remainder. No lane files were read or changed.

## Public-door probes and frozen rubric

PROBE CHANGE-002 8: POST /changes with a test CI, risk score 3 and emergency type; independent POST to its authorize route and GET of the change -> low band, ECAB record and ECAB decision attributed to approver.
PROBE CHANGE-002 8: Owner POST /change-templates and exact-version approval, then POST /changes with standard type -> high band, catalog path, preapproved state and exact approved version and snapshot.
PROBE CHANGE-002 8: POST to the high standard's authorize route -> 409 catalog_approval, unchanged complete change record, no invocation and no additional provider write.

R1 MET locally: low-scored emergency cannot take normal change-manager review. tests/services/risk-cases.mjs lines 33–48, changeRiskChecks, invoked by tests/services/integration.mjs line 198.
R2 MET locally: high-scored standard cannot take normal CAB review; exact owner-approved catalog identity and snapshot persist. Same journey, lines 50–70.
R3 MET locally: ordinary authorization is refused without mutation, and precedence proof dispatches no provider effects. Same journey, lines 71–79.
No additional behavior or authority was added outside this rubric.

## Acceptance coverage and retained limits

1. Existing high production SSO and low test-CI comparison: changeRiskChecks lines 16–22; preserved and passing locally. No expanded claim.
2. Existing scored-factor and unanswered-question assertions: lines 15–24; preserved and passing locally. Full questionnaire coverage was not requalified by this lease.
3. Existing production factor: line 17; preserved and passing locally. Legacy-item behavior remains outside this lease.
4. Existing no-calendar factor: line 17; preserved and passing locally. Named-calendar boundary proof remains outside this lease.
5. Existing prior failed-change factor: lines 13–19; preserved and passing locally. Compensated cases and lookback and cap boundaries remain outside this lease.
6. Existing high and low score assertions: lines 18–24; preserved and passing locally. Complete band-boundary proof remains outside this lease.
7. Existing normal CAB, independent change-manager decision and self-approval refusal: lines 19–27; preserved and passing locally. Broader normal-review proof remains outside this lease.
8. Selected risk-path precedence: new lines 33–79. Existing visible score, band and factors in route responses, plus edit recomputation and authorization withdrawal, remain asserted at lines 17–31. This is the only acceptance point credited in the claim.

## DONE-RIDERS review

1. SELECTED SCOPE PASS locally: R1–R3 reach and inspect the required public outcomes. Entire clause not claimed DONE; other acceptance remains held.
2. PASS for the selected scope: genuinely seeded changes and template; explicit contradictory bands; unsafe ordinary decision refused with the whole record unchanged.
3. PASS: exact-head Verify 42645867173, event pull_request, completed with conclusion success on 91014eeb01c9c8e28f03a09711a0aaf549ae5cbe. scripts/verify.mjs includes tests/services/integration.mjs as Controlled changes and reporting; integration calls changeRiskChecks unconditionally. No workflow edited.
4. PASS locally: exact-candidate checks and file hashes are recorded in RECEIPT.json. No source or test edits after those checks.
5. NOT APPLICABLE: no new inherited duty or clause edit.
6. MECHANICAL PASS locally: generator write and check pass; generated views restored from main. Contract cells and counts intentionally remain unchanged for the lander.
7. PASS: no acceptance rewrite or ruling needed.
8. PASS for the selected authority boundary: owner template approval, independent emergency decision, normal catalog authorization refused without mutation; no grants created by the added cases.
9. PASS boundary: no live-provider claim; empty invocations and unchanged provider-write count. External and held work retained in GAP.
10. NOT APPLICABLE: no new policy default.
11. PENDING guarded landing: candidate is branch-only. Main equality, complete full-history publication scan and Run site are lander duties.

## Pre-ready self-check

The added assertions fail if low emergency review is downgraded, high standard review becomes CAB, its exact catalog approval is lost, ordinary authorization mutates it, or provider dispatch occurs during the cases. No existing assertion weakened. Runtime authority, erasure and replay code is unchanged; the integration journey's existing restore, erasure and revoked-grant refusals also pass. No screen touched.

Source lock is fresh. Contract generation passes. Changed text introduces no email-shaped fixture values or bare repository-shaped prose tokens; the existing fixture address is unchanged. Candidate identity inspection includes every reachable commit beyond origin/main and finds only fleet authors and committers, with no trailers. Publication scan is NOT RUN in cloud and its result is unestablished; no COMPLETE or zero-findings claim is made. Scan, exact-main equality and Run site await the guarded fleet lander.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0

## Custody and CI

Product push succeeded on its first attempt through cloud-push.py. product-refs.txt records the exact remote candidate and main. Product head and index are unchanged by evidence publication. The selected explicitly listed packet files are ordinary public-safe reports, receipts and logs, without secrets, environment dumps, held-out gate material or symlinks.

Verify run 42645867173, event pull_request, was discovered in progress on the exact candidate. A separate dynamic PR run 42645863118 was also in progress. Latest Verify observation and final handoff state are recorded below when available. No CI dispatch or rerun was requested.

## Final CI and handoff

{"api_call": 5, "conclusion": "success", "event": "pull_request", "head_sha": "91014eeb01c9c8e28f03a09711a0aaf549ae5cbe", "html_url": "https://github.com/just-every/run-linen/actions/runs/42645867173", "observed_at": "2026-11-09T15:48:55.705878+00:00", "run_id": 42645867173, "status": "completed"}

Verify is completed with conclusion success on the full candidate SHA, including the existing integration registration that unconditionally invokes changeRiskChecks. Local exact-head integration, typecheck, first-party, view and lock checks all pass. Five GitHub REST calls were used: PR creation, run discovery and three observations at intervals of at least 300 seconds. No dispatch, rerun or workflow edit was needed.

No product blocker. The clause remains PARTIAL with the held GAP above. Product is branch-only; publication scan, main equality and Run site remain unestablished until the guarded fleet lander completes them. No main push was attempted. The preliminary evidence packet was fetched at its exact ref and head and all 21 selected file hashes verified; evidence-preflight.json is that actual transport receipt. The final updated packet is published separately on the same report-only evidence ref.

CLAIM CHANGE-002 PARTIAL points=8 tests=tests/services/risk-cases.mjs#changeRiskChecks
READY repo=just-every/run-linen branch=cloud/sx-linen-c-f70 head=91014eeb01c9c8e28f03a09711a0aaf549ae5cbe
