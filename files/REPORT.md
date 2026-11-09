# sx-linen-c-f35 — DESK-024

Candidate: 6e0f4ce6652fd99a8a3ece6c182e1ebe3aa6002e  
Branch: cloud/sx-linen-c-f35  
Repository: just-every/run-linen  
Draft PR: https://github.com/just-every/run-linen/pull/170  
Parent main: f9dcb5212d7beca66a3c926de9bcf4c2b4f56812

The two leased proof gaps are closed locally. The candidate replays the unfinished proof from db0229b015806e49a9dedd3695184335e1dbd7a1 onto fresh main without importing its old ancestry or discarding newer writers' changes. Only the source lock conflicted; main's lock was taken whole and regenerated. No product implementation needed modification.

## Plan and results

1. Read the supplied plan, rulings, builder rules and all eleven DONE riders; inspect the live clause and Status gap. The live gap named exactly stale handoff refusal and preservation of submitted forms. Other acceptance outcomes already have retained public-door journeys.
2. Replay the predecessor's department test extension and test Worker's structured error code. Keep the newer main's employment-attribute exclusion checks. No contract text or Status cell changes.
3. Submit a Facilities service form through the fulfilment route with six typed fields: text, number, false checkbox, selection, leap-day date and text area. Read the public catalog-request snapshot, change the live item's questions and estimates, and hand the same ticket to IT as the current owner.
4. Compare the complete original catalog-request response as both receiving staff and requester. Retry a move back using the pre-move revision; require 409 revision_conflict and identical ticket, messages, attachments, frozen snapshot and successful handoff history.
5. Run the touched work runtime, typecheck and first-party checks. Run the existing department browser journey with behavioral assertions at 1440 and additional screenshot-only captures at 390. Browser passed, closed its contexts and disposed its own Worker.
6. Generate contract views, check them, restore both generated files from main, regenerate the source lock last, and check it. Commit, fetch main and rebase before first publication. Main was unchanged. Repeat the mechanical checks on the committed candidate; tree remains clean.
7. Push only the named product branch with the fleet guard, create the draft PR needed by this repository's Verify entry point, inspect exact-SHA CI, publish this report packet separately and remove the disposable product clone once custody and evidence publication are confirmed.

Product diff: 34 added lines in the existing departmentSpaceChecks journey, one test-Worker error serialization change, and the regenerated source lock. No new test registration, no removed or narrowed assertion, no workflow change, no dependency or Base pin change, no migration and no generated view committed.

Before and after committed counts: 24 DONE, 138 PARTIAL, 37 MISSING, total 199. Proposed gate result for DESK-024 only: PARTIAL to DONE; after the lander applies it, 25 DONE, 137 PARTIAL, 37 MISSING. No plan file or contract status cell was edited. The report return updates only the DESK-024 campaign row; no other queued or held work is selected.

## Public-door probes

PROBE DESK-024 1: owner POST to the ticket department route at the current revision -> one successful IT handoff; owner retry with the pre-move revision -> 409 revision_conflict, identical ticket, messages and successful handoff history.
PROBE DESK-024 2: employee POST to the ticket fulfilment route with six nonempty typed answers, GET catalog-requests, owner edit of the live catalog form, owner handoff to IT -> receiving staff and requester read the identical original item revision, questions, answers, cost and delivery estimate; stale retry changes none of them.

The item revision also versions its form; there is no separate independent form-revision field. Whole-response equality covers all frozen fields, not a subset. The false checkbox is a deliberate typed answer. The supported move and refused stale retry exercise both sides of the data-preservation boundary.

## Acceptance coverage

Paths and lines refer to the exact candidate. PASS LOCAL means executed through the public routes in the focused work runtime or department browser. INSPECTED means retained source was read and remains in the existing Verify suite; it is not a new local execution claim. The exact candidate Verify result is recorded separately below.

