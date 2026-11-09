# sx-linen-c-f46 — CATALOG-007 value lifecycle proof

Repository: https://github.com/just-every/run-linen
Branch: `cloud/sx-linen-c-f46`
Candidate: `04d12f2c167ccd5f32d76dd3c0e4734c9f131aea`
Base before push: `e9aa94360d01ae5c8ae48557a61aca3c565f3236`
Draft PR: https://github.com/just-every/run-linen/pull/179

CATALOG-007 remains PARTIAL. The selected remainder of acceptance point 1 is locally proven. Acceptance point 8 still lacks native-restore proof that reviewed facts survive without a live binding. No acceptance wording, Status, Gap, Evidence, generated view, source pin, workflow, authority or UI was changed. Counts remain 28 DONE, 134 PARTIAL and 37 MISSING before and after this round.

## Plan and results

1. Read the supplied plan extract, standing rulings and DONE-RIDERS, the repository instructions, full CATALOG-007 acceptance and live Gap, the audience routes and evaluator, the existing catalogAudienceChecks journey and its Worker adapter. The live Gap named rename, never-delete and native restore. This lease selects the first two, while the supplied native-restore and wider holds stay outside the lease.
2. Extend the existing journey without adding a test registration. Use the already reviewed, bound Support person, a configured audience and an already submitted bundle with a real monitor snapshot. Read all three through public routes before changes. Refuse HR rename, rename as owner at the current revision, read back stable ID and label, then attempt actual DELETE. Verify the value and all references remain unchanged. Retire at the returned revision, preserve the existing person, item, submitted snapshot, discovery and a new submission by the existing match; refuse a new person review and an item audience selection of the retired value without state or revision changes.
3. Give the existing Worker request adapter an optional explicit HTTP method, preserving its default GET and POST behavior. Run setup through cloud_run, preserve repository hooks with fleet cleanup, generate and check contract views, restore the main views whole, relock source last, and commit. Run the touched work runtime, typecheck and first-party check. All passed. Fetch main and rebase immediately before the candidate push; main was unchanged, rebase reported up to date. Repeat contract generation and source lock checks, with a clean checkout.
4. Audit every candidate commit and message including side parents, check added strings and diff hygiene, push the named product branch through the fleet guard, open the draft PR as the repository's pre-main Verify entry point, observe exact-SHA CI with one watcher at five-minute intervals, and return reports through the separate evidence ref. The first product push succeeded. No main push, force push or published-history rewrite occurred.

The cloud adaptation's explicit instruction to create the branch from main governed the older pinned-base continuation instruction. The prior branch was fetched as requested. The continuation report said it had no additional product edits. No other writer's main commit was removed.

## Selected proof rubric

Every row is exercised by `tests/work/application-cases.mjs#catalogAudienceChecks`, invoked by `tests/work/runtime.mjs` through its real Miniflare Worker and D1 storage. Fixture writes seed native people and memberships; assertions use the public routes rather than a helper pretending that a route worked.

| Row | Outcome | Evidence on candidate | Local result |
| --- | --- | --- | --- |
| S1 | Referenced value has real reviewed-person, item and submitted references before mutation | Lines 325–335: GET people, GET catalog and GET submitted catalog requests; explicit stable value ID and reviewed person revision checks | PASS |
| S2 | HR review authority cannot rename a value | Lines 338–339: current-revision POST as HR returns 403 and subsequent GET is unchanged | PASS |
| S3 | Current owner renames the same stable value and reads the new label and revision | Lines 340–343: POST value edit, then GET value list and exact same ID, label and revision assertions | PASS |
| S4 | Rename preserves person, item and submitted references and existing eligibility | Lines 344–345: complete public readbacks equal baseline; employee catalog still contains the item | PASS |
| S5 | DELETE is refused without value or reference loss | Lines 346–349: actual DELETE returns 404; value and all three references read back unchanged | PASS |
| S6 | Retirement preserves stable identity, label and all references | Lines 350–354: current-revision POST active=false; GET retains ID and label, advances revision, and full references equal baseline | PASS |
| S7 | Existing matches remain eligible after retirement | Lines 355–357: employee discovery retains the item and public fulfilment POST succeeds | PASS |
| S8 | New selections of the retired value refuse and change nothing | Lines 358–363: new person review and item audience POST return 422; people list, item audience and revision are unchanged | PASS |

