# sx-linen-c-f33

Repository: just-every/run-linen
Branch: cloud/sx-linen-c-f33
Scope: DESK-013 acceptance point 6 only. All other acceptance and existing holds remain unchanged. No application, UI, contract-status or workflow change is selected.

## Plan

1. Read the supplied builder rules, plan extract, rulings and DONE riders; read the repository instructions, complete target clause, status gap and recurrence implementation with its existing public-door journey.
2. Start from the requested f28 commit 15d216b5e0593c6a6678460f4c5aaa20ac98ca4b in a full-history clone; carry that implementation onto current main, preserving other writers and all contract judgments.
3. Run historical New York plans for the November 2020 fold and March 2020 gap through native recurring plan creation, scheduler processing, recurring occurrence reads and generated ticket reads. Use every weekday with no holidays and leave the application clock unchanged. Assert literal independently specified UTC instants, persisted due times, ticket context and plan pause; verify another scheduler tick preserves the paused occurrence and ticket.
4. Extend the existing recurrenceChecks journey without adding registrations or weakening assertions. Run the touched work runtime and typecheck, first-party validation, contract generation then its check, restore generated views from main, regenerate the source lock last and check it.
5. Inspect every unpublished candidate identity, trailer and changed source text; publish only the named product branch. Open the single PR that provides this repository's pre-main Verify entry point. Discover exact-SHA CI through REST and report the observed state without crediting any other SHA.
6. Save the complete non-secret report and actual receipts outside the product tree, publish them only on the declared evidence ref, then return clause, custody and lane handoff lines. Main landing, publication scan and Run site belong to the fleet.

## Initial inspection

Main's DESK-013 status is PARTIAL and its gap names only the unasserted fold and skipped-hour outcomes. The requested f28 starting commit already contains the exact two historical public-door cases, but they are absent from fetched main. This round retains them and strengthens persisted-calendar and pause preservation checks. No production implementation correction is necessary.

Acceptance point 6: 2020-11-01 01:00 America/New_York must resolve to 2020-11-01T05:00:00.000Z; 2020-03-08 02:00 must advance to 2020-03-08T07:00:00.000Z. Expectations are literal observations through public doors, rather than values computed by the calendar implementation.

The lease is explicitly POINTS: PARTIAL for point 6. No full-clause DONE promotion is claimed and no status cells, acceptance sentences or summary counts will change. The full rider and acceptance mapping will be recorded with the candidate receipts below.

## Product and local results

Candidate: c3623f2650e2bbed6bc96957dd8c4dc792147483
Base main at final rebase: e0cbe435c23ad15a9fb87bff69d81cd2ff39aaaf
PR: https://github.com/just-every/run-linen/pull/169 (draft, open for lane custody).
Changed product files: ./tests/work/recurrence-cases.mjs and ./sources.lock.json only. The prior f28 work was rebased before its first publication under this run's branch. No published branch was rebased or force pushed.

The existing recurrenceChecks gained the fold and gap table plus persisted-calendar and pause-preservation assertions. No application code changed. New test registrations: 0; existing assertions deleted or narrowed: 0. No test-budget file exists in this checkout. The existing Service desk and lifecycle journey invokes recurrenceChecks at ./tests/work/runtime.mjs:129 and is in the maintained Verify command at ./scripts/verify.mjs:15.

Contract counts before and after: 23 DONE, 139 PARTIAL, 37 MISSING, 199 total. DESK-013 remains PARTIAL; only point 6 is claimed in this round. CONTRACT.md, ACCEPTANCE.md and docs/CLAIMS.md are byte-identical to final fetched main. No plan row is edited on this cloud; proposed plan-result update is point 6 proved, held remainder unchanged.

