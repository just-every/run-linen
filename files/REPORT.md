# sx-linen-c-f41 — CATALOG-007 selected proof

Repository: just-every/run-linen. Branch: cloud/sx-linen-c-f41.
Candidate: d74f73698b54a5b855ad90dae60de79fb9123ae7. Base: fcc2e53de937ab2ae17938147920b871b5fe70f5.

CATALOG-007 remains PARTIAL. This round closes acceptance point 1’s missing rename and never-delete proof only. No clause status, Gap, Evidence, acceptance text or generated view changes are proposed. Counts before and after: 27 DONE, 135 PARTIAL, 37 MISSING, 199 total. No new test registration; catalogAudienceChecks remains one existing sanity journey. No assertions were removed, skipped or narrowed. The old retirement call now follows an asserted rename and uses the resulting current revision. No pin tests or duplicate registrations were encountered or deleted.

The full plan is PLAN.md. The selected plan row is CATALOG-007: mark its value rename and never-delete proof extended on this candidate, keep PARTIAL and retain the native-restore facts-without-live-binding gap. Every supplied unselected audience, role, approval, account, ct, Base, provider and device hold remains unchanged. No new policy default, door or authority was introduced.

## Changes and public-door results

Only tests/work/application-cases.mjs, tests/work/runtime.mjs and their generated source lock hashes change. Runtime api accepts an explicit HTTP method while retaining its prior default method selection for every existing caller. Actual production routes are bundled into the existing test Worker with authenticated-principal fixture plumbing and persistent D1. No substitute catalog implementation or handler is added.

The journey creates a real support member and reviewed bound person, uses an audience-controlled catalog item and submits a request before touching the referenced value. Its reference baseline is read through GET /people, GET /catalog and the submitted catalog-request history route, with nonempty stable-value and person revision checks. The exact value is read through GET /catalog-values. No source-table edit drives the selected behavior.

| Selected outcome | Proof in tests/work/application-cases.mjs, catalogAudienceChecks | Result |
| --- | --- | --- |
| Referenced person, item and submitted request exist | 325–338 | PASS local runtime |
| Employee rename refused and value unchanged | 344–347 | PASS: 403 and identical readback |
| Owner rename uses current revision and stable identity | 348–351 | PASS: same id, new Customer support label, revision advanced once; dimension and active flag retained |
| Rename preserves references and matching | 352–353 | PASS: person, catalog item and submitted snapshot identical; item remains discoverable |
| Actual DELETE is refused without deleting data | 354–357; method dispatch in tests/work/runtime.mjs:87–94 | PASS: 404, identical renamed value and all reference readbacks |
| Retirement uses renamed current revision and preserves references | 358–362 | PASS: same id and renamed label, active=0, one revision increment, identical references and continued employee discovery |
| Retired values refuse new selection without state changes | 363–367 | PASS: new person review and catalog audience edit return 422; no new person or item revision, existing references identical |
| Submitted request remains frozen after retirement | 368–370 | PASS: replay returns the original frozen catalog snapshot |

PROBE CATALOG-007 1: current-revision owner POST /catalog-values/:id, GET /catalog-values and reference reads, actual DELETE, then current-revision retirement -> rename retains id and all references; DELETE 404 changes nothing; retirement preserves matches; new person and item selection return 422 without changes.

## Acceptance and inheritance boundaries

1. Selected value lifecycle proof is now covered above. Existing owner-only creation, item audience revision and editor coverage is unchanged; no UI changes or new browser proof is claimed.
2. Existing dated review and integration refusal checks in catalogAudienceChecks remain unchanged.
3. Existing matching and unknown-person boundary checks in catalogAudienceChecks remain unchanged.
4. Existing discovery checks in catalogAudienceChecks remain unchanged, with a new post-rename matching read.
5. Existing owner, employee and staff-filer checks in catalogAudienceChecks remain unchanged.
6. Existing person, catalog and membership race checks in catalogAudienceChecks remain unchanged.
7. Existing frozen snapshot and replay checks remain unchanged; this round also compares a support requester’s submitted snapshot through the public history route across rename, refused deletion and retirement.
8. Existing audit and erasure checks remain unchanged. Native restore retaining reviewed facts without a live binding remains UNPROVED and outside the selected lease.

D-1 remains the receiving clause’s named catalog-door inheritance. No assistant, REST automation, MCP, mobile or provider door is added or assigned new authority. Provider approval mapping, consent, mail receipt and device proof are not claimed.

## DONE-RIDERS assessment

These are scoped results for a PARTIAL claim, not a whole-clause DONE request.

1. PASS for the selected lifecycle outcomes, application-cases.mjs:325–368. Whole clause remains PARTIAL for point 8’s restore gap.
2. PASS: nonempty real seeded state, allowed rename and retirement, refused employee edit and DELETE, and unchanged reference readbacks, lines 325–368.
3. PENDING exact-head Verify. scripts/verify.mjs loads tests/work/runtime.mjs as Service desk and lifecycle; runtime invokes catalogAudienceChecks unconditionally. No new flag or width condition.
4. PASS source identity: candidate-relevant source and test bytes match the local checked tree; exact-head details and receipts below.
5. INSPECTED: clause meta line names D-1; no new inherited duty or receiving door.
6. PASS generator write and check locally; restored main’s generated views. Contract judgment cells unchanged. The lander owns final status and provenance.
7. PASS: no acceptance point, rider or coverage rewrite.
8. PASS for selected authority and data-loss paths: employee edit 403 and owner DELETE 404, followed by unchanged value and reference reads. Existing owner paths succeed. No new authority.
9. PASS boundary: no live provider, legal, native-device or restore completion claim.
10. PASS: no policy default or new consent, custody, spending or authority decision.
11. PENDING guarded landing: main intentionally remains the base; fleet publication scan, exact-main Verify and Run site are not builder receipts.

