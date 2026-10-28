# Linen rulings

Each ruling below shaped a clause of CONTRACT.md. The clause states the outcome; the ruling states why. RL-1 to RL-23 were moved verbatim out of the contract text in the 28 October 2026 contract cleanup; ct's own ruling pass numbers its entries from RL-101, and they are copied here verbatim from that pass.

### RL-1 — Binding Slack intake and delivery rule

*Date:* 20 October 2026, 18:40Z · *Ruled by:* ct · *Governs:* CHANNEL-001, CHANNEL-010, D-2

*Binding Slack intake and delivery rule (ct, 20 October 18:40Z):* setup requires the app signing secret and refuses without it. Intake checks, in order: constant-time HMAC verification of the raw body; a five-minute timestamp window; team/app/enterprise binding; event_id replay; a live owner-confirmed mapping keyed by Slack (team, enterprise, app, user) to an active Linen member; then that member's current Linen rights. Mapping never infers identity from email or name and never requests users:read.email. Mapping changes are audited. Removal, deactivation, disconnect or unmap makes a mapping dead on the next request; restore requires fresh owner confirmation. Unknown, external, shared-channel-guest and deactivated senders are quarantined visibly to the owner, never creating a ticket or receiving ticket detail. The mapped original poster is the ticket requester; the channel is its source; a mapped reaction/shortcut actor is the submitter. The clause status stays unchanged until both native fixture and real adapter proof pass. Every future Slack delivery or action inherits this rule before shipping, including CHANNEL-006, CHANNEL-008, DESK-007, DESK-009, NOTIFY-001, NOTIFY-002, ACCESS-007, LIFE-002, KB-003, KB-005, API-002 and L10N-001. A display name in a Slack reply needs a further ct ruling; it is not an exception to the notice-only rule.

### RL-2 — Service notice cohorts and all-clear

*Date:* 20 October 2026, 20:20Z · *Ruled by:* ct · *Governs:* CHANNEL-008

*Today's semantic (ct, 20 October 20:20Z):* an owner-managed requester group defines a cohort. A current owner or operator publishes against an incident or planned change. Every read and send rechecks active membership, current cohort membership and access to the source and its affected services. Chat notices inherit CHANNEL-001/CHANNEL-002 and carry only a generic notice and an authenticated link. An all-clear requires a named person to record verified recovery; it is retained until that same person withdraws it. The incident must have fresh independently admitted recovery for every affected cohort, or the change must have independently verified completion, before that record is made. Portal matching is an exact whole service-name phrase, ignoring case and punctuation, in the prospective ticket's text; it offers only an open notice for an open incident the requester can currently read. Filing anyway opens a separate ticket; a notice never establishes that ticket's recovery. Update cadence is whole minutes (1–10080): the portal shows when the next update is due; when email is enabled, the scheduler repeats a generic sign-in link at that cadence without inventing a fresh human progress update. Email uses a selected active SendGrid connection; provider acceptance is distinct from delivery and an uncertain send is not automatically repeated. Restored historical sources do not publish notices. Slack and Teams delivery remain required under CHANNEL-001 and CHANNEL-002 and are not implemented in this slice.

### RL-3 — Request sharing and manager visibility

*Date:* 20 October 2026 · *Ruled by:* ct · *Governs:* CHANNEL-009

*Today's semantic (ct, 20 October):* the requester or the person a normal request is for shares it by a colleague's work email with a current workspace member. A shared colleague reads and replies to the public thread only: never private notes or attachments, and their replies are conversation, not new intake. HR and restricted requests are never shared. The requester, the person it is for or a service operator revokes a share; every share and revoke is an audit event and the request lists current and earlier shares. A request filed on behalf of someone shows to the submitter and the person it is for (filing for someone else is the service team's or HR's today). "My team's requests" lists, read-only, the public thread of normal requests for a manager's direct and indirect reports, following each person's current manager on their reviewed HR-fact record at read time, so an HR change moves visibility at once; HR and restricted requests and private notes are never shown there, and a manager cannot reply from it. Linen's taxonomy has no separate security, health or leaver categories: security and health requests are restricted, and leaver lifecycle work is not a request. The request portal tells requesters and beneficiaries that their managers can read the public thread of their normal requests. HR facts arrive through the people API until LIFE-001's HRIS connectors inherit it, and DESK-011's department workspaces inherit the HR exclusion before they ship.

### RL-4 — Approved audience and quote semantic

*Date:* 21 October 2026 · *Ruled by:* ct · *Governs:* CATALOG-001, CATALOG-007, CATALOG-008, CATALOG-009, D-1

