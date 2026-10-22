# Linen adoption and data operations

Exports: `registerAdoptionRoutes(app: Hono<AppEnv>)`, `processDueAdoption(env: Env)`, `assertAdoptionEffectAllowed(ctx, {resource,action,sourceId?,sourceRevision?,fence?})`, `registerAdoptionRestorePort`, `registerAdoptionErasurePort`. Context is `{env,principal:{userId,workspaceId,roles}}`. Import the ordinary services from their responsibility modules for non-HTTP use. All registered routes are relative to `/api/v1` and require platform session middleware; mutations require same-origin Origin and X-Linen-CSRF. No public webhook or bearer bypass is registered.

Whole-workspace export, import, inspection, source custody and erasure require **current active owner** membership, re-read from D1 in services. This deliberately does not confer all-private-history access on operators/auditors. Do not put responses containing history into model context or logs. Downloads are private authenticated responses, never public R2 URLs. Audit stores operation IDs/counts, not archive payloads.

## Native archive lifecycle

1. `POST /exports {idempotencyKey}` → persistent export row (201). Repeated key returns original. One atomic D1 batch freezes all declared table rows, membership identities (without passwords/roles) and workspace identity. Credential/token columns are NULL; sessions, connection secrets/config and encryption keys are excluded. Table support is explicit in schema.ts; an absent table is not invented.
2. `POST /exports/:id/advance {}` processes up to 25 frozen rows. Checkpoint survives restart. Each record is a bounded JSON chunk; attachments are SHA256-verified against frozen metadata, divided into ≤8 MiB chunks, maximum supported original object 64 MiB. Missing/changed bytes fail the export, never generate a ready manifest. Every immutable chunk is private R2 content addressed by run/ordinal and recorded with size/hash. Repeat after a crash reuses deterministic keys.
3. `GET /exports/:id` → row plus `manifest`. `state=ready` has format `linen-native`, version 1, sourceWorkspace, exportId, snapshotAt, table counts, explicit exclusions, and chunks (`ordinal,kind,size,sha256,count`; attachment chunks additionally attachmentId/offset/totalSize/fullSha256). A manifest copy is stored in private R2 under the run. Snapshot is of D1 at freeze time; later attachment mutation is detected by hash rather than silently mixing versions.
4. `GET /exports/:id/chunks/:ordinal` verifies the R2 object hash and returns binary bytes with X-Content-SHA256 and Cache-Control:no-store. Each download is audited and reauthorizes current ownership.
5. `POST /imports {manifest,idempotencyKey}` (201); `PUT /imports/:id/chunks/:ordinal` sends exact binary bytes. Unknown/version-mismatched manifests, repeated ordinals, hash/size errors and unsupported shapes fail. No uploaded SQL is accepted.
6. `POST /imports/:id/dry-run {}` verifies all chunks, attachment segmentation/full hashes/metadata, privacy, source counts, duplicate identities and references. Report includes type/privacy counts, source and target counts, unknown mappings, identity collisions, unresolved references, erased records, history-only count and sensitive sample **identifiers**. No private sample bodies in report.
7. `POST /imports/:id/apply {acceptSemanticLoss:boolean}` or `/resume` processes 25 record chunks per call; repeat while state applying. Reviewed loss is explicit. Before materialization the same D1 batch establishes adoption_holds and sets workspace_settings.settings_json.executionHeld=true. All source rows enter a durable source/table/key/hash ledger. Duplicates never create new domain IDs. Deterministic destination UUID mapping rewrites exact references, including JSON fields; imported identities are historical nonmembers, not new memberships. No imported approval/grant creates live execution authority.
8. Native work, services, execution and intelligence restore ports reconstruct supported data through the domain-owned validators. Work includes actual private attachment bytes in destination R2. Domain parent ordering is explicit. Unknown/invalid records stay quarantined; unsupported operational records stay history_only. `restored` means all required active records were materialized, not permission to run effects. `GET /imports` lists the workspace's imports (id, state, created_at; newest 50); `GET /imports/:id` returns status/report/target state counts; `GET /imports/:id/records?cursor=UUID` gives bounded owner-only retained history. `GET /imports/:id/attachments/:attachmentId` reads verified imported bytes.

Native grant/decision/engineering authority and outbox/ownership history are retained inert. Fresh credentials, principals and current grants must be established separately. Restore never dispatches notifications, provider actions or old queued writes. `restoreAdoptionRecord` ports are called with `{table,row,sourceId,sourceKey}` using their actual domain APIs; third-party registration signature is `{table,restore(ctx,{table,key,row},{sourceId,revision}):Promise<{state:'restored'|'quarantined',reason?}>}`. Ports must remain idempotent and may not mint grants. A collision or missing native port is a visible incomplete restore, not a successful archived-JSON replacement.

