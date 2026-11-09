# sx-linen-c-f52 — PROB-002 native proof

Candidate: 96bc3a24b3b8a302494522179edffc855cfe2976
Repository: https://github.com/just-every/run-linen
Branch: cloud/sx-linen-c-f52
Draft PR: https://github.com/just-every/run-linen/pull/187
Starting continuation: 98af7777ddedfdc44103b859b0eca9847508ff0e
Main at final fetch and push: e9aa94360d01ae5c8ae48557a61aca3c565f3236

CLAIM PROB-002 PARTIAL points=4,5,6 tests=tests/work/problem-detection-cases.mjs#problemDetectionChecks

GAP PROB-002: This claim closes point 4's untagged bucket, point 5's label normalization and point 6's canceled-ticket exclusion only. Unselected acceptance remains owed, including complete inclusive elapsed-window and configurable policy proof; PROB-003's decision persistence, rolling-window, restart and readership remainder stays separate. Existing provider, role, Base and device holds are unchanged.

No policy default was adopted. No selected point is externally blocked. The explicit POINTS lease is partial; this report makes no whole-clause DONE claim. Counts before and after: 28 DONE, 134 PARTIAL, 37 MISSING; 199 total. No contract Status, Gap, Evidence, summary or generated-view cell changed.

Plan row to relay: PROB-002 selected bucket, normalization and cancellation proof passes, including correction of the canceled-source read defect. No lane plan or inbox was read or written.

## What changed

The specified starting commit already contained public-door tests for the three selected items, and its native runtime passed. Inspection found another ordinary cancellation path within the selected point: after detection captured a live incident, canceling that incident left the undecided proposal readable with the canceled source still in evidence. The focused reproduction failed at problem-detection-cases.mjs:149: proposal GET returned 200 instead of 409.

In src/features/services/problem-proposals.ts:33, evidence projection can now require non-canceled tickets. getProblemProposal applies that requirement to undecided proposals at line 57. The existing list suppresses the resulting evidence conflict, and acceptance validates the same read before writing. Detection retains current source authorization and can refresh stale evidence once three eligible live sources exist. Decided proposals and accepted problems keep historical references under existing rules.

The existing problemDetectionChecks journey now cancels a source already captured by detection, proves the invalid proposal disappears, refuses acceptance without changing the problem list or decision history, re-detects with two remaining live sources, and replaces the canceled source with a third live ticket. The refreshed semantic proposal is accepted and the native problem contains precisely the three live IDs.

From main, the candidate changes only the proposal source, the existing problem detection journey and the generated source lock. It preserves f50's bucket and normalization assertions. No assertion was removed, narrowed, skipped or moved behind an environment or width condition. No permanent test registration was added; no cap increase, duplicate or pin test was encountered.

## Plan and actual results

1. Initialized fleet identity, refreshed the launcher, installed the supplied Git helper and guard, cloned full history, configured local identity and commit hooks, fetched f50 and created this branch at the specified continuation SHA.
2. Read the repository instructions, clause and Gap, implementation and native proof, and the inline plan, rules, rulings and DONE riders. Mapped existing proof before editing.
3. Passed the starting native runtime. Added a post-detection cancellation probe; reproduced its failure against unchanged product code, exit 1. Corrected current proposal validation and passed the focused journey.
4. Passed the complete touched work runtime, typecheck, first-party check and build. Passed the existing focused problem browser journey; captured and inspected proposed, rejected and accepted-problem screens at 1440 and 390.
5. Fetched main and performed the required unpublished rebase. Main was already the branch's base. Ran contract write and check, restored main's views, regenerated the source lock last and checked it. Confirmed tested source hashes equal the committed candidate.
6. Committed with explicit fleet author and committer and active hooks. Inspected all candidate commits, including the inherited continuation, and pushed through the guard successfully on attempt 1. Created one draft PR for the repository's pull-request Verify entry point. Evidence transport remains separate from product custody.

Long native, build and browser commands used the cloud subreaper. Chromium was /usr/bin/chromium with --no-sandbox. The browser journey asserted at 1440 and captured each state once at 1440 and 390. Scratch focused adapters were removed. No live provider action or monitoring credential proved a selected point.