*Approved audience and quote semantic (ct, 21 October):* only the owner configures versioned catalog audience and quote requirements. Reviewed people have department, location and employment-type stable IDs from owner-maintained lists; referenced values may be retired, not deleted. Owner or HR reviews these attributes through the existing source-attributed, effective-dated people API; no inference or integration-principal writes. LIFE-001 later uses an owner-reviewed source mapping. Unbound, inactive, merged, erased, absent or unmapped facts are unknown, without age expiry. Matching is OR within each dimension, AND across dimensions, empty means unrestricted and unknown fails a restricted dimension. Every filer, including the owner, must satisfy the beneficiary audience. Employee-capacity filing also checks the requester; staff on behalf do not apply requester audience. Employees and assistant context see eligible items only. Submission atomically rechecks current filer membership/role, evaluated person revision, item revision, audience, conditional required answers and a quote revision/hash. Audience gates submission, not later approval or fulfillment; an amendment is a fresh submission and invalidates prior approvals. Freeze item/form/answers, cost/delivery, audience/person revisions and quote id/hash. Quote attachments are a separate `catalog_quote` kind, PDF up to 20 MiB, immutable after submission; replacement is an amendment. Readers are the requester, beneficiary, owner, current approver for the current revision, an approver who recorded a decision on that quote revision, and the current item fulfillment owner. A replaced undecided approver loses access. All other operators, shares, team managers, auditors, integrations and MCP get 404. Non-readers see only that a quote is attached, never name/content; serve it as a download, not inline. Exclude quote contents from search, history, notifications and AI context; include them in owner export, erasure and retention. Audit privileged reads except requester/beneficiary, uploads and replacement, item/value-list edits, dimension-only attribute reviews and audience refusals, with no attribute values. No PDF amount extraction: the requester enters a separate USD field when price-based routing needs it. Bundles refuse atomically with every failing child named. Pending people use their reviewed attributes at hold and release; failed services remain held with a visible reason. Assistant choices recheck eligibility and refuse missing required fields/quotes. Credentials, quotes and forms grant no provider or approval authority. API-003 ticket tools expose no catalog quote or catalog submission payloads. Refusals use `catalog_audience` (403, staff see failed dimensions but no values), `catalog_changed` (409), `catalog_quote_required` and `catalog_quote_type` (422), `catalog_field_required` (422, named question), and `bundle_child_refused` (one line per failed child). This complete rule is built; the slices below state the exact semantic the code uses.

### RL-5 — Bundles and kits

*Date:* 19 October 2026, 17:42Z · *Ruled by:* ct · *Governs:* CATALOG-004

Approved by ct on 19 October (17:42Z).

### RL-6 — Agent groups and accountable ownership

*Date:* 20 October 2026 · *Ruled by:* ct · *Governs:* DESK-001

*Today's semantic (ct, 20 October):* the owner (acting for "admin" until that role exists) creates agent groups, adds active agents (owner or operator members) and names each group's leads. Each ticket has one accountable group and at most one owner, its assignee, who must be an agent in that group: placing a ticket in a group whose members exclude its owner, assigning it to a non-member, or removing a member who still owns one of the group's open tickets is refused. A group lead's view lists their group's tickets that they can read and that are not restricted; it never widens visibility, and restricted tickets stay visible only to the workspace owner, the requester and the person it is for. Agents read each ticket's group and priority in the queue; requesters do not. An agent saves a view (filters: open or closed, unassigned or assigned to them, priority, ticket type, group; sort: recently updated, newest, oldest or priority, P1 first and unclassified last) under a name, private to them or shared with every agent in the workspace; running a view narrows its reader's own queue and never widens it, and only its creator or the workspace owner removes it. The bulk-update screen applies one command (assign, pause, resume or close) to the tickets an agent chooses from the current view through `POST /work/bulk-commands`, which changes or refuses each ticket on its own under the single-ticket rules and reports both counts. Keyboard triage works outside text fields: `j`/`k` open the next/previous ticket of the current view, `a` assigns the open ticket to oneself, `r` writes a shared reply, `n` a private note, `s` pauses or resumes it, `c` closes it, Ctrl/⌘+Enter sends the field's form, Escape leaves a field and `?` shows the shortcut reference. Done for every triage action that exists today; `x` runs a DESK-015 scenario on the open ticket.

### RL-7 — Ticket relationships

*Date:* 19 October 2026, 19:44Z · *Ruled by:* ct · *Governs:* DESK-006

Approved by ct on 19 October (19:44Z).

### RL-8 — Responses and summaries policy

*Date:* 19 October 2026 · *Ruled by:* ct · *Governs:* DESK-008

This implements the policy approved by ct on 19 October.

### RL-9 — Owner-only department administration

*Date:* 22 October 2026 · *Ruled by:* ct (approved as landed) · *Governs:* DESK-011, DESK-024

