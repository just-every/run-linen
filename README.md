# Run it locally

One line installs the RER CLI, clones Linen and starts it:

```sh
npx -y @runeditrun/rer dev just-every/run-linen
```

Without Node, `curl -fsSL https://runeditrun.com/install.sh | sh -s -- dev just-every/run-linen` does the same. To start it again later, run `cd run-linen && rer dev`. To prepare it yourself, run `npx -y @runeditrun/rer install just-every/run-linen`, then from the Linen edition directory:

```sh
rer setup
rer dev
```

Open the local address printed by RER (`RER_READY` or `RER_OPEN`); RER selects
and records an available port. The installed Lobby is at `/`, first-run owner
setup is at `/setup`, and the Linen application is at `/app`.

Linen is an owned IT service system. Its intended employee experience centers on
one conversation and a concise **Needs your decision** view, with contextual
service, lifecycle, connection and recovery work. It starts without seeded
requests or simulated provider outcomes. Owner-controlled credentials, consent,
scoped grants and independent outcome evidence remain required for external
effects.

`rer verify` runs Linen's browser, connected-journey, setup, HTTP and
intelligence checks, and CI runs it on every change. An archived native-data
upgrade was checked to retain prior rows and migration history. No real-provider action, hosted deployment or owner
acceptance is claimed; those full-release dimensions remain unproven. The native
Base authentication bridge and Linen account/data continuity are retained, as
are the existing product, package, edition, Worker and D1 identities. See
[ACCEPTANCE.md](ACCEPTANCE.md) for the full gates.

## Guides and the run site

Owner guides live in [docs/](docs/site.json): getting started, everyday work, moving in
from Freshservice, and backup and restore. `rer build --site` builds them into the run
site's `/docs`, beside its homepage and the Run page (`src/site/`, declared in
`deploy-site.json`). The installed instance keeps the Lobby at `/`.

## Operate and extend

[OPERATIONS.md](OPERATIONS.md) documents the RER operating commands, provider
boundaries, recovery and engineering responsibilities. [ONBOARDING.md](ONBOARDING.md)
covers first-run setup. Source is edition-owned; extend it through tested changes
in the maintained source workflow rather than regenerating an existing product.
A development companion is not endpoint management.

Linen's source is developed in the public repository
[just-every/run-linen](https://github.com/just-every/run-linen). The RER package is
`@runeditrun/rer` version `0.2.24`. Publishing source does not deploy Linen,
configure a provider, or satisfy an acceptance gate.

## Preserved product requirements

The complete E1–E7 employee floor and A1–A7 safeguards remain release
requirements. O1–O3 define the flagship destination; F1–F7 extend it. A connected
proof, local test or source integration does not waive any of them.
[UX.md](UX.md), [CONTRACT.md](CONTRACT.md), [ACCEPTANCE.md](ACCEPTANCE.md),
[FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md), [ARCHITECTURE.md](ARCHITECTURE.md)
and [ADOPTION.md](ADOPTION.md) preserve the requirements.

Linen's comparative advantage has not been measured.

The Linen site is at https://run-linen.com.
