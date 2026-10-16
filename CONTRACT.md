# Linen product contract

Target edition: 17 October 2026. Linen is a complete IT service desk for a US
company of 50–500 people replacing Freshservice, Jira Service Management or
ServiceNow ITSM, with the chat-first, act-for-you automation buyers now seek from
Serval, Console and Atomicwork. Employees ask for help in Slack, Microsoft Teams,
email, the portal or the mobile app; a service catalog with approval chains and SLA
timers routes the work; access, onboarding and offboarding are carried out through
the buyer's real identity, HR and device systems and read back; and the IT team
runs assets, incidents, problems and changes in the same product. Prices, budgets
and asset values are in USD; calendars default to US time zones, daylight saving
and US federal holidays; employment types distinguish W-2 employees from 1099
contractors.

This is the product Linen is building towards, not a description of what exists
today. The status table at the end marks each clause `done`, `partial` or
`missing` against current code and tests, so distance to the target can be seen.
A local test or fixture provider does not establish live-provider, hosted or owner
acceptance; [ACCEPTANCE.md](ACCEPTANCE.md) keeps those evidence labels separate.

Linen keeps the market's product separation. It integrates with, and does not
rebuild, its sibling products: Auth (workforce identity and SSO), Willow (HRIS),
Oncall (paging and responder schedules), Uptime (external monitoring), Lamp
(public status pages), Slate (team wiki), Nook (team chat), Vector (engineering
issues), Purse (procurement), Evidence (compliance automation) and Crank
(general workflow automation). Each is one connector among the named US
incumbents below.

Existing clause IDs are preserved: the E1–E7 employee floor, A1–A7 safeguards,
O1–O3 flagship operations and F1–F7 frontier extensions keep their meaning and are
given acceptance evidence here. The new `AREA-NNN` clauses spell out the complete
category job those clauses summarise. Difficulty (provider applications, native
apps, connector breadth) is recorded as engineering work in a clause, never as a
reason to narrow the product.

## Retained employee service floor

- **E1 — Help and incidents.** Authenticated portal, email, Slack and Teams intake
  with one stable conversation per issue, incident/request classification,
  accountable routing and reassignment, employee replies and private notes,
  attachments, impact, service/device context, response/resolution commitments and
  restoration evidence. Employees can correct, confirm when useful, report "still
  not working" or reopen; confirmation is not required when fresh independent
  evidence proves usable work. Duplicate messages, unknown senders, attachment
  failure, wrong classification, absent assignee, holidays/time zones, nonresponse
  and simultaneous edits are handled. Closure policy is disclosed; closure is
  distinct from verified recovery. **Acceptance evidence:** an employee opens a
  request in the portal and by email, an operator replies publicly and privately
  with an attachment, the employee reports "still not working" and reopens; the
  employee never sees the private note or attachment, a duplicate message creates
  no second ticket and closure is shown separately from verified recovery.

- **E2 — Access, device and software requests.** A natural-language request or
  catalog selection resolves beneficiary, purpose and prerequisites from permitted
  context, then shows exact authority, fulfilment owner, provision/delivery
  evidence and an understandable rejection or completion. Linen asks only for a
  genuinely missing fact or decision. Missing managers enter an accountable
  exception; substitutes need real delegated authority; material changes
  invalidate affected approval. Partial fulfilment, no stock/licence, cancellation
  after effects, failed/unknown provider actions, temporary access expiry and
  independently verified revocation are handled; routine reapproval or
  confirmation is not required when standing authority and machine evidence
  suffice. **Acceptance evidence:** request time-limited group access in plain
  language, supply the one missing fact, see absent authority denied, approve under
  a standing grant, read back the provider membership, reach expiry and observe
  independently verified removal; cancel a second request after its effect and see
  the remaining compensation duty.

- **E3 — Join, move and leave.** Authorised HR/manager initiation with effective
  times, task dependencies, accounts, access and devices; an authoritative HR
  event starts routine work without a separate request. Join prepares the
  authorised baseline and physical fulfilment; move compares retained, added and
  removed access; leave revokes access and keeps separate custody/return duties.
  Changed dates, cancelled hires, contractor expiry, urgent termination,
  already-disabled identity, partial revocation, unreturned laptop and ambiguous
  local times/daylight saving are handled. HR remains authoritative for
  employment facts; completed subtasks cannot conceal outstanding security or
  custody work. **Acceptance evidence:** run a join, a move and an urgent leave
  from HR facts; move a start date, cancel a hire after an account was created,
  submit a time in a DST gap, and see compensation duties, the rejected ambiguous
  time and an open laptop-return duty after identity revocation verifies.

- **E4 — Custody and context.** Stable device ID/serial, person, location,
  lifecycle, receipt/return and service ownership linked to work, with source and
  freshness. Conflicting serials, reassignment in progress, missing devices,
  disposed-but-assigned records, renamed/merged/deactivated people and stale MDM
  feeds are reconciled. Imported observation is distinct from verified custody.
  **Acceptance evidence:** record, assign, receive and return a laptop with
  attributed receipts; try to dispose of an assigned device, import a duplicate
  serial and age an MDM observation; see refusals, the conflict and stale state,
  and that physical return does not certify security completion.

- **E5 — Shared incidents and problems.** Accountable shared interruption, impact,
  linked employee incidents, update cadence, recurring cause/workaround and
  follow-up. Linen proposes correlations from permitted evidence and keeps each
  employee's work separate; people correct mistaken links. Parent recovery does
  not establish every employee's recovery. Confidential scopes, stale
  workarounds and failed notifications stay visible; restoration and
  cause/prevention outcomes are separate. **Acceptance evidence:** open an outage
  from a monitoring event, link three employee tickets, correct one mistaken link,
  restore the service while one employee is still broken; that employee's ticket
  stays open and a failed notification is shown with its reason.

- **E6 — Controlled changes.** Service, owner, risk/impact, dependencies,
  scheduled window, versioned authorisation, exact implementation, execution and
  rollback/compensation evidence, success/failure and follow-up. Standard
  low-risk changes use standing grants. Emergency authority, conflicts,
  post-approval edits, partial execution, failed rollback and post-change
  incidents are handled. A change record is not authority in a provider.
  **Acceptance evidence:** authorise a change, edit its implementation and see the
  approval invalidated, schedule a conflicting window, run canary then rollout,
  fail the rollback and see accountable takeover with the partial effect recorded.

- **E7 — Knowledge and management review.** Scoped reviewed articles with explicit
  expiry, search and escalation into a request with context. Reports cover age,
  response/resolution commitments, blocked approvals, lifecycle obligations,
  recurrence and outcomes with definitions, range and time zone. Paused clocks,
  changed schedules, reopened work, permission changes and failed refreshes stay
  explicit; closure counts never substitute for fulfilment. **Acceptance
  evidence:** search a reviewed article as an employee, escalate it into a request
  carrying the article revision, then read a management report for a date range in
  `America/Chicago` that separates closed from verified-fulfilled work.

## Employee channels

- **CHANNEL-001 — Slack as a primary employee channel.** A Linen Slack app
  (distributed through the Slack Marketplace, installable on Enterprise Grid)
  takes requests from a DM with the app, a message shortcut, an emoji reaction on
  any message and monitored help channels. Each request becomes one ticket whose
  public replies sync both ways in the Slack thread; private notes never post to
  Slack. Employees browse the catalog, fill item forms in modals, see status in
  the App Home, and approvers approve or reject with buttons that re-check
  current authority. Unknown Slack users, deactivated accounts, edited and
  deleted messages, files, and Slack outages are handled without duplicate
  tickets. **Acceptance evidence:** in a test Slack workspace, request access by
  DM, answer the follow-up in the thread, approve from a manager's DM, see the
  operator's public reply arrive and a private note not arrive; edit the original
  message and retry delivery after a simulated Slack 503 without a second ticket.

- **CHANNEL-002 — Microsoft Teams as a primary employee channel.** A Linen Teams
  app (Teams Store and admin-deployable package) gives the same behaviour as
  CHANNEL-001 through personal chat, message extensions and Adaptive Card forms
  and approvals, with Entra identity mapping and tenant consent. **Acceptance
  evidence:** in a Microsoft 365 developer tenant, submit a catalog request from a
  personal chat, approve it from an Adaptive Card, and see two-way thread sync and
  private-note exclusion as in CHANNEL-001.

- **CHANNEL-003 — Email mailboxes.** Support addresses on Google Workspace (Gmail)
  and Microsoft 365 (Exchange Online) are connected by OAuth or forwarding.
  Replies thread by message headers, CC'd people become watchers within policy,
  attachments are kept, auto-replies and loops are suppressed, and outbound mail
  goes from the buyer's domain with SPF/DKIM/DMARC alignment. Unknown senders are
  quarantined, not trusted. **Acceptance evidence:** connect a Gmail and an
  Exchange Online mailbox, send a request with an attachment and a CC, reply from
  a mail client and from Linen, and see one thread, the CC watcher, a suppressed
  out-of-office loop and a quarantined unknown sender.

