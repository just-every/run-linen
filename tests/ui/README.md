# Native journey evidence

`run.mjs` boots the emitted application against a fresh local database and drives
real owner and employee sessions. It covers missing configuration honestly,
private data, lifecycle/custody, DST fold/gap rejection, material decisions,
correction, offline composition and desktop layouts and one 390px phone smoke. It uses actual
cookie/CSRF authentication and private R2, copies the build into isolated temporary
storage, applies all migrations and creates fresh session/encryption keys. It
never seeds the owner's preview. Evidence defaults to `.wrangler/ui-evidence`;
`LINEN_TEST_OUTPUT` overrides it. `LINEN_TEST_URL` is only for an explicitly
disposable test Worker: never point either suite at the owner preview.

The verifier builds once and passes `LINEN_TEST_BUILT=1` to each browser runner.
Set `LINEN_CAPTURE=1` to record proof; ordinary verification asserts flows at 1440
pixels and keeps one 390-pixel offline/reply smoke.

`connected-run.mjs` adds explicit test-only external provider protocols. It copies
the emitted bundle into an isolated temporary directory and wraps only its
external fetch boundary. Microsoft Graph, independent workflow, controlled
release, notification and model responses are in `provider-boundary.mjs`.
`/__fixture/state` changes provider behavior; it never writes application records.
Unknown external hosts fail. `tick` awaits the real application's scheduled entry.
There is no application mock, fallback, port interception or live provider effect.

The browser starts at the empty native bootstrap at `/app`, then confirms the
authenticated owner at `/setup`. The public Base Lobby stays at `/`.
Connection creation and checks,
source discovery/review, identity mapping, standing access-grant review, employee
requests/corrections, lifecycle changes, incident diagnostics, controlled-change
creation/authorization/dispatch/verification, business decisions, commitments,
research, engineering grants, capability use, simplification, notification
readback and cancellation use the product interface. API reads assert durable
state. API writes set up catalogue/advanced exact grants and plans under real
named authenticated principals where those details are prerequisites to the
journey. They do not insert synthetic effect or verification records. The local
engineering companion uses the actual authenticated companion API and repairs a
real temporary Git repository, preserving its original checkout.

After the connected browser finishes, the runner stops the actual Worker process
group and restarts it with the same D1/R2 state and secrets. A fresh browser signs
in and compares every grant, operation and provider receipt before creating a
short-freshness commitment natively and observing its transition to stale.

Run individually with `LINEN_TEST_PORT=8811 LINEN_TEST_OUTPUT=/absolute/evidence`
and `node tests/ui/connected-run.mjs`, or run `rer verify` for the complete
local gate. Use installed/cached Playwright; these runners do not download a
browser. Every runner closes browsers and its isolated Worker. Evidence includes
`results.json`, optional screenshots at 1440 and 390 pixels, actual engineering receipts and the
pre-restart persistence comparison. The provider boundary and model are fixtures,
so these results establish local wiring and invariants, not real tenant outcomes,
real-model generality, owner usability acceptance or economic advantage.
