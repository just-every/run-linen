# Linen employee denial 500 — sx-linen-denial-500-1

Repository: just-every/run-linen. Product branch: cloud/sx-linen-denial-500-1.
Baseline: e9aa94360d01ae5c8ae48557a61aca3c565f3236 (origin/main).

## Finding and change

The unmodified main browser runner reproduced an employee denial HTTP 500 at width 390, zero-based iteration 44, on POST /sandboxes/<synthetic id>/rollback-package. Its receipt records 446 preceding 403 responses and one 500. The HTTP response says `Error: Network connection lost` with a Miniflare core entry Worker stack. Wrangler's server output independently identifies the same POST and `Error inside ProxyWorker ... failed after 1 attempt: Network connection lost`. The failure occurs in the development forwarding Worker, before the application permission guard runs. A simultaneous auxiliary burst loop was interrupted when the failing baseline runner shut down its server; its subsequent Failed to fetch is not counted as another HTTP 500.

Wrangler's pinned ProxyWorker source describes equal 5-second client-pool and server idle timeouts. GET/HEAD recovery exists there, but non-idempotent POST/PUT requests are deliberately not retried. Existing tests/ui/worker-server.mjs already serves the same emitted application directly with the pinned Wrangler Miniflare and real D1/R2; connected-run.mjs uses it. The affected main tests/ui/run.mjs still used wrangler dev and its forwarding hop. The change switches that runner to the existing direct server, waits for its actual readiness, validates the empty database once, and disposes it directly. It also includes the server exception beside a failing browser assertion.

The sandbox owner/read guards on main already reject the employee role before any configuration reads or body parsing. Every sandbox handler, including promotion, rollback, approval and rehearsal, enters those guards first. No product permission change, catch-all conversion of 500 to 403, request retry, or weakened 403 assertion is introduced. The existing sandbox journey now checks all 21 current sandbox doors plus an absent-resource promotion with malformed JSON: all must return the real typed 403 `forbidden`. This also ensures malformed input cannot supersede an employee refusal. Owner validation and other errors retain their existing typed API handling.

## Plan and validation

The full plan is PLAN.md. Complete baseline/candidate status receipts, exception excerpts and commands are published with this report on the evidence ref only. All data uses synthetic local fixtures. Browser contexts are freshly created and closed; no owner browser/session is used. The tests drive the emitted application and real local D1/R2, with no provider success simulation.

The separate main run at 1440 completed 200 denial iterations (2,000 actual HTTP 403s) and 200 repeated owner scans of the tagged asset (HTTP 200), without another 500. The 390 baseline stopped at its first HTTP 500, preserving the failed response and exception rather than retrying it.

The touched sandbox journey passed its complete native edit/rehearsal/review/approval/promotion/rollback flow, designated-administrator restrictions and the new 22-case employee refusal assertion at 1440. ASSET-010 passed at 390 and 1440, scanning 18 of 20 devices and reconciling the two missing devices into follow-up requests. Scope-refusal and stocktake screenshots at both widths accompany the receipts. Typecheck and syntax checks passed. The regenerated source lock passes its check.

The candidate is 5076449f4c0a30b83f5a910a466f6d08ac98cb8d, after merging updated main 833e41a. That merge adds main's unrelated application tests and retains all current assertions. The source lock was regenerated and checked after the merge; the checkout is clean. Local journeys began on the first save; the later changes add failure diagnostics and merge main's tests, with no application-source change. Exact-SHA Verify covers the integrated final candidate. Verify run 42590113043 completed successfully on exact SHA 5076449f4c0a30b83f5a910a466f6d08ac98cb8d: https://github.com/just-every/run-linen/actions/runs/42590113043. The existing workflow_dispatch entry point was used after discovering that this SHA had no Verify run; no PR was needed or created. One watcher made the required REST status calls at least 300 seconds apart. Total GitHub API/CLI invocations: four, within the ten-call budget. There was no failing CI job to retrieve. The success is a full Verify result, without needing the generated-contract-view exception.

## Scope and counts

No clause rows, statuses, gaps, evidence cells, contract views, product identities or legacy prose are edited. Clause counts before/after remain: 28 done, 134 partial, 37 missing, 199 total. No DONE claim is made. No new test registration is added: one existing sandbox browser journey is extended, and the verification script still declares 31 checks. The source lock is regenerated after source edits. The publication scan is not run, as explicitly excluded by the brief.

## Operational custody

The first real product commit 3348469da6ebf76e2dcf3df24f7291563e57e6fb was pushed immediately with [skip ci]. A second substantial save adds Worker exception output. Published history is retained; main is merged, never rebased, before final publication. Only the named cloud product branch is pushed. Evidence is a distinct report-only tree on evidence/sx-linen-denial-500-1; it does not authorize landing or signal product READY.

## Final measured result

The candidate loop completed 200 iterations at each of 390 and 1440: 400 total iterations, 4,000 real HTTP 403 denials, 400 owner ASSET-010-tag scans returning HTTP 200, and zero HTTP 500s or transport errors. The first 50 iterations at each width retain the baseline's 5,000ms idle intervals (including its failing iteration 44); the remaining 150 run the same public-door requests sequentially without an idle pause. Each iteration probes sandbox creation, edit, promotion, read, approval, rollback, masked-record creation, audit creation and employee scan denial; promotion is additionally used as the first idle-boundary probe. There are no retries or swallowed failed assertions. The separate existing browser regression covers all 21 current sandbox doors plus absent-resource promotion with malformed JSON.

| Measurement | Before, main | After, candidate |
| --- | --- | --- |
| 390 denial loop | 446 HTTP 403s, then 1 HTTP 500 at iteration 44 | 200 iterations, 2,000 HTTP 403s, zero 500s |
| 1440 denial loop | 200 iterations, 2,000 HTTP 403s, zero 500s | 200 iterations, 2,000 HTTP 403s, zero 500s |
| Repeated owner asset scans | 200 at 1440, all HTTP 200 | 200 per width, all 400 HTTP 200 |
| Existing touched browser journeys | Baseline HTTP fault captured separately | Sandbox flow and ASSET-010 passed |
| Clause status changes | none | none |
| Verify | Not claimed for baseline | 42590113043: completed/success on exact candidate SHA |

The product remote ref was independently read back as refs/heads/cloud/sx-linen-denial-500-1 at 5076449f4c0a30b83f5a910a466f6d08ac98cb8d. PRODUCT-RECEIPT.json records the full-history clone, clean checkout, changed files, merged main, all candidate author/committer/trailer checks and remote custody. CI-RECEIPT.json, CI-HISTORY.jsonl and GITHUB-CALLS.jsonl preserve the actual exact-SHA result and four-call budget. The evidence packet is report-only and includes no credentials, environment dumps, private gate material or symlinks. Test driver source remains outside the publication packet; receipts contain only synthetic records and ordinary HTTP response/error data.

Blockers: none. No PR was created. No publication scan or clause promotion was performed. The fleet owns publication review and landing from its own machine.
