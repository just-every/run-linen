**Connections & setup** is where Linen learns about your organization. Open it from your
profile menu. Connecting a service lets Linen read facts; it never grants permission to act.

## Connect a service

Only the owner can add connections. Choose **Connect a service**, pick the provider and enter
its details. Credentials are encrypted and never shown again.

| Connection | What you enter |
|---|---|
| Microsoft identity & licenses | Your tenant ID and an approved application's client ID and secret |
| Freshservice existing desk | Your exact `tenant.freshservice.com` domain and an API key |
| OpenAI reasoning | An API key, the model to use, price estimates and spending limits |
| SendGrid email delivery | The verified sender address, an API key and the signed-event key |
| Monitoring events | The webhook signing secret its events are signed with |
| Notification delivery, independent workflow verifier, owned release endpoint | An HTTPS endpoint, its exact allowed hostnames and a scoped token |

Each connection card shows its state. **Check connection** runs its read check again; a passed
check proves only that read. **Edit connection** changes its details, and **Disconnect this
source** removes the stored credential.

## Review what Linen found

For Microsoft and Freshservice, **Discover available facts** reads people, groups, licenses,
devices and applications in bounded pages. Linen brings the meaningful gaps and choices into one
review: confirm or correct each fact, then apply what you accept. Discovery cannot invent who
approves what, grant write access or verify an outcome.

## Choose the reasoning model

On a validated OpenAI connection, **Use for service reasoning** makes it the default model Linen
uses to understand requests. **Reasoning spending limit** sets the total budget; estimates,
failed attempts and uncertain charges all count against it.

## Grant permission to act

Linen acts on its own only where you have granted it, exactly. **Review standing grants**
(from the setup rail) lets the owner choose who may act, for which service, for how long and how
many times. Each grant has an end; temporary access carries its own removal.