*Current implementation, owner-only administration default (ct approved as landed, 22 October):* department workspaces are internal to the existing Linen installation. The owner creates IT, HR service, Facilities, Finance, Legal or custom departments, explicitly grants current staff membership and configures their service resources. Employee department attributes grant no staff authority. Current department membership intersects existing roles, sensitivity and private-note rules; the owner's existing global authority remains. Legacy records with no department or retained HR restriction keep their existing permissions.

### RL-10 — Erasure semantic for history values

*Date:* 20 October 2026 · *Ruled by:* ct · *Governs:* DESK-017, DESK-028, AUDIT-001, ERASURE-001, A8

*Erasure semantic (ct, 20 October):* the following approved retained-value rule is an implementation obligation, not a claim that value preservation exists today. Until it is built and proven, the existing blanket clearing stays. (a) Retention requires one shared typed schema registry mapping audit actions and fields to value classes, used by export, import, erasure and history; unregistered actions or fields keep full clearing. (b) The closed allowlist is built-in state, type, priority, impact/urgency, SLA pause with an enum reason, resolution code, and approval outcome with revision numbers and grant version; category, service and group by id and configured label (scrub a group with exactly one member at change time or a label matching an erased identity); dropdown, multi-select, number, boolean and date custom fields only after audited owner/admin classification as nonpersonal, default personal (text, user, email, URL, phone and attachment fields can never be nonpersonal); and links to tickets, tasks, changes, problems and assets as ids only, with titles read live under current scope. (c) Keep each scrubbed entry marked `redacted: erasure`. Erased-person references show "Erased person" without a link across entries (archives use A6 opaque aliases). Always scrub free text, values matching existing erased identity tombstone digests and asset values tying the asset to that person. (d) If an HR or restricted record's subject is erased, scrub category, type, service and all custom values too: only state, priority, SLA and timing remain. (e) For registered actions, touch only entries where that person is actor, requester/beneficiary or a value; leave unrelated people's history unchanged. (f) Already-cleared entries remain cleared, showing "values removed by an erasure on <date>"; never rebuild them from records, archives, imports or replay. (g) One redacted history serves agent, auditor, REST, MCP, search, notifications, export, restore and replay; no raw payload is exposed and scrubbed values leave search. Employee history remains public-only. Older archives receive the same scrub or are refused under A6; ServiceNow history inherits the same classification on import. (h) Erasure receipts report counts per class without content. Kept work facts may still point to a person when combined with outside knowledge; this is not a legal certification of anonymization.

### RL-11 — Application registry authority and visibility

*Date:* 19 October 2026 · *Ruled by:* ct · *Governs:* ACCESS-008

These authority and visibility semantics were approved by ct on 19 October.

### RL-12 — Owner-only lifecycle templates and minimal assignee view

*Date:* 22 October 2026 · *Ruled by:* ct (approved as landed) · *Governs:* LIFE-002, LIFE-008

The owner-only configuration and minimal assignee view are the default ct approved as landed on 22 October; the Slack reminder point stays unbuilt and is this clause's named gap (no narrowing).

### RL-13 — Stock rooms and reorder

*Date:* 19 October 2026 · *Ruled by:* ct · *Governs:* ASSET-005

*Today's semantic (ct, 19 October):* an owner or operator keeps one stock line per item per location (both matched ignoring case and repeated spaces): a device or accessory, the counted on-hand quantity, a reorder threshold, a reorder quantity, a unit estimate in whole USD cents and the buyer (Purse, CDW, Apple Business or Dell). Allocating stock to an active, bound person on the current revision lowers the count atomically and never below zero; when the count falls to or below the threshold (inclusive) and the line has no open request, the same write raises one purchase request for the reorder quantity with the estimate quantity × unit cents, addressed to the buyer. A line has at most one open (raised or ordered) request. Linen labels a raised request "raised in Linen, not sent": no Purse or vendor connector sends it yet. The owner or operator records the order placed with the buyer and its reference, cancels it with a reason, or receives the ordered quantity, which adds it to the count; every movement is kept with its evidence. Sending to Purse through its requester intake door (Purse INTAKE-004, an owner-created integration token) remains this clause's gap, under the egress rule for the owner-entered Purse origin; CDW, Apple Business and Dell connectors inherit transmission before they ship.

### RL-14 — Problem detection aggregation rule

*Date:* 19 October 2026 · *Ruled by:* ct · *Governs:* PROB-002, PROB-003

Under the ct-approved aggregation rule (19 October 2026), normal-source proposals use existing operator visibility. Restricted sources are clustered separately by their source audience; their proposal and accepted problem are visible only to the detecting owner, with no inferred participants. Every read rechecks every underlying ticket, alert and service; an inaccessible source hides the whole cluster and its count. Accepted problems inherit the proposal's owner and visibility. Source evidence stores references rather than copied conversations.