- **CHANNEL-004 — Employee portal.** A branded portal shows a home page with
  search, the service catalog, "my requests" and "my approvals", knowledge
  articles, my devices and current service notices. It works signed in through
  the buyer's SSO, honours department scoping and is the fallback when chat is
  down. **Acceptance evidence:** as an employee, find an article, submit a catalog
  item, see its status and approval progress, see one's own assigned laptop, and
  be denied another department's private catalog item.

- **CHANNEL-005 — Mobile for employees, approvers and technicians.** The portal
  and operator console work at phone width; native iOS and Android apps give
  technicians queues, ticket replies, approvals, asset scan by barcode/QR and push
  notifications, and give employees requests and approvals. Push respects quiet
  hours and the user's notification preferences. **Acceptance evidence:** at
  390 px, submit and approve a request; on a TestFlight/Play internal build, take
  a push notification to an approval, approve it, and scan a laptop's asset tag to
  open its record.

- **CHANNEL-006 — Conversational help that acts.** In every channel Linen's
  assistant answers from permitted knowledge, asks for a genuinely missing fact,
  and performs catalog actions the employee is entitled to under current standing
  grants, showing what it will do before acting when the grant requires it. Model
  output never confers authority. **Acceptance evidence:** ask in Slack and in the
  portal "I need edit access to the Finance shared drive until Friday"; see the
  resolved catalog item, the clarifying question, the executed grant with
  readback, and a refusal when the employee is outside the grant's audience.

- **CHANNEL-007 — Phone and walk-up intake.** Calls to the IT line on the buyer's
  phone system (RingCentral, Dialpad, Zoom Phone, Aircall) create or update
  tickets with caller identity, recording link and transcript; a walk-up queue
  for an office IT bar checks people in by name or badge and records the visit.
  **Acceptance evidence:** place a call through a connected RingCentral sandbox
  and see a ticket with the caller matched and a transcript; check an employee
  into the walk-up queue and resolve the visit.

- **CHANNEL-008 — Service notices to employees.** During an incident or planned
  change, Linen posts audience-scoped notices to the portal banner, Slack/Teams
  channels and email, with update cadence and an all-clear, and suggests the
  notice when a new ticket matches an open incident. **Acceptance evidence:**
  declare an incident affecting the Sales cohort, see a banner and Slack post
  only for that cohort, file a new matching ticket and be offered the notice,
  then see the all-clear.

## Service catalog and approvals

- **CATALOG-001 — Catalog items with forms.** Admins build catalog items (access,
  software, hardware, accounts, general services) with field types, conditional
  logic, required attachments, audience visibility by department/location/
  employment type, a USD cost and an expected delivery time. Items are versioned;
  in-flight requests keep their version. **Acceptance evidence:** build a "New
  monitor" item with a conditional field and a $250 cost visible only to
  employees in two departments; submit it as an eligible and an ineligible
  employee; edit the item and see an in-flight request unchanged.

- **CATALOG-002 — Approval chains.** Per item: manager, application owner, cost
  centre or finance above a USD threshold, and named groups, in serial or
  parallel, any-of or all-of, with delegation, out-of-office substitution,
  reminders and an approval SLA. Approvals work in Slack, Teams, email, mobile
  and the portal and re-check authority and request revision at decision time.
  **Acceptance evidence:** a $1,800 laptop request needs manager then finance
  (over $1,000); the manager is out of office and a delegate approves; finance is
  reminded at 24 business hours; an edited request invalidates the earlier
  approval.

- **CATALOG-003 — Fulfilment task plans.** Each item expands into ordered and
  parallel tasks for teams, automated steps through connectors, and child tasks
  with dependencies and due dates; the request completes only when every
  obligation is verified or explicitly waived by its owner. **Acceptance
  evidence:** a software request creates an approval, an automated licence
  assignment and a manual configuration task; the automated step fails and the
  request stays open with the failure owned.

- **CATALOG-004 — Bundles and kits.** A bundle such as "New engineer" combines
  hardware, software and access items with shared approval and individual
  fulfilment. **Acceptance evidence:** request the bundle; see one approval, five
  child fulfilments, and the bundle complete only when all children verify.

## Agent workspace and ticket operations

- **DESK-001 — Queues, groups and views.** Agent groups, saved and shared views,
  filters, sorting, bulk update and keyboard navigation; each ticket has one
  accountable group and owner. **Acceptance evidence:** create two groups, save a
  "Unassigned P1" view, bulk-assign five tickets, and see a group lead's view
  exclude another group's restricted ticket.

- **DESK-002 — Classification and priority.** Ticket types (incident, service
  request, question), categories and subcategories, and an impact × urgency
  priority matrix; Linen proposes classification and priority with the reason,
  and agents can override. **Acceptance evidence:** submit "VPN down for whole
  Denver office"; see type incident, high impact, proposed P1 with the reason;
  override to P2 and see the override audited.

- **DESK-003 — Routing and assignment.** Rules route by category, requester,
  department, location and VIP status; assignment can be round-robin, by current
  load, by skill, or by business-hours availability, and reassignment keeps
  history. **Acceptance evidence:** with three agents (one off shift, one
  overloaded), round-robin and load-based rules assign to the available agent; a
  VIP request routes to the executive-support group.

- **DESK-004 — SLA policies.** Multiple SLA policies by priority, category and
  requester group with first-response, next-response and resolution targets on
  business or calendar hours, US federal holiday calendars by location, pause on
  "awaiting requester" or "awaiting vendor", and visible breach time.
  **Acceptance evidence:** a P2 opened at 4:30 pm Friday in `America/New_York`
  before a federal holiday Monday gets a due time on Tuesday; pausing for the
  requester extends it; a breach shows on the ticket and the report.

- **DESK-005 — Escalation and supervisor rules.** Multi-level escalation before
  and after an SLA breach (agent, group lead, IT manager), and time-based rules
  such as "awaiting requester for 3 business days → reminder → resolve with
  disclosure after 5". Every reminder is persisted with its next due time and
  stops when the obligation is satisfied. **Acceptance evidence:** let a P1 near
  its response target and see level-1 then level-2 escalation; leave a ticket
  awaiting the requester and see the reminder, then the disclosed resolution;
  a reply before the due time stops both.

- **DESK-006 — Ticket relationships.** Merge duplicates (keeping both
  requesters informed), split, parent/child, and links to problems, changes,
  assets and engineering issues. **Acceptance evidence:** merge two duplicate
  printer tickets and see both requesters notified on the surviving ticket; link
  a ticket to a laptop and a problem and see it on each record.

- **DESK-007 — Collaboration.** Private notes, @mentions, watchers, and side
  conversations by email or Slack with vendors and other teams that stay off the
  employee's view. **Acceptance evidence:** mention a colleague in a private
  note, open a side conversation with a vendor by email, and confirm the
  employee sees neither while the mentioned colleague is notified.

- **DESK-008 — Responses and summaries.** Canned responses with placeholders,
  and assistant-drafted replies and ticket summaries that cite knowledge and
  ticket history; drafts are sent only by an agent unless a standing grant covers
  the reply. **Acceptance evidence:** insert a canned response with the
  requester's name; generate a summary of a 20-message ticket with citations; a
  drafted reply is not sent until the agent sends it.

- **DESK-009 — Satisfaction surveys.** A one-question CSAT survey after
  resolution in the channel the employee used, with optional comment, response
  rates and results by group and agent. **Acceptance evidence:** resolve a Slack
  ticket, answer the survey in Slack with a comment, and see it in the CSAT
  report with the response-rate denominator.

- **DESK-010 — Custom fields, forms and statuses.** Admins add custom ticket
  fields, forms per ticket type and custom statuses mapped to SLA behaviour.
  **Acceptance evidence:** add an "Office" dropdown and an "Awaiting parts"
  status that pauses SLA; use both and see the SLA pause.

- **DESK-011 — Department workspaces.** IT, HR service, Facilities, Finance and
  Legal run separate workspaces with their own catalog, queues, SLAs, knowledge
  and permissions, one employee portal across them, and handoff between
  workspaces that keeps history and restrictions. HR-service tickets remain
  service requests; Willow or the buyer's HRIS remains the employee record.
  **Acceptance evidence:** an IT agent cannot read an HR-workspace ticket; a
  Facilities request handed to IT keeps its history; the employee portal shows
  both catalogs.

- **DESK-012 — Time tracking and effort.** Agents log time on tickets and tasks,
  automatically measured active minutes are recorded, and both feed the human
  work measure in REPORT-004. **Acceptance evidence:** log 15 minutes manually,
  work a ticket for a measured interval, and see both in the effort report.

- **DESK-013 — Scheduled and recurring work.** Recurring tickets and task plans
  (monthly patch review, quarterly access review kick-off, annual hardware
  refresh) are created on a calendar with owners. **Acceptance evidence:** create
  a monthly recurring task on the first business day; skip a holiday and see the
  next business day used.

- **DESK-014 — Remote support handoff.** From a ticket, an agent starts a remote
  session through the buyer's BeyondTrust Remote Support, TeamViewer or
  Splashtop under the employee's consent; session start/end and recording link
  are attached. **Acceptance evidence:** launch a BeyondTrust sandbox session
  from a ticket and see consent, timestamps and the recording link on it.