The exact probe output is retained in `PROBE.txt`. It records value-list revision 2 and DELETE status 404, then retirement and both new-selection refusals. No production route needed modification; its existing behavior passes the additional proof.

## Acceptance and retained boundaries

| Acceptance point | Round disposition |
| --- | --- |
| 1 | Selected value rename and never-delete remainder closed locally by S1–S8. Existing native editor and other value-list behavior were preserved, not newly claimed from this API-only round. |
| 2 | Existing reviewed-person and pending-person authority proof retained. No new authority or integration write door. |
| 3 | Existing dimension matching, unknown-fact and erasure exclusions retained in the runtime journey; no new completion claim. |
| 4 | Existing discovery assertions retained; renamed and retired references also explicitly retain eligibility. Wider doors are unselected. |
| 5 | Existing filer and beneficiary checks retained; no owner audience bypass introduced. |
| 6 | Existing atomic drift and rollback checks retained; no production transaction change. |
| 7 | Existing snapshot assertions retained; new readbacks prove rename, deletion refusal and retirement do not rewrite submitted references. |
| 8 | Native-restore facts without live binding remain unproved. Other audit and erasure assertions are preserved. This clause is PARTIAL. |

Retained external and policy boundaries: supplied ROLE-001 acting-role, revision reconfirmation and custom-seat hold; mapped Slack and M365 approval and consent requirements; native mobile devices; live mail receipt; all account, ct and Base holds. Nothing in the round replaces those receipts, changes a ruling or creates a new catalog door. No new policy default was adopted. The lease's held remainder is not a reason to discard the completed selected proof.

## DONE-RIDERS

| Rider | Result | Exact evidence or limitation |
| --- | --- | --- |
| 1 | Selected slice PASS; entire clause remains PARTIAL | S1–S8 perform all selected outcomes. Point 8 native restore remains unproved. |
| 2 | PASS for selected data-preservation behavior | Real reviewed person, item and submitted snapshot are nonempty; supported rename and retirement succeed, HR rename and DELETE refuse, references stay exact. |
| 3 | PASS | Exact-SHA pull_request Verify run 42579290465 loads Service desk and lifecycle through scripts/verify.mjs, which invokes tests/work/runtime.mjs. Completed successfully on the exact SHA, observed 2026-11-09T07:41:16Z; recorded in CHECKS.json. |
| 4 | PASS locally | Work runtime and checks ran on the committed candidate. The final fetch and rebase changed no bytes or SHA; no subsequent product edits. |
| 5 | INSPECTED | CATALOG-007 already declares Rules D-1 and inherits from CATALOG-001. No inheritance text or public door added. |
| 6 | PASS mechanically; cells retained by rule | Contract write reports zero files changed; contract check passes. Status counts and cells are main's exact bytes. The builder cannot update the Gap cell; this report records the reduced proof gap for the lander. |
| 7 | PASS | CONTRACT.md, acceptance points and generated views unchanged; no rewrite or new point. |
| 8 | PASS for touched authority | HR current-revision rename returns 403 and changes no value; owner rename and retirement work. Existing scoped, revoked-membership, erasure and replay assertions also pass in the work runtime. |
| 9 | PASS boundary | No provider, native-device, retention or live-mail completion asserted. Native restore remains explicitly unproved. |
| 10 | NOT APPLICABLE | No new policy choice, default or ruling requested. Existing owner-only routes retained. |
| 11 | PENDING guarded landing | Product is branch-only. Exact candidate publication scan, main equality and Run site are fleet duties; no landing or count promotion claimed. |

