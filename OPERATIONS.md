# Operating Linen

This describes the current local implementation, not completed release acceptance.
The full [contract](CONTRACT.md) and [acceptance gates](ACCEPTANCE.md) remain intact.

## Local startup and identity

Start Linen with the one line in [Run it locally](README.md#run-it-locally), or get the checkout with `npx -y @runeditrun/rer install just-every/run-linen` and, from the Linen edition directory:

```sh
rer setup
rer dev
```

RER selects and records an available local port; open the address it prints as
`RER_READY` or `RER_OPEN`. The installed Base Lobby is at `/`, first-run owner
confirmation is at `/setup`, and the Linen application is at `/app`. The platform
bridge uses Linen's existing users, memberships, sessions and D1 data; do not
delete local data to repair an integration or migration problem. `rer dev` runs
the local application and scheduled work while that process remains active. Local
commands do not publish or deploy anything.

When upgrading an older native Linen installation, sessions without a version
proof are retired once. Affected members must sign in again; already-proved
sessions stay valid. Accounts, work and attachments remain. Do not reset the
installation to recover a retired session.

An empty installation asks for workspace name, owner name, email and password.
There is no default login. Native password authentication uses a private session
cookie, current active membership and same-origin/CSRF checks on mutations.
Current roles are `owner`, `operator`, `employee`, `approver`, `hr`, `auditor` and
`integration`; record scope and grants further constrain them. Owner-managed
members are not automatically provider identities. Optional Cloudflare Access
SSO (`ACCESS_ISSUER`, `ACCESS_AUDIENCE`) admits existing active members after
assertion validation; it cannot create authority. See [platform routes](src/platform/routes.ts)
and [authentication](src/platform/auth.ts).

For a separate fresh hosted installation, follow [Deploy a fresh
installation](README.md#deploy-a-fresh-installation). Plain `rer deploy`
provisions D1 and private R2 using derived names,
configures `AUTH_ORIGIN`, generates secrets, claims the setup owner and retires
the setup token. Keep `.rer/deploy/` and the environment name for upgrades and
removal. Never paste secrets into documentation, logs or source.

Existing pre-rer hosted installations keep Worker `linen`, D1 `linen` and R2
`linen-attachments` with their actual resource identities and data. They remain
recognised from a configured remote D1 ID, a matching retained record, or live
Worker/D1 bindings, and stop before changes because the pinned kit cannot adopt
fixed names. Keep their original `wrangler.jsonc` and existing deployment workflow.
Unconfirmed identity defaults to a fresh deployment with one line of legacy
guidance. Retained RER environments use their own records. Local Wrangler names
and migration history remain unchanged.

## Connect and review once

The Connections UI saves credentials privately, checks the current revision,
discovers bounded pages and presents review candidates. Apply reviewed ownership
and identity mappings, including conflicts and missing facts. A successful read
check is neither write permission nor workflow recovery. Disconnect destroys the
local credential and prevents future acquisition; it cannot undo in-flight effects.

| Supported boundary | Inputs and limits |
|---|---|
| Microsoft Graph | Tenant UUID and approved application's client ID/secret; global-cloud client credentials. Discovery reads supported users, groups, licences, devices and applications. Exact configured grants separately permit implemented identity/group/licence effects; this is not an Intune management agent. |
| Freshservice | Exact tenant hostname and API key; discovery plus the explicit adoption/coexistence adapter. Genuine source exports and reviewed cutover ownership are still needed. |
| OpenAI | API key, actual available model, owner-entered price estimates, output/per-attempt limits and total budget. Validate before selecting default. Model output proposes work; it never grants authority. |
| Monitoring | Signed inbound events bound to configured service/connection. No observed event means no verified feed. |
| Owned verifier/release/notification endpoints | HTTPS endpoint, exact host allowlist and scoped token; endpoint must implement Linen's protocol. Arbitrary HTTP 200 is insufficient. |

Use [connection API and official provider references](src/features/connections/API.md),
[execution API](src/features/execution/API.md), [service protocols](src/features/services/API.md)
and [intelligence configuration](src/features/intelligence/API.md) for supported
formats. No provider SDK or price schedule is implied by these adapters.

Automatic ordinary work requires reviewed catalogue/mapping and an actual
non-interactive automation principal, exact versioned grants and verifier binding.
Temporary access requires separately granted removal. The execution service
rechecks current authority at effects, persists intent and reconciles uncertain
outcomes. Provider readback establishes an effect only. The independent
`workflow-probe` must bind fresh nonce, target, beneficiary, exact cohort, positive
usability and negative control; see [connector implementation](src/features/execution/connectors.ts).
Missing configuration remains pending rather than generating runtime fixtures.

## Background work and delivery

[The scheduler](src/scheduler.ts) runs work, execution, services, notifications,
intelligence and adoption with separate leases/failure records. Cloudflare cron
is configured in the Worker declaration. Local due work advances while `rer dev`
is running and stops when that process stops.
`GET /api/v1/runtime-status` exposes recent cycles to owner/operator/auditor;
cycle completion does not prove a service outcome. `GET /health` is HTTP liveness.

Public request/reply intake is durable and deduplicated. Default-model reasoning
resolves supported catalogue work into existing granted execution, then linked
obligations retain initial and expiry verification separately. Missing manager,
capacity, scope or configuration stays accountable. Lifecycle security and
physical custody remain separate. Monitoring can open incidents and route declared
on-call; a bound business choice can advance its exact controlled change.

Service updates use `notification-webhook` and
`workspace_settings.notificationConnectionId`; acceptance is submitted, not
delivered, until correlated reconciliation. Execution also has a SendGrid adapter
with signed event receipts; see [notification implementation](src/features/execution/notifications.ts)
and [SendGrid validation](src/features/connections/sendgrid.ts). The connection form offers SendGrid with exact verified sender, signed-event
public key and privately stored API key. Inbound email is an authenticated adapter
boundary with mapped senders, not a configured mailbox: [work API](src/features/work/API.md).
Real delivery, mailbox and tenant acceptance remain separate checks.

## Data, recovery and owner responsibilities

Private records, attachments, model context, downloads and exports use current
scope. Provider secrets use AES-GCM encryption. Preserve `ENCRYPTION_KEY` securely;
loss requires re-entering credentials, and rotation requires decrypt/re-encrypt,
not replacing the key. Minimise data sent to the model and choose provider,
residency, retention and recovery policy for the actual environment.

The owner must schedule and safeguard backups of D1, private R2 and recovery
configuration, test restoration, and choose recovery time/data-loss targets.
Source publication is not a backup. Native archive export freezes declared data,
hashes private attachment chunks and excludes sessions, credentials and live
authority. The [adoption API](src/features/adoption/API.md) documents exact
export/restore, Freshservice, identity mapping and cutover procedures. Keep
export files private. The public archive commands are:

```sh
rer export --output ./exports/private-backup.rer
rer import --input ./exports/private-backup.rer --yes
rer setup --owner-email '<original owner email>'
rer dev
```

After import, replace `<original owner email>` inside the quotes with the original
owner's email (for example `'alex@example.com'`). Keep the quotes, not the angle
brackets. Setup restores the local owner settings before startup; `rer dev` uses
those settings and does not ask for the previous email. Sign in again after the
restore: archived sessions are excluded. Import requires an empty installation;
see the [backup and restore guide](docs/backup-and-restore.md) before resetting
an existing copy.

Archives go in the checkout's `exports/` folder or at an absolute path outside the
checkout; `rer` refuses any other path inside it. An archive restores with the Linen
release that made it. Retain that release and its exact source/release identity with
each private archive. Inspect the selected input and target and review the import
plan before confirming.
Import leaves an Adoption hold and preserves archived operation history as inert
records; it does not dispatch or automatically replay archived provider work.
Keep execution held while the owner uses Linen's existing Adoption UI to
inspect the held archive and its operations, reconcile every unknown or unresolved
effect against external evidence, and explicitly release the hold only after the
native restore is materialized and required operations are reconciled. Release
does not revive archived grants: current grants are still checked at each effect.
This recovery UI path is supported only for a release whose platform checks record
a pass; until then, keep execution held. Unknown remote effects must be reconciled
before any repeat; automatic provider replay is not a recovery path. Erasure
includes replay tombstones and durable blob cleanup; pending deletion is not
completed erasure. Archive size/shape limits and unsupported records are explicit
in the API. Real incumbent migration and disaster recovery have not been accepted.

`rer reset --yes` is destructive. Verify the selected target and retained-data
backup first; `--yes` confirms the command prompt and does not grant authority to
erase an owner's data.

## Engineering and source custody

Maintained source origins, pins and adapted donor provenance live in edition
metadata, source-lock records and feature provenance files. The GitHub origin is
private and has no public repository link. Preserve applied migrations and owner
changes; do not regenerate this edition. Repository package scripts such as
`pnpm source:lock` and `pnpm source:check` are maintainer source-authoring tools,
not the installed edition's public operating interface.

The optional maintainer [engineering companion](engineering-agent/README.md) is
separate from the installed `rer` command surface and is invoked with
`node engineering-agent/cli.mjs /path/to/private-config.json`. Each invocation
claims one job; the owner schedules it separately. It requires a separate bearer,
exact pinned clean repository, allowed paths, protected independent checks and
owner-issued command arrays. macOS sandbox-exec or Linux bubblewrap is mandatory;
commands lack network and use disposable checkouts. It checks reproducer, edits,
independent tests and exact local-ref adoption, retaining receipts across failures.
These restrictions are not a universal hostile-code security guarantee: use a
separate OS identity/container for hostile source. Local source adoption is not
hosted deployment or usable-service recovery. Service execution grants remain
separate; the companion is not an endpoint-management agent.

## Verification and evidence

```sh
rer describe
rer check
rer build
rer verify
```

These are the installed edition's public RER operations. `rer describe` reports
the selected edition/target, `rer check` reports configuration readiness without
printing secret values, `rer build` builds the selected source, and `rer verify`
runs the edition's declared local checks. Do not interpret an operation name,
source test mapping or package version as a passing result. Provider responses in
local tests are fixtures confined to tests.

A real model smoke is separate and chargeable; ordinary `rer verify` does not make
that call. It needs an explicitly supplied credential and an available model, and
proves only a bounded intake/persistence path, not real employee access or tenant
recovery. Configured costs are estimates, not invoices.

Local flows and remaining acceptance boundaries are recorded in
[ACCEPTANCE.md](ACCEPTANCE.md). Each release head needs its own `rer verify`
and CI result; results from earlier source snapshots are not current proof. No hosted
release, full provider journey, owner UX budget or comparative economics
acceptance is claimed.