### RL-15 — Change templates and standard-change approval

*Date:* 19 October 2026, 11:47Z · *Ruled by:* ct · *Governs:* CHANGE-001

These semantics were approved by ct on 19 October, including retained snapshots at 11:47Z.

### RL-16 — Generated article audience and reviewer rules

*Date:* 19 October 2026 · *Ruled by:* ct · *Governs:* KB-004, KB-006

These audience and reviewer rules were approved by ct on 19 October.

### RL-17 — Initial department role boundary

*Date:* 23 October 2026, 11:28Z · *Ruled by:* ct · *Governs:* ROLE-001

**Approved initial boundary (ct, 23 October 11:28Z):** current-owner administration and public-ticket reading in one active non-HR department add no staff actions, private notes, attachments, quotes, catalog eligibility or approval authority. Revocation applies on the next request; restored assignments stay inactive until re-confirmed. This is an interim floor, not the target.

### RL-18 — MCP credential semantic

*Date:* 20 October 2026 · *Ruled by:* ct · *Governs:* API-003, API-005, API-007

*MCP credential semantic (ct, 20 October):* credential lifecycle and authenticated protocol discovery and the six scoped ticket tools are implemented. An MCP grant has its own audience: a REST token is refused at MCP and an MCP credential is refused on `/api/v1/*`; no secret serves both. Only an owner mints one for an existing active automation principal holding only the integration role, refusing owner, approver, HR, auditor or operator roles. It binds one workspace, expires within at most 365 days, shows its secret once and stores SHA-256 only. The owner revokes it immediately; its list shows last use. Minting, revocation and expiry are audited. The closed tool list maps `work.read` to permitted queue listing, ticket get, search and DESK-017 redacted history, `work.create` to ticket creation and `work.comment` to comment addition. New tools need a ct contract change and tested release. Every call checks live active membership intersected with roles, scopes, the tool allowlist, current A1 scope and ticket access/grants; recheck at commit with revision checks. Exclude HR and restricted records. Ticket text is data, never authority. Launch refuses approval/decisions, credential minting, grants, role/configuration changes, export, restore, erasure, connectors/provider/external effects, task plans and bulk changes. Future external-effect tools need A2 grants with human approvals. Minting never grants agent approval rights or changes existing approvals/grants. Unauthenticated discovery returns only a protocol auth error, without tool or resource names; authenticated lists expose only currently usable tools and resources. No OAuth dynamic client registration ships at launch. Deactivation, removal or erasure refuses the next call; erasure revokes the credential and clears its hash. Export carries credential metadata without its hash; restore leaves it revoked and inert until freshly minted. Each call audits credential id, principal, tool, target ids, outcome/refusal code and time, never secrets, request bodies or argument free text. MCP may reuse API-001's future principal/scope checker, never its secret or audience.

### RL-19 — MCP queue readership

*Date:* 21 October 2026 · *Ruled by:* ct · *Governs:* API-006, API-007

*MCP queue readership (ct, 21 October):* at mint the owner selects one or more existing workspace agent groups on this credential, shown in its metadata and mint audit; work.read/work.comment without a grant, unknown groups and other-workspace groups are refused. An owner may narrow a grant immediately with an audited version increase; widening requires a new credential. It never makes the principal a group member, lead, assignee, owner or approver, and no requester, beneficiary, share, participant, manager or REST readership is inferred into MCP. Recheck every call and at commit: current group in the grant, normal sensitivity, not erased/withheld, active integration-only membership and automation principal, scopes, tool list, credential state/expiry and issuing owner still active as owner. Losing that issuer returns `mcp_issuer_inactive`, revokes the credential and audits it; another owner re-mints. Own normal work.create tickets are additionally readable by get/search, but list only includes them when in a granted group. Moving a ticket out removes it on the next call. Read core id/number/title/state/type/priority/impact/urgency, category/service/ group ids and labels, SLA, timestamps and revision; requester/beneficiary id and display name only; the public thread and the principal's own comments; owner-classified nonpersonal dropdown/multi/number/boolean/date fields; and DESK-017's redacted history with these same limits. Search uses only that set and those fields. No other private notes, attachment names/counts/content, personal fields, email/phone/HR facts, manager line, shares or team view. Missing, out-of-grant, HR and restricted tickets all return `not_found`, audited with a refusal code. Wider reads need a new ct-approved scope/tool. work.comment is internal, attributed to the principal, uses its read revision rechecked at commit, and sends no notification, requester reply or provider effect. work.create is normal-only, with no principal-chosen group placement. No assign/claim/group/state/priority/field/pause/close/merge/bulk/scenario/ approve/share action is allowed. Restore keeps grants/credentials revoked and inert. Audit mint group ids, versioned `mcp.queue_grant_narrowed`, issuer loss and calls with ids only; AUDIT-001 inherits these events. Existing custom fields support text and dropdowns; only dropdowns can be owner-classified nonpersonal through `/api/v1/mcp-fields/:id/classification`. DESK-010 inherits this classification and projection boundary before adding further field types. Queue grants narrow through `/api/v1/mcp-credentials/:id/narrow`, using the current grant revision; widening requires re-minting.

