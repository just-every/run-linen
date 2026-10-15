# Linen demo

Run `rer install`, `rer setup`, then `rer demo` and open its private `RER_OPEN`
link. The visitor opens signed in as the saved owner. The fictional Northstar
Studio workspace keeps its 12 requests and incidents, conversation history,
eight people, four stock devices, six catalogue choices, four reviewed articles,
three services and two decisions. These are editable domain records created
idempotently by `src/demo.ts`, with dates relative to the start. Independent
people and conversations are seeded concurrently; each conversation keeps its
normal ordered domain transitions.

The nav and document title read **Linen Demo**, or **Linen Dev** under `rer dev`.
There is no injected bar, captured-mail inbox or blocked-sends view. Local sign-in
is one click; development mail is validated and silently suppressed.

Public internet reads and checks use the real network. Demo effects reaching
people or third-party accounts return mocked provider success without sending.
The guard covers fetch in routes and scheduled work. A POST public check can use
`fetchDemoRead`; non-HTTP effects use `demoEffect(real, providerSuccess)` from
`src/modules/demo/index.mjs`. Linen's model effects use `demoEffect`; its Base mail sender validates and suppresses sign-in mail. Ordinary
production keeps real effects, and Base refuses production builds with RER_DEMO.
No production provider credentials are deployed to the demo.

The package pins `@runeditrun/rer` 0.2.22. `src/modules/demo` and its supporting
Base modules come from tag `rer-v0.2.22` (commit
`1ce15dd8cbb7c8cf2d83ebfde2b4a8a130ff9d74`). Only helper import paths change for
Linen's module layout; `base-copies.json` records retained hashes. The existing
three Vite adoption settings preserve isolated demo state, vars and sockets.
The retained import-kit and its D1 transport also match this tag; migration
0730 adds their preparation and erasure control tables without changing applied
history.

Stop with `rer demo --stop`. Its `.rer/demo/<start>` data is deleted; the owner's
`.wrangler/state` is retained. Each demo derives its connection-encryption key
from its private session secret. Hosted sign-in verifies Base's signed owner
claim, then uses Linen's atomic native bootstrap and native session adapter.

`.github/workflows/run-demo.yml` reads the `run-demo` environment in the
RunEditRun account. `test_only` selects a separate host with Turnstile test keys;
`remove_test` removes that host and reads back resource absence. Production uses
the real widget. The current `standard-2` instance type is retained.