## Identity and SaaS access

- **ACCESS-001 — Microsoft Entra ID.** Create users, add/remove group
  memberships and licences, disable accounts and revoke sign-in sessions under
  versioned grants, with independent readback of each effect. **Acceptance
  evidence:** in an Entra test tenant, create a user, add a group and an E3
  licence, then disable and revoke sessions; Graph readback confirms each; a
  stale grant is refused at the effect.

- **ACCESS-002 — Okta.** Users, groups, application assignments, lifecycle
  (activate, suspend, deactivate), session clear and factor reset through the
  Okta API, with readback. **Acceptance evidence:** in an Okta developer org,
  assign an app through a group, suspend the user, clear sessions and read back
  each state.

- **ACCESS-003 — Google Workspace.** Users, groups, organisational units,
  licences, suspend, sign-out, 2SV reset and Drive data transfer through the
  Admin SDK, with readback. **Acceptance evidence:** in a Google Workspace test
  domain, add a user to a group, move OU, suspend and transfer Drive ownership to
  the manager; readback confirms each.

- **ACCESS-004 — Auth.** The same lifecycle and group operations against Auth,
  Run Edit Run's workforce identity product, through its public API. **Acceptance
  evidence:** against a local Auth instance, add and remove a group and
  deactivate a user, with readback.

- **ACCESS-005 — SaaS application provisioning.** Direct connectors for GitHub
  (org membership, teams), Slack (workspace users, user groups, channels),
  Salesforce (users, profiles, permission sets), Atlassian Cloud, Zoom and AWS IAM
  Identity Center, plus provisioning through IdP app assignment where the app is
  SCIM-managed. Each action reads back its effect. **Acceptance evidence:** grant
  and revoke a GitHub team, a Salesforce permission set and a Slack user group in
  sandboxes and read back each; a SCIM-managed app is provisioned via its Okta
  assignment.

- **ACCESS-006 — Just-in-time and time-bound access.** Access granted for a stated
  period is removed at expiry by a separately authorised operation and verified
  removed; pre-existing access is not removed. **Acceptance evidence:** grant a
  group for two hours, let it expire, read back removal; repeat for a user who
  already had the group and see it kept.

- **ACCESS-007 — Self-service account recovery.** Password reset, MFA/factor
  reset and account unlock from Slack, Teams or the portal through the IdP, after
  identity verification (manager attestation, existing factor, or an identity
  verification partner such as Persona). Secrets never appear in chat or logs.
  **Acceptance evidence:** a locked-out employee unlocks through manager
  attestation; a factor reset requires an existing factor; no temporary password
  appears in the transcript or logs.

- **ACCESS-008 — Application catalog and owners.** A registry of SaaS
  applications with owner, approvers, roles/entitlements, cost per seat in USD,
  connector and data sensitivity; catalog items reference these entitlements.
  **Acceptance evidence:** register Salesforce with two permission sets and an
  owner; a request for the admin set routes to the owner and shows the seat
  cost.

- **ACCESS-009 — User access reviews.** Scheduled reviews ask managers or app
  owners to certify each person's entitlements; revocations from the review run
  through connectors with readback, and the signed review record exports as
  SOC 2 / ISO 27001 evidence and to Evidence. **Acceptance evidence:** run a
  quarterly GitHub review, revoke one member from the review, see the readback
  and export the completed review with timestamps and reviewers.

## Joiners, movers and leavers

- **LIFE-001 — HRIS-triggered lifecycle.** Rippling, Gusto, BambooHR, Workday and
  Willow connectors read new hires, start-date changes, department/title/manager
  changes and terminations (webhook where offered, polling otherwise) and start
  E3 work; the HRIS stays authoritative and Linen never writes employment facts.
  **Acceptance evidence:** in a BambooHR sandbox, add a hire, move their start
  date and terminate another employee; Linen creates, re-dates and starts leave
  plans; repeat one path for Rippling and Gusto.

- **LIFE-002 — Dated task plans across teams.** Templates by department,
  location, role and employment type (W-2 employee, 1099 contractor, intern)
  create tasks for IT, HR, the manager and Facilities with due dates relative to
  start or end date and reminders through each owner's channel. **Acceptance
  evidence:** a hire in Sales in Austin starting Monday gets the Sales/Austin
  template; the manager's "buddy assigned" task is reminded in Slack two
  business days before start; a 1099 template omits benefits tasks.

- **LIFE-003 — Birthright access baselines.** Access policies map department,
  title, location and employment type to groups, apps and licences; a join grants
  the baseline and a move computes retained, added and removed access for review
  or standing approval. **Acceptance evidence:** move an employee from Sales to
  Marketing; see Salesforce removed, HubSpot added and Slack retained, executed
  under standing authority with readback.

- **LIFE-004 — Joiner device readiness.** A device is allocated from stock or
  ordered, enrolled zero-touch (Apple Business Manager with Jamf or Kandji;
  Windows Autopilot with Intune), shipped to a US remote address with carrier
  tracking through the buyer's logistics partner (e.g. Firstbase, GroWrk) and
  confirmed received before day one. **Acceptance evidence:** a remote hire's
  plan allocates a MacBook, records ABM assignment, a tracking number and
  delivered state, and flags at T-2 days if delivery is late.

- **LIFE-005 — Leaver revocation everywhere.** At the termination instant in the
  employee's time zone (or immediately for urgent termination) Linen disables the
  IdP account, revokes sessions and OAuth tokens, removes SaaS access, transfers
  Drive/OneDrive ownership, converts or delegates the mailbox to the manager,
  locks or wipes devices under grant, reclaims licences and opens a return kit
  shipment; a residual report lists anything not verified. **Acceptance
  evidence:** terminate a test user with Okta, Google Workspace, GitHub and a Jamf
  laptop; every revocation reads back; one SaaS failure stays on the residual
  report and blocks "complete".

- **LIFE-006 — Contractors and temporary staff.** Contractor and temp accounts
  carry an end date and sponsor; access expires automatically unless the sponsor
  re-attests before the end date. **Acceptance evidence:** a contractor with an end
  date in three days triggers a sponsor reminder; without re-attestation access is
  removed and verified at the end instant.

- **LIFE-007 — Lifecycle evidence pack.** For each join, move and leave, an
  exportable record shows what was granted or revoked, when, by which authority,
  and how it was verified, for audit, legal hold and SOC 2. **Acceptance
  evidence:** export a leaver pack and see every effect with timestamp, grant and
  verification, and outstanding duties.

## Assets, devices and licences

- **ASSET-001 — MDM sync.** Jamf Pro, Microsoft Intune and Kandji connectors sync
  devices (serial, model, OS, encryption, compliance, last check-in, assigned
  user) on a schedule with freshness, matching to Linen assets by serial.
  **Acceptance evidence:** sync a Jamf and an Intune sandbox; see devices matched
  by serial, a stale device marked stale, and a serial conflict surfaced.

- **ASSET-002 — Device actions under grant.** Lock, wipe, restart, rename, push or
  remove an app, and retire through the MDM, each with a grant, a confirmation
  for destructive actions and readback of the command result. **Acceptance
  evidence:** lock a test Mac in Jamf through a leaver plan; the lock command's
  completion reads back; a wipe without its grant is refused.

- **ASSET-003 — Discovery and reconciliation.** Assets are discovered from MDM,
  IdP device lists, EDR (CrowdStrike Falcon, SentinelOne), Google endpoint
  management, cloud accounts (AWS, Azure, Google Cloud) and an optional
  buyer-hosted network discovery runner; duplicates reconcile by serial and
  hardware IDs, and unknown devices are flagged for review. **Acceptance
  evidence:** discover the same laptop from Intune and CrowdStrike and see one
  asset; an unmanaged device seen only by EDR is flagged.

- **ASSET-004 — Hardware lifecycle and custody.** Procure, receive, assign, loan,
  repair, return, retire and dispose with serial-level history, attributed
  receipts and, for disposal, the ITAD partner's certificate (R2v3 or e-Stewards).
  **Acceptance evidence:** run a laptop through assign, repair, return and
  dispose; disposal requires the certificate and is refused while assigned.

- **ASSET-005 — Stock rooms and reorder.** Stock locations hold counted devices
  and accessories with reorder thresholds; reaching a threshold raises a purchase
  request to Purse or the buyer's vendor (CDW, Apple Business, Dell).
  **Acceptance evidence:** allocate the last two spare monitors in Denver; the
  threshold raises a purchase request with quantity and USD estimate.

- **ASSET-006 — Software licence management.** Licences, seats, contracts and
  true-ups with renewal reminders at 90, 60 and 30 days in USD; usage from IdP
  sign-in data and SaaS admin APIs; unused seats are proposed for reclamation and
  reclaimed under the owner's grant with readback. **Acceptance evidence:** a Zoom
  contract with 120 seats and 95 active users shows 25 reclaimable; reclaim 10
  with the owner's approval and read back seat counts; the renewal reminder fires
  at 90 days.

