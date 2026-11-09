# sx-linen-c-f68 — CATALOG-004 native child proof

Product repository: just-every/run-linen. Branch: cloud/sx-linen-c-f68.
Candidate: 238b36923c630c642cc17031305c58389261719f.
Integrated main: e2d67da5861defba777d5c82248b3664b38c1481.

CATALOG-004 remains PARTIAL. This round closes the selected native portions of point 3 (shared child person, purpose and expiry) and point 5 (independent stock and licence capacity and no grant creation), preserving all other obligations. Before and after counts: 31 DONE, 131 PARTIAL, 37 MISSING, total 199. No clause status, Gap or Evidence cell changed. The plan update to relay is this selected proof only; no full plan was rewritten.

The specified predecessor ee0d7bc3920544d0e73ddbbf110209db64d7115e was fetched, branched and rebased onto main before publication, preserving its proof as ff78a58. The new commit 238b369 adds native expiry-duty and replay assertions to the same bundleChecks journey. The full execution plan is in PLAN.md. Product changes contain only tests/work/bundle-cases.mjs and the generated sources.lock.json; report files stay outside the product checkout.

## Check and build results

The repository setup completed through the fleet toolchain and cloud_run, including the application's local build and migrations. The touched manager runtime passed during development and on the committed candidate. Typecheck, first-party check, contract generator write and check, and source lock generation and check are recorded in checks.json and the selected logs. No migration changed, so no migration-ledger command applies. Contract generation wrote no changed documents; both generated views were explicitly restored from origin/main before the lock was regenerated. CONTRACT.md is byte-identical to main, and staged and candidate contract diffs are empty.

The suite entrypoint is tests/work/amend-manager-runtime.mjs; scripts/verify.mjs runs it as “Manager approval and bundles” in the existing Verify journey shards. No workflow edit or new test registration was needed. No assertion was deleted, narrowed, skipped or conditionalized. No UI file or screen changed, so new viewport or tooltip proof does not apply to this test-only round.

## Selected public-door probes

PROBE CATALOG-004 3: owner POST to /catalog-bundles/:id/request for employee, a nonempty purpose and a future expiry -> all four child fulfilment GETs return the same submitted beneficiary, purpose and expiry, matching read-only stored fields. Public obligation reads return both software-child expiry duties at the exact submitted expiry, including the held child. A same-input replay retains child identities; a changed-expiry replay returns 409 and leaves child facts and reservations unchanged.

PROBE CATALOG-004 5: bundle of device capacities 2 and 0 and software capacities 1 and 0, requested three times -> reserved child indices are [0,2], then [0], then []; no exhausted child borrows the other child's capacity. Current-manager approval records all four business approvals with null grant identity and version, leaves each submitted fact unchanged, and retains the independent pending or blocked result for each child. Owner approval returns 403 and changes nothing. Request and approval replays consume no extra capacity. Full snapshots of preexisting execution grants, plans, operations, fulfilment links and the provider fixture remain unchanged throughout this selected leg. No provider dispatch is invoked in that leg; the runtime's preexisting later verification examples use network-edge fixtures only.

## Acceptance sentences and inherited boundaries

| Item | Evidence on candidate | Result |
| --- | --- | --- |
| Point 1: one approval, five children, completion after all verify | Existing bundleChecks lines 111 onward, through public request and bundle reads; network-edge examples retained and rerun | Existing proof retained; real-provider completion not claimed |
| Point 2: owner builds pinned existing-item bundle | Existing bundleChecks owner refusal and five-item creation; no acceptance text changed | Existing proof retained; unselected bounds not newly certified |
| Point 3: same person, purpose and expiry; changed snapshot refusal | bundleChecks lines 25–54, 62–70, 78–90 and existing stale-snapshot check | Selected shared-fact proof PASS; native expiry propagation and refused replay PASS |
| Point 4: one current-manager atomic decision, never child-by-child | bundleChecks lines 71–90 and retained subset and single-child refusals after line 115 | Existing atomic-manager proof retained; selected current-holder decisions PASS |
| Point 5: independent capacity, grants and verification; no grant creation | bundleChecks lines 6–23, 56–101; three real native requests with progressively exhausted independent capacities and nonempty preexisting grant snapshots | Selected native capacity and no-created-grant proof PASS; actual provider grants and verification remain owed |
| Point 6: all-child delivery verification controls completion | Existing bundleChecks retained final-child physical handoff and per-child network-edge verification leg | Real delivery and independent provider completion not claimed |
| Inherited current manager and exact approval binding | Owner denied; holder succeeds; persisted approvals retain submitted fields with no provider grant | PASS for selected native decision boundary; wider CATALOG-002 channel duties unchanged |
| Inherited provider authority separation | Full existing execution snapshots unchanged before and after request, denial, approval and replay | PASS for no-created-authority selection; actual provider grants stay per child and are not certified |
| Inherited device, lease, channel and role duties | No implementation or clause text changed for those duties | Unselected; CATALOG-005, CATALOG-012, CHANNEL-005, ROLE-001 and all supplied holds retained |

