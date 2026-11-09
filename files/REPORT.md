# sx-linen-c-f47: calendar audit and inactive-window proof

Repository: `just-every/run-linen`  
Branch: `cloud/sx-linen-c-f47`  
Candidate: `2f8b89f09def3e73bbd5ebfa24994fc8818b0f0d`  
Base at final integration: `e9aa94360d01ae5c8ae48557a61aca3c565f3236`  
Draft PR: https://github.com/just-every/run-linen/pull/181  
Verify: 42583652209, event `pull_request`, exact candidate, completed with conclusion success; see CHECKS.json for terminal observation.

CLAIM CHANGE-009 PARTIAL points=2,6 tests=tests/services/calendar-cases.mjs#calendarChecks
GAP CHANGE-009: Point 3 restored emergency scheduling authority remains unproved; every unselected calendar obligation and all existing held dependencies remain owed.

Counts before and after: 28 DONE, 134 PARTIAL, 37 MISSING, 199 total. No status promotion is claimed. Contract status, Gap and Evidence cells are unchanged; generated views are unchanged. No policy default or new authority was introduced.

## Plan and completion

1. Read the full CHANGE-009 acceptance and live Status gap, calendar routes, calendar scope and ICS serializer, existing calendarChecks, its Worker principal adapter and runner, and Verify entry points. Read the supplied plan extract, ct rulings index, Linen rulings and DONE-RIDERS.
2. Map selected point 2 to missing per-request audit attribution, and point 6 to missing nonempty feed lifecycle coverage. Preserve point 3 restored emergency-authority work and the stated external holds. No other target is selected by this lease.
3. Extend existing calendarChecks, without registering a new test or changing runtime source. For both calendar doors compare audit rows before and after the request; require exactly one new row naming the actual workspace, current actor, action and target. Use distinct owner and operator principals in w1 and owner in w2, admitted by current D1 memberships.
4. Parse the actual ICS response into unfolded event records. Locate the real active maintenance window; retain its observed UID. Attempt operator deactivation, require 403 and unchanged successful history and entire feed. Deactivate as current owner, require its UID absent and every unrelated event byte-identical. Explicitly reactivate at the current revision, require the same UID and current sequence while preserving all unrelated events.
5. Run the touched service runner, typecheck and first-party check. Generate contract views and check them, restore both generated files from origin/main, regenerate source lock last and check it. Commit using fleet identity and preserved repository hooks. Fetch and rebase on main; no drift or rewritten commit resulted, and the committed lock check passed.
6. Inspect every candidate commit identity and trailer, check the changed test text for email addresses and publication-token hazards, push through the fleet guard, and verify the exact remote branch SHA. Open the one draft PR required by this repository's Verify triggers. Keep evidence outside the product tree and publish the explicitly selected actual packet on the separate evidence ref. Guarded landing, publication scan and main Run site belong to the fleet.

Completed plan rows: selected CHANGE-009 points 2 and 6 only. No full plan rebuild, no lane file writes and no contract judgment changes. New test registrations: 0. Removed, skipped or narrowed assertions: 0. No pin tests or duplicate tests encountered or deleted in this area.

## Frozen scoped rubric

| Item | Public behavior | Proof on candidate | Result |
| --- | --- | --- | --- |
| R1 | Calendar read audit binds workspace, current actor, read action and target | calendarChecks lines 5–15, 32, 59–61; actual D1 audit rows after native route requests | PASS local |
| R2 | Calendar export audit binds workspace, current actor, export action and target | calendarChecks lines 5–15, 48, 57–61; both owner and operator, plus a second workspace | PASS local |
| R3 | Feed includes a real active window and unrelated records | calendarChecks lines 63–72; real public-created maintenance and changes | PASS local |
| R4 | Owner deactivation removes that window without losing other events | calendarChecks lines 82–89; native update and subsequent JSON and ICS reads | PASS local |
| R5 | Explicit current-owner reactivation retains stable UID and other records | calendarChecks lines 90–97; current revision, same UID, current sequence | PASS local |
| R6 | Unsafe operator update is refused without successful history or feed changes | calendarChecks lines 73–81 | PASS local |
| R7 | The service journey is loaded by exact-head Verify | scripts/verify.mjs line 24 invokes tests/services/run.mjs; run.mjs invokes calendarChecks; Verify 42583652209 | PASS exact-head Verify |