- **ASSET-007 — Contracts, warranties and vendors.** Purchase records, leases,
  warranties (with manufacturer warranty lookup where available) and support
  contracts link to assets and vendors with expiry alerts. **Acceptance
  evidence:** attach an AppleCare warranty to a MacBook and see a repair ticket
  show coverage and the expiry alert.

- **ASSET-008 — Asset financials.** Purchase cost, depreciation (straight-line or
  declining balance), book value, cost centre and fiscal-year reporting in USD,
  exportable to Pantry, QuickBooks Online or NetSuite as CSV or API.
  **Acceptance evidence:** a $2,400 laptop over 36 months straight-line shows
  book value at month 12; export the fiscal-year schedule as CSV.

- **ASSET-009 — CMDB and service dependencies.** Configuration items for
  hardware, software, SaaS apps, business services and cloud resources with
  typed relationships, provenance and freshness; incidents and changes show
  upstream/downstream impact. **Acceptance evidence:** relate "Payroll" to Gusto
  and to the SSO service; a change to SSO shows Payroll as impacted; a stale
  relationship is marked stale.

- **ASSET-010 — Physical audits.** Asset audits by location using the mobile app
  to scan tags, with expected-vs-found reconciliation and missing-device follow
  up. **Acceptance evidence:** audit the Denver stock room; scan 18 of 20
  expected devices; two missing devices open follow-up tasks.

## Incidents and problems

- **INC-001 — Major incidents.** Declare a major incident, assign an incident
  commander, open a Slack or Teams war room, page responders through Oncall,
  PagerDuty or Opsgenie, and keep a timeline and update cadence. **Acceptance
  evidence:** declare a P1 for SSO; a Slack channel opens, Oncall is paged, the
  commander is recorded, and a missed update cadence prompts the commander.

- **INC-002 — Monitoring and alert intake.** Signed events from Uptime, Datadog,
  PagerDuty, Spool and a generic signed webhook open or update incidents with
  deduplication and freshness; missing data stays unknown. **Acceptance
  evidence:** send a Datadog alert twice and an Uptime recovery; see one incident,
  the duplicate ignored, and recovery recorded without closing employee tickets.

- **INC-003 — Status communication.** Internal notices per CHANNEL-008 and public
  status through Lamp or Atlassian Statuspage via their APIs, with publication
  controlled in those products. **Acceptance evidence:** post an incident update
  to a Lamp test page and see the delivered state, or the failure, on the
  incident.

- **INC-004 — Engineering escalation.** Create or link issues in Jira, GitHub
  Issues, Linear or Vector from a ticket or incident, with two-way status and
  comments flowing to private notes. **Acceptance evidence:** escalate a bug to
  GitHub Issues; closing the issue posts a private note and moves the ticket to
  "verify with employee".

- **PROB-001 — Problem management.** Problem records link incidents, carry root
  cause analysis, a known-error database and workarounds published to knowledge
  with expiry, and track the preventive change. **Acceptance evidence:** create a
  problem from three incidents, record the known error and a workaround article,
  link the preventive change, and see a later matching ticket offered the
  workaround.

- **PROB-002 — Proactive problem detection.** Linen clusters recurring tickets
  and alerts by service, device model or app and proposes problem records with
  the evidence; a human accepts or rejects. **Acceptance evidence:** seed eight
  Wi-Fi tickets from one floor; a proposed problem lists them; rejection is kept
  and does not re-propose the same cluster.

## Change management

- **CHANGE-001 — Change types and templates.** Standard (pre-approved, catalog-
  driven), normal and emergency changes, with templates carrying implementation,
  test and backout plans. **Acceptance evidence:** raise a standard change from
  the catalog and see it skip CAB; raise an emergency change and see the ECAB
  path.

- **CHANGE-002 — Risk scoring.** Risk is scored from a questionnaire, impacted
  CIs, schedule and the history of failed changes on those CIs; the score selects
  the approval path. **Acceptance evidence:** a change touching SSO with a prior
  failed change scores high and requires CAB; the same change on a test CI scores
  low.

- **CHANGE-003 — Change advisory board.** CAB membership, scheduled meetings
  with an agenda of pending changes, votes and quorum, approval from Slack,
  Teams, email or the portal, emergency CAB, and minutes on each change.
  **Acceptance evidence:** schedule a CAB, see two changes on the agenda, collect
  votes in Teams reaching quorum, and see minutes on each change.

- **CHANGE-004 — Change calendar and freeze windows.** A calendar of scheduled
  changes, maintenance windows and blackout/freeze periods, with conflict
  detection and an ICS feed. **Acceptance evidence:** a change scheduled into a
  year-end freeze is refused without emergency authority; two changes on the
  same CI in overlapping windows conflict.

- **CHANGE-005 — Rollback and post-implementation review.** Backout runs under
  its own grant with readback; incidents within a window after a change are
  linked automatically; Uptime and monitoring evidence confirm health; a
  post-implementation review closes the change. **Acceptance evidence:** a
  failed change triggers backout, an incident opened 30 minutes later is linked,
  and the PIR records the cause.

- **CHANGE-006 — Development-tool context.** Changes link to GitHub pull requests
  and deployments, GitHub Actions runs, and Jira or Vector issues; a deployment
  can raise a standard change automatically. **Acceptance evidence:** a GitHub
  deployment to production creates a standard change linked to its PR and run.

## Knowledge

- **KB-001 — Knowledge base.** Articles with authoring, review, versions,
  audience scoping, expiry and escalation to a request (E7). **Acceptance
  evidence:** as in E7, plus an expired article disappears from employee search.

- **KB-002 — Federated knowledge sources.** Permission-aware search and
  answering over Confluence, Slate, Google Drive, SharePoint and Notion, without
  exposing content the employee cannot open in the source. **Acceptance
  evidence:** connect Confluence and Google Drive; an employee's answer cites a
  page they can open and omits one they cannot.

- **KB-003 — Deflection with verified outcome.** The portal, Slack and Teams
  suggest articles and actions before a ticket is filed; deflection is counted
  only when the employee confirms or later evidence shows the issue resolved.
  **Acceptance evidence:** a "how do I connect to VPN" question is answered with
  an article; the employee confirms; a second employee who files a ticket anyway
  is not counted as deflected.

- **KB-004 — Articles from resolved work.** Linen drafts articles from resolved
  tickets and known errors with source links; a reviewer publishes or rejects.
  **Acceptance evidence:** resolve three similar tickets; a draft article appears
  with the three sources; publishing requires a reviewer.

## Reporting

- **REPORT-001 — Service desk dashboards.** Volume, backlog, SLA attainment,
  first-response and resolution time, reopen rate, first-contact resolution,
  CSAT, approval wait and lifecycle completion by group, agent, category and
  channel, with definitions, range and time zone. **Acceptance evidence:** read
  the dashboard for last month in `America/Los_Angeles`; each tile states its
  definition and denominator and matches the underlying tickets.

- **REPORT-002 — Custom and scheduled reports.** A report builder over tickets,
  assets, changes and lifecycle, saved and shared, scheduled by email or Slack,
  and exportable as CSV and XLSX. **Acceptance evidence:** build "P1 by
  location", schedule it weekly to Slack, and export CSV that matches the view.

- **REPORT-003 — Data access for BI.** A read API and scheduled exports for Power
  BI, Looker Studio and warehouses, honouring the reader's scope. **Acceptance
  evidence:** pull tickets through the read API as an auditor and see restricted
  HR tickets excluded.

- **REPORT-004 — Human work saved.** Per request type, touches and active minutes
  of employees, agents, approvers and vendors before and after automation, with
  model, provider and labour cost in USD per verified outcome, reported beside
  unresolved and failed work rather than tickets closed. **Acceptance evidence:**
  automate a request type; the report shows prior and current touches/minutes,
  cost per verified outcome and the failures in the same period.

## Platform, administration and integration

- **ROLE-001 — Roles and permissions.** Requester, agent, group lead, approver,
  workspace admin, HR, owner, auditor and integration roles, with custom roles
  scoped per department workspace; approvers and requesters need no agent seat.
  **Acceptance evidence:** a custom "Facilities agent" role reads Facilities
  tickets only; an approver approves without agent access.

- **SSO-001 — Sign-in, SSO and SCIM.** Base email sign-in, SAML 2.0 and OIDC SSO
  with Okta, Entra, Google and Auth, SCIM provisioning of requesters and agents,
  and MFA enforcement; SSO never grants roles by itself. **Acceptance evidence:**
  sign in through Okta SAML; a SCIM-deprovisioned user loses access; an SSO user
  without membership is refused.

- **AUDIT-001 — Audit log.** Privileged reads, exports, configuration, grant,
  role and executor actions are recorded durably with actor and time, readable by
  auditors and exportable; erasure anonymises without breaking the record.
  **Acceptance evidence:** change a grant and export data; the auditor reads both
  entries; erase the actor's personal data and the entries remain anonymised.

