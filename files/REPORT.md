# sx-linen-c-f64 report

Product repository: just-every/run-linen. Branch: cloud/sx-linen-c-f64.
Candidate: 15057928c4110f322805414c414db1a8def2fa47.
Base main at integration: 8cbb5da69a36002c032436b861772e8fb3f6247e.
Draft PR: https://github.com/just-every/run-linen/pull/192.

CLAIM DESK-015 PARTIAL points=6,8 tests=tests/work/desk-scenario-cases.mjs#deskScenarioChecks; tests/ui/desk-console-journeys.mjs#deskScenarioJourney
GAP DESK-015: Selected point 6 built-in HR field and status proof and point 8 responsive console execution are closed. Watchers remain under DESK-007 and native apps under CHANNEL-005 with the held developer accounts and devices. Unselected acceptance and the supplied custom-role, delegated administration, custom-HR, channel accounts, mapping, consent and sandbox notification prerequisite holds are unchanged. This responsive proof grants no new HR authority and certifies no native device.

Counts before and after: 31 DONE, 131 PARTIAL, 37 MISSING, 199 clauses. DESK-015 stays PARTIAL; no Status, Gap or Evidence cell changed. The plan extract is read-only and has no target table row; its DESK-015 selected-points entry now has both native proof gaps closed. No other plan row is changed or claimed.

## Work and proof

The complete execution plan is PLAN.md. The product commit extends two existing journeys and regenerates sources.lock.json. No runtime behavior, workflow, Base pin, branding, clause text or generated view changed. No test registration was added or removed and no existing assertion was removed, narrowed or placed behind a width condition. No duplicate or pin test was encountered in the touched scenario flow.

Point 6 now uses owner-maintained HR department configuration, explicit built-in HR membership and an HR-sensitive incident through public routes. HR changes a populated Office field and pauses, resumes and closes the ticket with the normal resolution code. Each run is read back through the history endpoint with the exact original field and state before and after values, current actor, scenario identity and timestamp. A scenario containing a forbidden classification step returns 403 and leaves the full ticket, messages, desk and run history unchanged. Existing classification and task-plan role refusals remain present.

Point 8 starts a fresh ticket run through keyboard x and the native scenario picker at innerWidth 390, then starts a fresh two-ticket bulk run at innerWidth 390. Neither substitutes screenshots of a desktop-started run. Public reads prove category, priority, group, state, private note, linked local task plan and one attributed before and after audit per ticket. Reloads preserve those audits. The existing desktop shortcut reference and history assertions remain; the screenshot helper captures the same end states once at 1440 and 390. All four selected ticket and bulk captures were visually inspected. No horizontal overflow or browser page error was observed.

A first local browser attempt timed out because the existing desktop keyboard reference was asserted while its queue was hidden on the phone ticket screen. The preserved assertion now runs at its original desktop width after phone execution and persistence are proved. The next full focused journey passed. No production change or CI repair was needed.

## Acceptance proof map

These rows distinguish the selected lease from existing behavior. Only points 6 and 8 are claimed by this run; the broader clause is not promoted.

| Point | Door and outcome | Test evidence at candidate | Result |
| --- | --- | --- | --- |
| 1 | Group scenario changes classification, group, pause and private note; requester gets no note | deskScenarioChecks, tests/work/desk-scenario-cases.mjs lines 19 to 53 | Existing runtime PASS; unchanged scope |
| 2 | Outside-group list omission and direct run refusal | deskScenarioChecks lines 31 to 41 | Existing runtime PASS; unchanged scope |
| 3 | A forbidden role step applies nothing | deskScenarioChecks lines 55 to 70 and 125 to 137 | Runtime PASS with populated HR control |
| 4 | Author, group and workspace saving and offering rules | deskScenarioChecks lines 19 to 35 and later author-plan checks | Existing runtime PASS; no expanded role claim |
| 5 | Existing classification, group, custom field, message and status doors | deskScenarioChecks lines 139 onward; HR status matrix lines 96 to 123 | Runtime PASS; unselected broader obligations unchanged |
| 6 | Built-in HR field changes and all three status commands, plus forbidden-step no-change refusal | deskScenarioChecks lines 88 to 138 | Selected proof PASS |
| 7 | Fixed-order run and honest partial audit after data refusal | deskScenarioChecks existing missing-close-code and invalid-plan cases | Existing runtime PASS; unchanged scope |
| 8 | Fresh native ticket keyboard run and two-ticket bulk run started at 390; persisted outcomes and audits | deskScenarioJourney, tests/ui/desk-console-journeys.mjs lines 273 to 331 and 403 to 431; loaded by tests/ui/browser.mjs line 585 | Selected proof PASS; native-device duty retained |

## Inherited duty boundaries

| Duty | Evidence or retained boundary | Result |
| --- | --- | --- |
| DESK-001 group and bulk rules | Existing scoped group and bulk checks preserved; new bulk uses ordinary endpoint | Local PASS |
| DESK-010 field values | Populated dropdown field written and read through ticket field and desk routes | Local PASS |
| DESK-023 close requirements | HR closes with required resolution code; existing no-code stopped-run assertion preserved | Local PASS |
| DESK-008 note privacy | Existing requester exclusion and canned response assertions preserved | Local PASS |
| DESK-007 watchers | No watcher expansion or provider proof in this lease | Retained outside selection |
| CHANNEL-005 native mobile | 390 px console execution does not certify native apps or physical devices | UNMET-EXTERNAL |
| ROLE-001 | Explicit existing HR membership only; no custom role or delegated administrator change | No expanded authority |
| SANDBOX-003 and NOTIFY-002 | No sandbox or notification-rule work selected | Retained prerequisite |

