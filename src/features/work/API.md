# Employee work API

`registerWorkRoutes(Hono<AppEnv>)` registers relative paths under authenticated `/api/v1`.
Platform cookies/CSRF apply. Service functions take `{env,principal}` and recheck current membership. Workspaces are never accepted from HTTP input. Dates are explicit-offset ISO instants, persisted as ISO UTC; IANA timezones are retained. Work record responses use persisted snake_case fields and integer `revision`.

## Conversations and requests

- GET `/work` → `{items:WorkRecord[]}` (current participant/operator; HR separate).
- POST `/work` or `/requests` `{title,body,deduplicationKey,kind?:request|incident,beneficiaryId?,sensitivity?:normal|restricted|hr,context?}` → WorkRecord.
- GET `/work/:id` → `{work,messages,attachments}`; private notes/attachment metadata are excluded for employees.
- POST `/work/:id/messages` `{body,visibility:public|private,sourceMessageId}` → persisted message. Duplicate source identity with changed body/scope conflicts.
- POST `/work/:id/commands` `{revision,command:reopen|pause|resume|close|cancel|assign,reason,assigneeId?}` → WorkRecord. `close` is administrative, never verified recovery. Assignee must be active operator/owner.
- POST `/work/:id/attachments`: raw bytes, `X-Filename`, `Content-Type`, optional `X-Visibility: private`; up to 20MiB. Returns `{id,sha256,size}`. GET `/attachments/:id` returns authorized R2 bytes as download, no-store.
- GET/POST `/catalog`: create `{name,kind:access|software|device,target,ownerId,requiresManager?,capacity?}`.
- POST `/work/:id/fulfilment` `{catalogId,beneficiaryId,purpose,expiresAt?}` creates distinct fulfilment/security/expiry duties. GET `/work/:id/obligations` → `{items}`. Missing manager/stock/licence remains an owned exception, not permission.
- GET `/fulfilment-decisions` → `{items}` for the current independent manager/delegated holder only. Each item includes the displayed request/service/beneficiary/purpose/expiry, `catalogId`, `workId`, `holderId`, and the exact review context: `expectedWorkRevision`, `expectedFulfilmentRevision`, `expectedCatalogRevision`, `expectedPersonId`, `expectedPersonRevision`, `expectedBindingId`. This minimal decision scope grants no conversation access.
- POST `/work/:id/fulfilment/approve` `{catalogId,expectedWorkRevision,expectedFulfilmentRevision,expectedCatalogRevision,expectedPersonId,expectedPersonRevision,expectedBindingId,expectedHolderId,idempotencyKey}` → `{id,state:'approved'}`. Copy the context from the reviewed queue item and set `expectedHolderId` to its `holderId`. All context is required; omitted or changed context returns 409 and must be refreshed and reviewed before a new decision. Exact retries reuse the same idempotency key; a newly reviewed context uses a new key, including after person replacement/rebinding with unchanged work/fulfilment revisions. The current holder is checked again, and wrong or lost authority returns 403. This records business approval only; it never creates a provider grant or confirms fulfilment.
- POST `/calendars` `{name,timezone,weekdays:number[],startHour,endHour,holidays:YYYY-MM-DD[]}`; POST `/work/:id/commitment` `{calendarId,responseMinutes,resolutionMinutes}`. Business-minute scheduling respects timezone/DST, weekends and holidays. Paused business minutes extend pending deadlines on resume; first public operator response is recorded separately from resolution.

Request creation and public replies atomically enqueue `work_intake_events` with exact source identity, original author, empty connection ID and `pending`. Private and `interpretation:`/`transition:` messages do not enqueue. `workIntakePort` implements intelligence's typed list/claim/finish/catalog interface, registered by `registerWorkRoutes`. Claims are author-bound and fenced by a 180-second lease; uncertain expired claims fail for reconciliation rather than repeat automatically. This outbox is the integration surface for automatic intelligence; no synchronous model call is required to submit work. Model output is proposal/question, never effect evidence.

## People, lifecycle and assets

