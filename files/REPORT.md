# sx-linen-c-f50 result

PROB-002 remains PARTIAL under the planner's explicit selection. The missing native proof selected in points 4, 5 and 6 is complete. The implementation already supplied the selected behavior, so this candidate adds public-route assertions to the existing problemDetectionChecks journey and regenerates its source lock. No production code repair was necessary.

Repository: https://github.com/just-every/run-linen
Branch: cloud/sx-linen-c-f50
Candidate: 98af7777ddedfdc44103b859b0eca9847508ff0e
Base: e9aa94360d01ae5c8ae48557a61aca3c565f3236
PR: https://github.com/just-every/run-linen/pull/183 (draft)
Verify: run 42583695971, pull_request event, completed SUCCESS on exact candidate 98af7777ddedfdc44103b859b0eca9847508ff0e, observed 2026-11-09 08:22:51 UTC. CI-status.json contains the actual REST response. Six GitHub calls were used; no dispatch, rerun or failed-log fetch was needed.
Counts before and after: 28 DONE, 134 PARTIAL, 37 MISSING, 199 total. No status promotion is claimed.

## Plan and changes

The full execution plan is in PLAN.md. The supplied extract has no standalone target table row for PROB-002. Its selected outcome row now has complete native proof for the untagged bucket, label normalization and canceled-source exclusion. No Mac plan file was edited. No next target shares this selection; PROB-003's retained decision-window and restart remainder is explicitly outside the lease.

Only these product files changed:
- tests/work/problem-detection-cases.mjs: 81 added lines inside the existing problemDetectionChecks function.
- sources.lock.json: generated hash update for that test file.

No test registration was added. No existing assertion was removed, narrowed, skipped or put behind a new condition. No pin, duplicate or unrelated test needed removal. The repository has no test-budget.json; this extension leaves its registration count unchanged.

CONTRACT.md, ACCEPTANCE.md, docs/CLAIMS.md, homepage content, UI code, workflow files, Base pins, migrations, credential handling and authority rules are unchanged. No policy default was adopted.

## Frozen selected rubric and public-door proof

All rows below use tests/work/problem-detection-cases.mjs#problemDetectionChecks, loaded unconditionally by tests/work/runtime.mjs and the existing Verify service desk journey.

| Rubric | Selected outcome | Native execution and assertion | Local result |
| --- | --- | --- | --- |
| R1, point 4 | Untagged sources stay in their own bucket and never merge cohort or location buckets | Lines 75–89 create two incident tickets per bucket through POST /work and prove no combined proposal, add a third to each, then read exactly three proposals through POST /problem-proposals/detect and GET /problem-proposals/:id. The cohort and location deliberately use the same label. Lines 64–71 compare every stored evidence ID and projected source ID with the independently retained ticket IDs. | PASS |
| R2, point 5 | NFKC, collapsed whitespace and case variants of app, model and scope labels coalesce | Lines 92–105 create full-width Unicode, repeated spaces, tabs and different case through POST /work. Both app and device-model facets have exactly one proposal for each cohort and location scope, each containing all three ticket IDs. | PASS |
| R3, point 5 | Opaque service identities remain separate | Lines 108–124 create two native services with the same name. Two tickets per service do not form a service proposal, while their shared app does. A third ticket per service yields separate proposals containing only that service's evidence and exact serviceId. | PASS |
| R4, point 6 selected portion | A genuinely canceled matching ticket cannot meet the threshold or appear in evidence | Lines 128–142 create three matching incidents, cancel one through requester POST /work/:id/commands at the read revision, and read back cancelled state and an advanced revision. Detection yields no proposal with only two active sources. Adding a replacement yields exactly the three active ticket IDs in both evidence and projected sources. | PASS |

PROBE PROB-002 4: POST /work and POST /problem-proposals/detect with untagged, cohort and location incidents -> independent buckets, no pooled threshold, exact evidence IDs on proposal reads.
PROBE PROB-002 5: POST /work with NFKC, whitespace and case variants -> one matching app and model proposal per normalized scope; separately created identically named services retain distinct IDs and evidence.
PROBE PROB-002 6: POST /work/:id/commands cancel followed by detection -> canceled state observed; two active sources plus one canceled source yield no proposal, then three active sources yield evidence excluding the canceled ID.

## Full-clause accounting

This table preserves the scope outside the selected proof. A local existing assertion is not converted into a new full-clause DONE claim.

| Acceptance point | Proof or retained boundary |
| --- | --- |
| 1: eight Wi-Fi tickets from one floor | Existing journey lines 16–26 still seeds eight tickets and checks the proposal evidence and projected source titles; passed in the touched runtime. Outside new selection. |
| 2: retained rejection | Existing lines 27–36 still reject, add a later ticket and read back one rejected semantic proposal with its reason; passed. Outside new selection. |
| 3: scheduled and on-demand recorded-context detection, unknown cause | Existing process-due, detect, service, device and app, signed network-edge fixture and unknown-cause checks remain and passed. No live monitoring adapter or root-cause claim. Outside new selection. |
| 4: facets, cohort and location separation plus untagged bucket | Existing facet checks retained; R1 adds the selected missing untagged and cross-bucket evidence proof. |
| 5: normalization and exact opaque service identity | R2 and R3 provide the selected native proof. |
| 6: distinct-source trailing window, defaults and policy range, cancellation | R4 proves only the selected cancellation portion. Existing threshold and old-source checks remain. Inclusive elapsed-window bounds and configurable policy obligations are not newly certified by this lease. |
| 7: one derived incident per monitoring event | Existing monitoring-derived incident and observation-log deduplication checks retained and passed. The monitoring transport is a fixture, not a real provider receipt. Outside new selection. |
| 8: attributed and timed decisions | Existing rejection and acceptance flows are retained and passed; their full actor and timestamp acceptance is not newly certified. Outside new selection. |

