# API-003 point 6 continuation

Repository: just-every/run-linen. Product branch: cloud/sx-linen-c-f11-pc1. The saved product commit aa04f912a23befd32c390ca877f4e5a0d1c2da98 is preserved.

## Scope and result

The selected point 6 is proved through native owner POST `/api/v1/mcp-credentials` and real MCP and native decision routes. The genuine persisted automation principal holds only the integration role. Fixtures contain a completed manager approval, a completed first stage, a pending second stage and an existing execution grant belonging to that principal. Complete row snapshots of memberships, group memberships, department roles, role members, automation principals, fulfilment approvals, approval stages, stage decisions, approval tokens, execution grants and grant revocations are identical before and after minting, and again after refused approval and decision attempts. The newly minted credential also successfully reads a granted ticket. The original human approver can still complete the pending second stage afterward.

No product authority implementation change is needed for that outcome. The saved test proof is retained. No approval, grant, custom role, seat, provider or additional tool authority is introduced. ROLE-001 and wider Base and provider holds remain outside the selected lease. API-003 is claimed PARTIAL with point 6 credited; no Status, Gap or Evidence cell is edited by this builder.

## CI diagnosis and integration plan

Verify 42515978740 on the saved SHA failed journey job 128839089567 and aggregate job 128841778777. Light, build and five other journey shards succeeded. Both required `gh run view ... --log-failed` calls exited successfully with empty formatted output. The locally cached archive contains the actual diagnostic, retained in `ci-failure-excerpt.txt`: `locator.waitFor: Error: strict mode violation: getByText('Linen could not reach the service.') resolved to 2 elements`, at `tests/ui/browser.mjs:418`. One match is in the collapsed Workspace handoff form and the other is in the Linen conversation region.

Before any edit, replayed `pnpm exec rer verify` on the saved head with `LINEN_VERIFY_SHARD=1/6`, `LINEN_TEST_BUILT=1`, `CI=true`, Node 22.20.0 and the required cloud Chromium executable. The replay passed, so no speculative repair was made. Fresh main already contained published browser feedback and tooltip transition fixes. Integrated those through a merge, retained newer main judgments and tests, regenerated the lock and reran the selected native proof. A separate main worktree passed the same employee browser entry point using identical application source and the built artifact; only its isolated local port differed.

## Acceptance evidence map

This map distinguishes the selected proof from inherited coverage; it does not promote unproved outcomes.

| Acceptance sentence | Door and journey | Evidence and result |
| --- | --- | --- |
| 1. Connect as an automation principal, list the permitted queue and refuse an out-of-grant action. | `/api/mcp`; `tests/platform/mcp-tools-cases.mjs` function `mcpToolCases` | Existing populated queue, other queue and restricted-ticket cases retained; focused native runtime passes. |
| 2. Authenticate before discovery, recheck current membership and automation status, return an auth error without names. | `/api/mcp`; `tests/platform/base-auth-runtime.mjs` unauthenticated discovery and live authority cases | Existing missing, wrong-audience and wrong-bearer discovery assertions, role changes, deactivation, revocation and erasure refusals retained; focused runtime passes. Complete broader Base discovery behavior is not expanded in this lease. |
| 3. Initialize and ping; discovery intersects usable scopes, selected tools and readership. | `/api/mcp`; `tests/platform/base-auth-runtime.mjs` initialize and registry cases; `mcpToolCases` scope cases | Initialize, registry and call-level scope refusals pass. Complete sentence not claimed: the maintained Base transport has no ping method and advertises its published four-tool registry while selected native subverbs remain call grants. No Base helper patch or wider discovery adoption is made. |
| 4. Map six closed ticket operations to their existing scopes, projection, queue and commit rules. | `/api/mcp`; `mcpToolCases` | Existing six native subverb cases behind the four published registry tools retained, including redaction and commit-race rollback; focused runtime passes. |
| 5. Refuse approval, decisions, credential minting, grants, configuration, archives, erasure, effects, plans and bulk changes. | `/api/mcp` and native routes; `tests/platform/base-auth-runtime.mjs` refusal loop and `mcpToolCases` | Existing closed-tool and forbidden-method checks retained; new populated approval proof refuses both MCP methods and tool calls, and refuses borrowing a human session at native decision and grant routes. No future external-effect authority claimed. |
| 6. Minting never grants agent approval rights or changes existing approvals or grants. | Owner POST `/api/v1/mcp-credentials`; `tests/platform/mcp-tools-cases.mjs#mcpToolCases`, called by `tests/platform/base-auth-runtime.mjs` | Saved proof at lines 77–133: nonempty authority snapshots equal after mint and refusals; minted credential reads its granted ticket; direct methods return -32601, unregistered tools return 400 with tool_not_found, native bearer requests return 401 with rest_auth_required; original human decision completes. Focused runtime passes. |

## DONE-RIDERS results

A full-clause DONE claim is not made. These rows record the selected point and inherited boundaries honestly.