## DONE-RIDERS and pre-ready review

| Rider | Result and evidence |
| --- | --- |
| 1 | Selected native outcomes PASS through bundleChecks lines 6–101 and exact-candidate runtime; full clause remains PARTIAL. Exact-head CI is recorded separately below. |
| 2 | PASS: nonempty existing grants, four native items, three capacity-exhaustion requests, unauthorized owner denial and changed-expiry replay denial; supported manager decisions succeed. |
| 3 | Existing Verify registration INSPECTED at scripts/verify.mjs:21; exact-head CI state follows below. No unrecorded CI success is claimed. |
| 4 | PASS: checks.json binds the final local run to the full committed candidate; no product bytes changed afterward. |
| 5 | INSPECTED: no inherited duty was newly claimed or removed and no contract prose changed. Current manager and independent execution authority remain explicit boundaries of the native proof. |
| 6 | PASS mechanically: generator write and check succeed, generated views restored, source lock regenerated and checked. Status cells and provenance remain under the single contract writer. |
| 7 | PASS: acceptance and status diffs are empty; no point was added, removed or rewritten. |
| 8 | PASS for selected authority: current holder succeeds; owner alone is refused; refused decisions preserve child fields, reservations and execution state. |
| 9 | PASS reporting boundary: no live-provider, MDM, legal, delivery or completion result claimed. The selected leg performs no provider dispatch. |
| 10 | Not applicable: no new policy default was adopted; existing authority rules were retained. |
| 11 | PENDING guarded landing. Candidate is branch-only; main equality, publication scan and candidate Run site remain fleet duties. No DONE count is awarded. |

Pre-ready review: selected user-visible behavior has public-door assertions; none was weakened. Replay refusal and unauthorized decision paths change no selected data or authority. Credential revocation and erasure implementations are untouched and are not newly certified by this selection. UI checks are not applicable to unchanged screens. The fresh source lock and complete identity audit pass. Added text contains zero email-shaped values, zero provider-shaped keys and no bare prose slash tokens. A local diff review is not a publication scan: candidate publication scan is NOT RUN in cloud, complete=unestablished, historyScanned=unestablished, findings=unestablished. The fleet must run the full-history scan and landing gates.

Main's observed exact-SHA Verify runs 42618425488 (push) and 42616492022 (workflow_dispatch) completed successfully. Main's Run site 42618425436 (push) completed successfully. These are main results, never evidence of candidate CI success. There are no known local product blockers. The clause remains PARTIAL because all unselected obligations and actual per-child provider grants, independent delivery verification and completion remain owed.

CLAIM CATALOG-004 PARTIAL points=3,5 tests=tests/work/bundle-cases.mjs#bundleChecks; tests/work/amend-manager-runtime.mjs#Manager approval and bundles
GAP CATALOG-004: Actual per-child provider grants, independent delivery verification, completion and all unselected obligations remain owed; existing account, ct, Base and device holds are unchanged.

## Terminal custody and CI

Product remote ref was read back and equals 238b36923c630c642cc17031305c58389261719f; the checkout is clean. Product push succeeded on its first guarded attempt. PR #198: https://github.com/just-every/run-linen/pull/198. Exact-head Verify 42622699479, event pull_request, is in_progress, conclusion None; it is not reported green. No duplicate workflow was dispatched or rerun. The maintained lander owns exact-SHA CI completion, full-history publication scan, main integration and candidate Run site. No main push was performed.

All five committed-candidate local checks returned exit 0. MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0 (no migration change). The complete commands, output file hashes, candidate binding and observed CI are in terminal-receipt.json and checks.json.

The GitHub API budget used four calls: an initial mistyped main-SHA discovery returned no runs and was discarded, a corrected full-SHA main discovery, PR creation, and the single exact-candidate run discovery. No run was polled twice within 300 seconds and no log archive was requested.