### RL-20 — Retention policies with preview and owner confirmation

*Date:* 19 October 2026, 15:09Z · *Ruled by:* ct · *Governs:* RETENTION-001

Approved by ct on 19 October (15:09Z), with the preview and owner confirmation.

### RL-21 — Interim sandbox-admin rule

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* SANDBOX-004

**Approved interim sandbox-admin rule, ct, 26 October 2026:** only a current owner may explicitly assign or withdraw the sandbox-admin role through the existing audited owner-only membership door. The holder must be a current active Linen member. Existing owner approval rights remain independent. A qualifying sandbox-admin may review the complete permitted differences of a known reviewable promotion or rollback package and approve its exact reviewed revision. Package knowledge alone confers no access. The role provides no draft listing or draft access, creation, editing, application, membership administration, production personal-record access, credentials, grants or provider execution authority. Sandbox and package creation and editing, promotion application and rollback application remain owner-only. The approver must be separate from the package creator and must have contributed no edits to the package’s included changes. Check current membership, approval authority, non-contribution and reviewed revisions at approval and again at application. Refuse unauthorized, self, contributing-editor, revoked-role and stale-revision attempts; refuse application when reviewer authority or independence is no longer current. Refusal applies to the whole package without partial application. Role changes, privileged package reads, approvals and applications retain their applicable durable audit requirements, recording actor, time and relevant package and revision identities without secrets or personal-record content. Refusal must not create a successful application record. Restore invalidates packages and approvals and cannot revive role authority. **Additional acceptance:** through the actual product doors, an owner assigns the role to a current active member; that non-editor reviews and approves known promotion and rollback packages. Refuse assignment by a non-owner, unassigned-member access, draft access, creation, editing and application by the sandbox-admin. Refuse self approval and contributing-editor approval, including after a role change. Withdraw membership or approval authority between approval and application and refuse application without partial state changes. Change a reviewed revision and require fresh review and approval. Verify applicable audit records and restore invalidation. Complete administrator native journeys at 1440 and 390 with keyboard and scope checks. **Named Gaps retained:** explicit owner-selected masked personal-record copying and its masking-before-persistence, storage, read, log, export, scope, retention and erasure proof; complete administrator native journeys; and any additional interim-role assertions above not already evidenced. Default personal-data exclusion is a safety floor, not proof of masked copying. SANDBOX-002 and SANDBOX-003 retain their own implementation and evidence Gaps. No original acceptance point is waived or transferred.

### RL-22 — Masking and custody of interim sandbox copies

*Date:* 26 October 2026 · *Ruled by:* ct · *Governs:* SANDBOX-005, SANDBOX-006

**CT masking and custody ruling, 26 October 2026 — APPROVE WITH RIDERS.** The interim copying capability is explicit, current-owner-consented ticket-row structure copying only. Every source value must be replaced with a non-identifying masked value before storage or exposure. Retain no source record or person identifiers, identity-bearing links, reversible mappings or raw source values in copied rows, storage, reads, logs or exports. Structural references, where needed, use fresh sandbox-local identities and cannot resolve production records. Copies confer no production authority, assignments, grants, credentials or provider execution rights. They never enter promotion or rollback packages, portable copies or retained rehearsal answers. Production records remain unchanged. Enforce source retention deadlines without extending them. Because retained source-identity links are prohibited, a source change or relevant membership, scope, erasure or retention change retires all masked copies in the workspace before further use. Restore cannot revive retired copies. Any later copy requires fresh owner selection and consent under current conditions. Retirement may retain only the minimal non-content control information needed to prevent revival. **Gap:** the complete owner-selected masked personal-record target remains owed beyond this interim ticket-row slice. Prove masking before persistence and exposure; absence of source values and identity links across storage, reads, logs and exports; source deadlines; workspace-wide retirement and restore fencing; unchanged production records; package and portable-copy exclusion; and inherited authority and native journeys. The prior sandbox-admin policy is independent and remains required. This ruling supplies no implementation certification and changes no clause status.

### RL-23 — Erasure and archives