- **API-001 — REST API and webhooks.** A versioned REST API with scoped tokens for
  automation principals and outbound signed webhooks for ticket, approval, asset
  and change events, with retries and delivery logs. **Acceptance evidence:**
  create a ticket through the API with a scoped token; a subscribed webhook
  receives the signed event; a failing endpoint is retried and logged.

- **API-002 — No-code workflow automator.** Triggers (ticket created/updated,
  time, approval, HR event, alert), conditions and actions (assign, notify, set
  fields, call a connector under grant, start a task plan), versioned with a
  test mode; Crank, Zapier, Make and Workato can trigger and act through the API.
  **Acceptance evidence:** build "if category is Hardware and VIP, assign to
  Exec Support and notify in Slack", test it on a sample, publish version 2 and
  see version 1 tickets unaffected.

- **API-003 — Agent access by MCP.** A Model Context Protocol server lets the
  buyer's own agents (Claude, ChatGPT, Copilot) read tickets and act within the
  same scoped principal and grants as any integration. **Acceptance evidence:**
  connect an MCP client as an automation principal; it lists its permitted queue
  and is refused an out-of-grant action.

- **PORT-001 — Portable native archive.** Owner export of every record,
  attachment and policy as a verified archive, and restore under an execution
  hold that never re-dispatches effects or reactivates grants (A6). **Acceptance
  evidence:** export, restore into a fresh workspace, compare counts and hashes,
  and see the execution hold and inert grants.

- **ERASURE-001 — Authorised erasure.** Owner/HR erasure removes a person's
  content and attachments while keeping anonymised work, effect and audit
  identities, and replay or restore never brings the content back (A1).
  **Acceptance evidence:** erase a person, restore an older archive, and see the
  content still absent.

- **RETENTION-001 — Retention policies.** Configurable retention for archives,
  closed tickets and attachments, with no hidden default; due deletion is durable
  and reported. **Acceptance evidence:** set ticket retention to 365 days; a
  ticket closed 400 days ago and its attachment are deleted with a receipt.

- **BASE-001 — Base platform replacements.** Linen uses Base's lobby, owner
  claim, operator sign-in, mail and dependency modules rather than private
  copies, keeping its account and data continuity. **Acceptance evidence:** the
  Base sign-in and mail-edge checks pass against Linen's Worker, and an upgrade
  keeps existing accounts.

- **COST-001 — US pricing and budgets.** Plans are priced in USD per agent seat
  with requesters and approvers free; model and provider spend has an owner budget
  in USD with unknown charges reserved; invoices carry US sales tax where
  applicable. **Acceptance evidence:** set a $50 monthly model budget, exhaust it,
  and see discretionary research held while routine work continues; an invoice
  preview shows seats and sales tax for a Texas address.

- **A11Y-001 — Accessibility.** Portal, console and apps meet WCAG 2.2 AA,
  supporting Section 508 buyers, with keyboard paths and screen-reader labels.
  **Acceptance evidence:** automated and manual audits of six core journeys at
  1440 and 390 px with keyboard only and VoiceOver; no AA failures.

## Migration and coexistence

- **MIGRATE-001 — Freshservice migration.** Through the Freshservice API, move
  tickets of every type (incidents, service requests, problems, changes),
  public and private conversations, attachments, requesters, agents, groups and
  departments, assets with relationships and software, catalog items with
  approval history (as history), knowledge solutions, SLA policies and business
  hours, canned responses, and workflows as reviewed drafts, with dry run, counts
  and resumable apply at full account size. **Acceptance evidence:** migrate a
  Freshservice trial with 5,000 tickets, 300 assets and 40 catalog items; the
  dry run reports counts and gaps, apply resumes after interruption, and
  attachments and private notes match by hash and visibility.

- **MIGRATE-002 — Jira Service Management migration.** Move issues by request
  type, internal and public comments, attachments, customers and organisations,
  request types and portal groups, SLA definitions, Assets object schemas and
  linked Confluence knowledge spaces. **Acceptance evidence:** migrate a JSM
  Cloud test site; internal comments stay private, request types become catalog
  items, and an Assets schema becomes CI types with relationships.

- **MIGRATE-003 — ServiceNow migration.** Move incident, sc_req_item, problem,
  change_request, cmdb_ci (with relationships), kb_knowledge and sys_user
  records via the Table API. **Acceptance evidence:** migrate a ServiceNow
  personal developer instance; counts match and work notes stay private.

- **MIGRATE-004 — Spreadsheet and lightweight-tool move-in.** CSV imports for
  tickets, people and assets, and importers for Zendesk (when used for IT) and
  Snipe-IT asset inventories. **Acceptance evidence:** import a Snipe-IT export
  of 500 assets; serial conflicts are reported in the dry run and resolved
  before apply.

- **MIGRATE-005 — Coexistence and cutover.** Run alongside the incumbent with
  ticket-level ownership, late-arrival reconciliation, one executor per resource
  and a fenced cutover (A6). **Acceptance evidence:** poll a Freshservice source
  during coexistence, claim ownership of one ticket, cut over, and see a late
  arrival move to reconciliation rather than being lost.

## Authority, evidence and operation (retained safeguards)

- **A1 — Identity and privacy.** Authenticate scoped principals at every private
  boundary. Separate requester/beneficiary, approver, HR, service operator, owner,
  auditor and integration rights. Enforce current scope on records, attachments,
  search, notifications, exports and AI context. Protect restricted departures and
  incidents; minimise HR data; support retention and authorised erasure without
  restoring erased content on replay. Audit privileged read/export and policy
  changes. **Acceptance evidence:** an employee is denied a private note,
  attachment and HR record across every read surface; revoked membership and
  erasure prevent later access and replay.

- **A2 — Granted action.** Versioned grants bind action, target, beneficiary,
  conditions, limits and time. Standing low-risk authority avoids repeated human
  approvals; wider-impact action needs appropriate authority. At-action checks
  reject stale, expired, revoked or concurrently superseded decisions. Retrieved
  text and model output never confer authority. Source/policy editing cannot
  silently let the executor expand its own privileges. **Acceptance evidence:**
  dispatch under a standing grant, then revoke and expire grants between plan and
  effect and see refusals; hostile retrieved text cannot cause an effect.

- **A3 — Durable effects.** Persist intent and operation identity before
  dispatch; fence competing execution and human takeover. Reconcile unknown
  remote effects before repeat. Resume after crash without duplicating confirmed
  effects. Record partial completion, failed compensation and remaining
  obligations. A revocation or cancellation request is not proof that a remote
  action stopped. **Acceptance evidence:** crash before and after a provider
  write, restart, and see reconciliation instead of a duplicate; cancel after
  effect and see compensation owed.

- **A4 — Verifiable outcomes.** Bind each claim to fresh attributed evidence,
  target/cohort and verifier version. Distinguish submission, effect and usable
  recovery. Retain unknown/disputed results and negative checks; no false success
  from sent instructions, tool status, nonresponse or a model's self-assessment.
  **Acceptance evidence:** provider readback alone leaves a request at
  "effect verified"; only the independent verifier's positive and negative
  workflow probes mark it usable.

- **A5 — Legible service.** Employees see truthful status and next action in their
  conversation; operators see accountable exceptions in their work context and can
  take over. Linen owns permitted routing, safe follow-up and escalation; routine
  acknowledgement is not a gate to machine-verifiable completion. Accessible
  desktop/mobile paths, private/public separation, real delivery states,
  calendars/escalation and an audited outage recovery-access procedure.
  **Acceptance evidence:** the six UX.md journeys at 1440/390 px with keyboard
  only; a failed delivery shows its real state; an IdP outage uses the audited
  recovery-access path.

- **A6 — Data and source custody.** Imports preserve identities, relationships,
  public/private history, attachments and meaningful status/approval history;
  imported approval is history, not new authority. Reconcile dry run and actual
  cutover, late arrivals and dual execution. Usable export/restore preserves
  policy, evidence and intent. Updates preserve applied migration history and
  test existing data and owner adaptations. Source may diverge deeply without
  losing eligibility for useful upstream improvements. **Acceptance evidence:**
  upgrade an archived database and retain every prior row and migration entry;
  import with an approval that stays inert.

- **A7 — Honest operating and cost boundaries.** Declare supported commands,
  runtime, resources, provider effects and recovery targets. Record every
  model/tool attempt, failures and uncertain charges, budgets, latency and all
  human work, counting touches and active minutes for sign-ins/consents, setup
  gaps, corrections, physical custody, vendor/technician tasks, takeover and
  recovery; report unresolved and missed work beside any lower-interruption
  result. Fixture, real provider, hosted and owner evidence stay distinct.
  Missing configuration cannot produce mock data or successful fallback
  execution. **Acceptance evidence:** exhaust a budget with unresolved
  obligations, record an unknown charge and restart; missing configuration
  returns `needs_configuration`, never data.

## Flagship service operations (retained)