| Row | Result | Evidence |
| --- | --- | --- |
| 1 | PASS selected point 6; PARTIAL full clause | Native public-door journey above covers the selected real outcome; complete point 3 remains outside the maintained Base floor. |
| 2 | PASS | Snapshots contain real approved and pending records and an execution grant; successful mint and human decision plus unsafe MCP refusals execute both directions. |
| 3 | PASS | Verify 42529338326, pull_request event, completed success on edd950f35fc0966f86828c1220b83f18bc31135f. The existing Verify command invokes the native auth journey. |
| 4 | PASS | Focused runtime reran on the integrated candidate tree. A committed diff check confirms every relevant application, migration and MCP test byte is identical to the saved head; only the source lock and merged main tests differ. Receipt names the committed tree and SHA. |
| 5 | INSPECTED | API-003 cites BASE-AGENT-001 at CONTRACT.md line 2055. No inheritance or acceptance text is changed. |
| 6 | PASS | Contract write reports zero documents changed; check reports zero errors or warnings and current documents. Both views restored from main. Lock regenerated last and integrity check exits 0. Contract and views are byte-identical to merged main. |
| 7 | PASS | No acceptance sentence or coverage rewrite. |
| 8 | PASS | Existing independent native manager and stage approver succeed; minted integration credential is refused at MCP methods, tools and native routes, with identical authority state. |
| 9 | PASS boundary | Fixtures prove native behavior only; no live provider, account, legal, scale or device claim. |
| 10 | PASS boundary | No new policy default. Existing owner-only mint and integration-only principal constraints retained; ROLE-001 and all other held authority remain unclaimed. |
| 11 | Pending guarded lander | No cloud landing, main mutation, Run site claim or publication-scan claim. |

## Pre-READY self-check

Selected behavior is covered by the same native public-door sanity journey with populated allowed and refused paths. No assertion was removed, skipped, reduced or moved behind a width condition by this continuation. The saved queue expectation adds the newly created approval ticket without dropping another expected ticket. Existing revocation, erasure, idempotency and commit rollback assertions stay active. No screen, icon control, homepage, logo or application look is changed. Existing browser journeys exercise their own desktop and mobile screens; no new browser test or extra test registration is added. Source lock and generator results, exact-SHA CI and publication custody are stated separately in the final receipt. Cloud publication scanning and main-only Run site remain the fleet's independent gates.

PROBE API-003 6: native owner POST /api/v1/mcp-credentials for an existing integration-only automation principal with populated approvals and execution grant -> 201; every authority snapshot identical; granted MCP read succeeds; approval and decision methods -32601, unknown tools 400, native bearer requests 401; original human approval still completes.

GAP API-003: Point 6 is closed; the full clause remains PARTIAL because the maintained Base ping and complete discovery requirements are not proved by this lease. Wider tools, resources, prompts, events, external effects and existing role, account, Base and device holds remain omitted.

## Final provenance and receipts

Product SHA: `edd950f35fc0966f86828c1220b83f18bc31135f`. Tree: `f69a8aa16b20afb00afbecfdb425fba85674cbb1`. Branch: `cloud/sx-linen-c-f11-pc1`. Saved history preserved. Merged main: `83d80f33869145ff2853f4e6d6b08e46b23acde1`. Product branch remote head was independently read back and equals the candidate. Product push guard succeeded on attempt 1. All two candidate commits have the fleet author and committer, with no trailers.

PR: https://github.com/just-every/run-linen/pull/162. Exact-SHA Verify: 42529338326, event pull_request. It completed with success on the exact candidate SHA. No workflow dispatch or rerun was issued.

The original failed assertion did not reproduce: the complete saved-SHA shard replay exits 0, including the existing browser journey and all 601 of 601 Base conformance points. No local repair was attempted, and no VERIFY_REPRODUCED receipt with a fabricated nonzero exit is claimed. The candidate carries the already-published main fix through a normal merge. Original failure remains documented for fv.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0.

Native auth runtime, integrated typecheck and first-party check exit 0. Contract and generated views match origin/main exactly. The complete command results and source hashes are in RECEIPT.json. No migration was edited. The separate main browser check exits 0 on main 83d80f33869145ff2853f4e6d6b08e46b23acde1. It includes offline unsent-message preservation, API-003 attribution and employee internal-comment isolation, and records zero page errors. Its detached worktree has been removed after completion.

Counts at the saved starting main: 18 DONE, 144 PARTIAL, 37 MISSING of 199. Current merged main and candidate: 20 DONE, 142 PARTIAL, 37 MISSING of 199, solely from other writers' CHANNEL-009 and DESK-019 promotions. API-003 stays PARTIAL; this round's count delta is zero. No test registration was added or removed.

Plan return: API-003 point 6 proof complete on the candidate; broader held Base and role remainder unchanged. No lane plan file was written in cloud.

Publication scan receipt: commit=edd950f35fc0966f86828c1220b83f18bc31135f complete=unestablished historyScanned=unestablished findings=unestablished; not run in cloud, fleet scan pending. Main does not equal this branch candidate. Main-only Run site and guarded landing remain pending. No scan or landing result is implied by the evidence push.


CLAIM API-003 PARTIAL points=6 tests=tests/platform/mcp-tools-cases.mjs#mcpToolCases

Final CI receipt: Verify 42529338326, event=pull_request status=completed conclusion=success head=edd950f35fc0966f86828c1220b83f18bc31135f. Eight GitHub command calls used. No workflow dispatch, workflow rerun or local repair round. No product blocker remains for the selected point 6 proof.