*Date:* 19 October 2026 · *Ruled by:* ct · *Governs:* A6, A8

*Erasure and archives (ct, 19 October):* after an identity erasure, a workspace export redacts the erased person's personal and free-text content and maps each erased actor or person reference to a stable, per-installation opaque archive alias; archive tombstones stay keyed digests, never raw identities; typed business policy, effect and audit identities and their relationships remain, and no grant is revived. Export and import reference validation use the same typed table and field schema; untyped content that still contains an erased identity refuses. A snapshot taken before an erasure stays refused against the destination's known tombstones, and fresh imports stay held and inert. No field is exempted from the tombstone check and no retained business row is deleted to pass it. Audit-history values also inherit DESK-017's *Erasure semantic (ct, 20 October)*, including redacted history on restore/replay and never reconstructing earlier cleared values.

### RL-101 — API-001: REST API and webhooks

Date: 2026-10-28 · Ruled by: ct · Governs: API-001

Question: May scoped integration-only tokens create a principal’s own normal tickets?

Adopted/proposed default: Owner-issued hash-only expiring work.create token; current principal/owner authority and no provider effects.

Outcome: **adopt with rider**. Approve the self-ticket token foundation with explicit scope, workspace binding, once-issued secret, bounded expiry, live transactional authorization, immutable dedupe and inactive hash-free restore; its narrow current scope cannot replace the complete automation API/webhook target.

Why: Freshservice has administrator-managed integration users and permission-bound API access. No common norm is established by the reviewed sources for Linen’s 365-day maximum or self-ticket-only interim scope; these conservative limits supply no permission to claim the rest implemented.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000014413-manage-integration-users-in-freshservice): Administrators with the relevant user-management permissions manage integration users and their API keys.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000008929-how-do-roles-and-permissions-work-in-single-and-multiple-workspace-setups-): Agent permissions are scoped to workspaces, groups or assigned items; admin settings have distinct administrative permissions.

Main evidence: `CONTRACT.md:2236` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: API-001 owns the REST credential door rule; API-002 cites it for shared token custody.

Engineering/proof retained: Wider API scopes, signed events, qualified egress, retries and delivery history remain engineering work.

### RL-102 — CATALOG-002: Approval chains

Date: 2026-10-28 · Ruled by: ct · Governs: CATALOG-002

Question: May exact-domain authenticated mail decide only the current revision and preserve a recorded rejection after role withdrawal?

Adopted/proposed default: Audited owner mail enablement; exact-domain alignment; rejection final for its revision; changed work invalidates decisions.

Outcome: **adopt with rider**. Approve explicit mail-connection consent, authenticated current-approver single-use revision-bound replies and rejection permanence for that exact revision; a changed request requires fresh decisions, and a withdrawn holder cannot make new decisions.

Why: Freshservice supports named approvers and configurable rejection rules across mail and chat. Exact-domain matching is stricter than ordinary DMARC alignment, and the reviewed sources establish no common norm requiring it: retain it as a disclosed conservative admission rule, not a claim that DMARC always requires exact equality.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000011144-how-to-create-and-assign-approvals-in-freshservice-): Named users/teams decide approvals with configured chain rules; email, portal, Slack and Teams are supported channels.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000009732-bulk-email-sender-requirements-for-custom-domain-users): Custom-domain senders configure SPF, DKIM and DMARC for authenticated outbound email.

- [Source 3](https://support.atlassian.com/jira-service-management-cloud/docs/manage-settings-for-approval-by-email/): Jira Service Management administrators choose direct email approval or authenticated request-view links; chat approvals are configurable.

Comparison: Freshservice and Jira support approver decisions through multiple configured channels, while their public instructions do not establish Linen’s strict exact-domain admission as a universal DMARC requirement.

Main evidence: `CONTRACT.md:557` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: CATALOG-002 owns the revision/rejection point; cite CHANNEL-003 for shared authenticated-mail admission.

Engineering/proof retained: Live SES/SendGrid/mailbox receipts, chat adapters and mobile approval remain owed. Logins/app consent remain external; the product boundary is ruled here.

### RL-103 — CHANNEL-003: Email mailboxes

Date: 2026-10-28 · Ruled by: ct · Governs: CHANNEL-003

Question: Can incoming email add readership or retain an untrusted message body?

Adopted/proposed default: Mapped DMARC-aligned senders, held address/subject only, CC watchers already authorized and requester-only outbound replies.

Outcome: **adopt with rider**. Adopt mapped active-sender plus receiving-provider authentication, no content persistence for held mail, existing-reader-only CC/watchers and requester-only public replies; message headers route a thread but never confer record authority.

Why: Freshservice authenticates custom-domain outbound mail and separates scoped agent rights. No common norm is established by the reviewed sources for Linen’s exact inbound hold/no-body/requester-only combination; the safest boundary prevents mail from widening access. Provider-issued Authentication-Results must be trusted transport evidence, never an arbitrary sender header.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000009732-bulk-email-sender-requirements-for-custom-domain-users): Custom-domain senders configure SPF, DKIM and DMARC for authenticated outbound email.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000008929-how-do-roles-and-permissions-work-in-single-and-multiple-workspace-setups-): Agent permissions are scoped to workspaces, groups or assigned items; admin settings have distinct administrative permissions.

