This is a bounded, documentation-derived file importer, not a verified customer
migration or a Freshservice account connector. It uses maintained Base import-kit
D1 source at `4c83ea57efc3a5b462426c6abc88826b72375112`, with a Linen-owned native
work adapter. Existing Linen archive import/export and live Freshservice
coexistence keep their separate routes. No provider URL is fetched by this kit.

## Supported files and truthful omissions

Supply exact UTF-8 file bytes, base64 encoded, labeled as:

- `tickets-csv`: RFC4180 CSV with unique headers `Ticket Id`, `Subject`,
  `Description`, `Status`, `Requester Email`, `Created Time`, `Last Updated Time`.
  `Type` must be `Incident` or `Service Request` for native mapping; absent or
  unknown types remain source-only with rejection diagnostics. Other fields remain in source custody
  with explicit mapping omissions. Ticket IDs must be positive decimal integers.
- `ticket-json`: a separately saved API view-ticket response `{ "ticket": ... }`.
  Plain text `description_text`, ID, subject, type, status, requester ID and
  creation/update timestamps are required. HTML is retained, never rendered.
- `conversations-json`: a separately saved `{ "conversations": [...] }` API page,
  accompanied by `ticketId`. Every row must match that ticket and contain an
  explicit boolean `private`, exact ID, author `user_id`, plain `body_text`, and
  creation/update timestamps. Missing privacy and duplicate/orphan pages fail.

This first bounded implementation accepts 1–100 tickets, up to 100 conversations
per ticket, 1–30 files and 1 MiB total source bytes per reviewed job. Dates must
be explicit ISO8601 with UTC/offset. Ambiguous local vendor dates are refused;
review conversion and keep the genuine original separately when conversion is
needed. This limit does not claim the vendor's 10,000-ticket export capacity.
XML, Excel, live API retrieval, attachment binary ingestion, asset/change/problem
mapping, SLA semantics, custom relationships and service-request item fields are
unsupported. Attachment URLs and metadata remain in owner-only retained source;
URLs are never fetched and are not counted as retained attachment bytes.
Credential-shaped payloads/URLs are refused by Base rather than saved.

The CSV field labels come from the [official end-user guide, page 6](https://s3.amazonaws.com/freshservice-support-assets/user-guides/Freshservice-end-user-guide.pdf).
It does not establish a universal CSV quoting/date grammar. The
[current ticket export guide](https://support.freshservice.com/support/solutions/articles/50000006341-exporting-tickets)
states ordinary export omits complete notes/conversations and service-request item
fields. Saved JSON follows the separate [view-ticket](https://api.freshservice.com/#view_a_ticket)
and [conversation API](https://api.freshservice.com/#list_all_conversations) contracts.
Supplied pages cannot establish pagination completeness; every dry-run warns of
that gap. No undocumented XML element schema is invented. Fixtures under
`tests/adoption/fixtures/freshservice` are synthetic documentation-derived data.

## Native authenticated API

Use ordinary Linen session cookies, same-origin requests and `X-Linen-CSRF` on
writes. All migration management, provenance and original-byte reads require a
current workspace owner; jobs also stay bound to the creating owner. No imported
identity becomes a login or membership.

The common input has `account` (a stable non-secret lowercase account slug),
`files` (`name`, `format`, `base64`, and `ticketId` for conversation pages), and
optional `identities`. That explicit map uses CSV requester email or API
`user:123` keys and current Linen member IDs. Mapping a requester deliberately
grants that member access to their imported conversation; it grants no other
right. Unmapped historical identities are opaque and have no account.

1. `POST /api/v1/adoption/freshservice-imports/dry-run` with `{ "input": ... }`.
   Planning and authentication use SELECT-only SQL. Review returned counts,
   native target IDs, omissions, rejection diagnostics and `fingerprint`.
2. `POST /api/v1/adoption/freshservice-imports` with the same `input`, exact
   `reviewedFingerprint`, stable `operationKey` and `acceptOmissions: true`.
   Changed bytes, mapping, account, destination or operator invalidate review.
   Creation durably stores the reviewed plan and exact original bytes in D1.
3. `POST /api/v1/adoption/freshservice-imports/:id/apply` or `/resume`.
   Each call applies at most one source ticket atomically with its journal and
   provenance. Call resume until status is `completed`. Restart needs only the
   durable job ID and current owner session, not files or credentials again.
4. `GET .../:id` reads checkpoint/status. `GET .../:id/history` reads import
   provenance, while native `GET /api/v1/work/:workId` reads useful work and its
   public/private conversation. `GET .../:id/artifacts` lists retained bytes;
   `GET .../:id/artifacts/:ordinal` downloads the exact available original.
5. `POST .../:id/undo` reverses a completed job; `/rollback` reverses a partial
   job. Resume continues the recorded reversal. Strict conflict checking keeps
   later native edits, messages, files and execution/fulfillment relationships.
   A conflict remains held; there is no force-delete option. Prior reverse-order
   batches may already have completed when a later conflict is reported.

Stable account/ticket identities deduplicate exact replay. Changed source under
the same identity is a conflict requiring reconciliation, not a silent update.
A different operation key does not bypass source ownership. Rollback and undo
retain original artifacts and historical provenance until explicit erasure.

## Privacy, authority and recovery

Native records start paused, restricted, with original incumbent status retained
as history. No intake job, approval, standing grant, execution, notification,
calendar or completion certificate is created. The historical Agent field is
not an assignment. Source instructions remain untrusted text. Later deliberate
native actions follow Linen's existing authority checks.

Only the mapped requester and owners can see a restricted imported record;
private messages remain hidden from employees. Migration history and exact
originals can include all private conversations and stay owner-only. Import-kit
checks the live session, membership, owner role, tenant and privacy revision at
atomic boundaries. A new source with an erased exact identity is refused.

The ordinary adoption erasure flow runs the Freshservice custody port. It
sanitizes affected retained plans, provenance and before-images; withdraws the exact CSV/ticket and conversation-page artifacts linked to affected
source records rather than pretending rewritten bytes are original. A shared
CSV file containing an erased ticket is withdrawn whole; unrelated artifacts
and jobs remain available; and
redacts affected imported native conversations. Whole affected conversations are
redacted conservatively, including their other messages. Erasure journal and
source tombstones prevent undo/resume resurrecting the erased source. Unrelated
tickets remain separate. An unresolved erasure port must keep the adoption job
pending and prevent platform identity retirement.

The legacy `/api/v1/exports` archive retains mapped work through its existing
selective domain path, but does not carry the new Freshservice journals and
original custody. It is not a complete migration-custody backup. The new `rer
export` / `rer import` full-installation portability policy includes `ik_*` and
`freshservice_*` tables; that separate product path and its stale-erasure restore
fence require their own verification. Keep a D1 backup and original source files
until the chosen recovery path has been proved. Hosted capacity, genuine owner export reconciliation,
real provider cutover, complete E1–E7/A1–A7/O1–O3 acceptance and a portability
custody migration remain separate gates.

## Local verification

`node tests/adoption/freshservice-import.mjs` exercises the native HTTP application
against isolated real Miniflare D1/R2: SELECT-only dry-run, changed review denial,
partial apply/restart/resume, idempotence, native work and private-history reads,
exact source artifacts, inert effects, tenant/role/identity fences, conflict-safe
undo, clean undo, partial rollback and the ordinary adoption erasure route.
It does not contact Freshservice or manufacture provider acceptance.
