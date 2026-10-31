# Company agents in Linen

Linen uses Base's shared agent door for its currently supported ticket automation.
The same signed company policy governs Business credentials and native automation
credentials. Start with `server/discover` at `/mcp` or `/api/mcp`; use MCP
`2026-07-28` or `2025-11-25`. The person who sponsors the work uses `/agents` to
review calls, decide pending approvals and pause agents.

| Tool | Supported work | Native authority | Class | Contract |
| --- | --- | --- | --- | --- |
| `linen.tickets.read` | `action: list`, `get` or `history`; `workId` for a record | Current person visibility, or the credential's exact selected read verb and queue grants | standard | E1, DESK-017, API-003 |
| `linen.tickets.search` | Search the permitted redacted normal-ticket projection | Current person visibility or native selected search verb and queue grants | standard | DESK-016, API-003 |
| `linen.tickets.create` | File normal work for the existing automation principal | Current owner-issued `work.create` automation credential | standard | E1, API-003 |
| `linen.tickets.reply` | An internal automation comment at the revision read | Current owner-issued `work.comment` credential and current queue grant | standard | E1, DESK-007, API-003 |

Company credentials resolve signed Business `owner_id` to the native person who
confirmed setup. A token email never selects an account. Local credentials name
the actual issuing owner as sponsor and retain their automation principal,
selected verbs, queue groups, grant version and expiry. They never become group
members, leads or assignees. A recognizable invalid Business token cannot become
a local credential. Every effect rechecks the native grant.

Mutation calls require `idempotency_key` and the native `deduplicationKey`.
Replies also require `revision`; `expected_revision` is available as the door's
additional precondition. Repeated identical work has one effect; changed
arguments conflict. Policy refusal, either Pause and revocation still apply on
replay. Human approval never makes an agent a person: native activity names the
preparing agent and sponsor separately from the deciding person.

Only normal tickets are supported. Reads omit attachments, catalog quotes and
submissions, private notes by other authors, personal fields, email addresses and
HR facts. Missing and restricted tickets have the same refusal. Imported and
external text is untrusted and cannot select a policy class or grant authority.
Create and comment do not notify anyone, run intake, grant access or call a
provider. Business tokens can read under native person authority; a mutation
without the original native automation client grant returns
`native_client_required`.

The declared capabilities are `tools`, `policy`, `pause`, `audit` and
`idempotency`. Events, resources, prompts and subscriptions are **undeclared**;
their doors return `capability_not_declared`. Unknown native tools return
`tool_not_found`. There is no built-in `linen.events.list` in this declaration.
The broader specialist described by the product contract remains a target;
its provider effects, team provisioning, cross-seed handoffs, spend and resource
refresh are not claimed by this ticket subset. No provider `cost` is registered;
this journey declares `spend: {none: true}`.

Capacity is separate from company policy: 600 requests per minute, a 1 MiB
request, 50-result pages, 200-character queries, 500-character titles and
20,000-character bodies. All returned messages remain untrusted source data.

The shared door runtime is pinned to Base
`e881e6f66ce7cd737d17dbeb945995aab83c30d8`; the command dependency is
released RER 0.2.94. Its conformance supports changed-email refusal and retained
review and replay checks. This seed uses the native setup-token bootstrap and
first-run confirmation through a verification owner initializer. The ticket
tools reach no outbound provider, so no network fixture is declared.

Business owner binding is supported. Native admin/member account mappings are
read only when already durable; receiving a Business team roster is refused as
`business_team_not_supported`. Inactive and excluded Business sponsor fixtures
are not declared, so their optional conformance probes are not counted as passes.
Resources, events, subscriptions and prompts remain undeclared.