- [Source 3](https://support.atlassian.com/jira-service-management-cloud/docs/what-are-the-customer-permission-settings-for-email-requests/): Jira email can admit new customers and CC participants depending on project access/sharing settings.

Comparison: Jira can permit email-driven new participants; Linen chooses existing-reader-only CC and no retained held body. That stricter privacy boundary is a local conservative choice, not a universal incumbent norm.

Main evidence: `CONTRACT.md:241` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: CHANNEL-003 owns the mail admission/reader rule once; approval and collaboration doors cite it.

Engineering/proof retained: Actual Gmail/Exchange OAuth receipt and Exchange Message-ID behavior remain unproved; no delivery claim follows from fixtures.

### RL-104 — CHANNEL-006: Conversational help that acts

Date: 2026-10-28 · Ruled by: ct · Governs: CHANNEL-006

Question: May requester-controlled handoff use current presence and a business calendar before leaving an asynchronous ticket?

Adopted/proposed default: Requester-only request, availability refreshed within five minutes and owner-configured business hours/accept timeout.

Outcome: **adopt with rider**. Keep the requester’s conversation as the handoff record; offer it only to a currently authorized available agent during the configured calendar, assign on acceptance, and retain an honestly timed asynchronous request when unavailable or timed out.

Why: Freshservice exposes AI-to-agent handoff and administrator-defined working hours. No common norm is established by the reviewed sources for a five-minute heartbeat or Linen’s timeout range; retain them as configurable local liveness rules with truthful unavailable states.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000009428-enable-freddy-ai-agent-features): Freddy provides handoff when an employee still needs a support agent.
- [Source 2](https://support.freshservice.com/support/solutions/articles/233754-user-management): Groups can have their own working hours and holidays.

Main evidence: `CONTRACT.md:307` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: CHANNEL-006 owns the handoff point; channel implementations cite it rather than copy it.

Engineering/proof retained: Slack/Teams context and adapters remain required; business-time proof must exercise actual public behavior. Agent action dispositions remain company-policy decisions.

### RL-105 — CHANNEL-007: Phone and walk-up intake

Date: 2026-10-28 · Ruled by: ct · Governs: CHANNEL-007

Question: May owner-mapped phone numbers and badges route intake while unknown callers remain held?

Adopted/proposed default: Mapped active-member identifiers, unknown number only, staff-private recording/transcript and deterministic walk-up matching.

Outcome: **adopt with rider**. Use reviewed number/badge mappings only as routing context, never authentication for access or privileged actions; hold ambiguous callers without content, restrict recordings/transcripts to authorized staff and require a clear provider recording/transcription disclosure before capture.

Why: Freshservice’s phone integration links calls and recordings to tickets for staff. No common norm supplies Linen’s exact unknown-caller retention or one-day reuse rule; the conservative approach avoids guessed identity. A spoofable phone number is not independent proof of who called.

- [Source 1](https://support.freshservice.com/support/solutions/articles/238117-add-a-phone-channel-to-your-service-desk-with-the-freshcaller-integration): Admins configure phone integration; agents create/link tickets and can access a call recording from its ticket.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000008929-how-do-roles-and-permissions-work-in-single-and-multiple-workspace-setups-): Agent permissions are scoped to workspaces, groups or assigned items; admin settings have distinct administrative permissions.

Main evidence: `CONTRACT.md:339` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: CHANNEL-007 owns this routing-versus-authentication point once.

Engineering/proof retained: Real RingCentral receipt/transcription, other phone adapters and real-time webhook delivery remain engineering gaps; recording permission/legal sign-off itself is not granted.

### RL-106 — DESK-007: Collaboration

Date: 2026-10-28 · Ruled by: ct · Governs: DESK-007

Question: May an owner initiate a private collaboration without granting its recipients ticket access?

Adopted/proposed default: Normal-ticket owner initiation with exact recipient/content consent and existing readership; no unknown-outcome resend.

Outcome: **adopt with rider**. Approve explicit recipient/content consent for the current normal-ticket collaboration door; mentions/watchers confer no readership, external messages contain only selected content, current authority is checked at send/read and ambiguous delivery is reconciled before another send.

Why: Freshservice separates ticket operations from administration and scopes access by workspace/group. The reviewed sources establish no common norm requiring every side conversation to be owner-only: that is an interim implementation floor, while the target’s authorized staff collaboration remains owed.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000008929-how-do-roles-and-permissions-work-in-single-and-multiple-workspace-setups-): Agent permissions are scoped to workspaces, groups or assigned items; admin settings have distinct administrative permissions.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000009732-bulk-email-sender-requirements-for-custom-domain-users): Custom-domain senders configure SPF, DKIM and DMARC for authenticated outbound email.