## DONE-RIDERS review

| Row | Result | Evidence or remaining condition |
| --- | --- | --- |
| 1 | PASS for selected points; clause PARTIAL | HR matrix and real phone runs perform and inspect named outcomes; whole-clause duties remain named above |
| 2 | PASS | Populated HR field and real persisted audits, allowed HR path and forbidden classification with unchanged state; untouched bulk tickets asserted before run |
| 3 | PENDING CI | Exact-head pull_request Verify 42616876267 invokes tests/work/runtime.mjs and tests/ui/run.mjs through existing scripts/verify.mjs |
| 4 | PASS | RECEIPT.json binds relevant committed file hashes; no relevant source or test changed between passing local proof and commit |
| 5 | INSPECTED | Existing clause names its field, status, group, watcher and native-mobile duties; no inheritance or acceptance text changed |
| 6 | PASS mechanical | Contract write and check exit 0; generated views restored from main; judgments and counts unchanged |
| 7 | PASS | CONTRACT.md and acceptance points unchanged; no rewrite or new policy default |
| 8 | PASS for selected authority | Explicit built-in HR member succeeds on an HR-readable ticket, forbidden classification refuses with no state or audit change; existing task-plan refusal preserved |
| 9 | PASS boundary honesty | No provider, legal or device proof claimed; native apps and held accounts remain owed |
| 10 | PASS | No new custody, consent, spending or authority default introduced |
| 11 | PENDING guarded landing | Candidate is branch-only; fleet owns exact-tree publication scan, main equality and Run site at landing |

## Checks and custody

All actual commands and their exit codes are in RECEIPT.json, with complete corresponding non-secret check logs explicitly selected for evidence publication. Work runtime, focused scenario browser, typecheck, RER build, first-party check, contract generation and source integrity checks passed. Browser setup uses the existing isolated Worker runner and a temporary driver copied from the canonical browser's setup and API adapter; it calls the committed deskScenarioJourney. Canonical Verify continues invoking the full tests/ui/browser.mjs.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check, then restore generated views from origin/main exit=0; ledger=none exit=0

PROBE DESK-015 6: POST /work-scenarios and POST /work/:id/scenario-runs as an explicit built-in HR member -> Office changes and pause, resume and close persist with one attributed before and after audit per run; forbidden classification returns 403 with no change.
PROBE DESK-015 8: native keyboard ticket run and fresh two-ticket bulk run at innerWidth 390 -> persisted category, priority, group, state, private note, local task plan and actor audits survive reload; ticket and bulk end states inspected at 1440 and 390.

Pre-ready checks: selected behaviors have public-door assertions that fail on missing or wrong output; all prior assertions remain; existing runtime revoked-membership, erasure and replay checks passed; no product authority or UI source changed; screenshot helper's overflow and keyboard checks passed. Source lock is fresh. No added email-shaped string or co-author trailer was found in the product diff. The complete history of candidate commits was checked for author, committer and trailers before product push; both identities are fleet and trailers are absent.

The first real product commit was pushed immediately through cloud-push.py and succeeded on attempt 1. Current main at initial inspection had successful Verify runs 42614672051 (push) and 42612972689 (dispatch), plus Run site 42614672049 at base 8cbb5da69a36002c032436b861772e8fb3f6247e. Candidate Verify 42616876267 was discovered on exact SHA 15057928c4110f322805414c414db1a8def2fa47 and is recorded separately in candidate-ci.jsonl. No workflow dispatch or rerun was requested.

Publication scan receipt: commit=15057928c4110f322805414c414db1a8def2fa47; complete=not established in cloud; historyScanned=not established; findings=not established. Full-history scan and exact-main Run site remain guarded lander duties. Main does not yet equal the candidate. Evidence publication is report custody only and signals neither landing nor whole-clause acceptance.

## Final cloud handoff

PUSHED branch=cloud/sx-linen-c-f64 head=15057928c4110f322805414c414db1a8def2fa47

At the final permitted status observation on 9 November 2026 at approximately 12:36 UTC, exact-head pull_request Verify 42616876267 remains in_progress with no conclusion. Two status polls were separated by at least 300 seconds after initial discovery; one watcher made five GitHub API calls in total, including initial main inspection and draft PR creation. No failed job is reported or guessed, and no workflow was dispatched or rerun. This cloud handoff is PUSHED, with no CI-green claim. Required exact-SHA Verify, the full-history publication scan and eventual main Run site remain with the maintained fleet.

The complete report, plan, actual receipts, logs and four screenshots were published to the separate evidence ref. An exact-head round-trip fetch of the initial evidence packet restored all manifest-verified files and bound them to product SHA 15057928c4110f322805414c414db1a8def2fa47. The final evidence publication updates only reporting custody with the last observed pending CI state. Evidence never supplies a product READY or landing signal. The product checkout remains unchanged and will be removed after final evidence publication, as required.
