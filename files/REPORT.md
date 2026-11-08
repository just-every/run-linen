# sx-linen-flake-1 report

Repository: just-every/run-linen. Product branch: cloud/sx-linen-flake-1.
Candidate: 5d749efb4578335e7ac54c907b8bd190d59d56bf. PR: none; Verify exposes workflow_dispatch for this branch.
Product commits: 6a99161 (published save, [skip ci]) and 5d749efb4578335e7ac54c907b8bd190d59d56bf (final candidate).

## Result and plan

1. Refreshed the fleet launcher, installed the decrypted-bundle Git helper, push guard and commit-message hook, cloned full history, and created the named branch from origin/main.
2. Audited opacity, computed styles, transforms, CSS assertions and fixed timing sleeps under tests. Replaced transition-frame reads with exact computed-opacity waits across eight existing journey files. Kept hover-delay, hidden-start, focus-visible and contrast assertions; made immediate keyboard presentation explicit with zero-duration checks. Full file-by-file findings are in AUDIT.md.
3. Replaced the strict global offline-text locator with a condition requiring visible network-error feedback inside the reply form after submission finishes. The existing unsent-draft equality remains. Extracted that same offline section into a helper used by both the original CI entrypoint and the focused proof.
4. Built through RER; ran the Verify typecheck, source-lock check and the four touched Verify browser entrypoints. Repeated monitoringJourney, mailboxJourney and offlineReplyJourney ten consecutive times each, with the final pass throttling only the browser CPU at CDP rate 4. No failed-run retries, timeout increases, skipped tests, disabled transitions or host CPU-burn processes were used.
5. Fetched and merged origin/main after the save (already current), regenerated the source lock last, inspected every candidate author/committer/trailer, and pushed only the named product branch through cloud-push.py. Published commits were never rebased or force-pushed.
6. Dispatched Verify through its existing pre-main entrypoint, polled exact-SHA runs via REST with one watcher and at least 300 seconds between run reads, and retained the actual receipts. Evidence publication is separate from product READY and landing.

## Counts and scope

Verify entrypoints: 31 before, 31 after. Registered tests added/deleted/skipped: 0/0/0. Focused proof: 30/30 journey passes, zero failures (10/10 per journey). Touched Verify entrypoints: 4/4 pass.

Clause status changes: none. No CONTRACT.md, ACCEPTANCE.md, docs/CLAIMS.md or src/** changes. Product diff is tests/** plus sources.lock.json. No acceptance/DONE, live-provider, hosted, deployment or landing claim is made.

## Validation

RER setup and build: exit 0 (build-receipt.json). Typecheck and final source check: exit 0 (typecheck.log, source-check-receipt.json, candidate-receipt.json).

| Verify browser entrypoint | Exit | Seconds | Actual log |
| --- | --- | --- | --- |
| employee | 0 | 395.761 | final-employee.log |
| communications | 0 | 148.102 | final-communications.log |
| billing | 0 | 56.465 | final-billing.log |
| department | 0 | 99.375 | final-department.log |

| Consecutive iteration | Journey passes | CPU throttle rate | Seconds | Actual log |
| --- | --- | --- | --- | --- |
| 1 | 3/3 | 1 | 58.174 | focused-1.log |
| 2 | 3/3 | 1 | 63.345 | focused-2.log |
| 3 | 3/3 | 1 | 60.4 | focused-3.log |
| 4 | 3/3 | 1 | 63.562 | focused-4.log |
| 5 | 3/3 | 1 | 61.476 | focused-5.log |
| 6 | 3/3 | 1 | 55.096 | focused-6.log |
| 7 | 3/3 | 1 | 58.444 | focused-7.log |
| 8 | 3/3 | 1 | 56.725 | focused-8.log |
| 9 | 3/3 | 1 | 64.104 | focused-9.log |
| 10 | 3/3 | 4 | 73.145 | focused-10.log |

The local schedulers started on 818cec20ac50404dcef1923bfa026440ed404b9a. Source-lock finalization changed only sources.lock.json. The complete tests tree equals the final candidate's tests tree (120e3945b00e5699883f66ef023de9b240f7bcf9); candidate-receipt.json records both hashes and the exact changed-path list. Thus the local proof tests the final test code without mislabeling the starting commit. Verify runs on the exact final candidate SHA.

Earlier employee and department passes are retained as preliminary logs/receipts; the final touched receipt is authoritative for the final test code. The first broad repetition scheduler was intentionally stopped after its first employee entrypoint completed successfully, then replaced by the focused same-code repetition driver to avoid repeating unrelated flows.

Exact-SHA Verify run IDs: 42507413107. All completed successfully on 5d749efb4578335e7ac54c907b8bd190d59d56bf. API calls used: 5/10. ci-receipt.json records paths, timestamps, run heads and URLs. No failed-job log downloads were necessary.

## Limits and custody

Held live-provider Okta and commitment restart journeys: NOT RUN because this task admitted no held provider credentials. The changed tooltip helper is exercised on the same account control by ordinary journeys. The test fixtures establish no live-provider acceptance.

No UI was changed, so no new UI screenshot proof was required. The task excludes the Mac publication scan; the fleet owns its independent publication/landing gates. No blockers remain for this candidate's branch Verify contract. No main/default-branch push, PR mutation, provider operation or deployment occurred.

All selected evidence is non-secret report/receipt data and explicitly selected logs/drivers. Raw worker directories, generated private configuration, credentials, environment dumps, held gate material and symlinks are excluded. The evidence-only ref is evidence/sx-linen-flake-1 and does not signal product acceptance or landing.
