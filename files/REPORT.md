# sx-linen-c-f27 report

Disposition: BLOCKED by the fix round's mandatory non-reproduction rule. The reported LIFE-002 operator-search assertion did not fail on the refused source in the Node 22.20.0 work runtime. No speculative repair, product commit, contract edit, PR or product push was made.

## Scope and provenance

Declared repository: just-every/run-linen. Intended branch: cloud/sx-linen-c-f27, initialized from main. Refused source tested: e8dd72e6b634e11559de32489a60388912fa53e7. The fresh full-history clone's main at initialization was ce86a9413f41103d066aa66c3db8d43fb40da248. Predecessor PR: https://github.com/just-every/run-linen/pull/157. No new PR was created. The fix-only section overrides the broader campaign and forbids additional acceptance work.

Recorded Verify: 42524581296, event pull_request, conclusion failure, exact refused head e8dd72e6b634e11559de32489a60388912fa53e7. Failed journey job: 128865352710, journeys (6). The aggregate verify job 128867922213 also failed. Reported failure from the brief: LIFE-002 ordinary operator ticket search cannot recover the subject through reminder text; actual 3, expected 0, rendered as `3 !== 0`.

The authorized failed-job archive command was invoked once:
`gh run view 42524581296 --repo just-every/run-linen --job 128865352710 --log-failed`.
It returned exit 0 with an empty output file. No assertion log was obtained, and no blocked blob-download retry was attempted. Three GitHub calls were used: exact-head run discovery, failed-job discovery, and that archive command. No new CI dispatch or rerun occurred.

## Actual checks

- Fleet launcher refresh, credential helper, cleanup guard, commit hooks and pinned pnpm setup completed. The repository's existing dependency pins were retained.
- Public RER setup completed, including the build and local migrations. No setup state or credential file is selected for evidence publication.
- `CI=true LINEN_TEST_BUILT=1 LINEN_VERIFY_SHARD=6/6 node tests/work/runtime.mjs`, explicitly using Node 22.20.0: exit 0. This runs the reported LIFE-002 search assertion at tests/work/lifecycle-template-cases.mjs lines 155 to 156, along with the rest of that journey and ACCESS-008 applicationChecks.
- `pnpm typecheck`, explicitly using Node 22.20.0: exit 0.
- The failed job command `CI=true LINEN_TEST_BUILT=1 LINEN_VERIFY_SHARD=6/6 pnpm exec rer verify` was also run on the exact refused source. Its orchestration used the VM Node 24.19.0 for the package-manager child despite RER announcing project Node 22.20.0. This environment distinction is retained; the direct work runtime above used the CI Node pin. Its full result was exit 0, all seven local shard checks passed, and RER Verify completed successfully. The actual per-journey results are retained in prior-shard6-results.json, with the full output in prior-shard6.log.
- An earlier orchestration attempt returned exit 4 while the setup process still held the checkout operation lock; no journey ran in that attempt. The command was retried after setup completed. That exit is not a reproduction of the reported assertion.

The reported LIFE-002 search assertion passed in the direct Node 22 runtime and in the shard's work runtime. The source was not instrumented or edited. Its assertion still requires total 0; no assertion was removed, narrowed, skipped or moved behind a condition.

## Public-door probes and claim

PROBE LIFE-002 operator-search finding: authenticated GET /search with the synthetic reminder subject and ticket type as an unrelated operator -> total 0; the reported total 3 did not reproduce on the refused head.

PROBE ACCESS-008 3: exact-current-revision POST /work/:id/approval-stage as a distinct active metadata-only employee -> 403; the open chain and stored decisions remain unchanged, with no execution-grant, membership or role change. The authorized holder satisfies the same stage. See applicationChecks in tests/work/application-cases.mjs, lines 45 to 96, executed by tests/work/runtime.mjs.

CLAIM ACCESS-008 PARTIAL points=3 tests=tests/work/application-cases.mjs#applicationChecks
GAP ACCESS-008: The requested Verify repair is unestablished because its LIFE-002 assertion did not reproduce. Existing held scope and contract judgments remain unchanged; no new acceptance promotion is claimed.

## Contract and rider review

No contract cells, acceptance points or plan rows changed. The refused source retains 20 done, 142 partial and 37 missing clauses before and after this investigation. The initialized main has 21 done, 141 partial and 37 missing clauses; the difference is existing main progress, not this run's work. ACCESS-008 remains partial in both.

Rider 1: selected metadata-only exclusion is locally reached through public routes; whole-clause DONE is not claimed.
Rider 2: the selected unsafe decision is refused without state change and the authorized holder succeeds; PASS locally in applicationChecks.
Rider 3: FAIL for a DONE claim; recorded exact-head Verify remains red. Local passing output is not substituted for that run.
Rider 4: local checks used the exact refused source, with no tracked diff; PASS for provenance.
Rider 5: no inherited duty was altered or newly claimed; INSPECTED.
Rider 6: contract status and generated views remain untouched; no candidate regeneration or status flip was performed after the non-reproduction stop.
Rider 7: no acceptance text or coverage rewrite; PASS by clean tracked diff.
Rider 8: metadata-only refusal and authorized approval are both exercised with authority snapshots; PASS locally for selected scope.
Rider 9: no provider delivery, provisioning or live account boundary was claimed; existing holds remain.
Rider 10: no new policy default adopted.
Rider 11: pending; no candidate landing, exact-main Run site or publication scan receipt is claimed.

PRE-READY: not satisfied and no READY is emitted. Exact-SHA Verify is red on the refused source and the brief prohibits guessing a fix after non-reproduction. No UI code changed, so no new touched-screen proof is claimed. Erasure and replay checks already in the work runtime passed; this investigation adds no authority or data exposure.

MECHANICAL lock=not run, no repaired candidate; views=not run, no contract edit or repaired candidate; ledger=none, no migration change.
Publication scan: not run in cloud; no product candidate was created. Main equality: not established for the refused head, which differs from initialized main. Run site: no new run. Evidence publication is report-only and cannot signal READY, acceptance or landing.

## Handoff

The next action is fv triage of the original CI runner's reproducible assertion using its actual failing output and environment. This run cannot truthfully provide a VERIFY_REPRODUCED receipt: the relevant local assertion exited 0. Original work remains preserved by its already-published predecessor head and PR; no finished new product work is discarded. The evidence packet contains the plan, this report, actual test output and structured receipt, and excludes credentials, environment dumps, private gate material and setup state.