GAP PROB-002: All unselected acceptance remains owed under the supplied planner lease. PROB-003's decision-window and restart proof remains outside selection. INC-002's native Datadog and Spool adapters, live Oncall paging and named-source binding consent, ROLE-001's retained acting-role decisions and all account, Base and device holds remain unchanged. No monitoring credentials, live-provider result, root cause or new authority is claimed.

## Local validation

All completed local checks exit 0; their actual logs and CHECKS.json are in this packet.

- cloud_run timeout 1200 node tests/work/runtime.mjs: PASS, including all three new probes, the existing problem proposal authority checks and the surrounding native work runtime. The final log confirms native D1 and R2 restart, revoked membership, restricted and private data boundaries, erasure and replay denial.
- pnpm typecheck: PASS.
- pnpm exec rer check --profile first-party: PASS.
- node src/base/contract-docs.mjs write: PASS, zero documents changed.
- node src/base/contract-docs.mjs check: PASS, zero prose errors or warnings and current documents.
- git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md: generated views restored whole; neither is committed.
- node scripts/edition-authoring/cli.mjs lock, then check: PASS. Lock generation ran after the final source and test edit and main integration.
- git diff --check: PASS.
- Migration ledger: not applicable; no migration changed.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0.

The local runtime completed before commit, with identical relevant source and test bytes on the exact candidate. CHECKS.json records the committed test SHA-256. No relevant byte changed afterward. The focused existing problemDetectionJourney browser proof also passed on the committed candidate. Assertions ran once at 1440; proposed, rejected and accepted-problem states were captured at 1440 and 390. BROWSER.json, browser.log and the six images record this supplemental proof. The application source is byte-identical to the setup build; only tests and their lock changed afterward. The browser closed and its isolated Worker stopped.

## DONE riders and inherited duties

This is a PARTIAL claim for a selected proof slice. No row below silently promotes unselected scope.

| Rider | Result on candidate |
| --- | --- |
| 1 | PASS for R1–R4 via the public-route sanity journey and exact evidence comparisons. Full unselected acceptance remains outside this claim. Exact-SHA Verify 42583695971 (pull_request) completed success. |
| 2 | PASS: nonempty independent seeded IDs, below-threshold refusals, genuinely canceled state and later positive controls make the selected assertions meaningful. |
| 3 | PASS: existing Verify invokes the runtime unconditionally through scripts/verify.mjs. Verify 42583695971 (pull_request) completed success on the exact candidate, recorded in CI-status.json. |
| 4 | PASS: local proof's relevant bytes equal the committed candidate; exact test hash is in CHECKS.json. |
| 5 | INSPECTED: no receiving clause, inherited duty or Base citation changed; no new inheritance claim. |
| 6 | PASS for generation and preservation: generator write and check passed; status cells and generated views are unchanged. The existing Gap is deliberately left for the fleet's sole contract writer. |
| 7 | PASS: no acceptance sentence, clause ID, coverage mapping or ruling changed. |
| 8 | PASS within unchanged authority: the existing journey's tenant, restricted-source, source-reader, inactive-member and revoked-role refusals still pass. This test-only change creates no authority. |
| 9 | PASS: provider and legal boundaries are stated honestly; fixture monitoring is not presented as a live provider result. |
| 10 | Not applicable: no policy choice or new conservative default was needed. |
| 11 | PENDING FLEET LANDING: product is branch-only; main equality, exact-main Run site and publication scan remain fleet gate duties. |

Pre-candidate review: selected user-visible outcomes have meaningful native assertions; no prior assertion weakened; the work runtime's authority, erasure and replay checks pass; no screen is changed; no new email-shaped fixture or provider-shaped key string is added. The edition source lock is fresh.

## Product custody and independent gates

The full-history clone was refreshed from main before the candidate commit. No source conflict occurred. All candidate author and committer identities and trailers were inspected, including every candidate parent traversal; the sole candidate uses the fleet identity and has no coauthor trailer. Product push succeeded on its first guarded attempt. PR #183 provides this repository's existing pre-main Verify entry point. No workflow was dispatched or rerun.

Remote product branch equals 98af7777ddedfdc44103b859b0eca9847508ff0e. At the custody read main remained e9aa94360d01ae5c8ae48557a61aca3c565f3236; main equality is false by design. Main was never written. The starting main has completed success for Verify 42570589451 (push), Verify 42569311484 (dispatch) and Run site 42570589486 (push), all at e9aa94360d01ae5c8ae48557a61aca3c565f3236, recorded in BASE-CI.json. These are baseline results and are never substituted for candidate proof.

Publication scan: commit=98af7777ddedfdc44103b859b0eca9847508ff0e complete=false historyScanned=false findings=unestablished. The full-history scan is unavailable in cloud and must run on the fleet before landing; there is no fabricated zero-findings receipt.
Run site: no candidate-main run; landing remains pending.
Blockers: none in the selected local behavior. Exact-SHA candidate Verify is green. Independent publication and landing gates remain fleet duties and are not waived.

Report publication uses only evidence/sx-linen-c-f50 and explicitly selected regular files. It does not change product HEAD, branch or index and is not a product landing signal.