- **O1 — Service graph and major incidents.** Relate business impact, services,
  technical dependencies, people and suppliers with provenance, freshness and
  uncertainty. Coordinate incident command, parallel scoped diagnostics,
  escalation, audience-specific updates and recovery checks across affected
  cohorts. Integrate real monitoring/on-call systems under declared authority; do
  not infer health or dependencies from missing data. **Acceptance evidence:** a
  multi-user SSO outage with competing hypotheses, parallel diagnostics,
  cohort-specific updates and per-cohort recovery checks against real monitoring.

- **O2 — Change, release and prevention.** Coordinate change windows,
  dependencies, deployment gates, canaries and compensations with real provider
  evidence. Connect known errors, recurrence and post-incident learning to owned
  preventive changes. Measure sustained recovery and effectiveness; a drafted
  postmortem or prevention suggestion is not a completed improvement.
  **Acceptance evidence:** a preventive change released by canary on a real
  provider, with recurrence measured over a declared window afterwards.

- **O3 — Lifecycle and economics.** Extend custody through acquisition,
  assignment, renewal, repair, return and disposal; manage software entitlements
  and reclamation with service impact and authority. Track supplier commitments,
  handoffs and breaches. Show attributed service costs, demand and avoided-work
  hypotheses with uncertainty. Owners' agents can add integrations and deeply
  adapt source through the tested change lane, keeping authority and verification
  guarantees. **Acceptance evidence:** a full asset and licence lifecycle with a
  supplier breach and a measured reclamation, plus a connector authored through
  the change lane and kept through an update.

## Push further with agents

Every agent below acts only through scoped principals and versioned grants (A2),
records every attempt and charge (A7), and claims success only from independent
evidence (A4). Humans can see, take over, correct or stop any run.

- **AGENT-001 — Resolve routine requests end to end.** For access, software,
  licence and account requests, the agent resolves the right entitlement from
  the plain-language need, checks policy and standing authority, performs the
  effect through connectors, and confirms the employee can use it; it involves a
  human only for a genuinely missing fact or decision. *Data:* catalog, app
  registry, IdP/SaaS state, grants. *Human control:* standing grants define what
  runs unattended; anything outside them becomes an approval with the exact
  effect shown. **Acceptance evidence:** 20 mixed routine requests in sandboxes;
  report verified outcomes, touches and false completions; one out-of-policy
  request becomes an approval.

- **AGENT-002 — Revoke the leaver everywhere.** The agent enumerates every place a
  leaver has access (IdP, SaaS apps including unmanaged ones seen in sign-in logs
  or OAuth grants, devices, shared-account ownership, calendar and file
  ownership), revokes or transfers under grant, and proves each with readback,
  leaving a residual list a human must close. *Data:* IdP logs, SaaS admin APIs,
  MDM, Drive/OneDrive. *Human control:* IT approves the plan for urgent
  terminations; destructive device actions need their own grant. **Acceptance
  evidence:** a leaver with one unmanaged OAuth app discovered from Google token
  logs; the agent revokes it and the residual list is empty only after readback.

- **AGENT-003 — Verify the employee can work again.** Before resolving, the agent
  checks real signals (successful sign-in after reset, device compliance,
  application probe as a test principal, mailbox delivery) and asks the employee
  only when no machine signal exists; it reopens when evidence later shows the
  issue persists. *Human control:* the verifier is configured per request type;
  the employee can always report "still not working". **Acceptance evidence:** a
  password reset is resolved only after the IdP shows a successful sign-in; a
  printer fix with no signal asks the employee; a later failed sign-in reopens.

- **AGENT-004 — Investigate multi-system failures.** For failures spanning
  identity, devices, network and SaaS, the agent forms competing hypotheses from
  IdP logs, MDM state, monitoring, recent changes and tickets, runs parallel
  read-only probes within budget, and keeps rejected hypotheses. *Human
  control:* probes are read-only unless a grant allows more; budgets in USD cap
  the run. **Acceptance evidence:** a held-out SSO failure caused by an expired
  SAML certificate; the agent finds it, cites the evidence, and records the
  rejected network hypothesis (F3).

- **AGENT-005 — Build a missing connector.** When a needed system has no
  connector, the agent writes one from the provider's public API documentation in
  the engineering lane, tests it against a sandbox, and submits it for the owner's
  release; it runs only after release and with its own grants (F4). *Human
  control:* release approval and grant scope stay with the owner. **Acceptance
  evidence:** with no Zoom connector, the agent authors one, its tests pass
  against a Zoom sandbox, the owner releases it, and a licence change runs under
  a new grant.

- **AGENT-006 — Measure human work saved.** The agent reports total human
  touches and minutes, model/provider cost and failures per verified outcome for
  each request type over time, and names the next most valuable automation by
  work saved, not tickets closed. *Human control:* the owner chooses the
  cohort and comparison period. **Acceptance evidence:** REPORT-004's report for
  two request types, with a ranked automation proposal and its evidence.

- **AGENT-007 — Mine ticket history for automations.** The agent clusters
  historic and recent tickets, drafts catalog items, workflows, standing grants
  and articles that would remove the repeated work, with expected work saved and
  risks; an admin reviews and publishes. *Human control:* nothing publishes
  without admin approval; grants are proposed, never self-issued. **Acceptance
  evidence:** from 1,000 imported Freshservice tickets, the agent proposes three
  automations; one is published and its measured effect is reported after two
  weeks.

- **AGENT-008 — Keep devices and licences healthy.** The agent watches MDM and
  EDR for non-compliant devices (OS behind, encryption off, EDR missing) and
  licence data for idle seats, opens work with the employee in their channel,
  fixes what a grant allows (push update, reclaim seat), and verifies.
  *Human control:* reclamation and device actions follow owner policy; employees
  can defer within policy. **Acceptance evidence:** a Mac with FileVault off gets
  a Slack message and a Jamf policy push, and compliance reads back; 10 idle
  seats are reclaimed with owner approval.

