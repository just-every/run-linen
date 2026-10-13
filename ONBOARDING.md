# Onboarding Linen

Install the published RER CLI with one of these methods:

```sh
npx -y @runeditrun/rer cli install
```

or:

```sh
curl -fsSL https://runeditrun.com/install.sh | sh
```

From the Linen edition directory, use the installed RER commands:

```sh
rer install
rer setup
rer dev
```

RER prints the local application address as `RER_READY` or `RER_OPEN` and selects
an available port. The installed Base Lobby is served at `/`, first-run owner
confirmation at `/setup`, and the Linen application at `/app`. Base authentication
is bridged to Linen's existing native account and workspace data; setup does not
create a second product identity or reset existing D1 state.

Linen starts without seeded accounts, requests or provider outcomes. The owner
must still choose real provider accounts, scopes, retention and recovery policy,
and supply credentials and consents privately where required. Discovery and
setup do not grant action authority. See [OPERATIONS.md](OPERATIONS.md) for
provider and data boundaries and [ACCEPTANCE.md](ACCEPTANCE.md) for the complete
employee and flagship gates.

The public operating surface is the `rer` command family. Repository package
scripts and `scripts/install.mjs` are implementation details, not supported
onboarding commands. Local installation does not publish a product, configure a
tenant, deploy a Worker or establish provider, hosted or owner acceptance.
Provider, hosted and owner acceptance remain unproven.