## Pre-ready self-check

1. PASS selected user-visible outcomes have concrete public-route assertions on seeded state, with both allowed and refused paths. Whole-clause DONE and exact-head CI success are not inferred.
2. PASS no existing assertion removed, narrowed, skipped or moved behind any condition. No new registration.
3. Product authority, erasure and replay code is unchanged. Existing work runtime includes revoked membership, erased-person and replay denial checks; selected lifecycle retry and rejected mutations preserve stored references.
4. NOT APPLICABLE: no screen, icon control, style, configuration placement or UI file changed; no browser run required for this test-only lease.
5. Source lock refreshed and checked; exact-head CI state below. Publication scan and Run site remain fleet landing duties. Added lines contain zero email-shaped strings and zero bare prose slash tokens; existing fixture identities are unchanged. Full-history scan NOT RUN in this cloud, complete=false, historyScanned=false, findings=unknown. No zero-finding scan is claimed.

## Local validation

Setup: public npx RER setup with noninteractive fleet owner; successful. Repository hooks reinstalled afterward. Source pins unchanged.
Touched command: node tests/work/runtime.mjs, through cloud_run. Result: exit 0; the complete work runtime including its restart, erasure, replay, membership and data-boundary checks passed.
Typecheck: pnpm typecheck, exit 0. Runtime shell selected Node v24.19.0; package requests 22.20.0 and pnpm emitted its existing engine warning. The supplied toolchain preserved the newer Node; no pin changes were made.
First-party: pnpm exec rer check --profile first-party, exit 0.
MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0.
Generator wrote zero documents and check reported 0 errors and 0 warnings; generated views restored from origin/main. No migration change.
Syntax: node --check on both touched test files, exit 0. git diff --check, exit 0.

## Publication and custody

Only the product branch is eligible for landing. Evidence is transported separately with an explicit file list and report-only tree. Main had Verify 42566680535 (push), Verify 42565435918 (dispatch) and Run site 42566680574 green at fcc2e53de937ab2ae17938147920b871b5fe70f5 before work. No CI rerun or workflow edit is planned.

Final candidate: d74f73698b54a5b855ad90dae60de79fb9123ae7. PR: https://github.com/just-every/run-linen/pull/174 (draft). Product push succeeded on attempt 1 through the supplied cloud guard. Identity audit covers all candidate commits and side parents; all new author and committer identities are fleet and there are no trailers. Fetch and rebase immediately before push reported up to date; origin/main remains fcc2e53de937ab2ae17938147920b871b5fe70f5. After that no-op rebase, generator write and check and source lock regeneration and check passed again. No content edit or rebase replay changed the tested source or tests; RECEIPT.json records the SHA-256 of each checked test file and proves it equals its committed bytes. Working tree was clean.

GitHub API calls used so far: 3 (main run discovery, draft PR creation, exact-candidate run discovery). Exact-head discovery: {"runs":[]}. No different SHA is used as candidate CI evidence. No workflow dispatch or rerun was made. Main equality is false until guarded landing. Publication scan complete=false, historyScanned=false, findings=unknown for this candidate; the Mac lander owns that result and exact-main Run site.

CLAIM CATALOG-007 PARTIAL points=1 tests=tests/work/application-cases.mjs#catalogAudienceChecks
GAP CATALOG-007: Native restore retaining reviewed facts without a live binding remains unproved; all unselected audience acceptance and supplied external holds remain unchanged.

Exact-head public-door probe: the committed Worker adapter and D1 setup were reused in an external temporary harness to invoke the existing catalogAudienceChecks alone. Command cloud_run node /tmp/linen-f41-probe.mjs exited 0 on d74f73698b54a5b855ad90dae60de79fb9123ae7. probe.log records its actual result. No product or test bytes changed.

Report completeness: full selected plan, concrete lifecycle outcomes, acceptance boundaries, all 11 DONE-RIDERS rows, all five self-check items, actual commands and receipt files, honest CI and landing boundaries, counts and held work are recorded. No product blocker was found for this lease.

Final CI discovery after the required 300-second interval: Verify 42570066462 (pull_request), status=in_progress, conclusion=None, exact head=d74f73698b54a5b855ad90dae60de79fb9123ae7. No completed success is claimed. The additional dynamic PR check 42570063427 succeeded; it is not substituted for Verify. Four GitHub calls used, no dispatch or rerun. The cloud-specific READY handoff leaves exact-head green Verify, full-history publication scan and landing with the maintained fleet.

CLAIM CATALOG-007 PARTIAL points=1 tests=tests/work/application-cases.mjs#catalogAudienceChecks
GAP CATALOG-007: Native restore retaining reviewed facts without a live binding remains unproved; all unselected audience acceptance and supplied external holds remain unchanged.
