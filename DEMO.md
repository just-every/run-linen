# Linen demo

Run `rer install`, `rer setup`, then `rer demo` and open its private `RER_OPEN`
link. The visitor is signed in as the saved owner, with a fictional Northstar
Studio workspace: 12 requests and incidents with conversation history, eight
people, four stock devices, four catalogue choices, four reviewed articles,
three services and two decisions. These are real editable domain records,
created by `src/demo.ts`; no provider outcomes are invented. Dates are relative
to the start. Seeding is idempotent.

Stop with `rer demo --stop`. Its `.rer/demo/<start>` data is deleted. A new demo
starts fresh; ordinary `.wrangler/state` is retained.

The package is pinned to published `@runeditrun/rer` 0.2.19. The seed-owned
`src/modules/demo` runtime comes from Base tag `rer-v0.2.19`, commit
`e17843562355e1b6e5068289c8e037951fbc8d3d`. Five runtime/declaration/Vite files
are copied unchanged except the index's two helper import paths. Its CSP helper
is copied unchanged from `modules/operator-auth/csp.mjs` at that same commit.
`base-copies.json` records the retained hashes. No guard behavior is changed.

On 0.2.19 Base blocks non-loopback outbound requests and supplies the shared
Demo bar. Local auth mail uses the existing development outbox; hosted magic
links are unavailable. Hosted sign-in verifies Base's signed owner claim with
its verifier, then uses Linen's atomic native bootstrap and session adapter.
This transport exists only with `RER_DEMO=1`; ordinary auth routes are unchanged.
No seed-side outbound blocking or capture code is added. A future Base release
will replace this policy with real reads and mocked successful third-party
effects and remove the bar/outbox; adopt its notes when published.

Each demo derives its connection-encryption key from its private session secret.
No production provider credentials are deployed.

`.github/workflows/run-demo.yml` is manually dispatched and reads the `run-demo`
environment in the RunEditRun account. `test_only` selects a separate host with
Cloudflare's published Turnstile test keys; `remove_test` removes that host and
reads back resource absence. Production uses the real environment widget keys.
No repository variable enables deployment. Startup timings select the
`deploy-demo.json` instance type, beginning at basic and stepping up only when
the 10-second p50 target is missed.
