# sx-linen-c-f15: API-003 point 6

Candidate: 30646fdeb3e2564d9f702ac2c716c3a1ba843396
Branch: cloud/sx-linen-c-f15
Repository: just-every/run-linen
PR: https://github.com/just-every/run-linen/pull/154 (draft, repository Verify entry point)
Integrated main: 0cae7fe338def5f96f52df2468f91f078a36827f

CLAIM API-003 PARTIAL points=6 tests=tests/platform/mcp-tools-cases.mjs#mcpToolCases; tests/platform/base-auth-runtime.mjs#Native sign-in and scoped API

GAP API-003: Selected point 6 is proven locally. Broader discovery proof and held scope remain unchanged: ROLE-001 acting-role grants, revision reconfirmation and custom-agent seat decisions, wider tools, Base resources, prompts and events, external effects and existing account, Base and device holds are not claimed. Exact-SHA Verify 42518243082 is green; guarded landing remains pending.

No DEFAULT: this uses the existing RL-18 credential semantic and creates no new policy or authority.

## Plan and result

The actual plan is PLAN.md. The task starts from continuation aa04f912a23befd32c390ca877f4e5a0d1c2da98, whose native fixture already populates approvals and a service execution grant. That work was retained, rebased onto current main before publication, and strengthened rather than replaced.

The native journey now includes both an existing manager approval with a recorded first-stage decision and a still-pending second-stage decision, plus a separate genuinely pending manager approval. It mints all six allowed ticket subverbs for the persisted integration-only automation principal. Complete snapshots of memberships, group membership, department role definitions and assignments, automation principals, fulfilments, manager approvals, stage decisions, approval tokens, service execution grants and revocations are identical immediately before and after owner mint.

The minted credential successfully reads its granted ticket. Approval and decision attempts fail as unknown MCP methods and unregistered tools. The real native approval, stage decision and grant routes reject the MCP bearer with 401 rest_auth_required, both alone and with a real authorized approver cookie. Full authority snapshots remain identical after every refusal set. Native readback retains the existing approval and pending stage. The exact pending manager and stage inputs subsequently complete under their authorized native holder. This distinguishes an authority refusal from an already-consumed decision or malformed fixture.

No application source, migration, workflow, contract judgment or generated view changed. The product commit includes two test files and the generated source lock. Existing unauthenticated-discovery refusals remain intact. No permanent test registration was added or removed; this extends the existing Native sign-in and scoped API journey. The queue expectation includes the new real fixture while continuing to assert exact equality; no existing assertion was removed or narrowed.

The plan extract has no API-003 target-table row. No plan row or contract status cell was changed. The selected API-003 point-6 queue entry is now locally proven. Before and after counts remain 18 DONE, 144 PARTIAL, 37 MISSING, total 199. No clause-wide promotion or landing is claimed.

## Public-door probe

PROBE API-003 6: native owner POST /api/v1/mcp-credentials for an active integration-only automation principal with populated approvals and a service execution grant -> 201; identical complete authority snapshots. Its MCP bearer reads granted work but approval and decision tools refuse; native approval, decision and grant POST routes return 401 both with and without the authorized approver cookie; snapshots remain identical. The same pending decisions then succeed through the native holder session.

## Acceptance evidence map

All paths below are actual repository files at the candidate. The touched journey is invoked by scripts/verify.mjs as Native sign-in and scoped API. It completed locally on the exact committed candidate with exit 0; runtime-receipt.json binds the command, tree and SHA. CI event and conclusion are recorded in ci-receipt.json when available. Only point 6 is claimed by this lease.

