# sx-linen-c-f63 — CATALOG-004 selected native proof

Repository: just-every/run-linen
Branch: cloud/sx-linen-c-f63
Candidate: ee0d7bc3920544d0e73ddbbf110209db64d7115e
Base: 8cbb5da69a36002c032436b861772e8fb3f6247e
Draft PR: https://github.com/just-every/run-linen/pull/195

CLAIM CATALOG-004 PARTIAL points=3,5 tests=tests/work/bundle-cases.mjs#bundleChecks
GAP CATALOG-004: Only point 3's shared child facts and point 5's native independent capacity and no-created-grant proof are certified here. Actual per-child provider authority, independent delivery verification and completion, and every other unselected acceptance obligation remain owed. The retained MDM, device, lease, channel, account, role, ct and Base holds are unchanged. A bundle decision supplies no provider authority.

Counts before and after: 31 DONE, 131 PARTIAL, 37 MISSING, 199 total. CATALOG-004 remains PARTIAL. No contract, status, Gap, Evidence, acceptance sentence, homepage or UI file changed. No new policy default was needed. Plan row reported for the fleet: CATALOG-004 selected point 3 and point 5 native proof completed; retain the held remainder and all existing holds. No other plan row was changed or retargeted.

## Plan and implementation result

1. Read the launcher instructions, repository AGENTS, README, contract and generated acceptance view, the supplied plan extract, Linen rulings and all eleven DONE riders. Inspect bundle admission, child fulfilment storage, capacity reservation, manager binding and existing journey coverage.
2. Extend the existing bundleChecks journey, with no additional test registration. Create four real catalog children through the native catalog route: device capacity two, device capacity zero, software capacity one and software capacity zero. All four require current-manager approval.
3. File three distinct native bundle requests as the owner for the employee, using nonempty distinct purposes and bounded future expiries. Read every child through its native fulfilment route and inspect only the corresponding stored facts. Compare the person, purpose and expiry with the submitted input before and after each allowed and refused decision.
4. Inspect actual reservation identities after each submission. Request one reserves its device and licence independently. Request two reserves its remaining device but holds its exhausted licence. Request three holds both. The zero-capacity siblings never borrow another child's capacity. Read the existing native fulfilment response after manager approval to assert pending or blocked with the appropriate stock or licence reason.
5. Snapshot pre-existing execution grants, plans, operations, fulfilment execution links and provider boundary rows. Compare all saved fields after admission, a refused non-manager decision and the allowed current-manager decision. Check every business approval stores the submitted facts and has null grant identity and version. The new native slice performs no grant issuance or provider dispatch.
6. Run the touched manager and bundle runtime, typecheck and first-party check. Generate and check contract views, restore the main copies, regenerate the source lock last and check it. Commit the test and generated source-lock hash only, fetch main, perform an up-to-date rebase before publication, recheck the lock and inspect all unpublished commit identities and trailers. Push only the named product branch through the fleet guard. Open the single draft PR required for the repository's pull-request Verify entry point.
7. Run the runtime again on the committed candidate and preserve the actual receipt and log. Record exact-head CI honestly, then publish the explicitly selected report packet on the separate evidence ref. Leave landing, full publication scan and resulting Run site to the maintained fleet lander.

The product diff is 77 added test lines and one mechanically regenerated test digest in sources.lock.json. The existing implementation already supplied the requested native semantics, so no runtime code change was required. Every existing assertion remains. No test was deleted, narrowed, skipped, hidden behind a width condition or replaced. Test registration delta is zero; no cap change was needed.

## Public-door probes and frozen proof rubric

