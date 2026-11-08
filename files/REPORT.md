# sx-linen-c-f11 report

Repository: just-every/run-linen. Branch: cloud/sx-linen-c-f11. Candidate: `aa04f912a23befd32c390ca877f4e5a0d1c2da98`. Base: `c4e9852d1098215b0371a6c67a9a721be85a88cf`.

API-003 remains PARTIAL. Selected acceptance point 6 is locally proven. Counts remain 18 DONE, 144 PARTIAL and 37 MISSING (199 clauses). No clause text, Status, Gap or Evidence cell changed. No generated view was committed. No new test registration, deleted assertion, pin change, workflow change, migration or UI change.

## Plan and result

The complete plan is in PLAN.md. Completed inspection, native fixtures, populated authority snapshots, allowed ticket read, forbidden approval and decision calls, unchanged-state checks, successful native human decision, touched tests, typecheck, first-party check, generation and source lock. The API-003 plan point 6 row now has local proof at this candidate. Live fleet plan files were not read or written. Fresh main was fetched after recovery and merged without changes. The product branch was pushed successfully on the fourth guard attempt. No landed status or count credit is claimed.

The only product changes extend `tests/platform/mcp-tools-cases.mjs` within `mcpToolCases`, update its existing strict queue expectation for the new fixture, update the parent runtime PASS summary and regenerate sources.lock.json. The strict queue comparison still excludes every other seeded ticket. The unauthenticated discovery assertions at `tests/platform/base-auth-runtime.mjs:85` are unchanged.

## Frozen proof rubric for point 6

All rows run in `tests/platform/base-auth-runtime.mjs` under `mcpToolCases`; scripts/verify.mjs:10 registers that script as Native sign-in and scoped API. Local exact-candidate runtime passed. Recorded GitHub Verify run: 42515978740, pull_request event, in_progress on the exact candidate at discovery and permitted REST reads at 19:42:58 and 19:47:59 UTC. No earlier SHA is represented as green.

| Item | Actual public-door proof | Result |
| --- | --- | --- |
| R1: genuine integration-only principal | Existing native automation-principal creation; membership roles exactly integration and live persisted automation row asserted at mcp-tools-cases.mjs:107 | Local PASS |
| R2: populated pre-existing approvals and grants | Native people binding, manager approval, recorded first-stage approval, pending second-stage decision, connection configuration and owner-issued service execution grant at lines 78–111 | Local PASS; no provider call |
| R3: mint creates no approval rights | Native owner POST /api/v1/mcp-credentials at line 112; full snapshots of workspace membership, group membership, department role definitions and assignments, automation principals, manager approvals, stage definitions, decisions, tokens, execution grants and revocations compared at line 113 | Local PASS |
| R4: credential usable within its actual grant | MCP work.get on the real granted approval ticket at line 114 | Local PASS |
| R5: agent cannot approve or decide | Four approval and decision names attempted as both protocol methods and tools at lines 115–120: protocol method refusal -32601, HTTP 400 tool_not_found. Native approval, stage decision and grant POST with bearer plus real approver session at lines 122–125: HTTP 401 rest_auth_required | Local PASS |
| R6: refusals preserve existing authority | Full populated snapshot equality at line 127; requester reads manager approved and stages approved then pending at lines 128–130 | Local PASS |
| R7: authorized decision remains possible | Same pending input completes via the configured native approver and requester observes satisfied at lines 131–132 | Local PASS |

PROBE API-003 6: native owner POST /api/v1/mcp-credentials for a live integration-only automation principal with existing manager approval, stage decision and service execution grant -> 201, granted ticket read succeeds, all authority rows unchanged; MCP approval and decision calls refused; native bearer decision attempts return 401 and change nothing; authorized native approver still completes the open decision.

## Clause acceptance map

Only point 6 was selected for new proof and credit. Existing points are preserved and listed to avoid a whole-clause DONE claim.

| Acceptance point | Journey and lines | This round |
| --- | --- | --- |
| 1: permitted queue and out-of-grant refusal | mcpToolCases, mcp-tools-cases.mjs:169 and existing bounded not_found cases | Existing local runtime PASS |
| 2: membership, automation status and unauthenticated discovery | base-auth-runtime.mjs:85–91 and existing live-role refusal cases; mcpToolCases authority-race cases | Existing tools/list refusals preserved; broader discovery not claimed |
| 3: initialize, discovery and scopes | base-auth-runtime.mjs:111–119, mcpToolCases scoped discovery and selected-subverb refusals | Existing local runtime PASS |
| 4: bounded ticket tools | mcpToolCases permitted read, search, history, create and internal comment assertions | Existing local runtime PASS |
| 5: forbidden authority and effects | base-auth-runtime.mjs:120–127; mcpToolCases refusal and no-effect assertions | Existing local runtime PASS, strengthened for approval and decision |
| 6: mint never grants approval rights or changes approvals and grants | mcpToolCases:77–133, rubric R1–R7 | New local PASS; GitHub Verify pending |

