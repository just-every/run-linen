# Linen Verify shard timing repair — sx-linen-shard-time-1

Repository: just-every/run-linen  
Branch: cloud/sx-linen-shard-time-1  
Product head: 9e9333540cd16e9cccb92dc3165433250336cc59  
Pull request: https://github.com/just-every/run-linen/pull/211

## Current custody

The product branch was pushed through the fleet guard on its first attempt.
Local touched checks passed. Exact-head Verify 42668280526 completed successfully
on 9e9333540cd16e9cccb92dc3165433250336cc59. All six hosted journey jobs
finished below ten minutes. READY applies to this pushed product head only.
Evidence publication is separate from product acceptance or landing.

## Plan and implementation

The full executable work plan is in PLAN.md. Read the launcher/repository rules,
read completed hosted timing samples, partition the existing browser suite,
refresh measured allocation weights, validate locally, regenerate/check the
source lock last, push the named branch, obtain exact-head hosted proof, then
publish the complete non-secret report packet on its separate evidence ref.

The existing longest-first planner still schedules six sequential journey jobs.
The largest old planner entry was the employee browser, which contained all 43
browser journey calls and could not be moved between shards in smaller pieces.
It now has core, configuration and operations fixture groups. Direct invocation
still runs all three, and Verify schedules each exactly once on a fresh native
Worker. The effort journey stays with the core request it measures. All 21
inline assertion expressions and all 43 journey invocations remain intact;
no test, assertion, viewport, provider boundary or workflow tier was removed,
skipped or weakened. Six shards and the 12-minute timeout remain unchanged.

Measured weights use the ceiling of the larger completed application-journey
sample from main Verify 42644529474 and f61 Verify 42647060661. The cancelled
f61 browser sample is censored, not treated as a completion. The three new
fixture-group weights are explicit conservative estimates, separate from the
hosted measurements. --plan now prints without building and respects a supplied
shard count. Progress lines expose browser journey starts/completions and every
application check's exit code and elapsed milliseconds.

The checked-in plan is docs/ci-shards.md. Product files changed:
scripts/verify.mjs, tests/ui/browser.mjs, docs/ci-shards.md and sources.lock.json.
No CONTRACT.md, ACCEPTANCE.md, docs/CLAIMS.md, workflow timeout, package pins or
provider configuration was changed. No publication scan ran, as this CI-only
brief explicitly excludes it; independent fleet publication gates still apply.

## Baseline

| Shard | Main 42644529474 | f61 42647060661 |
| --- | ---: | ---: |
| 1 | 8m29s | 12m15s, cancelled |
| 2 | 9m34s | 10m16s |
| 3 | 4m23s | 6m01s |
| 4 | 10m05s | 8m04s |
| 5 | 6m53s | 6m13s |
| 6 | 8m56s | 9m01s |

Main's employee browser completed in 419.659 seconds. On f61 it was still inside
that one script when the job was cancelled; its last progress was catalog
approval. Native archive/recovery measured 357–403 seconds rather than its
315-second weight; service desk/lifecycle measured 137–139 rather than 80.
Communications measured 96–141 rather than 315, while native transport measured
9–13 rather than 58. These stale weights made other shards unnecessarily heavy.
The current monolithic browser source is identical on main and the cited f61
head; no product clause change was imported to diagnose it.

The original archives did not emit the requested literal "verify progress"
lines. Application timings were extracted from timestamped Checking boundaries
and terminal PASS markers. The cancelled job's --log-failed command returned
empty output, so the completed run archive was read once instead. No direct job
blob endpoint was retried. Actual jobs/archives were used, with no substitution
from another SHA. Raw logs remain outside the public packet; only non-secret
extracted timings and actual API metadata receipts are selected.

## Local validation and counts