## Probes and frozen selected rubric

PROBE PROB-002 4: Native /work creates two sources in each untagged, cohort and location bucket; /problem-proposals/detect returns no pooled proposal. A third source in each produces three separate proposals. Reads contain exactly each bucket's stored and projected IDs.

PROBE PROB-002 5: Native tickets with full-width NFKC forms, repeated spaces, tabs and case variants produce one app and one model proposal for each normalized cohort and location. Identically named native services stay separate by opaque ID, cannot pool two-ticket service clusters, and later produce distinct three-ticket service evidence.

PROBE PROB-002 6: Native requester cancellation before detection cannot supply a third source. Cancellation after detection hides the captured proposal; acceptance returns problem_evidence_changed with unchanged problems and proposal history. Re-detection with two live sources remains insufficient. A replacement live ticket refreshes the same proposal with exactly the three live IDs, which then create a problem.

R1 — Bucket separation: MET locally. tests/work/problem-detection-cases.mjs#problemDetectionChecks, lines 75–88; evidence-ID comparisons at lines 66–71.
R2 — Normalization and opaque identity: MET locally. Same journey, lines 92–125, covering app, model, cohort and location.
R3 — Cancellation and threshold: MET locally. Same journey, lines 128–161, native cancel before and after detection, unsafe refusal without changes, valid replacement acceptance.

These rows implement the selected outcomes; they add no acceptance point.

## Full acceptance map and retained boundaries

Each row identifies candidate evidence. Only the selected subpoints are claimed this round.

1. Eight Wi-Fi tickets: existing problemDetectionChecks lines 14–21, and tests/ui/problem-detection-journey.mjs#problemDetectionJourney lines 5–14. Exercised locally.
2. Retained rejection after later sources: runtime lines 22–31; browser lines 16–23. Exercised. Broader rolling-window and restart persistence remains PROB-003's separate remainder.
3. Scheduled-service and on-demand recorded-context detection: runtime lines 16–17 and 22, facets at lines 50–54, monitoring context at lines 164–188. Exercised as native and network-edge fixture proof, never a live adapter claim.
4. Separate facets and scopes: existing facets at lines 50–54; untagged, cohort and location bucket proof at lines 75–88. Selected remainder MET.
5. NFKC, whitespace, case and opaque IDs: lines 92–125. Selected point MET.
6. Default threshold and old-source exclusion: existing lines 55–62. Native cancellation: lines 128–161, selected remainder MET. Complete inclusive-boundary and configurable policy proof is not claimed.
7. Monitoring-derived incident counted once: existing signed native fixture path at lines 164–194, exercised locally. No monitoring credential or live provider receipt claim.
8. Decision reason retained: existing lines 25–31 and acceptance checks. Complete attributed actor-and-timestamp proof is not newly claimed by this selection.

PROB-003 continues to own broader persistence and current-source visibility. Existing tenant, restricted-source, membership and revoked-role assertions passed unchanged in the full runtime. No new read, role, grant, cause inference, monitoring consent or provider authority was introduced. INC-002's native Datadog and Spool adapters, live Oncall paging and named-source consent, ROLE-001 acting-role decisions and all retained account, Base and device holds remain unchanged.

## DONE-RIDERS

1. PASS for selected outcomes: R1–R3 reach real native doors and inspect nonempty evidence. Whole-clause completion is not claimed; exact-head CI is recorded below.
2. PASS: actual incidents and cancellations, exact IDs, unsafe acceptance refused without problem or history changes, and valid replacement acceptance succeeds; lines 128–161.
3. CI_PENDING: tests/work/runtime.mjs:128 invokes the journey; scripts/verify.mjs:15 includes that runtime in Verify. Exact-head pull-request Verify 42589296946 was still in progress at both status polls, each at least 300 seconds after the prior call for that run. No green result is inferred.
4. PASS by byte identity: tested-source-hashes.json records final relevant bytes; checks-receipt.json verifies them against the full committed candidate. Runtime, build and browser ran before the commit; relevant bytes did not change afterward.
5. NOT_APPLICABLE: no new Base duty or inheritance claim. Existing current-source read authority remains tested.
6. PASS mechanical: final contract write produced zero files; check reported current documents, zero errors and warnings. Status, Gap, Evidence and counts remain main's text. Judgment edits belong to the lander.
7. PASS INSPECTED: no acceptance, ruling or coverage rewrite changed.
8. PASS for selected decision path: canceled evidence returns 409 with unchanged problems and history; three live replacement sources accept. Existing authority refusals passed.
9. PASS boundary: no live provider, legal, delivery or root-cause claim. All retained external holds remain.
10. NOT_APPLICABLE: no policy default was added.
11. PENDING GUARDED LANDING: main is not the candidate, Run site has not run on a landed head, and the fleet publication scan is not run here. No landing or DONE credit claimed.