Main evidence: `CONTRACT.md:885` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: DESK-007 owns selected-content collaboration; cite CHANNEL-003 for common mail admission.

Engineering/proof retained: Slack mapping/private-channel receive proof and broader staff/HR collaboration remain required. Provider acceptance is not mailbox receipt.

### RL-107 — ROLE-001: Roles and permissions

Date: 2026-10-28 · Ruled by: ct · Governs: ROLE-001

Question: Should a person with only a custom ticket role count as a billable agent seat?

Adopted/proposed default: The seed proposes counting any live custom-ticket-role member as one agent seat, while requesters and approvers need none. The ct interim default is no new paid-seat charge until the owner sets pricing.

Outcome: **adopt with rider**. Approve explicit capability grants, current department/role revision, audited changes, inactive restored assignments and fresh confirmation after a definition change. Seat counting is ADOPTED as the seed proposed, per main's note of 27 Oct 14:55Z under the owner's 19 Oct rule: a member whose custom ticket role lets them work tickets counts as one agent seat; requesters and approvers need none. Rider: this sets Linen's in-product seat counting only and sets no RER price.

Why: Freshservice distinguishes administrative permissions from scoped agent operations. These permission rules are ordinary ct authority. Counting a ticket-working custom role as one agent seat follows Jira Service Management and ServiceNow licensing practice (main's ruling, 27 Oct 14:55Z); no RER price is set by it.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000008929-how-do-roles-and-permissions-work-in-single-and-multiple-workspace-setups-): Agent permissions are scoped to workspaces, groups or assigned items; admin settings have distinct administrative permissions.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000006096-enabling-advanced-role-management-in-freshservice-accounts): Freshservice separates agent operational roles from admin configuration roles, including custom role splits.

- [Source 3](https://support.atlassian.com/jira/kb/manage-access-jira-service-management-projects-requests/): Jira distinguishes licensed full agents from customers and limited internal collaborators who do not consume an agent license.

Comparison: Jira Service Management licenses ticket-working agents and not requesters or approvers; Linen's seat count mirrors that.

Main evidence: `CONTRACT.md:2178` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: ROLE-001 owns ordinary grant semantics once; record the pricing question here only.

Engineering/proof retained: No scope is reserved: the seat count is in-product only and RER pricing is untouched. Assignment/approval/custom-HR/workspace-admin capabilities remain engineering gaps. Keep all statuses unchanged.

### RL-108 — SANDBOX-004: Administrator approval and explicitly chosen masked-data copying

Date: 2026-10-28 · Ruled by: ct · Governs: SANDBOX-004

Question: May explicitly selected message, attachment-metadata and person rows use the approved fully masked sandbox boundary?

Adopted/proposed default: Current-owner exact selections; all values masked before storage, no bytes/source links and workspace-wide invalidation.

Outcome: **adopt with rider**. Extend the already approved ticket-structure masking rule to explicitly selected current message rows, attachment metadata and person rows: mask every value before persistence/exposure, keep no production identity mapping or attachment bytes, and retire all workspace copies on relevant source/scope/retention/erasure/restore changes.

Why: Freshservice sandboxes test and deploy configuration sets at workspace scope. No common norm is established by the reviewed sources for this blanket field-masking or invalidation scheme; it is the safest local extension because no retained source link can support targeted invalidation. It grants no production execution authority.

- [Source 1](https://support.freshservice.com/support/solutions/articles/50000009712): Freshservice previews, validates and syncs configuration sets between source and target workspaces.
- [Source 2](https://support.freshservice.com/support/solutions/articles/50000008929-how-do-roles-and-permissions-work-in-single-and-multiple-workspace-setups-): Agent permissions are scoped to workspaces, groups or assigned items; admin settings have distinct administrative permissions.

Main evidence: `CONTRACT.md:2566` at `19816529116ae290357a5bebafc35189a7dcc1e9`.

Placement: Extend the existing SANDBOX-004 masking point once; do not add a second copy of its 26 October rider.

Engineering/proof retained: Native selectors, attachment-content rehearsal, other record families and complete family restore/export evidence remain owed. The existing 26 October ticket/admin approval is not re-opened.
