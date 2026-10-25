**Connections & setup** is where Linen learns about your organization. Open it from your
profile menu. Connecting a service lets Linen read facts; it never grants permission to act.

## Connect a service

Only the owner can add connections. Choose **Connect a service**, pick the provider and enter
its details. Credentials are encrypted and never shown again.

| Connection | What you enter |
|---|---|
| Microsoft identity & licenses | Your tenant ID and an approved application's client ID and secret |
| Freshservice existing desk | Your exact `tenant.freshservice.com` domain and an API key |
| GitHub repository access | One repository, the workspace member ID, their exact GitHub login and numeric user ID, and a token authorized to read that repository's metadata |
| OpenAI reasoning | An API key, the model to use, price estimates and spending limits |
| SendGrid email delivery | The verified sender address, an API key and the signed-event key |
| Monitoring events | The webhook signing secret its events are signed with |
| Notification delivery, independent workflow verifier, owned release endpoint | An HTTPS endpoint, its exact allowed hostnames and a scoped token |

Each connection card shows its state. **Check connection** runs its read check again; a passed
check proves only that read. **Edit connection** changes its details, and **Disconnect this
source** removes the stored credential.

## Keep a repository commitment

The owner binds each GitHub connection to one member and one repository explicitly.
Linen checks the repository identity and that user's current repository permission
through GitHub's fixed API origin. A successful check establishes read access only.
A denied or unavailable API response leaves the observation uncertain; an authoritative
`none` permission is a failed check. Names and email addresses never create a binding.

In **Continuing commitments**, define the outcome, cohort, owner, dependent commitments,
effective dates and observation interval. For a GitHub observation, use this definition
with the actual member and validated connection values:

```json
{
  "id": "baseline-repository",
  "description": "The bound starter retains repository read access",
  "step": {
    "action": "github.repository.read",
    "actionVersion": 1,
    "target": "just-every/run-linen",
    "beneficiaryId": "MEMBER_ID",
    "verifierConnectionId": "CONNECTION_ID",
    "verifierConnectionRevision": 2
  }
}
```

The target must match the connection exactly. Closing a ticket leaves the commitment
running. New members without checks appear as unobserved; changed definitions need
new evidence. Expired evidence, an inactive member or a changed connection never count
as verified coverage. The owner can **Retire this commitment** to stop scheduled checks
while preserving its recorded history. No GitHub access changes are sent.

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