- GET/POST `/people`: create/update `{source,sourceId,name,managerId?,effectiveAt,observedAt}`. Manager ID means the platform member user ID, never a person ID; it must be a current member of this workspace and only current owner/HR may review it. Integration may update source facts but cannot set manager or member authority. Source identities are stable; older effective data cannot overwrite newer facts. Operators receive only `id,name,active,merged_into,revision`; owner/HR receive employment-source context.
- POST `/people/delegations` `{managerId,delegateId,expiresAt}` requires actual current manager/owner and active decision holder; delegation routes the decision and does not mint execution grants.
- POST `/people/:id/commands` `{revision,command:merge|deactivate,target?}`. POST `/people/:id/erase` `{revision,reason}` invokes full domain erasure .
- GET/POST `/assets`: create `{serial,source,location?,procured?}`. Unique serial conflicts are explicit. Catalog reservations use atomic capacity admission.
- POST `/assets/:id/commands` `{revision,command:reserve|assign|loan|receive|return|repair|retire|dispose|missing,personId?,evidence,location?,certificatePartner?,certificateStandard?,certificateReference?}`. Assigned devices cannot be disposed. Import observation never creates a receipt.
- GET/POST `/lifecycle`: create `{personId,kind:join|move|leave,effectiveAt,timezone,source,sourceRevision,retained:string[],added:string[],removed:string[],deviceIds:string[],ownerId,urgent?,identityTarget?,expiresAt?}`. Rights arrays must be disjoint. `identityTarget` must be the real immutable provider ID or UPN when configuring identity execution; absent provider mapping remains blocked. Join dependencies wait for identity verification. Contractor expiry creates separate due disable/session-revocation duties. Leave has separate disable/session/access and physical-return duties.
- GET `/lifecycle/:id` → `{lifecycle,obligations}`. POST `/lifecycle/:id/amend` `{revision,effectiveAt?,cancel?}` invalidates work revision, preserves uncertain effects and creates compensation duties for applied/uncertain cancelled-hire actions.
- POST `/obligations/:id/physical` `{revision,custodyEventId}` accepts only matching receipt/return history. Employee catalogue obligations resolve the beneficiary member through its current reviewed person binding; HR lifecycle obligations name their domain person directly. Unbound, foreign or wrong-person receipts are rejected, and a changed person/binding requires a fresh attempt. Physical fulfilment is not a provider result.
- POST `/obligations/:id/execution` accepts execution `Step`; target/local beneficiary/action must match obligation exactly. `localBeneficiaryId` refers to the Linen identity; `beneficiaryId` refers to the separately observed provider subject. Execution grants bind mapping identity/version and provider connection revision; these IDs are deliberately different in the runtime test. Identity creation retains explicit `payload:{displayName,mailNickname}` and current grant payload hash; no invented identity profile. Supported identity/group/licence steps use real execution intents.
- POST `/work/process-due` invokes `processDueWork(ctx, executionPort)`. Due duties persist independently; one failure does not stop others. Restoration-held duties do not dispatch. Return values preserve blocked/unknown/physical-pending rather than certifying fulfilment.

## Knowledge, mail and reports

- GET `/knowledge?q=` → `{items}`: only current reviewed, unexpired, currently permitted content.
- POST `/knowledge` `{id?,revision?,title,body,scope:employees|operators|hr,expiresAt,review:boolean}` retains immutable historical versions. Edits invalidate review unless explicitly reviewed in that edit.
- POST `/knowledge/:id/escalate` `{question,deduplicationKey}` creates work preserving exact article revision/title.
- GET `/reports/work?from=&to=&timezone=`: `[from,to)` creation cohort, timezone, actual denominator, elapsed ages excluding pauses, calendar commitments and obligation state counts. Administrative closure is explicitly distinct from verified fulfilment; execution verification coverage is separate.
- POST `/mail/senders` owner mapping `{connectionId,email,userId}`; POST `/mail/intake` authenticated owner/integration envelope `{connectionId,sourceMessageId,sender,subject,text,workId?}`. Unknown/deactivated senders are quarantined. This is the authorized adapter service boundary, not a public unauthenticated webhook or invented configured mail provider.

## Ordinary function exports

`getWork`, `listWork`, `createWork`, `appendMessage`, `conversation`, `transitionWork`;
`storeAttachment`, `readAttachment`; `upsertPerson`, `changePerson`, `acquireAsset`, `moveAsset`;
`createLifecycle`, `amendLifecycle`, `processDueWork`, `effectiveInstant`;
`createCatalogItem`, `requestFulfilment`, `listObligations`, `recordPhysicalHandoff`;
`bindObligationExecution`, `executionPort` (real proposePlan/dispatchPlan/getOperation);
`businessDue`, `saveCalendar`, `setCommitment`, `commitmentStatus`;
`searchKnowledge`, `saveArticle`, `escalateKnowledge`, `workReport`;
`mapMailSender`, `receiveMail`, `restoreAdoptionRecord`, `erasePerson`, `delegateManager`, `resolveManager`.

`restoreAdoptionRecord(ctx,{table,row,sourceId,sourceKey})` materializes validated allowlisted work tables, binds current workspace, preserves scoped history and requires parent work first. Attachment R2 bytes must already reside under current-workspace prefix. It never restores execution bindings/grants. Unresolved duties retain source operation identity in their reason and remain held/blocked. Exact source identities deduplicate through `work_restore_records`.

