# Linen public-flow coverage

These are executable flow locations, not a release acceptance claim. Until a
candidate run is recorded, they are a test plan. Network/provider fixtures are
explicit; the emitted application, native sessions, D1 and R2 are real local
components. The complete contract exceptions and provider, hosted and owner gates
remain in ACCEPTANCE.md.

| Clause | Public flow and meaningful failure path | One primary executable flow |
|---|---|---|
| E1 | Create request, persist public/private replies and bytes, correct still-broken work, preserve offline draft and reject private reads | `ui/browser.mjs` (script) |
| E2 | Ask for access, resolve missing fact, deny absent authority, issue scoped standing permissions, independently verify provision and expiry denial; reconcile cancellation | `connectedRequest()` in `ui/connected-request.mjs` |
| E3 | Native join/move/leave, date correction and cancellation, reject DST gap/fold, retain incomplete security duties | `connectedLifecycle()` in `ui/connected-lifecycle.mjs` |
| E4 | Record asset, assign/receive/return with attributed custody receipt; physical return does not certify security completion | `custodyJourney()` in `ui/custody-journey.mjs` |
| E5 | Shared outage, rival diagnostics, separate employee cohorts, mistaken-link correction and real notification readback | `connectedChanges()` in `ui/connected-change.mjs` |
| E6 | Native declared change, conflicting windows, edited authority, partial/unknown effects, failed rollback and accountable takeover | `connectedChanges()` in `ui/connected-change.mjs` |
| E7 | Reviewed scoped article search and escalation, calendar-linked management report, employee report denial and closure/verification distinction | `adoption/prior-data-upgrade.mjs` (script) |
| A1 | Native employee cannot read private note/attachment/HR; membership revocation and erasure prevent later access or replay | `ui/browser.mjs` (script) |
| A2 | Standing authority avoids routine approval while missing/revoked/changed grants cannot dispatch; business choice creates no grant | `connectedRequest()` in `ui/connected-request.mjs` |
| A3 | Unknown effect survives cancellation/restart/upgrade, separate compensation authority and reconciliation prevent duplicate writes | `connectedCancellation()` in `ui/connected-cancellation.mjs` |
| A4 | Independent usable-work and negative-control observations bind outcomes; stale coverage and unobserved cohorts remain unknown | `connectedRequest()` in `ui/connected-request.mjs` |
| A5 | Employee sees saved configuration hold and next owner; owner reaches it through accountable responsibilities; actual loaded native journeys at 1440/390/320 with keyboard/overflow checks | `ui/browser.mjs` (script) |
| A6 | Archived native app creates old store through public APIs; supported `rer setup` applies additive migrations preserving all old rows/history, identities, roles, conversations, bytes, lifecycle, custody, policies, tombstones and held effects | `adoption/prior-data-upgrade.mjs` (script) |
| A7 | Missing configuration remains visible; failed/unknown attempts, budgets, provider outage, and measured simplification retain explicit cost/work gaps | `intelligence/runtime.mjs` (script) |

Supporting high-stakes checks remain separate: `work/runtime.mjs` and
`work/lifecycle-regressions.mjs` cover join/move replay, privacy and calendars;
`work/{fulfilment-link,amend,amend-manager}-runtime.mjs` cover bound request
corrections and authority; `execution/{runtime,authority-runtime}.mjs` and
`transport/runtime.mjs` cover races and provider effects;
`platform/{privacy,admission,tombstone}-runtime.mjs` cover erasure and admission;
`adoption/runtime.mjs` covers restore; `services/integration.mjs` covers service
binding; `ui/native-regressions.mjs` covers DST and named decisions;
`ui/connected-restart.mjs` covers durable restart and expired observations.
Repeated primary functions in the table contain a single connected journey whose
assertions address multiple clauses; no redundant wrapper tests were added.

O1–O3 coverage remains in the service runtime/integration and connected change
journeys. F1–F7 coverage remains in intelligence contracts/runtime/frontier,
engineering companion, connected frontier and restart journeys. No existing
semantic assertions were retired for the Base move. Navigation changed from `/`
to `/app`; first-run owner confirmation is now exercised at `/setup`.

Run the native suites one at a time from the candidate checkout under the shared
execution lease, using installed Playwright. Each runner builds its emitted app,
creates isolated data and closes its Worker/browser. `LINEN_TEST_OUTPUT` must be
an external evidence directory.

```sh
LINEN_TEST_OUTPUT=/absolute/evidence/native nice -n 15 node tests/ui/run.mjs
LINEN_TEST_OUTPUT=/absolute/evidence/connected nice -n 15 node tests/ui/connected-run.mjs
LINEN_TEST_OUTPUT=/absolute/evidence/setup nice -n 15 node tests/ui/setup-run.mjs
```

The one-off upgrade requires the read-only archived last-commit checkout. Set
`LINEN_PRIOR_SOURCE` to that checkout:

```sh
LINEN_PRIOR_SOURCE=/absolute/archived-linen LINEN_TEST_OUTPUT=/absolute/evidence/prior-data nice -n 15 node tests/adoption/prior-data-upgrade.mjs
```

The harness runs supported setup in its own disposable current-source copy;
it neither upgrades the archived checkout nor resets an owner database. Its
results include native before/after readbacks, setup log and explicit limits.
The archive-dependent proof is deliberately not an unconditional `rer verify`
dependency.