No rider is silently treated as a whole-clause DONE pass.

## PRE-READY check

1. Selected native outcomes have failing-sensitive public-door evidence. The added cancellation probe failed before the fix. Exact-head Verify state is recorded, not assumed.
2. No existing assertion was removed, narrowed or conditionally disabled.
3. Current source authority precedes projection. Existing revoked membership, erasure and replay checks passed in the full runtime. The new decision path tests unsafe refusal with no changes and valid replacement success. Credential, erasure and replay code did not change.
4. No screen source or control changed. Existing native problem screens were inspected at 1440 and 390, with journey page-overflow checks. No wider UI audit is claimed.
5. Source lock is fresh. Publication scan, main equality and Run site remain fleet duties. Added source and fixtures contain no new email-shaped strings. All candidate authors and committers are fleet identity; no co-author trailers exist.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock && node scripts/edition-authoring/cli.mjs check exit=0; views=node src/base/contract-docs.mjs write && node src/base/contract-docs.mjs check exit=0; ledger=none exit=0

Generated views were restored from origin main before committing. No migration changed. The candidate contains the regenerated lock and exactly the locally tested product and test bytes.

SCAN commit=96bc3a24b3b8a302494522179edffc855cfe2976 complete=not-run historyScanned=not-established findings=not-established
MAIN_EQUALITY false main=e9aa94360d01ae5c8ae48557a61aca3c565f3236 candidate=96bc3a24b3b8a302494522179edffc855cfe2976
VERIFY run=42589296946 event=pull_request head=96bc3a24b3b8a302494522179edffc855cfe2976 status=in_progress conclusion=null
RUN_SITE run=none reason=not-landed
BASE_VERIFY run=42570589451 event=push head=e9aa94360d01ae5c8ae48557a61aca3c565f3236 status=completed conclusion=success
BASE_RUN_SITE run=42570589486 event=push head=e9aa94360d01ae5c8ae48557a61aca3c565f3236 status=completed conclusion=success
These base runs are context only and do not prove the candidate.

No known failed candidate check; no CI repair, rerun or dispatch. The draft PR is the existing workflow entry point. Final API usage is five calls: one PR creation, one exact-head discovery, two Verify status polls separated by at least 300 seconds, and one exact-main discovery. No other watcher is running. No rerun, dispatch or log download was used.

## Actual receipts

checks-receipt.json binds commands, exits, candidate, main, counts and committed hashes. Candidate outputs are candidate-runtime.log, typecheck.log, first-party.log, build.log, browser.log, final-views.log, final-lock.log and final-lock-check.log. Reproduction outputs are cancellation-before-fix.log and cancellation-after-fix.log, explained by probe-description.txt. baseline-runtime.log is explicitly the prior continuation baseline. The six selected images under browser are actual captures. identity-check.log, push.log, pr.json, ci-discovery.json, ci-result.json and main-ci.json record observed publication and CI. custody-receipt.json records clean checkout, source boundaries and screenshot hashes.

Only explicitly selected regular report, receipt and screenshot files enter the evidence tree. No credentials, environment dumps, private held-out material, local settings, scratch databases, browser state or worker log is selected. Evidence publication does not mean product acceptance or landing.

Cloud handoff: all local touched checks pass and the exact product head is pushed. Verify remains in progress at the last permitted observation; the maintained fleet lander owns completion of exact-head CI, the full-history scan and landing. This is a PARTIAL selected-point handoff, not a whole-clause DONE or CI-success claim.