Passed commands:
- npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive (through cloud_run; local owner claimed and setup completed).
- npx -y @runeditrun/rer build (through cloud_run; build.txt).
- timeout 1200 node tests/work/runtime.mjs (through cloud_run; work-runtime.txt and tested-head.txt bind the final replay to the candidate).
- pnpm typecheck (typecheck.txt).
- pnpm exec rer check --profile first-party (first-party-check.txt).
- node src/base/contract-docs.mjs write, then node src/base/contract-docs.mjs check (views-write.txt and views-check.txt); generated views restored whole from main.
- node scripts/edition-authoring/cli.mjs lock, then node scripts/edition-authoring/cli.mjs check (lock-write.json and lock-check.json).
- Focused existing recurrenceJourney through ./tests/ui/run.mjs and a temporary uncommitted driver, Chromium at /usr/bin/chromium with --no-sandbox (browser-proof.txt). It creates a genuine monthly recurring plan, observes holiday roll-forward, materializes its ticket, completes an owned task and pauses the plan. Screens captured at 1440 and 390 and visually inspected. This browser check supports the existing screen journey; the two DST instants are proved by the runtime doors rather than by these monthly-plan screenshots.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0
No migration was added or edited. The source lock was regenerated after the final source edit and final rebase. Repository hooks remain installed. All candidate authors and committers are the fleet identity and there are no co-author trailers.

PROBE DESK-013 6: POST /recurring-work with 2020-11-01 at 01:00 America/New_York, all weekdays, no holidays; POST /work/process-due; GET /recurring-work and generated ticket -> plan and occurrence due 2020-11-01T05:00:00.000Z, matching ticket context, current owner and public schedule message; paused plan preserves both after another tick.
PROBE DESK-013 6: POST /recurring-work with 2020-03-08 at 02:00 America/New_York, all weekdays, no holidays; POST /work/process-due; GET /recurring-work and generated ticket -> plan and occurrence due 2020-03-08T07:00:00.000Z, matching ticket context, current owner and public schedule message; paused plan preserves both after another tick.

## Acceptance map

All rows name the existing recurrenceChecks journey in ./tests/work/recurrence-cases.mjs, run through ./tests/work/runtime.mjs. Only point 6 is newly claimed; the other rows describe retained coverage, not additional promotion.

| Point | Outcome and evidence | This round |
| --- | --- | --- |
| 1 | First monthly business day skips the January holiday; lines 5–15 and 23–27. Existing recurrenceJourney also sees the created plan and generated ticket. | Retained, no scope change. |
| 2 | Calendar zone, weekdays, holidays and creation hour persisted; lines 48–57 compare the public plan calendar to the submitted snapshot. | Snapshot checked while proving point 6. |
| 3 | Retained frequency and month-end coverage; lines 86–95 assert February 29 and March 31 and create the supported interval types. | Retained; no new full-point claim. |
| 4 | January holiday rolls forward to January 2; lines 13–15 and 92–95. | Retained, no scope change. |
| 5 | Monthly first-business-day fixtures retain the January anchor; lines 6–15 and 92–95. | Retained; no new full-point claim. |
| 6 | Fold and gap literal UTC instants, persisted occurrence, generated ticket context and public schedule message; lines 42–82. | PASS locally on exact candidate; Verify custody recorded separately. |
| 7 | Retained pause, stale-revision refusal, resume and concurrent deduplication; lines 16–25. New paused historical plans preserve occurrence and ticket after another tick, lines 74–81. | Retained plus pause check for the point-6 fixtures. |
| 8 | Owned local task creation and completion, unauthorized and stale refusal, activity attribution; lines 28–40. | Retained, no provider-effect claim. |

## DONE riders

No full-clause DONE claim is made. The following evaluates only the selected point and records the remaining lander conditions honestly.