The expected audit tuple is explicit and compared against all newly persisted audit rows, so omitted audit writes, a wrong actor, hardcoded workspace, wrong action or wrong target fail the journey. The lifecycle uses nonempty public-created records and an observed event UID: removing the active filter fails the inactive assertion, regenerating identities fails reactivation, and losing another event fails complete event-map comparison. These failure sensitivities are INSPECTED, not mutation-run receipts.

## Acceptance coverage and held remainder

| Acceptance sentence | Evidence and lines | Round disposition |
| --- | --- | --- |
| 1: current record scope on calendar and ICS | Existing calendarChecks lines 41–45, 55–58, 101–102 | Existing checks retained and pass in touched runner; no broader completion claim |
| 1: one generic warning without hidden record or count | Existing calendarChecks lines 41–45 | Existing assertions retained; unselected |
| 2: privileged reads and exports audited | New calendarChecks lines 5–15, 32, 48, 59–61 and lifecycle reads | Selected point closed locally; exact-head Verify recorded separately |
| 3: inactive restore requires explicit current owner reactivation | Existing tests/adoption/calendar-cases.mjs#checkArchiveCalendar lines 9–18 | Not rerun; unselected restore proof |
| 3: restored changes have no emergency scheduling authority | No passing restoration assertion supplied by this round | REMAINS OWED; prevents whole-clause DONE |
| 4: policy preserved and identity and free text erased without withdrawing freeze | Existing tests/adoption/calendar-cases.mjs#checkCalendarHistoricalErasure lines 21–35 | Not rerun; unselected, no new erasure claim |
| 5: stable UIDs and revisions | Existing refresh assertion lines 99–100; new same-window UID and sequence lines 90–97 | Preserved, only lifecycle delta claimed |
| 5: UTC seconds enclose the interval; escaped and folded text; tentative and cancelled states | Existing calendarChecks lines 49–54 covers some outcomes; full clause evidence extends beyond this lease | Unselected; no additional completion claim |
| 6: inactive windows absent from feed | New calendarChecks lines 67–97 | Selected point closed locally |
| 7: entries make no provider-execution claim | Existing tentative-state assertion line 51 and existing serializer route descriptions | Retained, unselected; no provider proof claimed |
| Inherited BASE-ACCESS-002 sessions | Clause already cites it; real D1 current-membership rechecks used by calendar runtime; native browser session proof unchanged | INSPECTED citation; no new credential or session capability |
| Inherited BASE-DATA-003 erasure | Clause already cites it; erasure source and tests unchanged | INSPECTED citation; held erasure duties not substituted |

## DONE-RIDERS assessment

This is a PARTIAL claim. PASS below refers to the selected delta only and never promotes the whole clause.

| Rider | Result | Evidence or limitation |
| --- | --- | --- |
| 1 | PARTIAL overall; selected points PASS locally | R1–R6 above; restored emergency-authority outcome remains owed |
| 2 | PASS selected | Real maintenance and change records; owner update succeeds and operator update is refused with no history or feed change; lines 67–97 |
| 3 | PASS exact-head CI | Verify 42583652209, pull_request, head 2f8b89f09def3e73bbd5ebfa24994fc8818b0f0d; the existing Verify command includes this runner |
| 4 | PASS source identity | No relevant source or test byte changed between successful local checks and the committed head; commit added only the tested file and generated lock |
| 5 | PASS citation, INSPECTED | CHANGE-009 cites BASE-ACCESS-002 and BASE-DATA-003 in CONTRACT.md; unchanged |
| 6 | PASS mechanical; judgments retained | Contract generator write and check exit 0; views then restored; no status, Gap or Evidence edits; clause stays PARTIAL |
| 7 | PASS, INSPECTED | No acceptance text or coverage rewrite; CONTRACT.md diff empty |
| 8 | PASS selected | Operator refusal 403; unchanged successful history and feed; current-owner deactivate and reactivate succeed, lines 73–97 |
| 9 | PASS boundary | No live provider, legal, native-device, restore or external-held completion claim |
| 10 | PASS, INSPECTED | No new policy default or authority; existing current-owner rule only |
| 11 | Pending guarded landing | Candidate remains branch-only; main equality, exact-tree scan and candidate Run site not established by cloud |

## Local results and probes

All commands below completed with exit 0. Actual outputs are selected into this packet, including an empty successful FIRST-PARTY.log.