PROBE CATALOG-004 3: POST /catalog-bundles/:id/request as owner for employee with a nonempty purpose and a future expiry; GET /work/:id/fulfilments/:catalogId as the employee before and after current-manager approval -> all twelve children retained exactly the submitted beneficiary, purpose and expiry, confirmed in read-only persisted fields.
PROBE CATALOG-004 5: POST the same four-child bundle three times with capacities [2,0,1,0], then decide through POST /work/:id/bundle/approve as the current manager and inspect native child fulfilment responses -> independent reservation counts per request were 2, 1 and 0; available children stayed pending, exhausted children stayed blocked with their stock or licence reason; no grant, plan, execution operation, execution link or provider row changed. A non-manager attempt returned 403 and changed no child, reservation, approval or execution state.

| Rubric | Selected outcome | Evidence on candidate | Result |
| --- | --- | --- | --- |
| R1 | Every child has the submitted person rather than the filer | bundleChecks, tests/work/bundle-cases.mjs lines 25–46 and 67; owner files for distinct employee; native reads and stored facts agree | PASS local exact candidate |
| R2 | Every child retains the submitted purpose and expiry through decisions | Same journey lines 26–41, 60 and 67–72; saved approval facts also agree | PASS local exact candidate |
| R3 | Stock and licence capacity reserve independently, including exhaustion | Same journey lines 15–23, 47–51 and 73–78; twelve children across three native requests | PASS local exact candidate |
| R4 | Business approval cannot use another child's capacity | Same journey lines 63–78; positive controls pending, zero-capacity and exhausted controls blocked | PASS local exact candidate |
| R5 | Request and manager approval leave existing grant identities unchanged | Same journey lines 6–14, 52, 62, 68–72 and 79; full existing grant rows compared, not merely counts | PASS local exact candidate |
| R6 | Refused authority changes nothing and no provider effect is dispatched | Same journey lines 56–62 and 79; unchanged plans, operations, links and provider boundary rows | PASS local exact candidate |

Runtime entry point: tests/work/amend-manager-runtime.mjs, line 107 calls bundleChecks. Verify loading: scripts/verify.mjs, line 21 registers “Manager approval and bundles.” The existing Verify runs this through its normal journey shards; no workflow was modified.

## Acceptance sentence accounting

| Point | Scope and proof | Round accounting |
| --- | --- | --- |
| 1 | Existing five-child public-route journey, atomic shared decision and last-child completion, bundleChecks lines 82–143 | Existing journey still passes; no new live-provider certification |
| 2 | Existing owner bundle creation and pinned snapshot; general size bounds and wider unselected outcomes | Unchanged and not certified by this lease |
| 3 | Shared person, purpose and expiry are proved by R1–R2. Existing stale-item refusal remains at the end of bundleChecks | Selected shared-child facts closed; other unselected paths remain owed |
| 4 | Existing all-or-nothing manager decision assertions remain; R6 adds wrong-holder invariance for the new native requests | Existing behavior preserved; no new delegated-role authority claim |
| 5 | R3–R6 prove native independent child capacity and no created or changed execution grant | Selected native part closed; actual per-child provider grants and independent verification remain owed |
| 6 | Existing fixture-based delivery journey still requires the final physical child before completion | No new real-provider completion or failed-provider certification |

## Checks and actual receipts

- timeout 1200 node tests/work/amend-manager-runtime.mjs: exit 0 on ee0d7bc3920544d0e73ddbbf110209db64d7115e. Actual start 2026-11-09T12:25:49.522132+00:00, elapsed 39.048 seconds. See runtime-receipt.json and runtime.log. This also retained all existing manager, task-plan and approval-chain assertions.
- pnpm typecheck: exit 0. See typecheck.log. Run before commit with identical relevant source and test bytes; only the source-lock digest was regenerated afterward.
- pnpm exec rer check --profile first-party: exit 0. See first-party.log and local-checks.json. Run against the same relevant source and test bytes.
- node src/base/contract-docs.mjs write and check: exit 0. Wrote zero documents; contract prose reported zero errors and warnings. Main copies of ACCEPTANCE.md and docs/CLAIMS.md restored; neither is in the product diff.
- node scripts/edition-authoring/cli.mjs lock: exit 0 after the final source edit and after the up-to-date rebase. node scripts/edition-authoring/cli.mjs check: exit 0 on the exact candidate. See local-checks.json, source-check.log and the full actual source-check.json output.
- Migration ledger: not applicable; no migration changed.
- git diff --check and clean worktree and index checks passed. CONTRACT.md diff is empty. The only candidate commit has fleet author and committer identity and no trailers; all candidate parents were included in the required git log range check.
- The repository has full history. The cloud-side full publication scan was not run; the guarded fleet lander must perform it. New product text contains no email-shaped fixture values, credential-shaped keys or new bare prose repository tokens. Existing fixture provider dispatches are retained, while the newly added native slice dispatches nothing.
- No UI changes: no touched screen, new icon control, design work or browser-width proof applies to this test-only change.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0