| Acceptance sentence | Evidence at candidate | Result and scope |
| --- | --- | --- |
| API-003.1: client connects, lists permitted queue, refuses out-of-grant action | tests/platform/mcp-tools-cases.mjs, mcpToolCases, lines 179 onward: native fixture, exact queue results and hidden-ticket refusals | PASS locally, retained coverage; no new scope claim |
| API-003.2: authenticate before discovery, check current membership and principal, disclose only auth error | tests/platform/base-auth-runtime.mjs lines 85 to 91 and 197 onward; tests/platform/mcp-tools-cases.mjs live-authority race cases | PASS locally for retained cases; broader discovery proof remains outside selected lease |
| API-003.3: initialize and ping; authenticated discovery within current grants | tests/platform/base-auth-runtime.mjs lines 107 to 118; tests/platform/mcp-tools-cases.mjs scoped discovery and narrowed grant cases | PASS locally for existing implemented tool surface; no wider Base family claim |
| API-003.4: six closed ticket subverbs enforce queue, projection and commit rules | tests/platform/mcp-tools-cases.mjs, mcpToolCases, permitted reads, search, history, creation, comment and authority rollback cases | PASS locally, retained coverage |
| API-003.5: refuse approval, decisions and wider authority or effects | tests/platform/base-auth-runtime.mjs lines 120 to 125; tests/platform/mcp-tools-cases.mjs lines 120 to 135 and dangerous create cases | PASS locally for existing closed surface and new pending-decision refusals; future effect tools omitted |
| API-003.6a: mint grants no agent approval rights | tests/platform/mcp-tools-cases.mjs lines 98 to 143: pending native decisions, genuine integration principal, successful read, MCP and native refusal, authorized completion | PASS locally on exact SHA |
| API-003.6b: mint changes no existing approvals or grants | tests/platform/mcp-tools-cases.mjs lines 77 to 118 and 135 to 143: nonempty existing approvals and service execution grant, complete before and after snapshots and native readback | PASS locally on exact SHA |
| Inherited BASE-AGENT-001, one MCP door | CONTRACT.md API-003 Cites BASE-AGENT-001; existing agentRpc posts /api/mcp and native REST refuses MCP audience | INSPECTED and runtime PASS for the touched credential boundary; no inheritance wording change |

## DONE-RIDERS score

This is a PARTIAL point claim. These rows do not assert a clause-wide DONE.

| Rider | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | PASS for selected point; clause-wide claim withheld | mcpToolCases lines 77 to 143 performs mint, full snapshots, unsafe decision refusal and native authorized completion; exact-SHA runtime receipt |
| 2 | PASS | Nonempty manager approvals, recorded stage decision, pending manager and stage inputs, active service grant; dangerous path both ways with unchanged state on refusal |
| 3 | PASS | Exact-SHA Verify 42518243082, pull_request, completed success. scripts/verify.mjs includes tests/platform/base-auth-runtime.mjs unconditionally as Native sign-in and scoped API |
| 4 | PASS | runtime-exact-sha.log and runtime-receipt.json name candidate 30646fdeb3e2564d9f702ac2c716c3a1ba843396 |
| 5 | PASS, INSPECTED | API-003 explicitly cites BASE-AGENT-001; no inherited acceptance text changed |
| 6 | PASS mechanically | contract-docs write and check both exit 0; views restored from main; Status, Gap, Evidence and counts unchanged |
| 7 | PASS, INSPECTED | No acceptance or contract text changes |
| 8 | PASS for selected authority boundary | Pending manager and stage decisions refused by MCP; authorized native holders subsequently complete the same inputs; full snapshots unchanged on refusal |
| 9 | PASS, boundary preserved | Synthetic connection and grant establish no provider operation; no provider, legal, device or account proof claimed |
| 10 | PASS, INSPECTED | Existing RL-18 semantic; no new policy default or scope |
| 11 | Pending guarded lander | Candidate differs from main; publication scan, exact-main equality and main-only Run site are not established in this cloud run |

## Mechanical checks and receipts

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none, no migrations changed exit=0

- Native runtime before strengthening: exit 0, baseline-runtime.log.
- Strengthened native runtime: exit 0, runtime.log.
- Exact committed candidate native runtime: exit 0, runtime-exact-sha.log and runtime-receipt.json.
- pnpm typecheck: exit 0, typecheck.log.
- npx -y @runeditrun/rer check --profile first-party: exit 0, first-party.log.
- Contract generator write and check: exit 0, views-write.log and views-check.log. Restored ACCEPTANCE.md and docs/CLAIMS.md from origin/main; neither is in the product diff.
- Source lock regenerated last, check exit 0: lock.log and lock-check.log.
- Git diff check passed. All candidate authors, committers and trailers passed inspection, including side parents. identity-check.txt records the output.
- No new email-shaped strings in the added test lines. Existing fixtures were retained.
- The supplied toolchain selected Node 24.19.0 and pnpm 10.12.4; pnpm prints a nonfatal Node engine warning for the repository's Node 22.20.0 declaration.
- Setup used the public rer setup command through cloud_run and completed. No private setup output, credential file or environment dump is included in the packet.
- No UI changed; screen proof and icon-control audits are not applicable to this test-only authority lease.
- No full local Verify, new provider journey, workflow edit, Base refresh or deployment was performed.
- Candidate pushed successfully through cloud-push.py; push.log records the transport result. No retry or recovery bundle was needed.

