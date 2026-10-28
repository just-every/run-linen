# Contract mechanism notes

Endpoints, stored kinds, constants and refusal codes that CONTRACT.md clauses rely on, moved out of the clause text in the 28 October 2026 contract cleanup. The clauses state the outcomes; this page records how the current code reaches them.

## Catalog quotes

CATALOG-008. An item's form carries `quoteRequired`. The requester or beneficiary attaches the PDF (`POST /work/:id/catalog-quote`, PDF magic bytes, `application/pdf`, at most 20 MiB; a later upload replaces an unsubmitted one) before submitting. The file is a `work_attachments` row of visibility `catalog_quote` (so export, erasure and retention reach it) served only by `GET /catalog-quotes/:id`, as a download; the generic attachment download delegates to the same reader check. Quote attachments are a separate `catalog_quote` kind, PDF up to 20 MiB, immutable after submission.

Catalog refusals use `catalog_audience` (403, staff see failed dimensions but no values), `catalog_changed` (409), `catalog_quote_required` and `catalog_quote_type` (422), `catalog_field_required` (422, named question), and `bundle_child_refused` (one line per failed child).

## Queues and routing

DESK-001's bulk-update screen calls `POST /work/bulk-commands`. DESK-003: an agent asks Linen to route a ticket through `POST /work/{id}/route` at the revision read; the item a ticket names is its `serviceId`; routing history is read through `GET /work/{id}/assignments` (agents only).

## REST tokens

API-004. REST tokens authorize `/api/v1/*` only and are refused by API-003. This release exposes only `work.create`: `POST /api/v1/work` files a normal ticket for the principal itself, with title, body, kind and a stable deduplication key.

## MCP credentials

API-003, API-005, API-006, API-007. Native owner routes at `/api/v1/mcp-credentials` mint, list and revoke separate-audience grants. `/api/mcp` authenticates before protocol discovery. Losing the issuing owner returns `mcp_issuer_inactive`; narrowing a grant audits a versioned `mcp.queue_grant_narrowed` event. Queue grants narrow through `/api/v1/mcp-credentials/:id/narrow`, using the current grant revision; widening requires re-minting. Only dropdowns can be owner-classified nonpersonal through `/api/v1/mcp-fields/:id/classification`. Missing, out-of-grant, HR and restricted tickets all return `not_found`.

`tests/platform/base-auth-runtime.mjs` and its `mcp-tools-cases.mjs` journey assert the full native owner/Desk bot boundary. `tests/platform/base-auth-transfer.mjs` asserts actual native archive compatibility and inert restored grants; `tests/ui/mcp-journey.mjs` asserts the internal-comment owner/employee views at 1440 and 390. These are local protocol and native-UI results, with no claim that an external agent service or provider has accepted an integration.

## Post-implementation review

CHANGE-010. A current owner or operator closes an evidenced review through `POST /changes/:id/review`. `reviewState` records closure separately from execution `state`.

## Retention

RETENTION-001. Closed tickets and their attachments are counted from the ticket's `closed_at`.

## Phone intake

CHANNEL-007. Until a transcription adapter is built, a transcript arrives only through the authenticated `/calls/events` door.

## Mail authentication provenance

CHANNEL-003 currently reads the topmost Authentication-Results header without binding its authentication service to the connection. Trusted receiving-provider provenance remains unproved; a sender-supplied header is never sufficient authority under RL-103. Other outbound mail doors retain D-3's domain-alignment obligation.
