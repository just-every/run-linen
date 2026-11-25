# Deploy Linen with mail off

Use a Cloudflare account with Workers, D1 and R2 enabled. Provide the account ID
and an API token with edit access to Workers Scripts, D1 and Workers R2 Storage through
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Keep the token in your
environment or a private `--env-file`.

From a fresh public checkout, install the pinned dependencies and set up the
owner with the address your Business uses:

```sh
git clone https://github.com/just-every/run-linen.git
cd run-linen
rer install
rer setup --owner-email "$OWNER_EMAIL"
MAIL_PROVIDER=none rer deploy --environment production --dry-run
```

Set `OWNER_EMAIL` to the owner's real address before setup. The dry run builds
Linen and plans the Worker, D1 and R2 resources without contacting Cloudflare.
Mail-off requires no sender address or mail key.

When ready to create the environment, use the same checkout and Cloudflare
credentials:

```sh
MAIL_PROVIDER=none rer deploy --environment production
rer signin --environment production
```

RER claims the owner during deploy. Open the one-time sign-in link it prints in your browser. Keep the private `.rer/deploy/`
directory and reuse this checkout, account and environment for later deploys.
Check `/health` at the URL printed by RER.

Outbound email stays off. Employees cannot request emailed sign-in links, and
mailbox replies, email approvals, scheduled email reports and mail notifications
cannot send. To enable hosted email, configure a supported provider with its
verified sender and credential. SendGrid and Resend use `MAIL_PROVIDER`,
`MAIL_FROM` and `MAIL_API_KEY`.

A fresh production install uses `linen-production`, `linen-production-db` and
`linen-production-attachments`. If you already run the legacy Worker `linen`
with D1 `linen` and R2 `linen-attachments`, keep its original Wrangler config
and deployment workflow. The fresh deploy path refuses to adopt it.