`erasePerson(ctx,{personId,revision,reason})` requires current owner/HR; removes personal content and R2 attachments for linked work while preserving anonymized work/effect/audit identities and source replay tombstones. Member identities without HR records are also supported and their membership is revoked. Failed physical blob deletion remains in the durable `work_blob_erasure` ledger; exported `processBlobErasure(ctx)` retries deletion without restoring metadata.

Local fixture/runtime command: `node tests/work/runtime.mjs`. This exercises actual workerd D1/R2, persistence restart, scopes/revocation, duplicate/revision/custody/lifecycle/knowledge, actual identity-intent integration without remote effects, business-calendar DST/holiday calculations, and private native restore with held duty.

## Fulfilment execution association

`recordFulfilmentExecution(ctx, {workId, planId, operationIds:string[]})` links an already-dispatched standing-grant work plan to existing catalogue fulfilment obligations. Call with the original authenticated work participant after `dispatchGrantedPlan`, before running provider operations. Include every operation returned by dispatch, including the independently granted expiry removal. The result is `{workId,planId,state:'linked',bindings:[{obligationId,operationId,phase:'initial'|'expiry'}]}`. This reports association only.

The service checks current work access/revision, local beneficiary separately from provider subject, reviewed mapping, exact plan and operation steps, persisted grant authorization, catalogue target/expiry, and existing obligation/binding identity. A D1 batch fences these inputs and atomically records the initial and removal bindings. Exact replay is accepted; changed work, fulfilment, catalogue or conflicting operation binding returns 409. It writes only work-owned tables and never accepts execution state or client verification evidence.

`executionPort` reads the linked operation and independent execution verification. Effect readback alone stays pending; uncertain/cancelled/amended operations stay unknown; missing configuration stays pending with `needs_configuration`; initial verification does not complete a future removal. The due loop reuses the existing operation identities. Cancellation does not certify remote undo: current separately authorized compensation and reconciliation remain execution-owned requirements.

Focused fixture/runtime check: `LINEN_TEST_PORT=<root-assigned-port> node tests/work/fulfilment-link-runtime.mjs`. Its provider boundary is confined to the new test worker; no real external provider writes occur.

## Reviewed person-to-member identity

A person ID is distinct from the platform member ID used for employee requests, approvals and grants. `sourceId` and name are external facts, never runtime account authority. People & permissions creates a reviewed person binding with its new member (`POST /members` with `isPerson:true`, returning `id` and `personId`). Service-only accounts may omit `isPerson`.

Owner/HR use `POST /people/:personId/binding {expectedRevision,memberId,managerId?}` to review an existing person, set its current workspace member, and optionally set its manager. `memberId:null` unbinds and clears the manager (also allowed for an inactive/merged record to release its account); `managerId:null` clears the manager. Manager and employee must be active same-workspace members. Binding is one-to-one, requires an active unmerged person and current owner/HR authority, and is atomically audited with a new person revision and unique binding identity. To replace a person, unbind the old record first, then review the new record. No previous approval survives a rebind, even when the new person's numeric revision coincides. Integration cannot use this endpoint. Scoped manager delegation and independent provider action grants remain required.

`GET /people` shows owner/HR the `member_id`, `binding_id`, manager, and revision. Null member binding means owner review is required; the People & lifecycle review form resolves it. Operators retain their existing limited person projection.

Upgrade migration 0710 uses the actual old schema: there is no person email column. Only normalized exact email in `source_id`, or the historical explicit person `id == member user_id` convention, can match an active member in that workspace. Both directions must have exactly one candidate; conflicting sources, duplicate people, cross-workspace-only, unavailable and opaque source identities remain unbound. Names and opaque source IDs never choose a winner. Workspaces with hashed adoption erasure tombstones require explicit review instead of SQL backfill, because SQL cannot resolve those aliases safely. Erased, inactive and merged records remain inactive/unbound. The migration records its constrained policy in audit and invalidates prior approvals; records and IDs are retained. Review unresolved records through the binding API/form.

Privacy resolves the current reviewed person/member relationship in both directions within this workspace, including deactivated bound records. Former bindings remain audit history and never connect different current people for erasure. Current ambiguous identities or concurrent binding changes stop erasure for owner review. Native restore clears imported member/binding/manager authority and requires new review; imported approvals remain inert.

### Lifecycle evidence export (LIFE-007)