Application setup and build completed using the public RER commands through
cloud_run. Typecheck and first-party checks passed. Planner probes confirmed all
prior entries retained and exact-once coverage across 1, 2, 6 and 8 shard plans;
invalid shard inputs refused. All three browser groups passed against separate
native Workers using /usr/bin/chromium with --no-sandbox, with no page errors.
Group body times were core 84.933s, configuration 94.418s and operations 123.858s;
these exclude Worker preparation and are not hosted-run timing proof.

The source lock was regenerated last and its workspace check passed, but the
first publication exposed a mistake: docs/ci-shards.md was untracked when the
lock ran. An exact committed-tree check reproduced the stale lock. The first
exact-SHA Verify 42666259242 completed with failure. The document was then
locked while tracked and a follow-up commit was pushed; the final clean
committed tree passes source:check. The complete first-run conclusion is retained
in first-candidate-runs.json; no uninspected failure log is claimed as read. git diff --check
passed. Fleet author/committer identities and every candidate's trailers,
including side parents, were inspected before the guarded push. No co-author
trailers were present. Main was fetched before the first candidate. Before the follow-up, newer main
902228f850007e262d9404b1f81397ef69e50e95 was merged without rewriting the
published branch. Its bundle-capacity tests and source-lock update were retained.

Planner entries: 31 before, 33 after (the same employee browser split into three).
Browser assertion expressions: 21 before, 21 after. Journey calls: 43 before,
43 after. No new product behavior assertions or test-cap increase. The single
site registration remains unchanged; application Verify plus that registration
has 34 script/registration entries, below 200 (vendored Base checks excluded).
Contract counts: 199 total, 31 done, 131 partial, 37 missing before and after.
Clause changes: none. No CLAIM status promotion is made by this CI repair.

## Final exact-head hosted result

Verify **42668280526**: completed/success on product head
**9e9333540cd16e9cccb92dc3165433250336cc59**.

| Job | Whole-job duration | Job ID | Result |
| --- | ---: | --- | --- |
| journeys (1) | 7m00s | 129337949365 | success |
| journeys (2) | 7m07s | 129337949383 | success |
| journeys (3) | 6m16s | 129337949485 | success |
| journeys (4) | 7m58s | 129337949654 | success |
| journeys (5) | 9m49s | 129337949491 | success |
| journeys (6) | 9m21s | 129337949573 | success |

Light, build and the aggregate verify job also succeeded. Longest shard:
**9m49s** (589 seconds, shard 5). Mean shard: **7m55.17s**; longest/mean:
**1.240**, within the 1.5 bound. Shard 1 changed from f61's cancelled 12m15s
sample to 7m00s on this candidate. Main's prior longest completed shard was
10m05s; this candidate's longest is 9m49s. The workload assigned to each numbered
shard changed, so these are whole-plan comparisons rather than identical-job
microbenchmarks. The longest has eleven seconds of observed margin to the
requested ten-minute bound; no broader performance guarantee is claimed.

The final candidate meets the brief's gate: every shard green and under the
limit, with no test or timeout weakened. Exact metadata and durations are in
candidate-runs.json, candidate-jobs.json and ci-receipt.json. Both initial and
final exact-head conclusions are retained. Ten of ten GitHub calls were used;
no dispatch, rerun or short polling loop was used. Evidence transfer uses Git
and does not consume a GitHub REST call. No blockers remain. No landing or main
push was performed; PR #211 remains for the lane/fleet's independent gates.

## Receipts

PLAN.md; baseline-shards.json; journey-timings.json; shard-plan.json;
coverage-receipt.json; browser-receipt.json; browser-core.log;
browser-configuration.log; browser-operations.log; local-checks.json;
source-lock-receipt.json; product-receipt.json; pr-receipt.json (PR creation);
first-candidate-runs.json;
clause-counts.json; api-budget.json. Original API job/list responses are retained
as f61-jobs.json, main-jobs.json and main-runs.json.

Final receipts also include candidate-runs.json, candidate-jobs.json and ci-receipt.json.