| Point | Acceptance sentence and public outcome | Test and lines | Local result |
| --- | --- | --- | --- |
| 1 | Facilities to IT keeps history; owner only; current revision; audited reason | tests/work/department-space-cases.mjs, departmentSpaceChecks, lines 119–150: nonowner refusal, empty reason refusal, successful current owner move, one audited handoff and stale refusal preserving all state | PASS LOCAL |
| 2 | Identity, messages, attachments, sensitivity, submitted forms and frozen SLA remain; incompatible assignment cleared | departmentSpaceChecks lines 88–148; tests/work/department-ops-cases.mjs, departmentOpsChecks lines 87–105; tests/ui/department-browser.mjs lines 172–180 and 202–224: same ticket and public and private history, attachment reads, frozen policy and due time, complete submitted snapshot, incompatible HR assignee cleared and valid destination assignment | PASS LOCAL |
| 3 | HR source remains a live restriction through later and legacy moves | departmentSpaceChecks lines 162–213, including second HR workspace, both required independently and inactive source refusal; department browser HR to IT journey | PASS LOCAL |
| 4 | Nonowner requires destination plus every retained HR membership; requester and beneficiary retain their public view | departmentSpaceChecks lines 130–180 and later multi-HR checks; departmentOpsChecks lines 123–150, requester scenario, completion and waiver refusals; department browser dual membership grant and withdrawal | PASS LOCAL |
| 5 | HR-service membership grants no HR employee-record authority | departmentSpaceChecks sensitive HR-record read refusal; tests/ui/department-browser.mjs lines 151–160 and 184–186, HR-service and dual-service members refused the HR record | PASS LOCAL |
| 6 | Managers, shares, participants and MCP queue grants cannot recover HR work; ordinary non-HR public relationships continue | departmentSpaceChecks manager and share exclusions, lines 50–86 and 151–180; tests/work/relationship-cases.mjs, relationshipChecks and sharingChecks public-only participant and normal sharing flows; tests/platform/mcp-tools-cases.mjs, mcpToolCases lines 210–242, matching HR, IT and legacy queue grants still return not_found and zero search counts | Native relationship cases PASS LOCAL; retained MCP cases INSPECTED pending candidate Verify |
| 7 | Withdrawal applies before staff reads, writes, assignment, scenarios, tasks, knowledge, derived views and aggregation; no protected HR copy to global project | departmentOpsChecks lines 105–172; tests/work/department-report-cases.mjs, departmentReportChecks lines 24–51; tests/services/department-source-cases.mjs, departmentSourceChecks lines 22–63, allowed then revoked derived service and plan access | Work cases PASS LOCAL; retained service cases INSPECTED pending candidate Verify |
| 8 | Archives retain metadata and restrictions and restore memberships inert until owner reconfirmation | tests/platform/base-auth-transfer.mjs, native archive and recovery, lines 244–251 and 312–328: real export, reset and import, protected history, inert memberships, fresh staff sign-in denied; tests/adoption/platform-privacy-cases.mjs, platformPrivacyChecks lines 14–27, own membership erased while foreign membership retained | INSPECTED pending candidate Verify |

## Inherited duty coverage

| Duty | Receiving clause and proof | Result |
| --- | --- | --- |
| D-4 department boundary and retained HR restriction | DESK-024 names D-4 in its meta line. Its own points 3–8 retain current department authority, source HR requirements, employee-record exclusion and inert restores. The acceptance matrix above names each public door. Existing other-clause duties remain with their receiving clauses; no delegated role or provider authority was added. | Native work and browser PASS LOCAL; retained archive and MCP coverage await candidate Verify |
| CATALOG-001, CATALOG-007 and CATALOG-008 inherited form, audience and exact quote readers on existing department doors | tests/work/application-cases.mjs, applicationChecks and catalogAudienceChecks; tests/work/catalog-quote-cases.mjs, catalogQuoteChecks; department browser lines 231–252 require a quote, deny receiving staff quote access and deny audience bypass. No quote-reader expansion. | PASS LOCAL |
| Frozen clock and ordinary assignment semantics | departmentSpaceChecks frozen policy and due time; departmentOpsChecks repeated classification after move retains its bound clock; browser uses a permitted IT agent and clears incompatible HR assignment. | PASS LOCAL |

## DONE-RIDERS