## DONE riders and pre-READY review

CATALOG-004 is claimed PARTIAL, with only the selected native parts of points 3 and 5 credited.

| Rider | Assessment | Proof or remaining boundary |
| --- | --- | --- |
| 1 | PASS for selected native outcomes; full clause not claimed DONE | R1–R6 reach the actual public doors and inspect nonempty results; held remainder stays named |
| 2 | PASS for selected native outcomes | Positive capacity and exhausted controls; non-manager denial with unchanged state, bundleChecks lines 47–79 |
| 3 | CI status recorded below | Existing Verify invokes this journey; exact-head run must be green before landing |
| 4 | PASS | Actual runtime receipt binds the committed candidate and test digest |
| 5 | UNCHANGED | No receiving-clause text, inheritance claim or Base adoption changed; no additional inherited duty certified |
| 6 | PASS mechanical; status writer deferred | Contract generator check passes; source status, Gap, Evidence, summary and generated views are untouched |
| 7 | PASS | No acceptance or ruling changes, no lost assertions |
| 8 | PASS selected authority boundary | Current independent manager succeeds; owner who is not that manager gets 403 with unchanged state |
| 9 | HONEST HELD BOUNDARY | No claim of real provider grants, MDM inventory, device delivery or independent provider completion |
| 10 | NOT APPLICABLE | No new custody, consent, spending or authority default |
| 11 | PENDING FLEET | Branch-only candidate; fleet owns exact-main equality, COMPLETE full-history scan with zero findings and exact resulting Run site |

Pre-READY: selected behavior has public-door assertions and the exact-candidate local run passed. No existing assertion was removed or narrowed. The diff changes only proof and its lock digest, so erasure, replay, credential revocation and production authority behavior are unchanged; the new journey additionally refuses the wrong decision holder without state change. No screen is touched. Lock freshness passes. Exact-head CI is recorded below; publication scan and resulting Run site remain fleet work. No overall DONE count is claimed.

Publication scan record: {"commit":"ee0d7bc3920544d0e73ddbbf110209db64d7115e","status":"NOT RUN in cloud; fleet lander required","complete":null,"historyScanned":null,"findings":null}.

The last fetched main was 8cbb5da69a36002c032436b861772e8fb3f6247e; it is the candidate's parent. Main equals candidate: false. Its Verify push run 42614672051 and workflow-dispatch run 42612972689 were completed with success, and Run site 42614672049 was completed with success. See main-runs.json. These are base health only, not candidate CI or landing receipts.

## Candidate CI and handoff

Exact-head pull-request Verify run 42616943517 was in progress at the latest REST discovery, 2026-11-09T12:30:49Z. See candidate-runs.json; verify-run.json will carry the subsequent exact-head response. The product-receipt.json separately verifies the advertised product ref equals the full candidate SHA. No green result from the base is credited to this candidate. No full-suite local verification, extra provider journey, workflow edit, main push or direct landing was performed. No blocker was found in the selected native scope. CATALOG-004 remains PARTIAL for the held remainder stated above.
