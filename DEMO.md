# Linen demo

Run `rer install`, `rer setup`, then `rer demo` and open its private `RER_OPEN`
link. The visitor opens signed in as the saved owner. The fictional Northstar
Studio workspace keeps its 12 requests and incidents, conversation history,
eight people, four stock devices, six catalogue choices, four reviewed articles,
three services and two decisions. These are editable domain records created
idempotently by `src/demo.ts`, with dates relative to the start. Independent
people and conversations are seeded concurrently; each conversation keeps its
normal ordered domain transitions.

**What the owner sees first.** The demo opens on the Requests workbench with
Priya's request "Priya needs Figma for the brand refresh" selected: the queue on
the left (each row led by the person the request is for, with their team and
place), and on the right the request's facts (Priya Shah, Design; Denver, CO;
the day it is needed by; the Figma design seat), its Progress readback ("0 of 1
verified"), the red exception "This request is waiting for its current
manager's decision" with Alex Morgan, the owner, as next owner and Review
catalog approvals as the place it is resolved, then Linen's strip. The seed
records that state through the domain, as "Or choose a known service" does:
Priya's directory record is reviewed as her account reporting to the owner, her
request is recorded for her, and the Figma seat is chosen for it, which needs her
manager's decision. Approving it in Decisions records the business approval;
the seat itself still needs provider authority, so the request then reads
"This responsibility is blocked" with Operations & recovery as its next place,
because the demo connects no provider. On any wide
screen the workbench opens the newest request with an exception when the app
itself is opened; phones open on the list.

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

The package pins `@runeditrun/rer` 0.2.38. Every Base copy (`src/base`, the
modules under `src/modules`, the vendored edition-authoring tool, the Vite
local-settings helper and `.github/workflows/run-demo.yml`) comes from tag
`rer-v0.2.38` (commit `670337b90174dd708aba9c9ec235e3be2e816d39`) byte for byte,
as `base-copies.json` records. The three Vite adoption settings preserve isolated
demo state, vars and sockets. Migration 0730 adds import-kit's preparation and
erasure control tables without changing applied history.

Stop with `rer demo --stop`. Its `.rer/demo/<start>` data is deleted; the owner's
`.wrangler/state` is retained. Each demo derives its connection-encryption key
from its private session secret. Hosted sign-in verifies Base's signed owner
claim, then uses Linen's atomic native bootstrap and native session adapter.

`.github/workflows/run-demo.yml` is Base's template and reads the `run-demo`
environment in the RunEditRun account. It deploys the hosted demo on Base's
native Worker host: each visitor gets their own isolate with `DB` as a SQLite
facet, `ATTACHMENTS` (R2) in their own storage and the every-minute cron by alarm;
the copy is erased after 60 minutes or 15 idle minutes. `test_only` selects the
separate `demo.test.run-linen.com` host with Turnstile test keys; `remove` removes
the selected host and reads back that it is gone. Production uses the real widget.
Alex Morgan at `alex@northstar.example` is the Northstar Studio owner.