## Pre-ready self-check

1. Selected security outcome is asserted through the public mint and decision doors, including supported and unsafe cases; exact-SHA local proof passes. Exact-SHA CI is recorded below.
2. No assertion was removed, skipped, narrowed or gated by width or branch. Exact queue equality was expanded for the real new fixture.
3. Existing revoked-credential, erased-principal and erased-subject refusal cases execute in the same passing runtime. Archive replay proof belongs to the unchanged transfer journey and is not newly claimed here.
4. No touched screen.
5. Source lock fresh. Publication scan and main-only Run site remain the Mac lander's duties; no cloud completion claim.

Publication scan text: commit=30646fdeb3e2564d9f702ac2c716c3a1ba843396 complete=false historyScanned=false findings=unestablished. The cloud-only route explicitly delegates this scan to the guarded lander. This is not a zero-findings receipt.
Main equality: false, origin/main=0cae7fe338def5f96f52df2468f91f078a36827f at integration.
Run site: no candidate main run; pending guarded landing.
Product blocker: none for the selected point. Held remainder remains unchanged. CI and custody status are appended below; no READY is asserted from a different SHA.


## Exact-SHA CI observation

Verify run 42518243082, event pull_request, head 30646fdeb3e2564d9f702ac2c716c3a1ba843396, was in progress at the first permitted discovery (2026-11-08T20:09:45Z).
URL: https://github.com/just-every/run-linen/actions/runs/42518243082
No Verify dispatch or rerun was needed. One watcher performs at most one request per 300 seconds for this run. The current receipt and terminal observation are in ci-receipt.json and ci-watch.log. A terminal CI result is appended after this observation.


## Terminal CI and custody

Verify 42518243082 completed SUCCESS on 30646fdeb3e2564d9f702ac2c716c3a1ba843396, event pull_request, observed 2026-11-08T20:19:46Z. This exact-SHA green run executes the journey named in every acceptance evidence row above. DONE-RIDERS row 3 now passes. The selected point-6 security proof passes both local exact-SHA runtime and Verify; broader held scope is unchanged. Row 11 remains the guarded lander's responsibility.

Five GitHub API calls were used: draft PR creation, initial exact-head discovery before the run appeared, delayed discovery, and two run polls spaced at least 300 seconds apart. No dispatch, rerun or failed-job log read was needed. No real CI failure was observed.

Final product custody: READY for the guarded lander; branch cloud/sx-linen-c-f15 at 30646fdeb3e2564d9f702ac2c716c3a1ba843396. This does not claim main equality, publication scan completion, Run site success or clause-wide DONE. Evidence is published separately on refs/heads/evidence/sx-linen-c-f15. The cloud clone and dependencies are deleted after publication as requested.

CLAIM API-003 PARTIAL points=6 tests=tests/platform/mcp-tools-cases.mjs#mcpToolCases; tests/platform/base-auth-runtime.mjs#Native sign-in and scoped API
GAP API-003: Point 6 closed; broader discovery proof and all explicitly held scope unchanged. Guarded landing, publication scan and Run site remain with the fleet.
POST lanes/sx/INBOX.md: sx-linen-c-f15 API-003 point 6 proven; no contract cell changes; counts 18 DONE, 144 PARTIAL, 37 MISSING unchanged; cloud/sx-linen-c-f15 30646fdeb3e2564d9f702ac2c716c3a1ba843396; PR 154; Verify 42518243082 pull_request success; guarded landing pending.
READY repo=just-every/run-linen branch=cloud/sx-linen-c-f15 head=30646fdeb3e2564d9f702ac2c716c3a1ba843396