## Holds and remote effects

`GET /adoption/holds`; `POST /adoption/holds/:id/reconcile {historyId,evidence}` records an owner-attested reconciliation of a particular archived operation; this is not a provider verification. `POST /adoption/holds/:id/release {revision}` requires all unresolved operations reconciled and a fully materialized native restore. The last released hold clears executionHeld; current grants are still mandatory at effect boundaries. Every external-effect executor must call `assertAdoptionEffectAllowed` as well as its ordinary current grant checks. Read-only remote reconciliation may continue under its own authority. Restoring a database is never claimed to undo remote writes.

## Freshservice v2 coexistence (declared candidate)

Primary reference: [official Freshservice API](https://api.freshservice.com/), inspected 27 September 2026: list tickets (`updated_since`, page/per_page, workspace_id), ticket detail, conversations, approval-groups (approved status ID 1), and private notes. This is a declared candidate adapter, not discovery of the owner's incumbent. Provider tenant/consent/automation ownership and end-to-end writeback remain real-provider gates. No actual provider mutation was used in local tests.

Create a platform connection `provider=freshservice`, `config={domain:"tenant.freshservice.com"}`, encrypted `secret` containing the API key. Only exact HTTPS Freshservice tenant hosts are allowed, with redirects denied. API key never enters responses/logs. Missing credentials return 503; errors never fabricate tickets or success. Provider permissions must cover ticket/conversation reads and the current approval-group API (official docs list tickets.edit for the latter); private note writes need corresponding ticket edit rights.

- `POST /adoption/sources {connectionId,sourceWorkspace:number,since?:ISO}` (without `since` the source is read from its first ticket); `GET /adoption/sources`; `POST /adoption/sources/:id/poll {}`. Each poll is a bounded ticket page with explicit source workspace and revision. Conversations retain private flags, approvals are structured source data, attachments are explicitly pending foreign byte import rather than declared imported. Unknown source states remain unresolved restricted source records. Complete drains advance checkpoint; duplicates are deduplicated, same-revision different content conflicts, old revisions cannot replace newer ones. Failed feeds invalidate ownership.
- `POST /adoption/ownership {resource,action,sourceId?,approvalId?,expectedRevision?,incumbentDisabledEvidence?}`. Native greenfield rows need no incumbent. Coexistent resources use `ticket:<id>`; live source revision and all approval-group statuses are read before ownership activation, and owner evidence must attest incumbent effect disablement. A repeated competing claim without exact revision fails. Ownership is exact resource/action with monotonically increasing fence. Stored freshness is at most one minute; **dependent effects must additionally call validateSourceAuthority immediately before dispatch**, which re-reads ticket and structured approvals and holds on drift/failure. Local execution grant validation is independent and also required.
- `POST /adoption/ownership/:id/cutover {revision,checkpoint}` fences ownership and sets executor none; `/complete-cutover {revision}` requires unchanged drained checkpoint, no unresolved source arrivals and no running/unresolved effects. Late arrivals move ownership to reconciliation. `POST /adoption/sources/:id/records/:recordId/reconcile {evidence}` is explicit owner reconciliation. No production cutover has occurred.
- `writebackEvidence(ctx,{ownershipId,operationId,body},authorizeCurrent)` is a service API for the execution owner, not an unguarded HTTP write. It creates a persistent unknown-state intent and unique loop marker before posting a private note; a duplicate operation cannot send twice. Failure stays unknown. `POST /adoption/writebacks/:id/reconcile` searches provider conversations for the marker; absence remains unknown, never permission to resend. Live current approval and supplied execution authority are checked before dispatch. Only tests inject a provider transport.

## Retention and erasure

`GET/PUT /adoption/retention {archiveDays:1..3650,revision}` configures **archive retention**; no hidden default retention is invented. Due processing invalidates expired export/import packages and queues durable private-object deletion. Retained domain product history follows its domain policies.

`POST /adoption/erase {identity}` requires current owner. It persists a hashed tombstone before cleanup, invalidates cached archives that could resurrect content, removes matching retained history, and invokes registered domain erasure services. Deletion queue survives failures; `processDueAdoption` deletes up to 100 pending private R2 objects and records outcomes. `POST /adoption/erase/:id/resume {}` resumes per-domain checkpoints; identity is encrypted while pending and discarded after completion. Domain failures/unreconciled remote effects remain explicit pendingDomains/error codes. No completion is claimed before all required domains participate. Source replay and import consult tombstones; imported erasure history does not reactivate content.

Person/member erasure follows only the current explicit workspace binding, including deactivated bound people and accounts. Corrected former bindings remain history, never permission to erase another current identity. Admission fences the current person revision/binding while recording all current identity tombstones; concurrent changes or ambiguous current identities require a fresh owner review.

## Verification and installed-edition commands

Developer verification: `node tests/adoption/runtime.mjs` uses isolated real local D1/R2 and authenticated Worker HTTP, with provider fixtures **only in tests/adoption**. `pnpm typecheck` verifies integrated TypeScript; these are maintainer checks, not installed-edition operating commands.

Use the installed RER operations to manage a private archive:

```sh
rer export --output ./exports/private-backup.rer
rer import --input ./exports/private-backup.rer --yes
rer setup --owner-email '<original owner email>'
rer dev
```

After import into an empty installation, restore the local owner settings with
`rer setup` before starting Linen. Replace `<original owner email>` inside the
quotes with the exported installation's owner email, for example
`'alex@example.com'`; retain the quotes, not the angle brackets. Bare `rer dev`
uses those saved settings and does not prompt for the previous email. Sign in
again because archives exclude sessions. Follow the
[backup and restore guide](../../../docs/backup-and-restore.md) before resetting
an existing installation.

Restore each export with the Linen release that created it; retain that release and its exact source/release identity with every private archive. Imported people retain facts but have member and manager bindings cleared; owner/HR must review current account links afresh.

The RER operations store restricted local checkpoint/manifest/chunk files, verify hashes, support resume, and use the current authenticated session. Import requires review of its losses before confirmation with `--yes`. External execution remains held. Credentials must not be supplied as command-line arguments or checked-in files.

`POST /imports/:id/identities {sourceUserId,targetUserId}` explicitly maps an archived principal to an already-active destination member before apply; it does not assign any role. Source identity must be present in the uploaded archive. Once a source identity is mapped/materialized it cannot be silently remapped. Unmapped identities retain deterministic nonmember IDs so restricted audiences never expand automatically. `GET /adoption/sources/:id/records?cursor=UUID` supplies audited bounded inspection of source records/conflicts and their source revision.

Dry-run includes `unresolvedRecords` (source table/key/field) for declared work/person/asset/calendar/execution/intelligence relationships. Those records are quarantined during apply until a faithful source/mapping is supplied; explicit semantic-loss acknowledgement never silently resolves them. The report rejects more than 10,000 unresolved references rather than truncating its loss accounting.

Native export also retains adoption source snapshots, mapping/cutover/hold/writeback history and prior import chunks, including quarantined attachment bytes. These historical custody tables cannot reactivate source ownership on restore. Prior import chunk bytes become scoped `adoption_artifacts` with their original run/ordinal/hash/metadata; `GET /adoption/artifacts/:id` verifies and downloads the retained object. No archived executor or approval feed is treated as current configuration.

For real provider effects, ownership `resource` must exactly equal the execution operation's resource, not just a ticket ID. Supply `sourceTicketId` independently alongside sourceId/approvalId; `ticket:<id>` remains the shorthand for a ticket-note resource itself. Bind returned sourceRevision and fence to the effect's versioned context and pass them to assertAdoptionEffectAllowed. That function performs fresh live source validation itself; missing bound source fields fail closed. A native ownership request cannot bypass the fenced cutover by dropping sourceId.

Freshservice requests use `redirect:manual`; every non-2xx response, including 3xx, is rejected without forwarding credentials to another host. A writeback intent is already durable before POST, so redirects/timeouts remain unknown and require reconciliation; they never authorize a repeat. Person erasure expands current-workspace email/user/source/import aliases before all domain ports. Platform deletion is last and requires every domain checkpoint complete. An authenticated owner must ask a different owner to erase their own identity; this is enforced before any partial erasure or membership change.

Limits: import manifests are streaming-bounded at 32 MiB (up to 100,000 declared chunks); chunk uploads enforce 8 MiB while streaming even without Content-Length. Individual Freshservice normalized ticket payloads are limited to 2 MiB, with an explicit source_payload_limit failure and unavailable feed if exceeded. This adapter does not silently truncate larger histories. Native repeated export/restore also preserves unmapped historical principal names/source IDs without creating current memberships.

Erasure never reports `completed` while private-object deletions remain pending: `blob_cleanup_pending` and pendingBlobs are returned after the bounded sweep. Durable due processing retries failed deletion work and completes the job only once domain checkpoints and physical deletion have finished. Until then the encrypted resume identity remains retained. Domain-specific unsupported historical identity mappings stay `domain_erasure_pending` with a precise reason.

Execution plan proposal now derives sourceId/sourceRevision/sourceFence from current exact resource/action ownership. Callers need not supply a manual fence; any supplied override must match. The persisted step is used at pre-admission and immediately after OAuth. Changed source approvals, ownership, cutover or fences invalidate the original step instead of converting it to native authority.

Imported erasures are preflighted against current destination identities and scoped imported aliases, including work-erasure history. Apply rechecks all incoming tombstones before mutation. Matching live identities enter normal domain erasure while only the current input archive remains available for materialization. Unknown effects retain a pending erasure and stop account authority; platform deletion waits for domain reconciliation. Migration 0506 stores encrypted aliases; 0507 links import and erasure durably across profile redaction/restart. On completion, input chunks are retired through the durable private-object deletion queue.

Native export has an explicit migrated-table policy (`schema.ts`). Fulfilment amendments/removals/approvals, execution bindings/mappings and source authority are restricted history only on restore. Intelligence fulfilment runs and investigations use their domain restore ports with unknown/held states. Restore does not activate historical approvals, queued removals, provider credentials, grants or sessions.

## Snipe-IT asset export (MIGRATE-004)

`POST /adoption/snipeit-imports/dry-run {file:{name,base64},resolutions?}` is owner-only and read-only. `file` is one Snipe-IT Custom Asset Report or asset list CSV export with `Asset Tag` and `Serial` columns (UTF-8, at most 2 MiB and 1,000 rows). The response has `fingerprint`, `counts {rows,ready,conflicts,unresolved,rejected}`, `conflicts [{serial,assetTags,linenAssetIds,resolution}]`, `rejected [{row,assetTag,reason}]` and `omissions`. Serials compare after trimming surrounding spaces and ignoring ASCII letter case. `resolutions` maps a conflicting serial to the asset tag of the one row to import, or `"skip"`; a serial already on a Linen device can only be skipped.

`POST /adoption/snipeit-imports {file,resolutions,reviewedFingerprint,acceptOmissions:true}` returns 201 `{created,conflicts,rejected,assets:[{id,serial,assetTag}]}` after one atomic write of observed stock devices, each with a `record` custody event. It answers 409 `snipeit_review_changed` when the file, resolutions or Linen devices differ from the reviewed fingerprint (including a device recorded since the review), 409 `snipeit_conflicts_unresolved` while a reviewed conflict has no resolution, and 422 `snipeit_input` for malformed files or unaccepted omissions. Snipe-IT check-outs and assignees are never imported as custody, and the export file is not retained.

### Saved ServiceNow incident history

The authenticated owner can POST `/api/v1/adoption/servicenow-imports/dry-run`
with `{input:{instance,files,departmentId?}}`. `instance` is a stable non-secret
instance slug. Each file is `{name,format,base64}` containing its exact saved UTF-8
JSON bytes. Formats are `incidents-json` and `audits-json`, both raw Table API
responses with one `result` array. Export using `sysparm_display_value=false`
and `sysparm_exclude_reference_link=true`; display-value objects are refused.

Incident rows require `sys_id`, `number`, `short_description`, `description`,
`caller_id`, `state`, `priority`, `sys_created_on` and `sys_updated_on`.
`sys_audit` rows require `sys_id`, `tablename` (`incident`), `documentkey`,
`fieldname`, `oldvalue`, `newvalue`, `user` and `sys_created_on`. Raw UTC dates
use `YYYY-MM-DD HH:mm:ss`. `documentkey` must name a supplied incident.
The audit's `user` and time remain its original attribution, distinct from the
importing owner. Conflicting source audit identities are refused, including an
attempt to replace already-redacted original values.

Review the returned fingerprint, omissions and target IDs. POST the same input,
`reviewedFingerprint`, a fresh `operationKey` and `acceptOmissions:true` to
`/api/v1/adoption/servicenow-imports`. POST `/:id/apply` or `/:id/resume` until
completed; GET `/:id` reads its durable state. `/:id/undo` and `/:id/rollback`
retain the import kit's conflict protection. GET `/:id/artifacts` and
`/:id/artifacts/:ordinal` inspect metadata or exact original bytes, respectively.
Related erasure withdraws whole affected originals and refuses unsanitized replay.

Imported incidents are paused, restricted historical records. No account or
membership is created from the caller or source actor; no approval, notification,
SLA clock or provider operation is granted. An optional destination department
must be active. Native ticket activity shows supplied audited field changes;
priority `3` to `2` is recorded as `P3` to `P2` without changing current priority.
Only supplied audit rows are included. Saved files do not establish completeness
or source-side deletion, and journal messages, attachment downloads, CMDB and
source automations remain outside this importer.

## CSV and Zendesk move-in (MIGRATE-004)

All routes below use the current authenticated owner's session and CSRF token.
Dry runs are read-only. Apply requires the returned `reviewedFingerprint` and
`acceptOmissions:true`; changed files or destination state require a fresh review.
These are saved-file imports, with no source account credentials or provider
calls. They confer no account, membership, approval, execution or outbound right.

- **Tickets CSV:** POST `/adoption/csv-imports/tickets/dry-run` with
  `{input:{account,files:[{name,format:"tickets-csv",base64}]}}`. `account` is a
  stable non-secret slug. Supply one UTF-8 CSV, at most 1 MiB and 100 tickets,
  with headers `id,subject,description,type,status,requester,created_at,updated_at`.
  IDs are stable ASCII letters/numbers/dot/dash/underscore (1–100 characters).
  `type` is `incident` or `request`; `status` and `requester` are source history.
  Timestamps must include a timezone. RFC 4180 quoted commas/newlines work.
  No account identity mapping is accepted. POST the same input, fingerprint,
  accepted omissions and an `operationKey` to `/adoption/csv-imports/tickets`.
- **Zendesk:** the same job API under `/adoption/zendesk-imports` accepts
  `{input:{account,files:[{name,format:"tickets-json",base64}]}}`. Supply the
  [documented full JSON ticket export](https://support.zendesk.com/hc/en-us/articles/4408886165402-Exporting-ticket-user-or-organization-data-from-your-account):
  newline-separated `{"ticket":{...}}` objects or the documented
  `{"tickets":[{"ticket":{...}},...]}` conversion, UTF-8, at most 1 MiB total,
  100 tickets and 100 supplied text comments per ticket. Each ticket requires its
  source ID, subject, description, requester ID, status, nullable type, created
  and updated timestamps, and explicit comments array. Each comment requires
  its ID, author ID, plain-text `body`, `public` boolean and created timestamp.
  Missing/ambiguous history, unsafe numeric IDs and HTML-only/voice comments
  are refused. Zendesk incident tickets become inert incident records;
  question/problem/task/untyped tickets become inert requests, with the source
  type retained in original history. This does not create native problems/tasks.
  Exports may omit recent updates or oversized histories; saved files do not
  establish completeness. Users, organizations, attachments and automations
  are listed omissions, not imported as live configuration.

Both ticket doors return restricted paused native tickets with opaque historical
requester/author identities and original times and public/private comment flags.
Current owners alone can read these unmapped records and retained source files.
`/:id/resume` advances the durable job; `/:id`, `/:id/history`, `/:id/artifacts`
and `/:id/artifacts/:ordinal` inspect it. `/:id/undo` and `/:id/rollback` retain
conflict protection for later native edits. Jobs are scoped to their source door
and importing owner. An operation key is unique to that owner and destination
across source doors; use a fresh key for a different source/job. Originals are retained exactly, withdrawn on related
person erasure, and unsanitized replay is refused. The existing archive retention
and erasure rules apply; a restore confers no execution or membership authority.

- **People CSV:** POST `/adoption/csv-imports/people/dry-run` with
  `{account,file:{name,base64},skipIds?:string[]}`. Supply UTF-8 CSV headers
  `id,name,effective_at,observed_at`, at most 1 MiB and 1,000 people. IDs and dates
  follow the ticket CSV rules. Every source person is an observed native person
  under `csv:<account>`, with no member, manager or attribute binding. Email,
  roles, managers and other fields are listed omissions. Existing source IDs
  appear as conflicts and may only be explicitly skipped; they are never
  overwritten or merged. POST the same body, fingerprint and accepted omissions
  to `/adoption/csv-imports/people` to atomically record the remaining people.
  The file is not retained. Current native people readership, erasure and source
  replay fences apply; this never admits an HR event or runs a lifecycle plan.
- **Assets CSV:** POST `/adoption/csv-imports/assets/dry-run` with the same
  `{file,resolutions?}` body and `Asset Tag,Serial` schema as the Snipe-IT door
  above; `Location,Status` are optional. Apply at `/adoption/csv-imports/assets`
  uses the same owner review, serial conflict decisions, atomic observed-stock
  write and typed `record` custody history. Source status is quoted evidence,
  never an assignment; existing custody is not overwritten. The original file,
  assignments, purchase and warranty fields are not imported or retained.
