<p><img src="public/brand/mark.svg" width="76" height="50" alt=""></p>

# Linen

Everyone set up. Everything working. Linen is a free, open source IT service desk for US companies:
requests, access, onboarding and offboarding, and every laptop accounted for. See
[run-linen.com](https://run-linen.com).

## Run it locally

Two lines, the same as the [Run page](https://run-linen.com/run). Install `rer`, the Run Edit Run command
(it brings its own Node if you have no Node 22 or later):

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
```

Then start Linen:

```sh
rer dev just-every/run-linen
```

Already have Node 22 or later? `npx -y @runeditrun/rer dev just-every/run-linen` does both steps in one line.
To start it again later, run `cd run-linen && rer dev`. To prepare it yourself, run `rer install just-every/run-linen`, then from the Linen edition directory:

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
upgrade was checked to retain prior rows and migration history. These checks do
not establish real-provider action, hosted deployment or owner acceptance for
the full release; those dimensions remain unproven. The native
Base authentication bridge and Linen account/data continuity are retained, as
are the existing product, package, edition, Worker and D1 identities. See
[ACCEPTANCE.md](ACCEPTANCE.md) for the full gates.

## Guides and the run site

Owner guides live in [docs/](docs/site.json): getting started, everyday work, moving in
from Freshservice, and backup and restore. `rer build --site` builds them into the run
site's `/docs`, beside its homepage and the Run page (`src/site/`, declared in
`deploy-site.json`). The installed instance keeps the Lobby at `/`.

## Operate and extend

### Deploy a fresh installation

From a new checkout, run `rer install` and `rer setup` with your owner email.
Create a Cloudflare API token for your account with Workers Scripts, D1 and R2
edit permissions. Configure a real mail provider and a sender verified with it:

```sh
export CLOUDFLARE_ACCOUNT_ID=your-account-id
export CLOUDFLARE_API_TOKEN=your-api-token
export MAIL_PROVIDER=sendgrid
export MAIL_FROM=your-verified-sender
export MAIL_API_KEY=your-mail-provider-api-key
export LINEN_DEPLOYMENT=new
rer deploy --environment production
```

`MAIL_PROVIDER` also accepts `resend`. RER generates the session, setup and
encryption secrets, claims the owner selected in setup, removes the one-time
setup token and prints the hosted address. Open it and sign in by real email.
Use the same environment for every subsequent deployment. RER records and checks
the created resource identities in `.rer/deploy/`; keep this private directory.

`LINEN_DEPLOYMENT=new` explicitly selects a separate fresh installation. Its
Worker is `linen-<environment>`, D1 is `linen-<environment>-db`, and private R2 is
`linen-<environment>-attachments`. The runtime uses bindings `DB` and
`ATTACHMENTS`; their physical names need not be fixed. Local resource names and
applied migrations stay unchanged.

For an existing pre-rer hosted installation, do not select `new` or deploy from a
fresh clone as an upgrade. Keep Worker `linen`, D1 `linen` and R2
`linen-attachments`, their actual IDs, data and configuration. The hook continues
to refuse that upgrade until the shared deploy kit supports existing-resource
identity. A configured remote D1 ID also refuses fresh deployment.

To permanently delete an environment and its data, using its retained deployment
record and the same Cloudflare credentials:

```sh
rer deploy --environment production --remove --yes
```

RER reads back that its recorded resources are gone. This does not remove an
existing pre-rer installation.

[OPERATIONS.md](OPERATIONS.md) documents the RER operating commands, provider
boundaries, recovery and engineering responsibilities. [ONBOARDING.md](ONBOARDING.md)
covers first-run setup. Source is edition-owned; extend it through tested changes
in the maintained source workflow rather than regenerating an existing product.
A development companion is not endpoint management.

Linen's source is developed in the public repository
[just-every/run-linen](https://github.com/just-every/run-linen). The RER package is
`@runeditrun/rer` version `0.2.51`. Publishing source does not deploy Linen,
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