- **AGENT-009 — Carry service commitments across tickets.** The agent holds a
  service outcome (e.g. "every new hire can sign in to all baseline apps on day
  one") as a commitment across tickets and staff changes, checks it against
  observations and follows up until met (F1). *Human control:* owners define and
  retire commitments. **Acceptance evidence:** a commitment survives ticket
  closure and restart and flags a hire whose GitHub access never verified.

- **AGENT-010 — Prevent recurrence and simplify.** After a fix, the agent watches
  for recurrence, links preventive changes to the problem, and proposes
  structural simplifications (retire a redundant app, merge groups) with measured
  before/after work and exposure (F6, F7). *Human control:* service owner
  approves changes and rollback. **Acceptance evidence:** a preventive change
  with recurrence observed over a declared window, and one simplification
  compared with continued repair on total work.

### Frontier extensions (retained)

[F1–F7](FRONTIER-EXTENSION.md#seven-extensions-that-change-the-product) extend
the destination with persistent service commitments (F1), semantic observation
and help (F2), unfamiliar causal research (F3), autonomous service engineering
(F4), executable service models and experiments (F5), reusable capabilities from
solved cases (F6) and continuous service simplification (F7). They inherit A1–A7
and preserve E1–E7 and O1–O3. Their acceptance evidence is the
[frontier evidence](ACCEPTANCE.md#frontier-extension-evidence) table.

## Honest boundaries

- **Not the identity provider.** Linen does not store workforce passwords or run
  SSO for other apps. Buyers use Auth, Okta, Microsoft Entra ID or Google
  Workspace; Linen acts through their APIs and reads back results.
- **Not the HRIS or payroll.** Employment facts come from Willow, Rippling, Gusto,
  BambooHR or Workday and stay authoritative there. Payroll, benefits and
  W-2/1099 tax filing stay with the buyer's payroll provider.
- **Not MDM or EDR.** Device commands run through Jamf Pro, Kandji or Microsoft
  Intune, and endpoint security through CrowdStrike or SentinelOne. Linen does not
  ship its own endpoint agent; its optional network discovery runner only
  observes.
- **Not paging, monitoring or public status.** Oncall, PagerDuty or Opsgenie
  page responders; Uptime, Datadog or Spool observe systems; Lamp or Atlassian
  Statuspage publish status. Linen holds the incident, change and employee record
  and delivers into them.
- **Not physical logistics or disposal.** Shipping, kitting, repair and certified
  disposal are done by the buyer's partners (Firstbase, GroWrk, Apple or Dell
  repair, R2v3/e-Stewards ITAD). Linen tracks custody and needs their receipts;
  a closed ticket never certifies a delivered or wiped device.
- **Not remote control or a password vault.** Remote sessions run in
  BeyondTrust, TeamViewer or Splashtop; shared credentials live in 1Password,
  Bitwarden or Keeper, which Linen links but does not replace.
- **Not procurement, accounting, the team wiki or chat.** Purchases go to Purse
  or the buyer's vendor; asset depreciation exports to Pantry, QuickBooks Online
  or NetSuite; Linen's IT knowledge base is native, while wider team knowledge
  stays in Slate, Confluence or Google Drive; Slack, Teams and Nook stay the chat
  systems.
- **Not customer support.** Linen serves the buyer's own employees. External
  customer support is HappyToHelp's product.
- **US first.** USD, US time zones and federal holidays, US sales tax and US
  employment types first. No FedRAMP, HIPAA BAA or other regulated certification
  is claimed without its own agreement and evidence; Section 508 support rests on
  A11Y-001.

## Clause implementation status

Audit baseline: `7ce9dae45191d365d21645791ca29dda46f1c115` (16 October 2026);
re-checked at main `9af1441`. Since the audit, main changed only Base logout and
mail-header validation, the run site and README/getting-started copy; no cited
path changed behaviour. `done` means implemented with a cited test through a
public door using local runtime and test-only provider fixtures; it is not live
provider, hosted or owner acceptance. `partial` cites what exists and names what
is missing. `missing` has no implementation.

**123 clauses (116 here plus F1–F7 in FRONTIER-EXTENSION.md): 11 done, 83 partial, 29 missing.**

| Clause | Status | Evidence path and remaining scope |
|---|---|---|
| E1 | partial | `src/features/work/core.ts`; `src/features/work/intake.ts`; `tests/ui/browser.mjs`; `tests/work/runtime.mjs`. Slack/Teams intake missing; mail intake untested by a public-door test. |
| E2 | partial | `src/features/work/requests.ts`; `src/features/execution/connectors.ts`; `tests/ui/connected-request.mjs`. Effects only through Microsoft Graph fixtures. |
| E3 | partial | `src/features/work/lifecycle.ts`; `src/features/work/processor.ts`; `tests/ui/connected-lifecycle.mjs`; `tests/work/runtime.mjs`. No HRIS connector. |
| E4 | partial | `src/features/work/resources.ts`; `tests/ui/custody-journey.mjs`. No MDM feed. |
| E5 | partial | `src/features/services/incidents.ts`; `tests/ui/connected-change.mjs`; `tests/services/run.mjs`. |
| E6 | partial | `src/features/services/changes.ts`; `tests/services/integration.mjs`; `tests/ui/connected-change.mjs`. |
| E7 | partial | `src/features/work/knowledge.ts`; `tests/work/runtime.mjs`; `tests/adoption/prior-data-upgrade.mjs`. |
| CHANNEL-001 | missing | No Slack app or connector. |
| CHANNEL-002 | missing | No Teams app or connector. |
| CHANNEL-003 | partial | `src/features/work/intake.ts` (authenticated mail envelope, sender quarantine); `src/features/execution/mail/sender.ts`; `tests/connections/sendgrid-runtime.mjs`. No Gmail/Exchange mailbox connector or threading by headers. |
| CHANNEL-004 | partial | `src/ui/work.tsx`; `src/ui/knowledge.tsx`; `tests/ui/browser.mjs`; `tests/ui/connected-request.mjs`. No "my devices", notices or branding. |
| CHANNEL-005 | partial | `tests/ui/viewport-evidence.mjs` (390 px). No native iOS/Android apps or push. |
| CHANNEL-006 | partial | `src/features/intelligence/intake.ts`; `src/features/intelligence/intake-execution.ts`; `tests/ui/connected-request.mjs`. Portal only; no Slack/Teams. |
| CHANNEL-007 | missing | No phone-system or walk-up intake. |
| CHANNEL-008 | partial | `src/features/services/incidents.ts` (audience-bound updates); `tests/services/run.mjs`. No portal banner or chat posting. |
| CATALOG-001 | partial | `src/features/work/requests.ts` (`createCatalogItem`: kind, target, owner, capacity); `tests/ui/connected-request.mjs`. No form builder, conditional fields, audience or cost. |
| CATALOG-002 | partial | `src/features/work/fulfilment-decisions.ts`; `src/features/work/delegation.ts`; `tests/ui/fulfilment-decision-journey.mjs`; `tests/execution/authority-manager-cases.mjs`. Single manager approval; no multi-level, finance threshold or approval SLA. |
| CATALOG-003 | partial | `src/features/work/requests.ts` (obligations); `src/features/execution/plans.ts`; `tests/ui/connected-request.mjs`. No team task templates. |
| CATALOG-004 | missing | No bundles. |
| DESK-001 | partial | `src/features/work/core.ts` (`listWork`); `src/ui/work.tsx`. No groups, saved views or bulk actions. |
| DESK-002 | partial | `src/features/work/intake-classification.ts`; `tests/work/runtime.mjs`. No categories or priority matrix. |
| DESK-003 | partial | `src/features/work/core.ts` (assign); `src/features/intelligence/intake-execution.ts`. No rules, round-robin, load or skills. |
| DESK-004 | partial | `src/features/work/calendar.ts`; `tests/work/runtime.mjs`. One commitment per ticket; no policy sets or holiday catalogues. |
| DESK-005 | partial | `src/features/services/integrations.ts`; `src/features/intelligence/followup.ts`. No multi-level escalation or supervisor rules. |
| DESK-006 | partial | `src/features/services/incidents.ts` (link/correct). No merge, split or parent/child tickets. |
| DESK-007 | partial | `src/features/work/core.ts` (private notes); `tests/work/runtime.mjs`; `tests/ui/browser.mjs`. No mentions, watchers or side conversations. |
| DESK-008 | partial | `src/features/intelligence/models.ts`; `src/features/intelligence/intake.ts`. No canned responses or cited summaries. |
| DESK-009 | missing | No CSAT. |
| DESK-010 | missing | No custom fields, forms or statuses. |
| DESK-011 | partial | `src/platform/auth.ts`; `src/features/work/core.ts` (workspace and HR sensitivity scoping); `tests/platform/runtime.mjs`. No department workspaces under one portal. |
| DESK-012 | missing | No time entries. |
| DESK-013 | missing | No recurring tickets. |
| DESK-014 | missing | No remote-support integration. |
| ACCESS-001 | done | `src/features/execution/connectors.ts`; `src/features/execution/identity.ts`; `tests/execution/runtime.mjs`; `tests/ui/connected-lifecycle.mjs`. Fixture provider; live tenant acceptance remains. |
| ACCESS-002 | missing | No Okta connector. |
| ACCESS-003 | missing | No Google Workspace connector. |
| ACCESS-004 | missing | No Auth connector. |
| ACCESS-005 | missing | No GitHub, Slack, Salesforce, Atlassian, Zoom or AWS connectors. |
| ACCESS-006 | done | `src/features/work/requests.ts`; `src/features/execution/automation.ts`; `tests/ui/connected-request.mjs`. |
| ACCESS-007 | missing | No password/MFA reset or unlock. |
| ACCESS-008 | partial | `src/features/work/requests.ts` (catalog target and owner); `src/features/services/economics.ts`. No app registry with entitlements. |
| ACCESS-009 | missing | No access reviews. |
| LIFE-001 | missing | No Rippling, Gusto, BambooHR, Workday or Willow connector; lifecycle accepts HR facts through the API only. |
| LIFE-002 | partial | `src/features/work/lifecycle.ts`; `tests/work/runtime.mjs`. No templates by role, location or employment type. |
| LIFE-003 | partial | `src/features/work/lifecycle.ts` (retained/added/removed); `tests/ui/connected-lifecycle.mjs`. No access policies. |
| LIFE-004 | partial | `src/features/work/resources.ts`; `tests/ui/custody-journey.mjs`. No zero-touch enrolment or shipping. |
| LIFE-005 | partial | `src/features/execution/identity.ts` (disable, session check); `src/features/work/lifecycle.ts`; `tests/ui/connected-lifecycle.mjs`. Entra only; no SaaS, data transfer or device actions. |
| LIFE-006 | partial | `src/features/work/lifecycle.ts` (contractor expiry duties); `tests/work/runtime.mjs`. No sponsor re-attestation. |
| LIFE-007 | partial | `src/features/work/requests.ts` (`listObligations`); `src/features/execution/verification.ts`. No exportable pack. |
| ASSET-001 | missing | No Jamf, Intune or Kandji connector. |
| ASSET-002 | missing | No device actions. |
| ASSET-003 | partial | `src/features/connections/providers.ts` (Graph devices discovery); `tests/connections/runtime.mjs`. No MDM/EDR/cloud/network discovery. |
| ASSET-004 | partial | `src/features/work/resources.ts`; `tests/ui/custody-journey.mjs`; `tests/work/runtime.mjs`. No ITAD certificate requirement. |
| ASSET-005 | partial | `src/features/work/requests.ts` (catalog capacity admission). No stock locations or reorder. |
| ASSET-006 | partial | `src/features/services/economics.ts` (software assets, usage, renewal, reclamation); `tests/services/run.mjs`. No IdP usage feed or reclamation through connectors. |
| ASSET-007 | partial | `src/features/services/economics.ts` (suppliers, renewal); `tests/services/run.mjs`. No warranties. |
| ASSET-008 | missing | No depreciation or accounting export. |
| ASSET-009 | partial | `src/features/services/graph.ts`; `tests/services/run.mjs`. No CI type model or impact view. |
| ASSET-010 | missing | No physical audits. |
| INC-001 | partial | `src/features/services/incidents.ts` (on-call rotation, updates); `tests/services/run.mjs`. No war room or Oncall/PagerDuty connector. |
| INC-002 | partial | `src/features/services/integrations.ts` (signed monitoring webhook, dedupe, staleness); `tests/services/run.mjs`. No named Uptime/Datadog/PagerDuty/Spool connectors. |
| INC-003 | partial | `src/features/services/integrations.ts` (notification webhook, delivery reconcile); `tests/services/run.mjs`. No Lamp or Statuspage connector. |
| INC-004 | missing | No Jira/GitHub/Linear/Vector escalation. |
| PROB-001 | partial | `src/features/services/problems.ts`. No public-door test; no KB publishing of workarounds. |
| PROB-002 | partial | `src/features/intelligence/investigations.ts`; `src/features/intelligence/capabilities.ts`. No ticket clustering into problems. |
| CHANGE-001 | partial | `src/features/services/changes.ts` (emergency flag); `tests/services/run.mjs`. No templates or standard-change catalog. |
| CHANGE-002 | partial | `src/features/services/changes.ts` (declared risk). No scoring. |
| CHANGE-003 | partial | `src/features/services/changes.ts` (versioned authorisation); `tests/services/integration.mjs`. No CAB, meetings or votes. |
| CHANGE-004 | partial | `src/features/services/changes.ts` (window conflicts); `tests/ui/connected-change.mjs`. No calendar, freeze windows or ICS. |
| CHANGE-005 | partial | `src/features/services/changes.ts` (compensation); `tests/services/integration.mjs`. No automatic incident linking or PIR. |
| CHANGE-006 | partial | `src/features/intelligence/engineering.ts`. No GitHub/Jira/Vector links or deployment-raised changes. |
| KB-001 | done | `src/features/work/knowledge.ts`; `tests/work/runtime.mjs`; `tests/adoption/prior-data-upgrade.mjs`. |
| KB-002 | missing | No federated sources. |
| KB-003 | partial | `src/features/work/knowledge.ts` (search and escalation); `tests/work/runtime.mjs`. No suggestion before filing or deflection count. |
| KB-004 | missing | No article drafting from tickets. |
| REPORT-001 | partial | `src/features/work/knowledge.ts` (`workReport`); `src/features/services/economics.ts`; `tests/adoption/prior-data-upgrade.mjs`; `tests/services/run.mjs`. No dashboards, CSAT or per-agent views. |
| REPORT-002 | missing | No report builder or scheduling. |
| REPORT-003 | partial | REST `/api/v1` (`src/features/work/index.ts`); `tests/work/runtime.mjs`. No BI export. |
| REPORT-004 | partial | `src/features/intelligence/measurement.ts`; `tests/intelligence/runtime.mjs`. No per-request-type touch reporting. |
| ROLE-001 | partial | `src/platform/auth.ts`; `tests/ui/browser.mjs`; `tests/platform/runtime.mjs`. Fixed roles; no custom roles. |
| SSO-001 | partial | `src/platform/sso.ts` (Cloudflare Access); `src/platform/base-auth`; `tests/platform/runtime.mjs`; `tests/platform/base-auth-runtime.mjs`. No SAML/OIDC with named IdPs or SCIM. |
| AUDIT-001 | done | `src/platform/privacy.ts`; `tests/platform/privacy-runtime.mjs`; `tests/platform/config-runtime.mjs`. |
| API-001 | partial | `src/features/work/index.ts`; `src/features/execution/index.ts`; `tests/work/runtime.mjs`. No outbound event webhooks. |
| API-002 | partial | `src/features/execution/automation.ts`; `src/features/execution/plans.ts`; `tests/ui/connected-request.mjs`. No no-code builder. |
| API-003 | missing | No MCP server. |
| PORT-001 | done | `src/features/adoption/export.ts`; `src/features/adoption/import.ts`; `tests/adoption/runtime.mjs`. |
| ERASURE-001 | done | `src/features/adoption/core.ts`; `src/features/work/privacy.ts`; `tests/adoption/runtime.mjs`; `tests/work/person-binding-runtime.mjs`; `tests/platform/privacy-runtime.mjs`. |
| RETENTION-001 | partial | `src/features/adoption/retention.ts`; `tests/adoption/runtime.mjs`. Archive retention only; no ticket/attachment retention. |
| BASE-001 | done | `src/platform/base-auth`; `src/base`; `tests/platform/base-auth-runtime.mjs`; `tests/platform/mail-edge.mjs`. |
| COST-001 | partial | `src/features/intelligence` budget (`/intelligence/budget`); `tests/intelligence/runtime.mjs`. No seat pricing or sales-tax invoices. |
| A11Y-001 | partial | `tests/ui/viewport-evidence.mjs`; `tests/ui/browser.mjs` (keyboard/overflow checks). No WCAG audit. |
| MIGRATE-001 | partial | `src/features/adoption/freshservice-import`; `src/features/adoption/freshservice.ts`; `tests/adoption/freshservice-import.mjs`; `tests/adoption/runtime.mjs`. Tickets and conversations only, 100 per job; no assets, catalog, KB, SLA or attachment bytes. |
| MIGRATE-002 | missing | No JSM importer. |
| MIGRATE-003 | missing | No ServiceNow importer. |
| MIGRATE-004 | missing | No CSV, Zendesk or Snipe-IT importer. |
| MIGRATE-005 | partial | `src/features/adoption/coexistence.ts`; `tests/adoption/runtime.mjs`. Freshservice only. |
| A1 | done | `src/platform/auth.ts`; `src/features/work/privacy.ts`; `tests/ui/browser.mjs`; `tests/platform/privacy-runtime.mjs`; `tests/work/person-binding-runtime.mjs`. |
| A2 | done | `src/features/execution/authority.ts`; `src/features/execution/grants.ts`; `tests/execution/authority-runtime.mjs`; `tests/ui/connected-request.mjs`. |
| A3 | done | `src/features/execution/engine.ts`; `tests/ui/connected-cancellation.mjs`; `tests/ui/connected-restart.mjs`; `tests/execution/runtime.mjs`. |
| A4 | done | `src/features/execution/verification.ts`; `tests/ui/connected-request.mjs`; `tests/execution/runtime.mjs`. |
| A5 | partial | `src/ui`; `tests/ui/run.mjs`; `tests/ui/viewport-evidence.mjs`. No chat channels; bounded accessibility evidence. |
| A6 | partial | `src/features/adoption`; `tests/adoption/prior-data-upgrade.mjs`; `tests/adoption/runtime.mjs`. Incumbent imports bounded to Freshservice. |
| A7 | partial | `src/features/intelligence/measurement.ts`; `tests/intelligence/runtime.mjs`. Human touch counting incomplete. |
| O1 | partial | `src/features/services/graph.ts`; `tests/services/run.mjs`; `tests/services/integration.mjs`. No real monitoring/on-call. |
| O2 | partial | `src/features/services/changes.ts`; `tests/services/integration.mjs`; `tests/ui/connected-frontier.mjs`. No live provider or sustained prevention. |
| O3 | partial | `src/features/services/economics.ts`; `tests/services/run.mjs`. No real supplier or reclamation. |
| AGENT-001 | partial | `src/features/intelligence/intake-execution.ts`; `tests/ui/connected-request.mjs`. Graph-only effects. |
| AGENT-002 | partial | `src/features/work/lifecycle.ts`; `tests/ui/connected-lifecycle.mjs`. No SaaS/OAuth enumeration. |
| AGENT-003 | partial | `src/features/execution/verification.ts` (independent verifier); `tests/ui/connected-request.mjs`. No sign-in or compliance signals. |
| AGENT-004 | partial | `src/features/intelligence/research.ts`; `tests/intelligence/frontier.mjs`. |
| AGENT-005 | partial | `src/features/intelligence/engineering.ts`; `tests/ui/connected-frontier.mjs`. No released provider connector. |
| AGENT-006 | partial | `src/features/intelligence/measurement.ts`; `tests/intelligence/runtime.mjs`. |
| AGENT-007 | partial | `src/features/intelligence/capabilities.ts`; `tests/intelligence/frontier.mjs`. No ticket-history mining. |
| AGENT-008 | missing | No MDM/EDR signals. |
| AGENT-009 | partial | `src/features/intelligence/commitments.ts`; `tests/intelligence/frontier.mjs`. |
| AGENT-010 | partial | `src/features/intelligence/simplification.ts`; `tests/intelligence/frontier.mjs`. |
| F1 | partial | `src/features/intelligence/commitments.ts`; `tests/intelligence/frontier.mjs`. |
| F2 | partial | `src/features/intelligence/events.ts`; `tests/intelligence/runtime.mjs`. |
| F3 | partial | `src/features/intelligence/research.ts`; `tests/intelligence/frontier.mjs`. |
| F4 | partial | `src/features/intelligence/engineering.ts`; `tests/ui/connected-frontier.mjs`. |
| F5 | partial | `src/features/intelligence/protocol.ts`. |
| F6 | partial | `src/features/intelligence/capabilities.ts`; `tests/intelligence/frontier.mjs`. |
| F7 | partial | `src/features/intelligence/simplification.ts`; `tests/intelligence/frontier.mjs`. |
