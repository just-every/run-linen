# Adoption, connectors and owner operation

Proposed paths; no owner tenant, credentials, genuine export or supported provider
has been supplied or tested. [Acceptance](ACCEPTANCE.md) specifies the evidence
needed before any release claim.

## Connect beside an incumbent when it already owns the work

Default for an established IT team: Linen takes an execution lane for selected
outcomes while the incumbent remains in place. The owner signs in to each
supported account and grants its displayed scope. Count every sign-in and consent
as human setup time. Linen then discovers permitted records, approvals, current
automations and source identities, and prefills the ownership map below. The
owner reviews one concise set of material choices and corrects only facts the
sources cannot establish; no one builds the service graph or workflow by hand.

| Responsibility | Coexistence owner | Linen responsibility |
|---|---|---|
| Request/incident identity and employee correspondence | Existing ITSM | Store stable external IDs, scoped working context and correlated updates; avoid a competing inbox |
| Approval policy and decision | Existing ITSM plus its authenticated principals | Validate mapped scope, current revision, expiry and revocation at execution; read a comment saying “approved” only as content |
| Execution plan, attempts, verifier and evidence | Linen | Persist and reconcile effects; write back understandable evidence and remaining obligations |
| Identity, employment, device observation and technical state | IdP, HR, MDM and service providers respectively | Read attributable facts, maintain mappings and expose staleness/conflict |
| Effect ownership | One named executor per action/resource | Fence duplicated triggers across incumbent automations and Linen; suspend dispatch if ownership cannot be established |

Enable a selected effect only after evidence or an authorised owner decision
establishes current approval ownership and one executor. Use signed notifications
or scoped polling, version checkpoints, replay protection, loop markers and
remote writeback IDs. A lost approval feed, stale mapping or competing automation
blocks affected writes until ownership and authority are current; do not ask the
owner to approve routine work already covered by standing grants. Outages leave
evidence queued and visible, never a second executor. Incumbent closure may be
mirrored while Linen still reports an unverified outcome; reopening and late
employee replies reconcile in the same conversation.

Choose the first incumbent adapter from the actual owner, not the Freshservice
research name. Read-only import is not coexistence execution support. Prove
approval invalidation, incumbent automation disable/ownership transfer and return
of evidence against the configured system before enabling selected effects.

## Complete greenfield and replacement path

For a greenfield owner, Linen owns native requests, conversations, catalog,
commitments, approval records, execution, service context and reporting. The
underlying IdP/HR/MDM/service systems keep their source-of-truth roles. Discovery
prefills the available identities, service relationships, grants and outcome
checks; one review resolves actual business choices and missing authority. Native
setup produces a complete usable desk without requiring a graph or workflow
builder.

For replacement, begin with one real consenting-owner export/API snapshot.
Record export tool/time/scope and known omissions. Preserve source IDs and stable
identity mappings, public/private messages, attachment bytes and hashes,
service/asset relationships, custom fields, calendars/due dates, status transitions
and exportable approval history. Unknown mappings stay unresolved. Preserve
restricted read-only history when faithful operational conversion is impossible;
never silently flatten private history or translate an unknown state to resolved.
Imported approvals cannot mint current execution grants.

The dry run shows counts by source/type/status/privacy, identity collisions,
missing attachment bytes, hash failures, unresolved references and unsupported
fields/history. The owner reviews material semantic loss before cutover. Use a
resumable migration ledger and source checkpoints; replay cannot duplicate work,
resurrect erased data or emit notifications/actions. Compare totals and sample
sensitive/complex cases, not just successful row counts.

Cutover declares the intake boundary and exact executor ownership transfer.
Pause or fence incumbent automations before activating Linen effects; drain or
reconcile running operations. Capture late mail, webhook events and source edits
through a final delta checkpoint. Reconcile their identities and effects before
releasing new execution. Rollback after new work starts must account for Linen's
new messages, grants and provider changes; an old database restore alone is
insufficient. Maintain a usable source archive within retention/privacy policy.

## Capability and connector progression

The proposed Entra ID / Microsoft 365 / Intune reference stack comes from the
22 September research. It is a hypothesis, not the owner's stack and not a
provider commitment. If an actual owner uses Google/Okta/Jamf, choose the matching
scope before implementation. A connector's API existence is not tested support.
Each real provider authentication or consent remains a counted human touch and
active-time cost, even when the rest of setup is automated.

| Step | Capability to establish | Concrete proof required |
|---|---|---|
| Read and correlate | Identity/login, directory status, mail intake/reply, device facts, existing work/approval references | Stable IDs, scoped access, pagination, changed/deleted records, replay, rate limits, freshness and actual message delivery |
| First write | One temporary application entitlement and scheduled revocation | Exact authorised beneficiary, idempotency/reconciliation, provider readback, useful application access and subsequent denial |
| Complete desk | Supported lifecycle actions, custody, selected software/device fulfilment and native/coexistent change path | Dependencies, licence/stock exceptions, partial failure, real technician handoff where action is unsupported, no false autonomous completion |
| Service operations | Monitoring/logs, service dependencies, paging, deployment/change tooling and supplier incidents | Diagnostic scope, safe probes, change gates, overlapping writes, cohort recovery and communications |
| Adaptive breadth | Further SaaS/endpoint/cloud connectors, renewals/reclamation and preventive fixes | Tested engineering change, released action/verifier version, owner approval of new effects and actual adoption |

Each action adapter declares permissions, principal mapping, targets and limits,
preconditions, request/response schemas, idempotency/reconciliation mechanism,
rate limits, compensations, verifier and unsupported effects. Missing capabilities
enter the tested development lane or an accountable technician task; no pretend
provider success, generic shell escape or silent fallback. A paired local agent
may be one executor under explicit authority, but its presence alone establishes
neither endpoint management nor arbitrary remote remediation.

## Operating the owned product

Choose and document target resources, identity recovery, encryption/secret custody,
retention/residency, service hours, capacity and recovery-point/recovery-time
objectives with the real owner before production. Supply actual install, dev,
build, verify, setup, deploy, export and restore commands once implemented.
A selected maintained Base path should retain common operating/source-authoring
commands while declaring Linen's actual effects.

Source export includes retained origins, chosen modules, owner changes, migrations
and requirements. Data export includes records, private access metadata,
attachments, graph provenance, grants/decisions, evidence, unresolved operations,
knowledge, calendars and relevant cost history without credential secrets.
Restore reconstructs usable state with external execution initially held; reconcile
remote effects and refresh authority before resuming. Backups are not proof until
restore and resumed operation are observed.

Update on existing data and a customised owner fork. Preserve past applied
migrations; add transitions instead of rewriting history. The owner's agent
chooses merge/reapply/rewrite methods, verifies retained intent, and publishes
useful common fixes from their natural home. Count this ongoing work in economics.
No production migration, account cutover or remote publication is authorised by
the existence of this plan.
