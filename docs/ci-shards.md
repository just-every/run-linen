# Push Verify journey plan

Run `node scripts/verify.mjs --plan` to print the six-shard assignment without
building or starting a Worker. `LINEN_VERIFY_SHARD=1/8` also previews a different
shard count. The workflow still runs six jobs with its existing 12-minute timeout;
the target is less than ten minutes per hosted job, including setup and Base checks.

The planner assigns the longest measured journey to the lightest shard, then
restores source order inside each shard. Its weights use the larger completed
journey duration from main Verify **42644529474** and f61 Verify **42647060661**,
rounded up. These are application journey times, not whole-job times. The latter
include dependency/browser/sandbox installation and the shared Base checks.

The old assignment estimated service-desk/lifecycle at 80 seconds although it
measured 137–139 seconds, and native transport at 58 seconds although it measured
9–13 seconds. Communications had the reverse imbalance (315 estimated, 96–141
measured). Archive/recovery measured 357–403 seconds against its old 315-second
weight. Shard 2 took 10m16s on f61, and shard 4 took 10m05s on main.

The employee browser was a single indivisible planner entry: 420 seconds on main,
and still unfinished when f61 shard 1 was cancelled at 12m15s. That cancelled
sample is censored; it is not treated as a completed duration. The browser now
exposes three independently initialized groups through `LINEN_BROWSER_GROUP`:

- `core`: the original employee/owner request, lifecycle, privacy and recovery
  checks, including the one mobile smoke and effort recording on the same request.
- `configuration`: pending people, catalog tasks, sandbox at both existing widths,
  lifecycle templates, import, applications, forms, audience and quotes.
- `operations`: dependencies, search, calendar, problem detection, recurrence,
  asset finance/audit/stock, sharing, fields, workarounds, drafts, queues,
  scenarios and MCP comments.

Every group still runs through the existing isolated native Worker and real
browser. `node tests/ui/run.mjs` defaults to all groups; the verify runner schedules
each group once. All original assertions, journey calls and widths remain. No
provider check moves tiers, no timeout changes, and no retry masks failures.
There are 33 planner entries rather than 31; this partitions the existing tests
and adds no product behavior assertions. The initial group weights (180/200/160
seconds) include repeated Worker preparation and must be refreshed from hosted
results rather than extrapolated from a faster local machine.

## Assignment

| Shard | Estimated application seconds | Journeys |
| --- | ---: | --- |
| 1 | 439 | Native archive/recovery; knowledge publication; intelligence protocols/budgets |
| 2 | 445 | Current effect authority; connection discovery; connected service recovery; billing; software license; report builder/exports |
| 3 | 441 | Native sign-in/API; configuration browser; fulfilment/effort; conversational intake; incumbent import; software provider |
| 4 | 439 | Employee browser core; configuration/sandbox; pending people; native transport; department privacy; notification rules |
| 5 | 438 | Operations browser; fulfilment integration; identity continuity; service operations; controlled changes/reporting; archive restore/erasure |
| 6 | 438 | Emitted HTTP; service desk/lifecycle; manager approval/bundles; execution/reconciliation; connection/authority; communications |

`verify progress` lines identify browser journey starts/completions and every
application check's exit code and elapsed milliseconds. The existing
`.wrangler/verification/results.json` timing artifacts retain completed check
results. Use the exact-head hosted run, including whole-job durations, to judge
the ten-minute target; the estimates alone do not establish it.