- `node tests/services/run.mjs`: existing service journeys and new calendar assertions pass against the bundled production route handlers and real workerd D1. The existing test Worker supplies authenticated-principal contexts; this is not a new live-login or provider receipt.
- `pnpm typecheck`: pass. The supplied cloud toolchain uses Node 24.19.0 and pnpm 10.12.4; pnpm emits the existing exact engine-pin warning. RER selects project Node 22.20.0 for its own commands.
- `pnpm exec rer check --profile first-party`: pass.
- `node src/base/contract-docs.mjs write`, then `node src/base/contract-docs.mjs check`: both pass; both generated views restored from main before commit.
- `node scripts/edition-authoring/cli.mjs lock`, then its `check`: pass. Post-rebase committed-head check passes too.
- `git diff --check`, clean working tree, unchanged CONTRACT.md, fleet candidate identity and absent trailers: pass.

PROBE CHANGE-009 2: GET /change-calendar and GET /change-calendar.ics as current owner and operator in w1 and owner in w2 -> 200, exactly one new audit row naming the expected workspace, actor, action and global-calendar target per request.
PROBE CHANGE-009 6: POST /change-windows/:id and GET /change-calendar.ics -> operator update 403 with unchanged history and feed; owner deactivation succeeds with UID absent; explicit owner reactivation succeeds with same UID; unrelated events remain identical.
MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0.

Pre-READY self-check: selected named behaviors have assertions that inspect actual persisted audit rows and actual ICS events. Existing assertions are retained without new branches or width conditions. Authority and refusal are covered in the selected lifecycle; restore, erasure and replay source paths are untouched and no completion is inferred for their outstanding proof. No UI screen changes: browser widths, text size and tooltip audit are not applicable. Source lock is fresh. Changed test text contains no email addresses or new provider-shaped credentials. Publication scan is delegated to the maintained cloud lander under the cloud exception. No known local test failure or Verify repair exists.

## Custody and landing boundaries

Product push: verified `refs/heads/cloud/sx-linen-c-f47` advertises 2f8b89f09def3e73bbd5ebfa24994fc8818b0f0d. Draft PR 181 starts Verify because this branch is not in the repository's push trigger list. No workflow file changes or dispatches were needed.

Candidate publication scan: commit=2f8b89f09def3e73bbd5ebfa24994fc8818b0f0d; complete=false; historyScanned=not-run-in-cloud; findings=not-established. Full Git history is present. No COMPLETE or zero-findings scan is claimed. The maintained lander owns the exact-tree scan.

Main equality: false (unlanded). Baseline main e9aa94360d01ae5c8ae48557a61aca3c565f3236 had push Verify 42570589451 success and Run site 42570589486 success. Those runs are baseline health only, not candidate proof. Candidate Run site and main equality await guarded landing. No push or fast-forward of main is authorized or performed.

Retained holds: point 3 restored emergency authority; every other unselected calendar obligation; DESK-017, DESK-027 and DESK-028 maintained keyed-identity import port and coordinated legacy-marker migration; supplied ROLE-001 acting-role, revision reconfirmation and seat holds; all account, Base, device and other ct holds. No helper patch, reconstruction of erased values, audit-reader authority expansion, restore-policy change or provider execution is selected.

No runtime blocker was found for points 2 and 6. Whole-clause DONE is not claimed. See CHECKS.json for the final CI observation and product custody receipt.

## Terminal exact-head result

Verify 42583652209: event=pull_request; status=completed; conclusion=success; head=2f8b89f09def3e73bbd5ebfa24994fc8818b0f0d.
Run URL: https://github.com/just-every/run-linen/actions/runs/42583652209

Scoped rubric R7 and DONE-RIDERS row 3 now PASS: the existing Verify command loads the service runner containing calendarChecks on this exact head. All selected point 2 and point 6 assertions are proven. Local checks passed without a repair; no dispatch or rerun was made. GitHub calls used: 6 of 10.

CLAIM CHANGE-009 PARTIAL points=2,6 tests=tests/services/calendar-cases.mjs#calendarChecks
GAP CHANGE-009: Restored emergency scheduling authority in point 3 and all unselected obligations remain owed. Contract cells and all existing holds are unchanged. Counts remain 28 DONE, 134 PARTIAL, 37 MISSING.

The product is ready for the maintained lander's independent publication scan and guarded landing. This receipt does not claim main equality, a completed cloud publication scan or candidate Run site. Product branch and exact head have been observed at origin; the report-only evidence transport does not modify that head or signal product landing.