| Row | Result on candidate | Evidence |
| --- | --- | --- |
| 1 | Local outcomes covered; exact-SHA Verify pending | Eight-point matrix. The only two previously named gaps are executed in departmentSpaceChecks, lines 88–150. |
| 2 | PASS LOCAL for changed data-preservation boundary | Real submitted form, changed live catalog, successful move, then unsafe stale move refused with complete unchanged reads. No empty-list-only proof. |
| 3 | Pending exact-SHA Verify | scripts/verify.mjs lines 15 and 32 invoke work runtime and department browser. The workflow uses these existing journeys; nothing is hidden behind a new test flag. Screenshot capture alone is optional. |
| 4 | PASS | Source hashes in checks-receipt.json match the committed candidate. Candidate runtime rerun has its own runtime-receipt.json. Relevant application and browser sources are unchanged since the local captures. |
| 5 | PASS INSPECTED | DESK-024 cites D-4 and its own acceptance names the retained duty. No inherited obligation is silently removed. |
| 6 | PASS mechanical; status update belongs to lander | Contract generator write and check both exit 0, then generated views restored whole from main. No Status, Gap, Evidence or summary edit in candidate. |
| 7 | PASS INSPECTED | No acceptance text, rider, coverage map or ruling changed. |
| 8 | PASS LOCAL for touched authority boundary | Nonowner handoff 403, missing reason 400, current owner succeeds, stale owner revision 409 with unchanged state. Existing HR staff grant and withdrawal checks still pass. |
| 9 | PASS scope | No provider, legal, real device, licensing, delivered notification or broader role completion claimed. This clause's native handoff is independent of those held clauses. |
| 10 | PASS scope | No new policy default. Existing owner-only handoff, exact quote readers and every retained HR requirement remain. Supplied ROLE-001 holds are unchanged. |
| 11 | PENDING GUARDED LANDING | Main still equals parent main, not candidate. Candidate scan, main equality and resulting Run site are fleet duties and not fabricated here. |

## Pre-ready checks

1. The changed stale-refusal and submitted-form outcomes have real public-route assertions against populated data and both allowed and refused paths. Relevant sources are committed unchanged.
2. No existing assertion removed, narrowed, skipped or placed behind a width or branch condition. Test-registration delta is zero.
3. Revocation, erasure and replay remain exercised by the existing work runtime, including department withdrawal and erased staff. Archive restoration and MCP retained-HR denial remain in Verify.
4. No screen source changed. Browser proof uses the existing look, native controls and tooltips; handoff actions have text labels. Handoff and retained-history screens captured at 1440 and 390. No new icon-only control, typography, border or configuration placement introduced.
5. Source lock fresh. First-party and typecheck pass. Candidate exact-SHA Verify and publication scan are reported honestly below. Added test fixture content contains no email-shaped string or provider-shaped key. No secrets or environment dumps included in selected evidence.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check, restored generated files exit=0; ledger=none exit=0.

## CI and custody

Initial main f9dcb5212d7beca66a3c926de9bcf4c2b4f56812:
- Verify 42550063380, push, completed success.
- Verify 42548823483, workflow_dispatch, completed success.
- Run site 42550063451, push, completed success.
- No red main repair was needed.

Candidate push succeeded with cloud-push.py. All candidate authors and committers are the fleet identity; no trailers. Full history retained for fleet scanning. Draft PR 170 is the existing repository's branch Verify entry point. The initial immediate discovery returned no rows; the next discovery obeys the five-minute interval. No workflow dispatched or rerun.

Publication scan receipt: commit=6e0f4ce6652fd99a8a3ece6c182e1ebe3aa6002e complete=UNESTABLISHED historyScanned=UNESTABLISHED findings=UNESTABLISHED. Cloud branch pushes are exempt from running the fleet publication scanner. A COMPLETE zero-finding result is owed by the guarded lander, along with candidate main equality and Run site. These are not counted as local successes.

No product blocker or new policy default was found. All pre-existing ROLE-001, delegated administration, custom HR, account, Base and device holds remain in their own clauses. No additional campaign target touches this narrow leased change without entering the supplied held queue.

Final CI, claim and terminal custody are appended after the candidate's permitted discovery. Complete packet files are explicitly selected for report-only publication; credentials, environment files, private held-out gates, raw browser Worker log and symlinks are excluded.

## Exact-candidate local receipts

Build: npx -y @runeditrun/rer build, exit 0, head 6e0f4ce6652fd99a8a3ece6c182e1ebe3aa6002e.

Work runtime: node tests/work/runtime.mjs, exit 0, head 6e0f4ce6652fd99a8a3ece6c182e1ebe3aa6002e, both DESK-024 probes and the final runtime success marker present. Typecheck and first-party check exited 0. Mechanical checks were repeated after the pre-push rebase and left a clean source tree.

Browser: the existing department journey passed; all original assertions stayed at 1440 pixels. Five clause screens have full-page captures at both 1440 and 390 pixels, and viewport captures accompany them. The evidence-only copy adds capture at 390, with no assertion removed or moved. Original committed browser source hashes match checks-receipt.json.

Candidate Verify discovery: run 42556740045, pull_request, head 6e0f4ce6652fd99a8a3ece6c182e1ebe3aa6002e, in_progress at 03:35 UTC. Dynamic PR run 42556736780 completed success. The next status read is at least five minutes after discovery.