| Rider | Result | Evidence |
| --- | --- | --- |
| 1 | Selected outcome PASS on exact-SHA Verify; whole-clause promotion unclaimed. | recurrenceChecks lines 42–82 performs native creation, processing, occurrence and ticket reads for both transitions; exact-SHA Verify recorded below. |
| 2 | PASS | Literal independent expected instants; nonempty occurrence and genuine ticket asserted at lines 60–73. A later fold or a non-advanced gap fails these comparisons. |
| 3 | PASS exact-SHA Verify. | Service desk and lifecycle is an existing Verify journey; push has no matching named cloud branch trigger, so draft PR #169 supplies the pull_request entry point. Verify id 42548515225, pull_request event, completed success on c3623f2650e2bbed6bc96957dd8c4dc792147483. |
| 4 | PASS | tested-head.txt binds the final runtime replay to c3623f2650e2bbed6bc96957dd8c4dc792147483; no subsequent product edits. |
| 5 | INSPECTED | No inherited Base duty or clause text changed; point 6 explicitly owns its time-zone outcome. |
| 6 | Mechanical PASS; judgments unchanged | Generator write and check pass; generated views restored from main; no Status, Gap or Evidence edit. Counts unchanged. |
| 7 | PASS | No acceptance text, coverage rewrite or ct ruling changed. |
| 8 | Retained; no new authority | Existing unauthorized manager and task-completion refusals remain at lines 9–12 and 31–40. No new roles or grant behavior. |
| 9 | PASS boundary | Native local scheduling only, with no live-provider, legal or device claim. Existing held obligations remain unchanged. |
| 10 | Not applicable | No policy default adopted. |
| 11 | Pending guarded lander | Candidate remains branch-only; main equality, exact-main Run site and complete publication scan are fleet landing duties and are not claimed here. |

## Pre-ready checks

1. Selected public behavior is asserted against independent literal instants and persistent user-visible ticket context; incorrect DST resolution would fail the tests. The final Verify state is recorded below.
2. No existing assertion removed, narrowed, skipped or conditioned on a viewport or branch. Added lines only; registration delta zero.
3. No new authority, erasure or replay path introduced. Existing recurrence erasure and inactive-restore checks remain at lines 97–113 and passed with the touched work runtime. No broader role or provider boundary changed.
4. No screen code touched. Existing recurring-plan and generated-ticket screens were exercised at 1440 with captures also at 390; both fit and show the plan and completed owned duty. No UI release completion claim is added.
5. Source lock fresh and generated contract views reproduce. Publication scan: NOT RUN in cloud, as explicitly delegated to the maintained Mac lander. No complete scan, finding count, main equality or Run site success is invented. No newly added email-shaped or provider-key-shaped source strings; scope-check.json records the inspection.

GAP DESK-013: Unselected acceptance and all existing role, account, ct, Base and device holds remain unchanged; this lease claims point 6 only. Clause promotion and independent landing gates remain with the fleet.

SCAN commit=c3623f2650e2bbed6bc96957dd8c4dc792147483 complete=false historyScanned=not-run findings=not-run custody=guarded-fleet-lander
Main equality is false by design: only the named cloud branch is pushed. The candidate descends from final fetched main; main is not modified. Publication scan and Run site are unestablished here, rather than assumed green. No external-provider account or policy ruling is required for the selected native DST point.

Plan result proposed for sx: sx-linen-c-f33 proves DESK-013 point 6 through recurrenceChecks, with fold and gap persisted due-time and ticket-context assertions and historical-plan pause preservation. Leave contract status, counts and all unselected holds unchanged. No additional clause was started.


## Final CI and custody

Verify 42548515225, event pull_request, completed success on c3623f2650e2bbed6bc96957dd8c4dc792147483. URL: https://github.com/just-every/run-linen/actions/runs/42548515225
Four task GitHub REST calls were used: PR creation, exact-SHA run discovery and two run-status polls spaced at least 300 seconds apart. No dispatch, rerun, failed-job repair or workflow edit was needed. Local proof, exact-SHA Verify and product push are complete; there is no product blocker. The PR remains draft and open for the lane. Full publication scan and exact-main Run site remain independent guarded-lander duties.

CLAIM DESK-013 PARTIAL points=6 tests=tests/work/recurrence-cases.mjs#recurrenceChecks
GAP DESK-013: Unselected acceptance and existing holds remain unchanged; whole-clause promotion is not claimed by this point-6 lease.