## Pre-handoff self-check

1. The selected positive behavior and data-preserving refusal paths are asserted through public routes. The existing journey runs in Verify; no outside-Verify or screen flag was added. Exact-SHA pull_request Verify 42579290465 completed successfully, as recorded in the receipt.
2. No existing assertion was deleted, narrowed, skipped or placed behind a width or branch condition. The old retirement write now uses the renamed value's current revision; its matching and new-review refusal assertions remain and are strengthened. New test registrations: zero. No pin or duplicate tests were added.
3. The full touched work-runtime file passed its existing revoked-membership, erased-person and replay denials. This change touches only tests and their request adapter, not credential or data authority source.
4. Touched screens: none. No UI, copy, tooltip, layout or icon controls changed, so no new browser proof or design work was needed for this API proof lease.
5. Source lock is fresh. Contract generation and check pass; generated views were restored to main and are not committed. No migration changed, so migration ledger is not applicable. The cloud does not claim a full-history publication scan or exact-main Run site receipt. No new email-shaped or credential-shaped fixture string was added. The complete product diff was reviewed for accidental bare repository-like prose tokens; newly added slash paths are real public route paths.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0.

## Custody and CI

Product push: guard exited 0 on its first attempt and printed PUSH_OK. One candidate commit, fleet author and committer, no trailers, all candidate parents inspected. Full history was cloned. The product diff has only two existing test files and the generated source lock (42 added lines, 5 removed lines). No fleet report is in the product tree.

Baseline main Verify push 42570589451 and dispatch 42569311484 were successful on e9aa94360d01ae5c8ae48557a61aca3c565f3236; Run site 42570589486 was successful on the same main SHA. These are baseline receipts, never substituted for candidate CI.

Candidate Verify: 42579290465, event pull_request, head 04d12f2c167ccd5f32d76dd3c0e4734c9f131aea. Completed successfully, observed 2026-11-09T07:41:16Z, and recorded in CHECKS.json. No workflow edited, dispatched or rerun. The PR was the configured pre-main entry point.

Publication scan exact candidate: commit=04d12f2c167ccd5f32d76dd3c0e4734c9f131aea complete=unestablished historyScanned=unestablished findings=unestablished. Cloud branch publication is authorized without that scanner; the fleet must run the COMPLETE full-history scan before landing. Candidate main equality=false; exact-candidate Run site=pending guarded landing.

Plan rows changed for return: CATALOG-007 selected point-1 rename and never-delete proof complete; clause stays PARTIAL, counts unchanged. No other plan row or held item changed. Product blockers: none observed locally. The retained point-8 proof gap prevents a whole-clause DONE claim.

CLAIM CATALOG-007 PARTIAL points=1 tests=tests/work/application-cases.mjs#catalogAudienceChecks
GAP CATALOG-007: Acceptance point 8 native restore retaining reviewed facts without a live binding remains unproved; unselected audience acceptance and supplied holds remain unchanged.

## Final receipt

Verify run 42579290465: event=pull_request status=completed conclusion=success head=04d12f2c167ccd5f32d76dd3c0e4734c9f131aea. The single watcher used three five-minute observations after discovery; GitHub calls total 7 of 10, including the PR creation and a corrected initial baseline discovery. No failed run, repair or rerun occurred.

Git remote readback confirms refs/heads/cloud/sx-linen-c-f46 holds the same full SHA. Product checkout is clean and full history is present. Reports remain outside the product tree. Evidence is published only to refs/heads/evidence/sx-linen-c-f46 by the separate entrypoint. The product clone is removed after successful transfer, retaining this actual packet locally.

READY branch=cloud/sx-linen-c-f46 head=04d12f2c167ccd5f32d76dd3c0e4734c9f131aea