An exploratory uncommitted expansion to unauthenticated initialize encountered HTTP 200 in the existing implementation. That change was removed from the lease; the original discovery refusals remain intact. This pre-existing point-2 observation needs a separate scoped round and is not silently credited.

## DONE-RIDERS

| Row | Assessment at this candidate | Evidence or boundary |
| --- | --- | --- |
| 1 | PASS for selected point 6 locally; whole-clause DONE not claimed | Rubric R1–R7; recorded Verify pending |
| 2 | PASS | Populated independent fixtures; positive read, negative approval attempts with unchanged rows, positive native completion |
| 3 | UNESTABLISHED | Existing Verify script includes the runtime; recorded exact-SHA Verify 42515978740 still in progress at 19:47:59 UTC |
| 4 | PASS locally | CHECKS.json binds all five checks to `aa04f912a23befd32c390ca877f4e5a0d1c2da98` |
| 5 | INSPECTED | API-003 cites BASE-AGENT-001 in unchanged CONTRACT.md:2055; same membership and scope checker remains |
| 6 | PASS mechanical only | Generator write and check exit 0; restored generated views; unchanged status cells and counts |
| 7 | PASS | No acceptance change or new policy default |
| 8 | PASS selected security path | Lines 107–132 exercise real integration identity, refusal and preserved state; authorized native completion follows |
| 9 | PASS boundary | No account proof, provider effect or legal claim; connection remains unverified configuration |
| 10 | PASS | No policy decision or new scope; held role obligations unchanged |
| 11 | PENDING | Not landed, main equality false, candidate Verify 42515978740 pending, no publication scan or candidate Run site receipt |

## Pre-ready self-check

1. Selected point 6 has allowed and refused public-door outcomes with full state comparisons. Exact-SHA Verify is still in progress after two permitted REST polls; product custody is proven, and no real local check failure remains. Eight of ten explicit GitHub calls were used, with the remainder reserved for failure triage. Handoff is PUSHED, without a green or READY claim.
2. No existing assertion removed, skipped or narrowed. Existing queue equality now includes one genuine added normal ticket and still requires the exact set.
3. Existing credential revocation, principal erasure, subject erasure, replay and transactional authority-race paths all passed in the touched runtime. Existing replay assertions at mcp-tools-cases.mjs:259 remain.
4. No screens touched; browser widths and tooltip audit do not apply to this test-only change.
5. Source lock fresh and local first-party check passes. Cloud publication scan is assigned to the fleet; no COMPLETE or zero-findings claim. Main equality, Verify and Run site remain unestablished.

## Checks and custody

CHECKS.json is the actual exact-candidate command receipt: runtime, typecheck, first-party check, restored-view generator check and source integrity check each exit 0. Runtime log contains the point-6 PASS line. Generator write and check both exited 0 before restoring ACCEPTANCE.md and docs/CLAIMS.md; source lock was regenerated last and checked. Migration ledger: not applicable, no migration change.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0, generated files restored; ledger=none exit=0.

All unpublished candidate commits were inspected with the required full-range identity and trailer command. Author and committer are fleet identity, no trailers. CONTRACT.md diff is empty. Product branch has one real commit. Draft PR: https://github.com/just-every/run-linen/pull/153. Exact-SHA Verify 42515978740 (pull_request) remained in progress at 19:47:59 UTC. Polling has stopped; the guarded fleet lander must establish its conclusion. Main Verify 42514121758 and Run site 42514121732 succeeded on base c4e9852d1098215b0371a6c67a9a721be85a88cf.

Initial GitHub REST attempts reported Bad credentials, HTTP 401; initial Git fetch and product push reported Invalid username or token and Authentication failed, with no Git HTTP status. Authentication recovered on fourth attempts after launcher refresh and decrypted-bundle setup. Product push succeeded, fresh main fetch succeeded, merge was already up to date, and draft PR 153 was created. No alternative credential was sought. Product-push and API recovery logs contain actual outcomes. CUSTODY.json records transport status and the proactively verified recovery bundle.

CLAIM API-003 PARTIAL points=6 tests=tests/platform/mcp-tools-cases.mjs#mcpToolCases; tests/platform/base-auth-runtime.mjs#Native sign-in and scoped API
GAP API-003: Exact-SHA Verify 42515978740 is still in progress and guarded landing is unestablished; point-2 discovery remainder and all existing held role, Base, account and device obligations remain outside this point-6 lease.

Terminal product custody: PUSHED branch=cloud/sx-linen-c-f11 head=aa04f912a23befd32c390ca877f4e5a0d1c2da98. PR 153. No real blocker remains; CI, publication scan and landing are pending. No unpublished product work will be deleted: the branch ref was verified remotely and the recovery bundle remains outside the clone. Evidence transfer is reported separately by its exact EVIDENCE ref and head.