GET `/lifecycle/:id/evidence` downloads the selected join, move or leave as JSON.
A current owner or HR member may export a visible record in their workspace. The
pack retains the HR source, effective time, every duty and linked operation,
versioned grant decisions, execution attempts and independent verification.
Unfinished and unknown duties remain explicit. This is an evidence snapshot for
an auditor or a legal-hold/SOC 2 archive; downloading never certifies an
unverified effect or creates retention authority. Store the download under your
organization's retention and access policy. The lifecycle detail page offers the
same download.

### Physical asset lifecycle (ASSET-004)

Set `procured:true` when recording a serial against a purchase record. The asset
stays procured until an attributed `receive` puts it in stock. Observed stock
keeps its source as observation, without claiming physical receipt. Assignments,
loans, repair, return, retirement and disposal remain in the serial's history at
GET `/assets/:id/history`, visible to current owners and operators. A repair does
not clear assignment; only a return does. Retirement and disposal refuse an
assigned device. Receiving a repaired unassigned device makes it available again.

Disposal requires the actual ITAD partner, `certificateStandard` (`R2v3` or
`e-Stewards`) and an HTTPS `certificateReference` to its document. This reference
is retained with the receipt, actor and timestamp. Linen records the operator's
attribution; it does not independently certify the partner or retain the remote
certificate's bytes. The Devices page exposes these fields and custody history.

### Human time and effort

`GET /work/:id/time` lists scoped recorded effort. Service operators can see all
entries on work they may read; participants see only their own entries. Private
notes remain outside the public conversation.

`POST /work/:id/time` accepts `{source:"manual", minutes:15,
deduplicationKey, obligationId?, note?, effortRole?}` or `{source:"measured",
deduplicationKey, obligationId?}`. Task IDs must belong to that same scoped work.
The actor and actual workspace role come from current membership. The effort role
defaults to that person's role (`operator`/`hr` maps to `agent`); operators can
explicitly attribute manual vendor/technician work. A stable key replays the same
entry and rejects changed content. Measured sessions cannot attribute another
person's work. At most one active timer exists per person and workspace.

`POST /work/:id/time/:entryId` accepts `{command, sequence, activeMs?}`. Commands
are `heartbeat`, `pause`, `resume`, `stop`; every change requires the returned
sequence. A heartbeat credits the smaller of the client's active duration and the
server's elapsed interval, only while the prior heartbeat is fresh. Gaps over
30 seconds earn zero. Pauses, stops and resumes add no elapsed minutes. Resume is
a new touch; heartbeat is not. The browser sends activity only while visible,
focused and recently used, and pauses on hidden/blur/inactivity. Failed or lost
heartbeats never manufacture time; refresh reconciles the stored state.

`GET /reports/effort?from=ISO&to=ISO` and the `effort` member of `/reports/work`
return persisted manual/measured minutes and touches grouped by the recorded
request type and effort role. The declared cohort is work created in the period,
plus work with effort entries started in it; each entry's total is reported
through `asOf`. Request type is the first selected catalog service, or work kind
when none is selected. Pending, failed and verified obligations remain visible;
closure does not establish verification. This is the human-effort input to
REPORT-004, with unavailable charges/rates explicit; it does not establish a
before/after savings claim. Reports include normal-sensitivity work only and
require current owner/operator/auditor membership.

Native and full-installation archives retain recorded effort, while restoring all
timers completed with no live heartbeat authority. Person erasure clears private
effort notes and ends affected timers without inventing or deleting active minutes.

### ASSET-008 asset financials

Owner/operators use `POST /assets/:id/financials` with `revision` (0 initially),
`purchaseCents` (integer USD cents), `inServiceDate` (YYYY-MM-DD), `usefulMonths`,
`method` (`straight-line` or `declining-balance`) and `costCenter`.
`GET /assets/:id/financials?asOf=YYYY-MM-DD&fiscalStart=YYYY-MM-01` reads book
value and the fiscal-year schedule. The matching `/financials.csv` door downloads
the same fiscal schedule for accounting import. ASSET-008 in CONTRACT.md defines
rounding, anniversary postings, zero salvage and fiscal bounds.

### DESK-013 recurring work

`GET/POST /recurring-work` lists or creates owned calendar plans. Creation takes
`title`, `body`, `ownerId`, `calendar` (timezone, weekdays, startHour, holidays),
`rule` (startDate, frequency, interval, firstBusinessDay), and optional
`tasks: [{title,ownerId}]`. Plan content and calendar are immutable;
`POST /recurring-work/:id` with current `revision` and `enabled` pauses/resumes.
The existing scheduler and `POST /work/process-due` create due occurrences,
one per plan per tick, atomically with the ticket, local tasks and cursor.
`GET /work/:id/recurring-tasks` reads duties;
`POST /work/:id/recurring-tasks/:task` with `revision` records completion.
Imported plans remain disabled and need current active owners before resumption.
