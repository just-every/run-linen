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
category job those clauses summarize. Difficulty (provider applications, native
apps, connector breadth) is recorded as engineering work in a clause, never as a
reason to narrow the product.

## Product target

Linen is the IT service desk a US company of 50 to 500 people buys instead of
Freshservice, Jira Service Management or ServiceNow ITSM, with the chat-first,
act-for-you automation of Serval, Console and Atomicwork. This contract describes
that product and marks how close the current code is (see [Status](#status)).

| | |
| --- | --- |
| Category | IT service management (ITSM) / employee service desk |
| Incumbents a buyer switches from | ServiceNow ITSM, Freshservice, Jira Service Management |
| Up-and-comers it must also beat | Serval, Console, Atomicwork |
| First buyer | A US company of 50 to 500 people whose IT team runs employee help, access, onboarding and offboarding, devices and changes in Freshservice, Jira Service Management or ServiceNow ITSM; prices, budgets and asset values in USD, US time zones and federal holidays, W-2 employees and 1099 contractors |

### Scope mapping

| Required scope | Clauses |
| --- | --- |
| Identity and SaaS provisioning (Okta, Microsoft Entra, Google Workspace, Auth, GitHub, Slack, Salesforce) that grants, revokes and reads back | ACCESS-001, ACCESS-002, ACCESS-003, ACCESS-004, ACCESS-005, ACCESS-006, ACCESS-010, LIFE-003, LIFE-005 |
| HRIS-triggered onboarding and offboarding (Rippling, Gusto, BambooHR, Workday) with dated task plans across IT, HR and managers | LIFE-001, LIFE-002, LIFE-004, LIFE-005, LIFE-006, LIFE-007 |
| MDM and asset management: Jamf, Intune and Kandji sync, discovery, serial-level custody, software licenses and renewals | ASSET-001, ASSET-002, ASSET-003, ASSET-004, ASSET-005, ASSET-006, ASSET-007, ASSET-011, CATALOG-005 |
| Slack and Teams as the primary employee channel, with a self-service catalog, approval chains and SLA timers | CHANNEL-001, CHANNEL-002, CATALOG-001, CATALOG-002, CATALOG-003, DESK-004, DESK-005 |
| Change management with CAB, risk scoring, change calendar and rollback, linked to Oncall incidents and Uptime evidence | CHANGE-001, CHANGE-002, CHANGE-003, CHANGE-004, CHANGE-005, INC-001, INC-002 |
| Freshservice and Jira Service Management migration preserving tickets, attachments, assets, catalog items and knowledge | MIGRATE-001, MIGRATE-002, MIGRATE-003, MIGRATE-005 |
| Push further: agents resolve routine requests end to end under standing authority, verify the employee can work again, investigate multi-system failures, build missing connectors and measure human work saved | AGENT-001, AGENT-002, AGENT-003, AGENT-004, AGENT-005, AGENT-006, REPORT-004 |

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
  context, then shows exact authority, fulfillment owner, provision/delivery
  evidence and an understandable rejection or completion. Linen asks only for a
  genuinely missing fact or decision. Missing managers enter an accountable
  exception; substitutes need real delegated authority; material changes
  invalidate affected approval. Partial fulfillment, no stock/license, cancellation
  after effects, failed/unknown provider actions, temporary access expiry and
  independently verified revocation are handled; routine reapproval or
  confirmation is not required when standing authority and machine evidence
  suffice. Software requests install through the device's MDM and complete only
  when the device's installed-application inventory shows the app (CATALOG-005).
  **Acceptance evidence:** request time-limited group access in plain
  language, supply the one missing fact, see absent authority denied, approve under
  a standing grant, read back the provider membership, reach expiry and observe
  independently verified removal; cancel a second request after its effect and see
  the remaining compensation duty; request Visio for one's laptop and see the
  request stay "effect submitted" until the laptop's inventory shows Visio.

- **E3 — Join, move and leave.** Authorized HR/manager initiation with effective
  times, task dependencies, accounts, access and devices; an authoritative HR
  event starts routine work without a separate request. Join prepares the
  authorized baseline and physical fulfillment; move compares retained, added and
  removed access; leave revokes access and keeps separate custody/return duties.
  Changed dates, canceled hires, contractor expiry, urgent termination,
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
  scheduled window, versioned authorization, exact implementation, execution and
  rollback/compensation evidence, success/failure and follow-up. Standard
  low-risk changes use standing grants. Emergency authority, conflicts,
  post-approval edits, partial execution, failed rollback and post-change
  incidents are handled. A change record is not authority in a provider.
  **Acceptance evidence:** authorize a change, edit its implementation and see the
  approval invalidated, schedule a conflicting window, run canary then rollout,
  fail the rollback and see accountable takeover with the partial effect recorded.

- **E7 — Knowledge and management review.** Scoped reviewed articles with explicit
  expiry, search and escalation into a request with context. Reports cover age,
  response/resolution commitments, blocked approvals, lifecycle obligations,
  recurrence and outcomes with definitions, range and time zone. Paused clocks,
  changed schedules, reopened work, permission changes and failed refreshes stay
  explicit; closure counts never substitute for fulfillment. **Acceptance
  evidence:** search a reviewed article as an employee, escalate it into a request
  carrying the article revision, then read a management report for a date range in
  `America/Chicago` that separates closed from verified-fulfilled work.

## Target clauses

### Employee channels

- **CHANNEL-001 — Slack as a primary employee channel.** A Linen Slack app
  (distributed through the Slack Marketplace, installable on Enterprise Grid)
  takes requests from a DM with the app, a message shortcut ("Create IT
  request"), an emoji reaction (`:ticket:` by default, configurable per channel)
  on any message, and monitored help channels such as `#it-help`, where each new
  top-level post becomes a ticket. A ticket filed from a channel post, reaction or
  shortcut is filed for the original poster as requester, with the person who
  reacted or used the shortcut recorded as submitter, and Linen acknowledges in
  that message's thread. Each request becomes one ticket whose public replies sync
  both ways in its originating thread. Private notes, internal fields and internal
  attachments never post to Slack, and a ticket in a sensitive workspace (HR,
  security) is never discussed in a channel: Linen moves it to a DM with the
  requester. Catalog modals list only items whose audience includes the
  submitting employee and re-check audience on submit. The App Home shows "my
  requests" with current status and "my approvals". Approvers approve or reject
  with buttons that re-check current authority and request revision. Unknown
  Slack users, deactivated accounts, Slack Connect external users (never trusted
  as employees), edited and deleted messages, files, and Slack outages are
  handled without duplicate tickets. **Acceptance evidence:** in a test Slack
  workspace: (1) a post in monitored `#it-help` becomes a ticket for its poster
  and the acknowledgment lands in its thread; (2) a teammate adds `:ticket:` to
  another employee's message and the ticket's requester is the original poster,
  with the teammate as submitter; (3) an operator's public reply arrives in that
  thread while a private note and an internal attachment do not; (4) request
  access by DM, answer the follow-up in the thread and approve from a manager's
  DM; (5) a catalog modal opened by an employee outside an item's audience omits
  the item, and a crafted submission for it is refused; (6) the App Home lists
  the employee's open requests with current status; (7) edit the original message
  and retry delivery after a simulated Slack 503 without a second ticket; (8) a
  Slack Connect guest's post is quarantined, not filed as an employee request.

- **CHANNEL-002 — Microsoft Teams as a primary employee channel.** A Linen Teams
  app (Teams Store and admin-deployable package, with Entra identity mapping and
  tenant admin consent) gives employees personal chat with the app; monitored team
  channels, where each new channel post becomes a ticket for its author with
  replies in the post's reply chain; a message-extension action ("Create IT
  request") on any message that files for the original author, with the invoking
  user recorded as submitter; a search message extension to look up one's tickets
  and articles; Adaptive Card catalog forms that list only items in the
  employee's audience and re-check it on submit; Adaptive Card approvals that
  re-check authority and request revision; and a personal tab with "my requests"
  and "my approvals". Public replies sync both ways; private notes, internal
  attachments and sensitive-workspace tickets never post to a channel; guest and
  federated external users are never trusted as employees. **Acceptance
  evidence:** in a Microsoft 365 developer tenant: (1) a post in a monitored "IT
  Help" team channel becomes a ticket for its author with the acknowledgment in
  its reply chain; (2) a colleague uses "Create IT request" on another employee's
  message and the requester is the original author; (3) submit a catalog request
  from personal chat through an Adaptive Card, while an employee outside the
  item's audience neither sees it nor can submit it; (4) approve from an Adaptive
  Card, and a stale card for an edited request is refused; (5) the personal tab
  shows the employee's open requests; (6) an operator's public reply arrives in
  the reply chain and a private note does not; (7) a guest user's message is
  quarantined.

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
  articles, my devices and current service notices. Admins set the buyer's logo,
  colors, portal name and a custom domain (such as `help.example.com`, with a
  managed TLS certificate), applied to the portal and to notification emails. It
  works signed in through the buyer's SSO, honors department scoping and is the
  fallback when chat is down. **Acceptance evidence:** as an employee, find an
  article, submit a catalog item, see its status and approval progress, see one's
  own assigned laptop, and be denied another department's private catalog item;
  set a logo, brand colors and `help.example.com`, and see the portal served on
  that domain over TLS with the branding, and the next notification email
  carrying the same logo and colors.

- **CHANNEL-005 — Mobile for employees, approvers and technicians.** The portal
  and operator console work at phone width; native iOS and Android apps give
  technicians queues, ticket replies, approvals, asset scan by barcode/QR and push
  notifications, and give employees requests and approvals. Push respects the
  user's quiet hours and notification preferences (NOTIFY-002): subscribable
  pushes are held until quiet hours end, while mandatory ones (an on-shift P1
  assignment, an approval the user's SLA depends on) are delivered as the user's
  preference states. **Acceptance evidence:** at 390 px, submit and approve a
  request; on a TestFlight/Play internal build, take a push notification to an
  approval, approve it, and scan a laptop's asset tag to open its record; with
  quiet hours 9 pm–7 am set, a requester-reply push at 10 pm arrives at 7 am
  while an on-shift P1 assignment push arrives immediately.

- **CHANNEL-006 — Conversational help that acts.** In every channel Linen's
  assistant answers from permitted knowledge, asks for a genuinely missing fact,
  and performs catalog actions the employee is entitled to under current standing
  grants, showing what it will do before acting when the grant requires it. Model
  output never confers authority. When the employee asks for a person, or the
  assistant cannot help, the conversation hands off live to an available agent in
  the same portal chat or chat thread during the group's business hours, with the
  transcript; outside hours, or when no agent accepts within the configured time,
  it files a ticket carrying the transcript and tells the employee when to expect
  a reply. **Acceptance evidence:** ask in Slack and in the portal "I need edit
  access to the Finance shared drive until Friday"; see the resolved catalog
  item, the clarifying question, the executed grant with readback, and a refusal
  when the employee is outside the grant's audience. In the portal assistant at
  11 am, ask for a person: an available agent accepts and replies in the same
  chat with the transcript in view; at 9 pm the same request files a ticket with
  the transcript and states the expected response time.

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

- **CHANNEL-009 — Request sharing and manager visibility.** A requester shares a
  request with named colleagues, who can read and reply to its public thread but
  never see private notes; a request filed on behalf of someone shows to both the
  submitter and the beneficiary; managers see their direct and indirect reports'
  requests in "My team's requests", following the HRIS reporting line (LIFE-001),
  with sensitive categories (HR, security, health, leaver) excluded by policy.
  Every share is audited and revocable. **Acceptance evidence:** an employee
  shares a ticket with a colleague, who reads and replies but does not see the
  private note; a manager sees two reports' requests but not a report's HR
  workspace ticket; after the HRIS changes the report's manager, the old manager
  loses visibility and the new one gains it.

### Service catalog and approvals

- **CATALOG-001 — Catalog items with forms.** Admins build catalog items (access,
  software, hardware, accounts, general services) with field types, conditional
  logic, required attachments, audience visibility by department/location/
  employment type, a USD cost and an expected delivery time. Items are versioned;
  in-flight requests keep their version. **Acceptance evidence:** build a "New
  monitor" item with a conditional field and a $250 cost visible only to
  employees in two departments; submit it as an eligible and an ineligible
  employee; a "Software purchase" item that requires a quote PDF refuses
  submission without it, and the attached quote is visible to its approvers but
  not to other employees; edit the item and see an in-flight request unchanged.

- **CATALOG-002 — Approval chains.** Per item: manager, application owner, cost
  center or finance above a USD threshold, and named groups, in serial or
  parallel, any-of or all-of, with delegation, out-of-office substitution,
  reminders and an approval SLA. Approvals work in Slack, Teams, email, mobile
  and the portal and re-check authority and request revision at decision time.
  An email approval is given by replying "approve" or "reject" (with an optional
  comment) or by a signed link; a reply counts only from the approver's own
  address with aligned SPF/DKIM/DMARC and the approval's single-use token, and
  only for the current request revision. **Acceptance evidence:** a $1,800
  laptop request needs manager then finance (over $1,000); the manager is out of
  office and a delegate approves; finance is reminded at 24 business hours; the
  finance approver replies "approve" to the approval email from their mailbox
  and the approval records with the reply as its comment, while the same reply
  forwarded and sent from another address, or a reply to an earlier revision, is
  refused; an edited request invalidates the earlier approval.

- **CATALOG-003 — Fulfillment task plans.** Each item expands into ordered and
  parallel tasks for teams, automated steps through connectors, and child tasks
  with dependencies and due dates; the request completes only when every
  obligation is verified or explicitly waived by its owner. A software item's
  install step is CATALOG-005's MDM install, verified on the device.
  **Acceptance evidence:** a software request creates an approval, an automated
  license assignment and a manual configuration task; the automated step fails
  and the request stays open with the failure owned.

- **CATALOG-004 — Bundles and kits.** A bundle such as "New engineer" combines
  hardware, software and access items with shared approval and individual
  fulfillment. **Acceptance evidence:** request the bundle; see one approval, five
  child fulfilments, and the bundle complete only when all children verify.

- **CATALOG-005 — Software requests installed through MDM.** Admins bind a
  software catalog item to an MDM application:
  - a Microsoft Intune app (Win32, line-of-business MSI, Microsoft Store,
    Microsoft 365 Apps or macOS PKG/DMG) with an Entra install group, assigned as
    required, and a matching uninstall group;
  - a Jamf Pro policy or Self Service item scoped by a static group;
  - or a Kandji Library item.

  The item carries the supported platforms and a minimum version. Fulfillment
  runs in order:
  1. approval (CATALOG-002);
  2. a license check against the title's entitlement (ASSET-006), which joins a
     waitlist or raises a purchase request when no seat is free;
  3. the install, by adding the employee's device or user to the install group
     or by a direct push under grant (ASSET-002);
  4. verification.

  When the MDM accepts the assignment or command the request shows "effect
  submitted". It completes only when the chosen device's installed-application
  inventory (ASSET-001) or an app probe (AGENT-003) shows the title at or above
  the minimum version. A failed or timed-out deployment (an Intune install
  status of failed, a Jamf policy log failure, or a device offline past the
  deadline) leaves the request open with a failure task owned by the item's
  fulfillment group, and Linen retries only as the item's policy allows. An item
  may carry a lease, for example 30 days, with a reminder before it ends. At
  lease end the device moves to the uninstall group or Jamf runs the removal
  policy; the app's absence is verified by the next inventory and the seat
  returns to the pool. An employee with several devices chooses which one, and a
  device on an unsupported platform (Visio on macOS, say) is refused at request
  time with the reason. **Acceptance evidence:** (1) an employee requests Visio
  in Slack, the manager approves and Intune installs it through the install
  group; the request stays "effect submitted" until the laptop's inventory shows
  Visio, then completes; (2) a Jamf install that fails on one Mac leaves the
  request open with the failure task owned by the fulfillment group; (3) a 30-day
  Tableau lease ends with the app uninstalled, absent on the next inventory and
  the seat returned to ASSET-006's pool; (4) a request with no free seat waits
  without installing; (5) a request for Visio on a Mac is refused at request
  time with the reason.

- **CATALOG-006 — Requests for pending people.** A request may name a pending
  person (a reviewed person record without an account, e.g. a new hire) as its
  beneficiary; requested catalog services are held, with the reason shown,
  until that person's account is bound, then released into normal fulfillment;
  an unbound pending person can be edited or withdrawn, canceling the request.
  A person without review cannot be named as a beneficiary. **Acceptance
  evidence:** submit a request naming a pending new hire; see the service held
  with its reason; bind the account and see it released into fulfillment; edit
  an unbound pending person; withdraw one and see its request canceled; a
  person without review cannot be named.

### Agent workspace and ticket operations

- **DESK-001 — Queues, groups and views.** Agent groups, saved and shared views,
  filters, sorting, bulk update and keyboard navigation (next/previous ticket,
  assign, reply, private note, status, run a scenario from DESK-015, with a
  shortcut reference); each ticket has one accountable group and owner.
  **Acceptance evidence:** create two groups, save a "Unassigned P1" view,
  bulk-assign five tickets, and see a group lead's view exclude another group's
  restricted ticket; triage that view keyboard-only (open next, assign to self,
  send a reply, set status) with no pointer input.

- **DESK-002 — Classification and priority.** Ticket types (incident, service
  request, question), categories and subcategories, and an impact × urgency
  priority matrix; Linen proposes classification and priority with the reason,
  and agents can override. **Acceptance evidence:** submit "VPN down for whole
  Denver office"; see type incident, high impact, proposed P1 with the reason;
  override to P2 and see the override audited.

- **DESK-003 — Routing and assignment.** Rules route by category, requester,
  department, location, VIP status and the impacted configuration item's or
  business service's support group (ASSET-009); assignment can be round-robin, by
  current load, by skill, or by business-hours availability, and reassignment
  keeps history. **Acceptance evidence:** with three agents (one off shift, one
  overloaded), round-robin and load-based rules assign to the available agent; a
  VIP request routes to the executive-support group; a ticket raised against the
  "Payroll" service routes to Payroll's support group, and against a laptop CI to
  that CI's support group.

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
  printer tickets and see both requesters notified on the surviving ticket; split
  a ticket carrying two unrelated asks into two tickets, each with its own SLA
  and history and a link back to the original messages; link a ticket to a
  laptop and a problem and see it on each record.

- **DESK-007 — Collaboration.** Private notes, @mentions, watchers, and side
  conversations by email or Slack with vendors and other teams that stay off the
  employee's view. **Acceptance evidence:** mention a colleague in a private
  note, open a side conversation with a vendor by email and another with the
  Network team in a private Slack channel, see both teams' replies arrive on the
  ticket as private notes, and confirm the employee sees none of them while the
  mentioned colleague is notified.

- **DESK-008 — Responses and summaries.** Canned responses with placeholders,
  and assistant-drafted replies and ticket summaries that cite knowledge and
  ticket history; drafts are sent only by an agent unless a standing grant covers
  the reply. **Acceptance evidence:** insert a canned response with the
  requester's name; generate a summary of a 20-message ticket with citations; a
  drafted reply is not sent until the agent sends it.
  Workspace canned responses are managed and inserted by current owners and
  service operators. Their plain-text placeholders are `requester.name`,
  `ticket.title` and `ticket.id`; unknown or malformed placeholders are refused.
  Shared-reply generation receives only the ticket's public messages and selected
  current, reviewed employee-audience knowledge. A working summary may use the
  requesting agent's permitted messages and reviewed knowledge; it is returned
  only to that agent. Generated text is not stored as a server-side conversation
  message. The complete message set, ticket access, current role and selected
  article revision, audience, review and expiry are rechecked before returning
  a result; changed context or unknown citations refuse the result. Inserting a
  template or using a reply draft preserves the composer's selected visibility
  and leaves it unsent. This implements the policy approved by ct on 19 October.
  For articles generated by KB-004, the requester and beneficiary must each
  currently be able to read every source before and after reply generation.
  A pending beneficiary refuses that article context. These are read-only checks,
  never a new account or grant; working summaries keep the agent's own scope.

- **DESK-009 — Satisfaction surveys.** A one-question CSAT survey after
  resolution in the channel the employee used, with optional comment, response
  rates and results by group and agent. **Acceptance evidence:** resolve a Slack
  ticket, answer the survey in Slack with a comment, and see it in the CSAT
  report with the response-rate denominator.

- **DESK-010 — Custom fields, forms and statuses.** Admins add custom ticket
  fields, forms per ticket type and custom statuses mapped to SLA behavior.
  Fields can be required on a status: by default an incident cannot be resolved
  without a resolution code (from an admin-edited list such as "Solved
  (workaround)", "Solved (permanent fix)", "Not reproducible" and "Duplicate")
  and close notes, and a service request cannot be resolved without close notes.
  The rule holds on every door: console, bulk update, scenario, API and chat
  action. **Acceptance evidence:** add an "Office" dropdown and an "Awaiting
  parts" status that pauses SLA; use both and see the SLA pause. Resolve an
  incident without a resolution code from the console, a bulk update and the API
  and see each refused; resolve it with a code and close notes and see both on
  the record and resolutions counted by code in REPORT-001.

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
  Calendar semantics: each plan snapshots its time zone, business weekdays,
  holiday dates and local creation hour. Daily, weekly, monthly and annual
  intervals retain their original anchor; month-end dates clamp without drift.
  Non-business dates roll forward. First-business-day schedules use the first
  of each month (or annual anchor month); the initial occurrence never precedes
  the selected start date. A daylight-saving fold uses the earliest matching
  instant; a skipped local hour advances to the next real minute. Pausing keeps
  existing work and overdue periods; resuming catches up one occurrence per
  plan per scheduler tick. Task plans create owned local duties, each separately
  completed; they do not authorize provider effects.

- **DESK-014 — Remote support handoff.** From a ticket, an agent starts a remote
  session through the buyer's BeyondTrust Remote Support, TeamViewer or
  Splashtop under the employee's consent; session start/end and recording link
  are attached. **Acceptance evidence:** launch a BeyondTrust sandbox session
  from a ticket and see consent, timestamps and the recording link on it.

- **DESK-015 — Agent scenarios and record templates.** Admins and agents build
  named scenarios: one-click actions that set several fields (type, category,
  priority, status, custom fields), assign a group and agent, add a private note
  or a public reply from a template, add watchers, and link or start a task plan.
  Each scenario is scoped to its author, a group or the workspace. Running it
  applies every step as one audited action recording each field's before and
  after; each step is checked against the runner's permissions, and a step the
  runner may not perform stops the scenario with nothing applied. Scenarios are
  offered only within their scope and run from the ticket, a bulk selection
  (DESK-001) and mobile. Record templates pre-fill new tickets, tasks and changes.
  **Acceptance evidence:** a Service Desk agent runs "Escalate to Network L2" on a
  ticket; category, priority, group and status change and a private note is
  added in one audit entry listing each change, and the requester sees no note;
  an agent outside the Service Desk group is not offered the group-scoped
  scenario and a direct API call to run it is refused; a scenario with a step
  outside the runner's role applies nothing; a "New laptop setup" template
  pre-fills a new ticket's fields.

- **DESK-016 — Global agent search.** One search across tickets (number, subject,
  content, requester), people, assets (serial, asset tag), configuration items,
  changes, problems, catalog items and articles, with type filters and typo
  tolerance. Results and their counts honor the searcher's current scope (A1).
  **Acceptance evidence:** search a laptop serial and find the asset, its tickets
  and its assigned person; search a requester's name and see their tickets; an IT
  agent's search for a term in an HR-workspace ticket returns no result and no
  count for it.
  Search uses each current source door's readership, refreshed membership and
  message visibility before matching, pagination or counts; no index, model or
  external flow is created. Privileged searches are audited without storing query
  content. Owners, operators and HR agents use the search;
  employees retain their reviewed-knowledge search. People expose recorded names
  and IDs only, with the existing operator projection. Active member IDs/names
  also appear under existing member-directory access; a current reviewed binding
  deduplicates a member and recorded person without name/email inference. Tickets match their native
  ID (the current ticket number), title, readable conversation text and requester
  name. Assets match serial and recorded asset tag. Explicit repair, device-duty
  or recorded asset-ID links let a serial find its tickets; its assigned person
  is found through the recorded custody relationship, never an inferred identity.
  CIs, changes and problems retain existing service/source checks; articles must
  remain reviewed, current and source-readable. Matching normalizes Unicode NFKC,
  case and non-letter/number separators. A normalized phrase substring ranks
  first, followed by all exact query tokens, then all tokens allowing one inserted,
  omitted, substituted or adjacent-transposed character per token of at least
  four characters. Tokens can span readable fields. Queries allow at most 200
  UTF-16 code units; pages contain at most 50 visible matches with the total for
  the selected type, ordered by match rank, type, title and ID. No hidden rows or
  source-list truncation affect that count.

- **DESK-017 — Ticket activity history.** Every ticket, task, change, problem
  and asset shows a chronological, append-only history of each field change
  (state, type, category, priority, group, assignee, custom fields, SLA pauses,
  approvals, links, merges and splits). Each entry records the actor (a person,
  a rule, a scenario, an agent or an integration principal), the time and the
  before and after values, beside each message and notification with its
  delivery state. Agents see the full history within their scope (A1); employees
  see only public events. Erasure anonymizes the actor without removing the
  entry (ERASURE-001), and imported records keep their source history
  (MIGRATE-001 to MIGRATE-003). **Acceptance evidence:** an agent changes a
  ticket's priority from P3 to P2, a scenario (DESK-015) sets its category and a
  routing rule reassigns it; the history shows three entries, each with its
  actor, time and before and after values; the employee's portal view shows only
  the public status change; an imported ServiceNow incident shows its audited
  priority change with the original actor and time.

### Notifications

- **NOTIFY-001 — Default notifications by role and event.** Out of the box:
  agents are notified when a ticket or task is assigned to them or their group,
  when a requester replies, when they are @mentioned, when an SLA is about to
  breach or has breached, and when a ticket is reassigned away; approvers when an
  approval is pending, reminded or delegated to them; requesters when a ticket is
  received (with its reference), publicly updated, waiting on them, resolved
  (with a reopen path) and closed; watchers on public updates; managers on their
  reports' approvals and lifecycle tasks. Each notice goes to the person's
  channel (Slack, Teams, email, mobile push, portal), rapid updates are grouped,
  scope is re-checked at send (A1) and the real delivery state is kept. Agent
  notifications in Slack and Teams carry actions (assign to me, change status,
  add a private note, run a permitted scenario, open in Linen) that re-check the
  agent's current permission and the ticket revision before applying, and each
  action is audited. **Acceptance evidence:** assign a ticket to a three-person
  group and see each member notified in their own channel (one Slack, one Teams,
  one email); a requester reply notifies the assignee; an SLA at 80% of its
  target notifies the assignee and group lead; the requester receives received,
  waiting-on-you and resolved notices; a bounced email shows as failed on the
  ticket. An agent taps "Assign to me" on the Slack notification and the ticket
  is assigned with an audit entry; a second agent's tap on the now-stale
  notification is refused, showing the current assignee; a person outside the
  group who is forwarded the message cannot act on it.

- **NOTIFY-002 — Admin-configured rules, templates and preferences.** Admins edit
  and add notifications per workspace: when to send (event and conditions), who
  receives (roles, groups, record fields, named people) and what it says
  (templates with record placeholders such as `{{ticket.number}}`,
  `{{requester.first_name}}` and `{{sla.due_at}}`, per language under L10N-001,
  with the buyer's logo, colors and sender domain). Each notification is
  mandatory or subscribable. Users manage subscribable notifications per event
  and channel in their preferences; mandatory ones (approval requests,
  waiting-on-you, security and leaver tasks) cannot be turned off. Rule and
  template changes are versioned and audited, with preview and test send.
  **Acceptance evidence:** edit the "resolved" template and see the new text and
  placeholders filled on the next resolution; add a rule that notifies the
  Facilities lead for P1 Facilities tickets and see it fire; a user who opts out
  of "public update" stops receiving it but still receives a mandatory approval
  request; the template change appears in the audit log with before and after.

### Identity and SaaS access

- **ACCESS-001 — Microsoft Entra ID.** Create users, add/remove group
  memberships and licenses, disable accounts and revoke sign-in sessions under
  versioned grants, with independent readback of each effect. Users and groups
  mastered in on-premises Active Directory are handled by ACCESS-010.
  **Acceptance evidence:** in an Entra test tenant, create a user, add a group
  and an E3 license, then disable and revoke sessions; Graph readback confirms
  each; a stale grant is refused at the effect.

- **ACCESS-002 — Okta.** Users, groups, application assignments, lifecycle
  (activate, suspend, deactivate), session clear and factor reset through the
  Okta API, with readback. **Acceptance evidence:** in an Okta developer org,
  assign an app through a group, suspend the user, clear sessions and read back
  each state.

- **ACCESS-003 — Google Workspace.** Users, groups, organisational units,
  licenses, suspend, sign-out, 2SV reset and Drive data transfer through the
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
  period is removed at expiry by a separately authorized operation and verified
  removed; pre-existing access is not removed. **Acceptance evidence:** grant a
  group for two hours, let it expire, read back removal; repeat for a user who
  already had the group and see it kept.

- **ACCESS-007 — Self-service account recovery.** Password reset, MFA/factor
  reset and account unlock from Slack, Teams or the portal through the IdP, after
  identity verification (manager attestation, existing factor, or an identity
  verification partner such as Persona). For an account mastered in on-premises
  Active Directory, the reset (with "must change password at next logon") and
  the unlock run in AD through ACCESS-010 and read back from a domain
  controller; Linen never resets an AD-mastered password through Graph. Secrets
  never appear in chat or logs. **Acceptance evidence:** a locked-out employee
  unlocks through manager attestation; a factor reset requires an existing
  factor; no temporary password appears in the transcript or logs. In a hybrid
  test domain synced to an Entra test tenant, a locked-out AD-mastered employee
  is unlocked through manager attestation and the domain controller reads back
  `lockoutTime` 0; their password reset reads back `pwdLastSet` 0 (must change at
  next logon), and the temporary password is delivered only through the
  attested channel.

- **ACCESS-008 — Application catalog and owners.** A registry of SaaS
  applications with owner, approvers, roles/entitlements, cost per seat in USD,
  connector and data sensitivity; catalog items reference these entitlements.
  **Acceptance evidence:** register Salesforce with two permission sets and an
  owner; a request for the admin set routes to the owner and shows the seat
  cost.
  The current owner manages the registry until an admin role exists; current
  owners and operators read its metadata. Employees see only linked entitlement
  names and seat costs with their billing period. Owner and approver IDs must be
  active members when recorded; approver metadata never confers approval or
  execution rights. A linked catalog item takes its target from the selected
  entitlement. Its existing access-grant and expiry duties route to the recorded
  application owner; manager-required approvals and separate provider grants
  remain mandatory. Each request snapshots its entitlement, owner, registry
  revision and cost; later registry edits affect new requests, while retries
  retain that snapshot. Seat costs are nonnegative integer USD cents
  per month, year or one-time period, without conversion or a charge claim.
  Connector descriptions are recorded metadata, not provider verification;
  ACCESS-005 carries SaaS provisioning. Native restore remaps references without
  activating historical membership or releasing the execution hold; erasure
  anonymizes retained registry/request actors. These authority and visibility
  semantics were approved by ct on 19 October.

- **ACCESS-009 — User access reviews.** Scheduled reviews ask managers or app
  owners to certify each person's entitlements; revocations from the review run
  through connectors with readback, and the signed review record exports as
  SOC 2 / ISO 27001 evidence and to Evidence. **Acceptance evidence:** run a
  quarterly GitHub review, revoke one member from the review, see the readback
  and export the completed review with timestamps and reviewers.

- **ACCESS-010 — On-premises Active Directory (hybrid identity).** For buyers
  whose users and groups are mastered in Windows Server Active Directory and
  synced to Entra ID by Microsoft Entra Connect Sync or Cloud Sync (or to Okta by
  its AD agent), Linen acts on AD through a buyer-hosted, outbound-only relay: a
  signed Windows service on a domain-joined server, the same pattern as
  ASSET-003's discovery runner. The relay opens no inbound port, polls Linen over
  TLS for signed operations, runs them over LDAPS or AD PowerShell with a
  least-privilege delegated service account, and keeps that credential inside
  the buyer's network. Operations:
  - create, enable and disable users, and set attributes (title, department,
    manager, office);
  - add and remove members of security and distribution groups;
  - reset a password with "must change password at next logon", and unlock;
  - move users and groups between OUs (for example to a leavers OU).

  Each operation reads back from a domain controller and, for a synced object,
  again from Entra (or Okta) after the next sync cycle; a delta sync can be
  triggered on the Entra Connect server under its own grant. Before every
  identity operation Linen reads the object's source of authority (Entra
  `onPremisesSyncEnabled`, the Okta profile source, Google Cloud Directory Sync)
  and routes it to AD. A Graph or IdP write against an object mastered
  on-premises is refused before dispatch with the reason. Each relay operation
  carries its grant, operation identity and expiry; the relay rejects expired or
  replayed operations (A2, A3). The relay reports health and version, and when it
  is offline operations stay queued as unknown and are never sent to Graph
  instead. **Acceptance evidence:** in a test domain synced to an Entra test
  tenant: (1) a request for an AD-mastered security group is executed in AD, not
  Graph, and reads back from the domain controller and then from Entra after the
  sync; (2) a locked-out employee is unlocked through ACCESS-007's attestation and
  AD reads back unlocked; (3) a leaver's AD account is disabled and moved to the
  leavers OU, and stays disabled in Entra after the next sync; (4) a Graph write
  attempted against a synced group is refused before dispatch, with the reason;
  (5) with the relay stopped, a group request stays queued as unknown and runs
  once the relay returns; (6) a replayed relay operation is rejected and leaves
  one audit entry.

### Joiners, movers and leavers

- **LIFE-001 — HRIS-triggered lifecycle.** Rippling, Gusto, BambooHR, Workday and
  Willow connectors read new hires, start-date changes, department/title/manager
  changes and terminations (webhook where offered, polling otherwise) and start
  E3 work; the HRIS stays authoritative and Linen never writes employment facts.
  **Acceptance evidence:** in a BambooHR sandbox, add a hire, move their start
  date and terminate another employee; Linen creates, re-dates and starts leave
  plans; repeat the hire and termination paths for Rippling, Gusto, a Workday
  implementation tenant (Workers and Staffing events) and a local Willow
  instance, and see a manager change in each re-point the employee's approvals.

- **LIFE-002 — Dated task plans across teams.** Templates by department,
  location, role and employment type (W-2 employee, 1099 contractor, intern)
  create tasks for IT, HR, the manager and Facilities with due dates relative to
  start or end date and reminders through each owner's channel. **Acceptance
  evidence:** a hire in Sales in Austin starting Monday gets the Sales/Austin
  template; the manager's "buddy assigned" task is reminded in Slack two
  business days before start; a 1099 template omits benefits tasks.

- **LIFE-003 — Birthright access baselines.** Access policies map department,
  title, location and employment type to groups, apps and licenses; a join grants
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
  locks or wipes devices under grant, reclaims licenses and opens a return kit
  shipment; a residual report lists anything not verified. For an identity
  mastered in on-premises Active Directory, the account is disabled in AD through
  ACCESS-010 (and moved to the leavers OU and removed from groups by policy), so
  the next sync cannot re-enable it in the cloud; Entra sessions are revoked
  through Graph without waiting for the sync. **Acceptance evidence:** terminate
  a test user with Okta, Google Workspace, GitHub and a Jamf laptop; every
  revocation reads back; one SaaS failure stays on the residual report and blocks
  "complete". In a hybrid test domain, terminate an AD-mastered user: the domain
  controller reads back the account disabled, Entra sessions read back revoked,
  the account is still disabled in Entra after the next sync cycle, and a
  re-enable at the source (for example a restored AD object) reopens the leaver
  plan.

- **LIFE-006 — Contractors and temporary staff.** Contractor and temp accounts
  carry an end date and sponsor; access expires automatically unless the sponsor
  re-attests before the end date. **Acceptance evidence:** a contractor with an end
  date in three days triggers a sponsor reminder; without re-attestation access is
  removed and verified at the end instant.
  *Today's semantic:* every lifecycle record with an end date names a sponsor, a
  current active member other than the contractor. When the end instant is 72
  hours away or less, the sponsor receives one reminder as a request in their own
  portal queue (email and chat delivery are inherited by NOTIFY-001 before it
  ships). Only the current active sponsor re-attests, choosing any later end
  date; this moves the identity-disable and session-revoke expiry duties, clears
  the reminder so a new one precedes the new end, and is audited. If the sponsor
  is no longer an active member, the reminder goes to the owner, labelled
  "Sponsor left; owner to reassign or re-attest", and the owner (acting for
  "admin") may re-attest or name a new sponsor, who is then reminded afresh. Without
  re-attestation the account disable starts at the end instant and session
  revocation follows once the disable is independently verified (both act on the
  same account, through their bound provider grants); once either duty has
  started, the end date cannot be re-attested.

- **LIFE-007 — Lifecycle evidence pack.** For each join, move and leave, an
  exportable record shows what was granted or revoked, when, by which authority,
  and how it was verified, for audit, legal hold and SOC 2. **Acceptance
  evidence:** export a leaver pack and see every effect with timestamp, grant and
  verification, and outstanding duties.

### Assets, devices and licenses

- **ASSET-001 — MDM sync.** Jamf Pro, Microsoft Intune and Kandji connectors sync
  devices (serial, model, OS, encryption, compliance, last check-in, assigned
  user) and each device's installed applications (title, version, bundle or
  product ID, install source and last seen) on a schedule with freshness,
  matching to Linen assets by serial. **Acceptance evidence:** sync a Jamf, an
  Intune and a Kandji sandbox; see devices matched by serial, a stale device
  marked stale, a serial conflict surfaced, and each device's installed
  applications with versions; an app removed on the device disappears from its
  list on the next sync.

- **ASSET-002 — Device actions under grant.** Lock, wipe, restart, rename, push or
  remove an app, and retire through the MDM, each with a grant, a confirmation
  for destructive actions and readback of the command result. An app push or
  removal is verified by the device's next installed-application inventory
  (ASSET-001), not by the MDM accepting the command. **Acceptance evidence:**
  lock a test Mac in Jamf through a leaver plan; the lock command's completion
  reads back; a wipe without its grant is refused; push an app to a test Mac and
  see it stay unverified until the inventory shows it.

- **ASSET-003 — Discovery and reconciliation.** Assets are discovered from MDM,
  IdP device lists, EDR (CrowdStrike Falcon, SentinelOne), Google endpoint
  management, cloud accounts (AWS, Azure, Google Cloud) and an optional
  buyer-hosted network discovery runner; duplicates reconcile by serial and
  hardware IDs, and unknown devices are flagged for review. **Acceptance
  evidence:** discover the same laptop from Intune and CrowdStrike and see one
  asset; an unmanaged device seen only by EDR is flagged; connect an AWS account
  through a read-only IAM role and an Azure subscription through a reader service
  principal, see EC2 instances and Azure VMs appear as CIs with account, region
  and owner tag, and see an instance terminated in AWS marked retired on the next
  run.

- **ASSET-004 — Hardware lifecycle and custody.** Procure, receive, assign, loan,
  repair, return, retire and dispose with serial-level history and attributed
  receipts. A disposal records the ITAD partner's certificate as a persisted
  HTTPS reference to the partner's actual certificate document, stored with the
  partner, standard (R2v3 or e-Stewards), operator and disposal timestamp. Linen
  does not retain the original document bytes unless uploaded, never infers that
  the partner is certified and never claims the document was independently
  validated. Disposal is refused while the device is still assigned to someone,
  including when it is in repair.
  **Acceptance evidence:** run a laptop through assign, repair, return and
  dispose; disposal requires the persisted HTTPS reference to the partner's
  actual certificate document, with partner, R2v3 or e-Stewards standard, operator
  and disposal timestamp retained after reopening. Refuse disposal while the
  device is assigned, including during repair, and refuse a missing reference.
  Confirm the reference alone retains no original document bytes, an uploaded
  document retains its bytes, and neither view claims partner certification or
  independent document validation.

- **ASSET-005 — Stock rooms and reorder.** Stock locations hold counted devices
  and accessories with reorder thresholds; reaching a threshold raises a purchase
  request to Purse or the buyer's vendor (CDW, Apple Business, Dell).
  **Acceptance evidence:** allocate the last two spare monitors in Denver; the
  threshold raises a purchase request with quantity and USD estimate.

- **ASSET-006 — Software license management and compliance.** SaaS and desktop
  licenses, seats, contracts and true-ups with renewal reminders at 90, 60 and 30
  days in USD. SaaS usage comes from IdP sign-in data and SaaS admin APIs.
  Desktop installations come from ASSET-001's installed-application inventory,
  normalized to a software title and publisher (e.g. Adobe Acrobat Pro,
  Microsoft Visio, JetBrains IntelliJ IDEA) and compared with entitlements by
  license metric (per device, per user or concurrent), showing over- and
  under-licensed counts. Admins mark titles managed, ignored or prohibited; a
  prohibited or unlicensed installation opens work with the device's user and
  the title's owner, and removal runs as an MDM app removal under grant
  (ASSET-002) and is verified by the next inventory. Unused seats are proposed for
  reclamation and reclaimed under the owner's grant with readback. **Acceptance
  evidence:** a Zoom contract with 120 seats and 95 active users shows 25
  reclaimable; reclaim 10 with the owner's approval and read back seat counts;
  the renewal reminder fires at 90 days. Jamf and Intune report Acrobat Pro on 30
  devices against 25 licenses, and Linen shows 5 over-licensed; a prohibited
  title on one Mac is flagged and its user notified; its removal through Jamf
  under grant reads back as absent on the next inventory.

- **ASSET-007 — Contracts, warranties and vendors.** Purchase records, leases,
  warranties (with manufacturer warranty lookup where available) and support
  contracts link to assets and vendors with expiry alerts. Where a manufacturer
  offers an API the customer can authorize (for example Dell or Lenovo partner
  access), coverage is fetched and labelled verified by the manufacturer; otherwise
  Linen offers the official manufacturer serial-check link with the recorded
  serial and user-recorded coverage/source, never labelled manufacturer-verified. **Acceptance
  evidence:** attach an AppleCare warranty to a MacBook and see a repair ticket
  show coverage and the expiry alert.

- **ASSET-008 — Asset financials.** Purchase cost, depreciation (straight-line or
  declining balance), book value, cost center and fiscal-year reporting in USD,
  exportable to Pantry, QuickBooks Online or NetSuite as CSV or API.
  **Acceptance evidence:** a $2,400 laptop over 36 months straight-line shows
  book value at month 12; export the fiscal-year schedule as CSV.
  Accounting semantics: costs are integer USD cents; straight-line rounds
  cumulative expense to the nearest cent. Declining balance uses twice the
  monthly straight-line rate on the opening book value, rounded to cents; the
  remaining balance is expensed in the final month, with zero salvage value.
  Postings occur on each completed UTC calendar-month anniversary of the
  in-service date, clamped to month end without drifting later anniversaries.
  Fiscal years start on a selected month's first day (inclusive) and end at the
  next year's start (exclusive). The CSV downloads the schedule for import into
  the named accounting products; a download does not claim a provider import.

- **ASSET-009 — CMDB and service dependencies.** Configuration items for
  hardware, software, SaaS apps, business services and cloud resources with
  typed relationships, provenance and freshness; incidents and changes show
  upstream/downstream impact. **Acceptance evidence:** relate "Payroll" to Gusto
  and to the SSO service; a change to SSO shows Payroll as impacted; a stale
  relationship is marked stale.
  Configuration item types are hardware, software, SaaS app, business service
  and cloud resource; existing service records are business services. Facts are
  labeled observed, asserted or inferred. Relationships point from dependent to
  dependency: `depends_on`, `hosted_on`, `runs_on` and `uses` contribute to impact;
  `connects_to` records a non-dependency connection. Upstream means dependencies,
  downstream means dependents, transitively, within the reader's existing scope.
  Freshness is inclusive from observed time through observed time plus the
  recorded millisecond window; a future observation is not fresh. Stale,
  conflicting or not-yet-effective relationships yield uncertain possible impact.
  An absent relationship is unknown; inferred impact does not establish an outage.

- **ASSET-010 — Physical audits.** Asset audits by location using the mobile app
  to scan tags, with expected-vs-found reconciliation and missing-device follow
  up. **Acceptance evidence:** audit the Denver stock room; scan 18 of 20
  expected devices; two missing devices open follow-up tasks.

- **ASSET-011 — Hardware requests and device swaps for existing employees.**
  Replacement of a broken or aging device, loaners, peripherals (monitor, dock,
  headset) and refresh upgrades run one chain:
  1. eligibility and approval (CATALOG-002, with the refresh-age policy);
  2. allocation from stock (ASSET-005) or an order to the vendor;
  3. zero-touch enrollment assigned to the employee (Apple Business Manager with
     Jamf or Kandji; Windows Autopilot with Intune), read back from the MDM;
  4. shipment to the employee's US address through the logistics partner
     (Firstbase, GroWrk) with carrier tracking and delivered state, or desk
     pick-up with an attributed receipt;
  5. receipt confirmed by the employee or by their first sign-in on the new
     device (AGENT-003);
  6. a return kit for the old device;
  7. wipe or retire of the old device under its own grant (ASSET-002) once
     received, or remotely if it cannot be returned;
  8. a custody swap that closes only when the new device is assigned and the old
     one is received and wiped with readback, or written off by its owner with a
     reason.

  Loaners carry a due-back date with reminders; warranty coverage (ASSET-007)
  routes repairs to Apple or Dell. **Acceptance evidence:** a remote employee
  reports a broken MacBook in Slack; a replacement is allocated from Denver stock,
  appears assigned to them in Jamf through ABM, ships with a tracking number and
  reaches delivered; their first sign-in on the new Mac closes the replacement
  duty; the old Mac's return stays an open custody duty after the new one
  arrives, and the ticket cannot show complete until the old Mac is received and
  the Jamf wipe reads back; a loaner past its due date reminds the borrower and
  the IT owner.

### Incidents and problems

- **INC-001 — Major incidents.** Declare a major incident, assign an incident
  commander, open a Slack or Teams war room, page responders through Oncall,
  PagerDuty or Opsgenie, and keep a timeline and update cadence. **Acceptance
  evidence:** declare a P1 for SSO; a Slack channel opens, Oncall is paged, the
  commander is recorded, and a missed update cadence prompts the commander.

- **INC-002 — Monitoring and alert intake.** Signed events from Uptime, Datadog,
  PagerDuty, Spool and a generic signed webhook open or update incidents with
  deduplication and freshness, carrying the monitored CI or service so changes
  and problems can link to them; a P1 event pages through Oncall, PagerDuty or
  Opsgenie (INC-001); missing data stays unknown. **Acceptance evidence:** send a
  Datadog alert twice and an Uptime recovery; see one incident, the duplicate
  ignored, and recovery recorded without closing employee tickets; an Uptime
  check failure on the SSO service opens an incident tagged with that service
  and pages its Oncall rotation.

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
  Detection runs with scheduled service work and on demand, using explicit
  recorded service IDs, device-model and app labels from tickets and monitoring
  context. It does not infer a common cause from a matching label. Each facet
  and cohort or location is a separate cluster; untagged sources have their own
  bucket. Labels use Unicode NFKC, collapsed whitespace and case-insensitive
  comparison; service IDs remain exact opaque identities. The default is three
  distinct sources recorded within the trailing 30 elapsed days, inclusive of
  both bounds; canceled tickets are excluded. The detection API may choose
  2–1,000 sources and a positive window of at most 365 days. A monitoring event's
  derived incident counts once, rather than also counting its observation log.
  Decisions retain the actor, reason and timestamp. Accepting creates one native
  problem with links to all evidence, leaves the cause unknown and does not
  resolve any source ticket. Rejected and accepted semantic clusters stay
  decided across later sources, rolling windows, restart and native restore.
  Under the ct-approved aggregation rule (19 October 2026), normal-source
  proposals use existing operator visibility. Restricted sources are clustered
  separately by their source audience; their proposal and accepted problem are
  visible only to the detecting owner, with no inferred participants. Every
  read rechecks every underlying ticket, alert and service; an inaccessible
  source hides the whole cluster and its count. Accepted problems inherit the
  proposal's owner and visibility. Source evidence stores references rather
  than copied conversations.

### Change management

- **CHANGE-001 — Change types and templates.** Standard (pre-approved, catalog-
  driven), normal and emergency changes, with templates carrying implementation,
  test and backout plans. **Acceptance evidence:** raise a standard change from
  the catalog and see it skip CAB; raise an emergency change and see the ECAB
  path.
  The current owner manages versioned templates and explicitly preapproves an
  exact version with a reason. Standard catalog creation copies that version's
  implementation, test, backout and affected-scope snapshot and records CAB
  bypass; it creates no provider grant. Existing execution grants are bound
  separately and checked at each effect. Normal changes need a recorded decision;
  emergency changes use an explicit ECAB decision by a current owner or approver.
  No meeting, vote or quorum is claimed: CHANGE-003 carries the complete board,
  quorum and channel requirements before those capabilities ship. Template edits
  and deactivation prevent new catalog use until the current version is approved
  and active; exact in-flight snapshots keep their recorded bypass. The owner may
  explicitly withdraw a recorded approval ID with a reason, which fences affected
  in-flight changes at effects. Amending a change's implementation clears bypass
  and authorization and returns it to normal review. Restore makes templates
  inactive with no live approval and clears imported change bypass/authority;
  affected personal-data erasure also withdraws live template approval. Freeze
  bypass remains the separate owner-only authority in CHANGE-004. These semantics
  were approved by ct on 19 October, including retained snapshots at 11:47Z.

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
  Only the current owner manages freeze and maintenance windows. A window may
  name CIs or cover the workspace; its bounds are UTC instants, inclusive at the
  start and exclusive at the end. Calendar range filtering uses the same overlap
  rule, with dates displayed in the selected IANA time zone. Draft changes remain
  possible and their overlaps are shown; existing dispatch conflict checks still
  refuse conflicting admitted changes. An active freeze refuses a new schedule,
  implementation edit or dispatch that overlaps a covered CI. Bypass requires an
  owner-recorded emergency flag and reason, with that owner's membership still
  current; a submitted actor ID or an operator's emergency flag grants nothing.
  This authorizes scheduling only: execution keeps its separate versioned grants
  and change approvals, and compensation keeps its existing separate grant.
  Database admission and effect-time checks fence a freeze added after planning.
  Reads and the ICS download require a session and inherit current record scope;
  inaccessible conflicts produce one generic warning per visible affected change,
  without exposing the hidden record or its count. Privileged reads/exports are
  audited. Inactive restored windows require explicit current-owner reactivation;
  restored changes retain no emergency scheduling authority. Person erasure
  preserves typed calendar policy (kind, bounds, CIs and active state) while
  pseudonymizing owner/audit actors and scrubbing title/adoption free text; it
  never withdraws a business freeze. ICS uses stable
  workspace/record UIDs and revision sequences, UTC seconds (start rounded down,
  end rounded up to enclose the exact interval), escaped/folded text and tentative
  planned events, with cancelled changes marked cancelled. Inactive windows do
  not enter the feed. Calendar entries never claim provider execution.

- **CHANGE-005 — Rollback, change-caused incidents and post-implementation review.**
  Backout runs under its own grant with readback. Each change names the
  CIs and services it touches and the health checks that watch them (Uptime
  checks, Datadog monitors or other INC-002 sources). From implementation start
  through a declared observation window (24 hours by default), an incident opened
  or paged through Oncall, PagerDuty or Opsgenie on an impacted CI or service
  links to the change automatically as a suspected cause, which a human confirms
  or rejects ("caused by change"). A change cannot be recorded successful while
  a watching check is failing or unknown or a suspected-cause incident is
  unreviewed, and is recorded successful only after its checks stay healthy for
  the window. A post-implementation review closes the change, citing the health
  evidence, linked incidents and backout outcome. **Acceptance evidence:**
  implement a change on the SSO service, which an Uptime HTTPS check watches; the
  check fails and Uptime's signed event opens an incident and pages through
  Oncall; the incident links to the change as suspected cause with no manual
  entry; marking the change successful is refused while the check is red;
  backout runs under its own grant and reads back; after the check recovers and
  stays green for the window, the PIR cites the Uptime failure and recovery
  events and the Oncall incident, and REPORT-005 counts the change as failed with
  one change-caused incident.

- **CHANGE-006 — Development-tool context.** Changes link to GitHub pull requests
  and deployments, GitHub Actions runs, and Jira or Vector issues; a deployment
  can raise a standard change automatically. **Acceptance evidence:** a GitHub
  deployment to production creates a standard change linked to its PR and run.

- **CHANGE-007 — Release management.** Releases group related changes (e.g. "Okta
  MFA rollout") with a plan, build/test/deploy phases, a release calendar shared
  with CHANGE-004, a go/no-go decision by named approvers, linked tickets,
  problems and CIs, and release notes to affected employees through CHANNEL-008's
  notices. A release completes only when every change in it is successful or
  explicitly backed out. **Acceptance evidence:** create a release with three
  changes, record go/no-go approval, deploy canary then rollout, post release
  notes to the affected cohort only, and see a failed change hold the release
  open until it is backed out.

### IT projects

- **PROJECT-001 — IT team projects.** Projects such as an office move, a laptop
  refresh or an SSO migration have tasks, milestones, owners, due dates,
  dependencies and status, link to tickets, changes, assets and lifecycle plans,
  and show as a board and a timeline; each agent's workload shows project tasks
  beside ticket load. Software delivery projects stay in Vector or Jira, and
  cross-functional business projects stay in the buyer's work-management tool.
  **Acceptance evidence:** create "Denver office move" with 12 tasks across two
  milestones, link 30 asset relocations and two changes, see a blocked dependency
  flagged on the timeline, and see an agent's workload combine project tasks and
  tickets.

### Knowledge

- **KB-001 — Knowledge base.** Articles with authoring, review, versions,
  audience scoping, expiry and escalation to a request (E7). **Acceptance
  evidence:** as in E7, plus an expired article disappears from employee search.

- **KB-002 — Federated knowledge sources.** Permission-aware search and
  answering over Confluence, Slate, Google Drive, SharePoint and Notion, without
  exposing content the employee cannot open in the source. **Acceptance
  evidence:** connect Confluence and Google Drive; an employee's answer cites a
  page they can open and omits one they cannot; repeat with a SharePoint site, a
  Notion workspace and a local Slate instance, each with one restricted page that
  never appears.

- **KB-003 — Deflection with verified outcome.** The portal, Slack and Teams
  suggest articles and actions before a ticket is filed; deflection is counted
  only when the employee confirms or later evidence shows the issue resolved.
  **Acceptance evidence:** a "how do I connect to VPN" question is answered with
  an article; the employee confirms; a second employee who files a ticket anyway
  is not counted as deflected.
  *Today's semantic:* a request a person sends for themselves from the portal is
  first matched against current reviewed articles they may read. An article is
  offered when at least half (rounded up) of the question's content words
  (normalized tokens of three or more characters, excluding common English
  function words) appear in its title and body, with at least one in its title;
  at most three are offered, by words matched then recency. A suggestion records
  the asker, the offered article revisions and the outcome, never the question
  text. Today the only evidence that the issue is resolved is the asker's own
  confirmation of an offered article that is still current and readable; a
  request filed from that question, even after a confirmation, is never a
  deflection, and an unanswered suggestion is not counted. The work report shows
  offered, deflected, filed-after-suggestion and unanswered counts as aggregates
  only. No self-service action resolves an issue without a request today (catalog
  services are fulfilled through one), so there is no action to suggest yet.
  CHANNEL-001 (Slack) and CHANNEL-002 (Teams) inherit this suggestion and count
  before they ship; ACCESS-007 and CATALOG-001 inherit it for any self-service
  action they add; and any later resolution evidence (such as a verified
  execution outcome, AGENT-003) inherits the rule that only a resolved issue
  counts.

- **KB-004 — Articles from resolved work.** Linen drafts articles from resolved
  tickets and known errors with source links; a reviewer publishes or rejects.
  **Acceptance evidence:** resolve three similar tickets; a draft article appears
  with the three sources; publishing requires a reviewer.
  Opening Knowledge discovers local candidates without a model call. Ticket
  candidates require at least three resolved, normal-sensitivity tickets with
  matching recorded context and cohort: use the first present app, service ID,
  device model, then ticket title; normalize app/model/title and cohort words;
  a candidate retains up to 30 complete public-message sources. Reviewed,
  nonrestricted known errors can also supply a candidate. Private notes and
  attachments never enter generation. A current owner or service operator
  explicitly generates through a configured model and budget, then reviews and
  publishes or rejects; the reviewer may be the initiator. Every source must be
  cited. Repeated discovery preserves the group's rejection or publication.
  Draft reads, generation, publication and published-article reads recheck every
  source and its current audience; reopened, changed, erased or inaccessible
  sources withdraw the affected guidance. Source links remain structured through
  native restore, which never resumes an old model call. Erasure removes derived
  text and source snapshots, including article versions, while retaining an
  opaque suppression key. These audience and reviewer rules were approved by ct
  on 19 October.
  DESK-008 also checks the requester's and beneficiary's current readership before
  and after using a generated article in a shared reply; a pending beneficiary
  prevents that use. A reviewer publishing an article does not grant its sources
  to a reply recipient.

- **KB-005 — Article feedback, attachments and templates.** Employees rate
  articles helpful or not helpful, with an optional comment, from the portal,
  Slack and Teams; negative feedback opens a review task for the article's owner
  and each article shows its helpfulness score. Articles carry attachments and
  inline images scoped like the article. Article templates (how-to,
  troubleshooting, known error) structure new articles. **Acceptance evidence:**
  mark an article not helpful with a comment in Slack and see a review task for
  its owner and the updated score; attach a PDF to a scoped article and see an
  employee outside its audience denied the file; create an article from the
  troubleshooting template with its sections pre-filled.

### Reporting

- **REPORT-001 — Service desk dashboards.** Volume, backlog, SLA attainment,
  first-response and resolution time, reopen rate, first-contact resolution,
  CSAT, approval wait and lifecycle completion by group, agent, category and
  channel, with definitions, range and time zone. Imported history (MIGRATE-001
  to MIGRATE-003) is reported with its original timestamps and SLA outcomes,
  labeled imported, so trends run across the cutover. **Acceptance evidence:**
  read the dashboard for last month in `America/Los_Angeles`; each tile states
  its definition and denominator and matches the underlying tickets; after a
  ServiceNow import, last year's SLA attainment by priority, computed from the
  imported `task_sla` history, matches the source instance's figure, and the
  MTTR trend runs unbroken across the cutover month.

- **REPORT-002 — Custom and scheduled reports.** A report builder over tickets,
  assets, changes and lifecycle, saved and shared, scheduled by email or Slack,
  and exportable as CSV and XLSX. **Acceptance evidence:** build "P1 by
  location", schedule it weekly to Slack, and export CSV that matches the view.

- **REPORT-003 — Data access for BI.** A read API and scheduled exports (CSV or
  Parquet to Amazon S3, Google Cloud Storage or Azure Blob, and direct loads to
  Snowflake and BigQuery) for Power BI, Looker Studio and warehouses, honoring
  the reader's scope. **Acceptance evidence:** pull tickets through the read API
  as an auditor and see restricted HR tickets excluded; schedule a nightly
  incremental export to an S3 bucket and see the next run deliver only changed
  rows, under the export principal's scope, with a delivery receipt.

- **REPORT-004 — Human work saved.** Per request type, touches and active minutes
  of employees, agents, approvers and vendors before and after automation, with
  model, provider and labor cost in USD per verified outcome, reported beside
  unresolved and failed work rather than tickets closed. **Acceptance evidence:**
  automate a request type; the report shows prior and current touches/minutes,
  cost per verified outcome and the failures in the same period.
  Cost semantics: the owner chooses a baseline window (before automation) and a
  current window, half-open `[from,to)` and non-overlapping; Linen does not infer
  when automation started. Touches and active minutes are DESK-012's recorded
  human effort by effort role (employee, agent, approver, owner, vendor,
  technician); machine runtime is never human work. Labor USD is active minutes
  / 60 × the owner-declared USD-per-hour rate for the role (cent precision),
  using the current rates in both windows; only the owner declares rates, and
  the existing report audience (owner, operator, auditor; normal-sensitivity
  requests) reads them. Model USD is the configured-price estimate of model
  calls that named the request (classification, reply/summary, employee
  intake); a dispatched call without usage is an unknown charge. Linen receives
  no provider invoice, so every provider dispatch is an unknown charge, never
  $0. Known cost per verified outcome is the known USD of all work of the type
  in the window, failed and pending included, divided by the requests whose
  every duty was independently verified; it is labelled known cost only
  whenever a role is unpriced or any charge is unknown, and closure never counts
  as an outcome. A future clause that adds a model purpose, provider or human
  door that serves a request (CHANNEL-001..008, ACCESS-002..010, AGENT-001)
  attributes its calls, charges and touches to that request before it ships.

- **REPORT-005 — IT operations and asset KPIs.** Incident MTTA and MTTR by
  priority and service, major-incident count and duration, change success rate,
  emergency-change share, change-caused incident rate, problem backlog and age,
  known errors without a permanent fix, assets by state and age, devices out of
  compliance, license utilization and spend in USD, and upcoming renewals and
  refreshes, each with definition, range, time zone and drill-through to its
  records. **Acceptance evidence:** for a month in `America/Denver` with 40
  incidents, 25 changes (2 failed, 3 emergency) and 300 assets, the KPI page shows
  MTTA and MTTR by priority, a 92% change success rate and a 12% emergency share,
  and each tile drills through to the records it counts.

### Platform, administration and integration

- **ROLE-001 — Roles and permissions.** Requester, agent, group lead, approver,
  workspace admin, HR, owner, auditor and integration roles, with custom roles
  scoped per department workspace; approvers and requesters need no agent seat.
  **Acceptance evidence:** a custom "Facilities agent" role reads Facilities
  tickets only; an approver approves without agent access.

- **SSO-001 — Sign-in, SSO and SCIM.** Base email sign-in, SAML 2.0 and OIDC SSO
  with Okta, Entra, Google and Auth, SCIM provisioning of requesters and agents,
  and MFA enforcement (Linen's own second factor for email sign-in, and a
  required MFA claim in SSO assertions for agent and admin roles); SSO never
  grants roles by itself. **Acceptance evidence:** sign in through Okta SAML; a
  SCIM-deprovisioned user loses access; an SSO user without membership is
  refused; with MFA required for agents, an agent signing in by email is
  challenged for a second factor, and an SSO assertion without an MFA
  authentication-method claim is refused for the agent role.

- **AUDIT-001 — Audit log.** Privileged reads, exports, configuration, grant,
  role and executor actions are recorded durably with actor and time, readable by
  auditors and exportable; erasure anonymizes without breaking the record.
  **Acceptance evidence:** change a grant and export data; the auditor reads both
  entries; erase the actor's personal data and the entries remain anonymized.

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

- **ERASURE-001 — Authorized erasure.** Owner/HR erasure removes a person's
  content and attachments while keeping anonymized work, effect and audit
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

- **L10N-001 — US English and Spanish for employees.** The portal, Slack and Teams
  messages, notifications, catalog labels, surveys and the assistant work in US
  English and US Spanish, chosen from the IdP or HRIS locale or the employee's
  preference. Admins provide Spanish catalog items, templates and articles, and
  the assistant drafts translations for review. Agents see each employee message
  with a translation, and replies to a Spanish-speaking employee are sent in
  Spanish, marked as machine-translated where they are. **Acceptance evidence:**
  an employee with locale `es-US` sees the portal and Slack messages in Spanish
  and submits an item with Spanish labels; the agent sees the message and its
  translation, replies in English, and the employee receives it in Spanish marked
  as translated; an article with no Spanish version shows in English with a
  notice.

- **SANDBOX-001 — Sub-production workspace and configuration promotion.** Owners
  create a sandbox workspace from production configuration, without production
  personal data unless explicitly chosen and masked. Catalog items, forms,
  workflows, SLAs, notification rules, scenarios, roles and connector
  configuration (with sandbox credentials) are changed and tested there. A
  promotion package lists every configuration difference, is reviewed and
  approved, and applies to production as one versioned, audited change with
  rollback to the prior version. Promotion never copies grants, secrets or
  records. **Acceptance evidence:** create a sandbox, edit a catalog item and a
  workflow there, review the diff, promote it with approval, and see production
  updated with an audit entry while in-flight requests keep their versions; roll
  back; production grants and secrets are unchanged, and sandbox connectors call
  only sandbox credentials.

### Migration and coexistence

- **MIGRATE-001 — Freshservice migration.** Through the Freshservice API, move
  tickets of every type (incidents, service requests, problems, changes),
  public and private conversations, attachments, requesters, agents, groups and
  departments, assets with relationships and software, catalog items with
  approval history (as history), knowledge solutions, SLA policies and business
  hours, canned responses, and workflows as reviewed drafts, with dry run, counts
  and resumable apply at full account size. Full account size means at least
  50,000 tickets with attachments, completed within 24 hours while staying under
  the plan's per-minute API limit (honoring 429 and `Retry-After`); the run
  reports throughput and estimated time remaining. After the bulk pass, delta
  passes (tickets listed with `updated_since` at the last checkpoint, then their
  conversations and attachments) keep the copies current until cutover
  (MIGRATE-005). **Acceptance evidence:**
  migrate a Freshservice trial with 5,000 tickets, 300 assets and 40 catalog
  items; the dry run reports counts and gaps, apply resumes after interruption,
  and attachments and private notes match by hash and visibility; a scale run on
  an account seeded with 50,000 tickets with attachments completes within 24
  hours with no request rejected for exceeding the rate limit.

- **MIGRATE-002 — Jira Service Management migration.** Through the Jira Cloud
  REST API, the JSM Service Desk API, the Assets REST API and the Confluence REST
  API, move:
  - issues of every request type (incidents, service requests, problems,
    changes, post-incident reviews) with keys, status and resolution history,
    priority, components, labels, custom fields, linked issues and sub-tasks;
  - comments, internal ones (`jsdPublic: false`) as private notes and public ones
    as replies, each with its original author and created timestamp;
  - attachments, matched by name, size and SHA-256;
  - customers, organizations, agents and teams;
  - request types with their fields and portal groups as draft catalog items,
    and each issue's request-type field values;
  - approval history, as history only (A6);
  - SLA definitions with their calendars as draft SLA policies, and each issue's
    SLA cycles with met or breached state;
  - queues as saved views;
  - Assets object schemas, object types, attributes and objects with references
    as CI types, CIs and relationships, keeping each issue's object links;
  - linked Confluence knowledge-base spaces as articles with attachments and with
    space restrictions mapped to audiences, or as a federated source (KB-002)
    when the buyer keeps Confluence;
  - each issue's changelog (status, priority, assignee and field changes) as
    activity history (DESK-017);
  - automation rules, listed as drafts for review and never executed.

  A dry run reports counts per record class, unmappable fields, missing
  references and estimated duration. Apply resumes from a checkpoint after
  interruption without duplicates and honors Atlassian rate limits
  (`Retry-After`); a site of at least 50,000 issues with attachments completes
  within 48 hours. After the bulk pass, incremental delta passes run on a
  schedule until cutover: issues found by JQL `updated >= "<checkpoint>"`
  ordered by `updated` (with an overlap window for clock skew), then each changed
  issue's new comments, attachments, changelog entries and SLA cycles; Assets
  objects by an AQL `Updated >=` query; Confluence pages by CQL `lastmodified >=`.
  Deltas apply idempotently by issue and comment ID, so nothing is duplicated,
  and an issue deleted at the source is flagged for reconciliation, never
  silently removed. **Acceptance evidence:** migrate a JSM Cloud test site: the
  dry run lists counts and gaps; an interrupted apply resumes without duplicates
  and per-class counts match the dry run; every attachment matches by SHA-256;
  internal comments are private and public comments public, each with its
  original author and timestamp; a request type with four fields becomes a draft
  catalog item and each imported issue shows its field values; an Assets schema
  becomes CI types with relationships and issue links kept; a breached SLA cycle
  shows as breached; a linked Confluence KB space's articles arrive with
  attachments and a group-restricted article stays restricted; a scale run on a
  site seeded with 50,000 issues with attachments completes within 48 hours.

- **MIGRATE-003 — ServiceNow migration.** Through the Table API and Attachment API
  with a read-only integration account, move:
  - task records: `incident`, `sc_request`, `sc_req_item`, `sc_task`, `problem`,
    `problem_task`, `change_request` and `change_task`, keeping numbers, states,
    priority, assignment group, assignee, CI, dates and parent links;
  - journal history from `sys_journal_field`, joined by `element_id`, with
    `comments` becoming public replies and `work_notes` private notes, each with
    its original author and `sys_created_on` timestamp;
  - attachments from `sys_attachment`, downloaded one file at a time through the
    Attachment API and matched by name, content type, size and SHA-256;
  - people and structure: `sys_user`, `sys_user_group`, `sys_user_grmember`,
    `cmn_department`, `cmn_location` and vendors from `core_company`;
  - the catalog: `sc_cat_item` and `sc_category` with variables and variable sets
    (`item_option_new`, `io_set_item` and their choices) as draft catalog items
    with fields and the conditions Linen can express, and each requested item's
    variable values (`sc_item_option_mtom`);
  - approvals from `sysapproval_approver`, as history only (A6);
  - SLAs: `contract_sla` definitions with `cmn_schedule` business schedules and
    holidays as draft SLA policies, and `task_sla` history with met or breached
    state;
  - assets and the CMDB: `alm_asset`/`alm_hardware` with cost, state and
    substate, stockroom (`alm_stockroom`), assigned user and warranty; and
    `cmdb_ci` with its subclasses and `cmdb_rel_ci`, keeping each asset's link to
    its CI;
  - software entitlements from `alm_license`, with their user and device
    allocations (`alm_entitlement_user`, `alm_entitlement_asset`), as ASSET-006
    licenses with assigned seats;
  - field history from `sys_audit`, where the table is audited, as activity
    history (DESK-017) with the original actor and time;
  - knowledge: `kb_knowledge` with knowledge bases, categories, versions where
    present and article attachments;
  - workflows, flows and business rules, listed as drafts for review and never
    executed.

  A dry run reports counts per table, unmappable fields, missing references and
  estimated duration. Apply resumes from a checkpoint after interruption without
  duplicates and stays within the instance's rate-limit rules (honoring 429 and
  `Retry-After`); an instance of at least 50,000 tickets with attachments and
  journals completes within 48 hours. After the bulk pass, incremental delta
  passes run on a schedule until cutover. Each pass re-reads every migrated table
  for rows whose `sys_updated_on` is at or after the last checkpoint
  (`sysparm_query=sys_updated_on>=<checkpoint>^ORDERBYsys_updated_on`, with an
  overlap window for clock skew), including new `sys_journal_field`,
  `sys_attachment` and `task_sla` rows, and applies them idempotently by
  `sys_id`, so nothing is duplicated. Records deleted at the source (seen in
  `sys_audit_delete` where recorded, or missing from a keyed recount) are flagged
  for reconciliation, never silently removed. Imported history keeps its
  original timestamps and SLA outcomes and is reportable, labeled imported
  (REPORT-001). **Acceptance evidence:** migrate a
  ServiceNow personal developer instance seeded with incidents, requested items
  with variables, catalog tasks, changes with change tasks, problems, groups,
  `alm_hardware` assets linked to CIs, a contract SLA and KB articles: the dry run
  lists counts per table and gaps; an interrupted apply resumes without
  duplicates and per-table counts match the dry run; every attachment matches by
  SHA-256; work notes are private and comments public, each with its original
  author and timestamp; an `sc_cat_item` with three variables becomes a draft
  catalog item with three fields and each imported request shows its values;
  `sysapproval_approver` rows appear as history and confer no approval; a
  hardware asset keeps its cost, stockroom, assigned user and CI link; an
  `alm_license` entitlement with 25 rights and 20 user allocations becomes an
  ASSET-006 license with 25 seats, 20 of them assigned to the same people; an
  audited priority change appears in the incident's activity history with its
  original actor and time; last year's P1 SLA attainment read in REPORT-001 from
  the imported `task_sla` rows matches the instance's own figure for the same
  range; a scale run on an instance seeded with 50,000 tickets with attachments
  completes within 48 hours within the instance's rate limits.

- **MIGRATE-004 — Spreadsheet and lightweight-tool move-in.** CSV imports for
  tickets, people and assets, and importers for Zendesk (when used for IT) and
  Snipe-IT asset inventories. **Acceptance evidence:** import a Snipe-IT export
  of 500 assets; serial conflicts are reported in the dry run and resolved
  before apply.

- **MIGRATE-005 — Coexistence and cutover.** Linen runs alongside Freshservice,
  Jira Service Management or ServiceNow while the desk keeps working in the
  incumbent:
  1. the delta passes of MIGRATE-001, MIGRATE-002 and MIGRATE-003 keep Linen's
     copies current, each pass reporting what changed since the last;
  2. ownership is per ticket, with one executor per resource, so a ticket owned
     by the incumbent is read-only in Linen and the reverse;
  3. cutover is fenced: the owner declares a freeze, a final delta runs under the
     fence, and every open ticket's ownership moves to Linen only when that delta
     is current and no effect or source record is unreconciled (A6);
  4. after cutover Linen keeps reading the source for a declared period (30 days
     by default). Late arrivals there, such as an email reply to an old
     ServiceNow notification appended as a comment, a comment on a JSM issue or a
     new ticket raised in the incumbent, go to reconciliation on the matching
     Linen ticket by source key and are never dropped or applied as a new effect.

  **Acceptance evidence:** for each of a ServiceNow personal developer instance
  and a JSM Cloud test site: (1) run the bulk import; (2) add a work note, a
  public comment and an attachment to three open tickets in the source, and close
  a fourth; (3) run the delta, and exactly those changes arrive with their
  visibility, the fourth ticket closes in Linen and nothing is duplicated;
  (4) cut over, then post a comment in the source, and it appears in
  reconciliation on the right Linen ticket. Repeat (2)–(4) with a Freshservice
  source, and see a cutover refused while the final delta is behind.

## Authority, evidence and operation (retained safeguards)

- **A1 — Identity and privacy.** Authenticate scoped principals at every private
  boundary. Separate requester/beneficiary, approver, HR, service operator, owner,
  auditor and integration rights. Enforce current scope on records, attachments,
  search, notifications, exports and AI context. Protect restricted departures and
  incidents; minimize HR data; support retention and authorized erasure without
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
  acknowledgment is not a gate to machine-verifiable completion. Accessible
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
  guarantees. **Acceptance evidence:** a full asset and license lifecycle with a
  supplier breach and a measured reclamation, plus a connector authored through
  the change lane and kept through an update.

## Push further with agents

Every agent below acts only through scoped principals and versioned grants (A2),
records every attempt and charge (A7), and claims success only from independent
evidence (A4). Humans can see, take over, correct or stop any run.

- **AGENT-001 — Resolve routine requests end to end.** For access, software,
  license, account and hardware requests (replacements, loaners and peripherals
  under ASSET-011), the agent resolves the right entitlement or device from the
  plain-language need, checks policy and standing authority, performs the effect
  through connectors and logistics partners, and confirms the employee can use it;
  it involves a human only for a genuinely missing fact or decision. *Data:*
  catalog, app registry, IdP/SaaS state, stock, MDM and shipment state, grants.
  *Human control:* standing grants define what runs unattended; anything outside
  them becomes an approval with the exact effect shown. **Acceptance evidence:**
  20 mixed routine requests in sandboxes, including a broken-laptop replacement
  run end to end under ASSET-011; report verified outcomes, touches and false
  completions; one out-of-policy request becomes an approval; the replaced
  laptop's return and wipe stay open after delivery until their readback.

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
  application probe as a test principal, the requested app present at the
  required version in the device's installed-application inventory, mailbox
  delivery) and asks the employee
  only when no machine signal exists; it reopens when evidence later shows the
  issue persists. *Human control:* the verifier is configured per request type;
  the employee can always report "still not working". **Acceptance evidence:** a
  password reset is resolved only after the IdP shows a successful sign-in; a
  Visio install is resolved only after Intune's inventory for the employee's
  laptop shows Visio (CATALOG-005); a printer fix with no signal asks the
  employee; a later failed sign-in reopens.

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
  against a Zoom sandbox, the owner releases it, and a license change runs under
  a new grant.

- **AGENT-006 — Measure human work saved.** The agent reports total human
  touches and minutes, model/provider cost and failures per verified outcome for
  each request type over time, and names the next most valuable automation by
  work saved, not tickets closed. *Human control:* the owner chooses the
  cohort and comparison period. **Acceptance evidence:** REPORT-004's report for
  two request types, with a ranked automation proposal and its evidence.
  *Today's semantic:* the owner's comparison period is REPORT-004's baseline and
  current windows, and the cohort is an optional selection of request types
  (all types when none is chosen). Request types are ranked by the human work
  automating them would remove: current-window human active minutes per
  verified outcome × current verified outcomes, ties by more failures first;
  each shows the realized saving per verified outcome (baseline minus current
  minutes), touches, verified and failed counts as evidence. A type with no
  verified outcome in the current window is listed as not enough evidence, never
  ranked. The proposal authorizes nothing. Cost evidence in USD follows the
  role-rate audience (the owner); operators and auditors see the same ranking
  without monetary values.

- **AGENT-007 — Mine ticket history for automations.** The agent clusters
  historic and recent tickets, drafts catalog items, workflows, standing grants
  and articles that would remove the repeated work, with expected work saved and
  risks; an admin reviews and publishes. *Human control:* nothing publishes
  without admin approval; grants are proposed, never self-issued. **Acceptance
  evidence:** from 1,000 imported Freshservice tickets, the agent proposes three
  automations; one is published and its measured effect is reported after two
  weeks.

- **AGENT-008 — Keep devices and licenses healthy.** The agent watches MDM and
  EDR for non-compliant devices (OS behind, encryption off, EDR missing) and
  license data for idle seats, opens work with the employee in their channel,
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

## Frontier extensions (retained)

[F1–F7](FRONTIER-EXTENSION.md#seven-extensions-that-change-the-product) extend
the destination with persistent service commitments (F1), semantic observation
and help (F2), unfamiliar causal research (F3), autonomous service engineering
(F4), executable service models and experiments (F5), reusable capabilities from
solved cases (F6) and continuous service simplification (F7). They inherit A1–A7
and preserve E1–E7 and O1–O3. Their acceptance evidence is the
[frontier evidence](ACCEPTANCE.md#frontier-extension-evidence) table.

- **F1 — Persistent service commitments.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f1-persistent-service-commitments).
- **F2 — Semantic observation and help.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f2-semantic-observation-and-immediately-useful-help).
- **F3 — Unfamiliar causal research.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f3-unfamiliar-causal-research).
- **F4 — Autonomous service engineering.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f4-autonomous-service-engineering).
- **F5 — Executable service models and experiments.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f5-executable-service-models-and-experiments).
- **F6 — Reusable capabilities from solved cases.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f6-turn-solved-cases-into-reusable-capability).
- **F7 — Continuous service simplification.** As defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md#f7-continuously-simplify-the-service-estate).

## Honest boundaries

- **Not the identity provider.** Linen does not store workforce passwords or run
  SSO for other apps. Buyers use Auth, Okta, Microsoft Entra ID, Google Workspace
  or Windows Server Active Directory synced to the cloud; Linen acts through their
  APIs, or for on-premises AD through the buyer-hosted relay (ACCESS-010), and
  reads back results.
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
- **Not general project management.** Linen runs IT team projects (PROJECT-001);
  software delivery projects stay in Vector or Jira, and cross-functional
  business projects stay in the buyer's Asana, monday.com or ClickUp.
- **Not procurement, accounting, the team wiki or chat.** Purchases go to Purse
  or the buyer's vendor; asset depreciation exports to Pantry, QuickBooks Online
  or NetSuite; Linen's IT knowledge base is native, while wider team knowledge
  stays in Slate, Confluence or Google Drive; Slack, Teams and Nook stay the chat
  systems.
- **Not customer support.** Linen serves the buyer's own employees. External
  customer support is HappyToHelp's product.
- **US first.** USD, US time zones and federal holidays, US sales tax and US
  employment types first; employee-facing language is US English and US Spanish
  (L10N-001). No FedRAMP, HIPAA BAA or other regulated certification
  is claimed without its own agreement and evidence; Section 508 support rests on
  A11Y-001.

## Status

Judged from the code and tests at commit `9af14410a127c58bffe7935207f6524c6620157d` (16 October 2026).

The commit is the code this branch carries unchanged; the code audit at `7ce9dae` was the starting point. `done` means implemented with a cited test through a public door using local runtime and test-only provider fixtures; it is not live provider, hosted or owner acceptance. A `partial` row cites what exists and its gap names what is missing; a `missing` row has no implementation. F1–F7 are defined in [FRONTIER-EXTENSION.md](FRONTIER-EXTENSION.md) and counted here.

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 4 | 20 | 0 | 24 |
| Target and push further | 26 | 56 | 33 | 115 |
| All | 30 | 76 | 33 | 139 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `E1` | Help and incidents | published | partial | `src/features/work/core.ts`, `src/features/work/intake.ts`, `tests/ui/browser.mjs`, `tests/work/runtime.mjs` | Slack/Teams intake missing; mail intake untested by a public-door test. |
| `E2` | Access, device and software requests | published | partial | `src/features/work/requests.ts`, `src/features/execution/connectors.ts`, `tests/ui/connected-request.mjs` | Effects only through Microsoft Graph fixtures; no MDM software install verified on the device. |
| `E3` | Join, move and leave | published | partial | `src/features/work/lifecycle.ts`, `src/features/work/processor.ts`, `tests/ui/connected-lifecycle.mjs`, `tests/work/runtime.mjs` | No HRIS connector. |
| `E4` | Custody and context | published | partial | `src/features/work/resources.ts`, `tests/ui/custody-journey.mjs` | No MDM feed. |
| `E5` | Shared incidents and problems | published | partial | `src/features/services/incidents.ts`, `tests/ui/connected-change.mjs`, `tests/services/run.mjs` | No live monitoring connector; provider, hosted and owner acceptance unproven. |
| `E6` | Controlled changes | published | partial | `src/features/services/changes.ts`, `tests/services/integration.mjs`, `tests/ui/connected-change.mjs` | No live provider change execution; hosted and owner acceptance unproven. |
| `E7` | Knowledge and management review | published | partial | `src/features/work/knowledge.ts`, `tests/work/runtime.mjs`, `tests/adoption/prior-data-upgrade.mjs` | No federated knowledge or dashboards; hosted and owner acceptance unproven. |
| `CHANNEL-001` | Slack as a primary employee channel | target | missing |  | No Slack app or connector: no DM, help-channel, reaction, shortcut, modal or App Home intake. |
| `CHANNEL-002` | Microsoft Teams as a primary employee channel | target | missing |  | No Teams app or connector: no personal chat, channel, message-extension, Adaptive Card or tab intake. |
| `CHANNEL-003` | Email mailboxes | target | partial | `src/features/work/intake.ts`, `src/features/execution/mail/sender.ts`, `tests/connections/sendgrid-runtime.mjs` | No Gmail/Exchange mailbox connector or threading by headers. |
| `CHANNEL-004` | Employee portal | target | partial | `src/ui/work.tsx`, `src/ui/knowledge.tsx`, `tests/ui/browser.mjs`, `tests/ui/connected-request.mjs` | No "my devices", notices, branding or custom domain. |
| `CHANNEL-005` | Mobile for employees, approvers and technicians | target | partial | `tests/ui/viewport-evidence.mjs` | No native iOS/Android apps, push or quiet hours. |
| `CHANNEL-006` | Conversational help that acts | target | partial | `src/features/intelligence/intake.ts`, `src/features/intelligence/intake-execution.ts`, `tests/ui/connected-request.mjs` | Portal only; no Slack/Teams or live agent handoff. |
| `CHANNEL-007` | Phone and walk-up intake | target | missing |  | No phone-system or walk-up intake. |
| `CHANNEL-008` | Service notices to employees | target | partial | `src/features/services/incidents.ts`, `tests/services/run.mjs` | No portal banner or chat posting. |
| `CHANNEL-009` | Request sharing and manager visibility | target | missing |  | No request sharing or manager team view. |
| `CATALOG-001` | Catalog items with forms | target | partial | `src/features/work/requests.ts`, `tests/ui/connected-request.mjs` | No form builder, conditional fields, required attachments, audience or cost. |
| `CATALOG-002` | Approval chains | target | partial | `src/features/work/fulfilment-decisions.ts`, `src/features/work/delegation.ts`, `tests/ui/fulfilment-decision-journey.mjs`, `tests/execution/authority-manager-cases.mjs` | Single manager approval; no multi-level, finance threshold, approval SLA or email-reply approval. |
| `CATALOG-003` | Fulfillment task plans | target | partial | `src/features/work/requests.ts`, `src/features/execution/plans.ts`, `tests/ui/connected-request.mjs` | No team task templates. |
| `CATALOG-004` | Bundles and kits | target | missing |  | No bundles. |
| `CATALOG-005` | Software requests installed through MDM | target | partial | `src/features/work/requests.ts`, `src/features/execution/verification.ts` | Software is a catalog kind fulfilled as an access grant; no MDM app binding, install-group assignment, installed-inventory verification, deployment failure task or lease uninstall. |
| `CATALOG-006` | Requests for pending people | target | done | `src/features/work/pending-people.ts`, `src/features/work/pending-services.ts`, `src/features/work/pending-binding.ts`, `tests/work/pending-person-runtime.mjs`, `tests/ui/pending-person-browser.mjs` | Local D1/runtime and 1440/390 browser: reviewed creation/edit, held catalog services, native email proof and password sign-in binding, normal fulfillment release, employee visibility, withdrawal/cancellation and attributed audit. Provider delivery and live SSO are not claimed. |
| `DESK-001` | Queues, groups and views | target | partial | `src/features/work/core.ts`, `src/ui/work.tsx` | No groups, saved views, bulk actions or triage shortcuts. |
| `DESK-002` | Classification and priority | target | done | `src/features/work/classification.ts`, `tests/work/classification-cases.mjs`, `tests/ui/classification-journey.mjs`, `tests/adoption/classification-cases.mjs` | Local public-route/model-edge fixture proof of incident/service request/question proposals, category/subcategory, impact × urgency and reason; audited operator P1-to-P2 override, current-role/scope/CAS and late-result fencing. Native 1440/390 controls and persistence, missing-provider state, held archive restore and erasure. No live-model quality claim. |
| `DESK-003` | Routing and assignment | target | partial | `src/features/work/core.ts`, `src/features/intelligence/intake-execution.ts` | No rules, round-robin, load, skills or CI/service support-group routing. |
| `DESK-004` | SLA policies | target | partial | `src/features/work/calendar.ts`, `tests/work/runtime.mjs` | One commitment per ticket; no policy sets or holiday catalogs. |
| `DESK-005` | Escalation and supervisor rules | target | partial | `src/features/services/integrations.ts`, `src/features/intelligence/followup.ts` | No multi-level escalation or supervisor rules. |
| `DESK-006` | Ticket relationships | target | partial | `src/features/services/incidents.ts` | No merge, split or parent/child tickets. |
| `DESK-007` | Collaboration | target | partial | `src/features/work/core.ts`, `tests/work/runtime.mjs`, `tests/ui/browser.mjs` | No mentions, watchers or side conversations. |
| `DESK-008` | Responses and summaries | target | done | `src/features/work/canned-responses.ts`, `src/features/work/response-assistance.ts`, `tests/work/response-cases.mjs`, `tests/work/knowledge-draft-cases.mjs`, `tests/ui/response-journey.mjs` | Local public-route and paid-model-edge fixture proof of safe canned placeholders, generated knowledge/history citations, a complete 20-message summary, native 1440/390 unsent-draft persistence and explicit agent Send; current role/scope, provider/citation failures and changed-message/article/expiry fences. Native template restore remains inert. No live-model quality claim. |
| `DESK-009` | Satisfaction surveys | target | missing |  | No CSAT. |
| `DESK-010` | Custom fields, forms and statuses | target | missing |  | No custom fields, forms, statuses or required-on-status resolution code and close notes. |
| `DESK-011` | Department workspaces | target | partial | `src/platform/auth.ts`, `src/features/work/core.ts`, `tests/platform/runtime.mjs` | No department workspaces under one portal. |
| `DESK-012` | Time tracking and effort | target | done | `src/features/work/time.ts`, `src/features/work/effort-report.ts`, `tests/work/time-cases.mjs`, `tests/ui/time-journey.mjs`, `tests/adoption/runtime.mjs` | Local public work/task routes and real 1440/390 browser interval: manual and measured active minutes feed role/request-type effort totals with touches and failed/pending work. Visibility/focus/inactivity pauses, server-bounded sequenced heartbeats, current scope, erasure and inert restored timers are proved. REPORT-004 prices these minutes at owner-declared role rates. |
| `DESK-013` | Scheduled and recurring work | target | done | `src/features/work/recurrence.ts`, `src/features/work/recurrence-calendar.ts`; DESK-013 public routes in `tests/work/recurrence-cases.mjs` via `tests/work/runtime.mjs`, `tests/ui/recurrence-journey.mjs` via `tests/ui/browser.mjs`, `tests/adoption/recurrence-cases.mjs` via `tests/adoption/runtime.mjs`: calendar tickets/task plans with owners, first business day/holiday, atomic occurrences, DST/month-end, pause/resume, inert restore and 1440/390 journeys. | |
| `DESK-014` | Remote support handoff | target | missing |  | No remote-support integration. |
| `DESK-015` | Agent scenarios and record templates | target | missing |  | No agent scenarios or record templates. |
| `DESK-016` | Global agent search | target | done | `src/features/work/search.ts`, `tests/work/search-cases.mjs`, `tests/work/knowledge-draft-cases.mjs`, `tests/ui/search-journey.mjs` | Local public-route and 1440/390 browser evidence: all eight current record types, filters, typo matching, serial-linked asset/ticket/person, native ticket ID, subject/content/requester, recorded asset tags, scoped visible counts and pages. HR/private/restricted/article/current-role fences and generated-source withdrawal are asserted. |
| `DESK-017` | Ticket activity history | target | partial | `src/features/work/core.ts`, `tests/work/runtime.mjs` | State transitions only, as public messages; no field-level before/after history, actor types or imported source history. |
| `NOTIFY-001` | Default notifications by role and event | target | partial | `src/features/execution/notifications.ts`, `tests/execution/runtime.mjs` | Explicit per-message only; no event-driven default set, chat or push delivery, or actionable agent notifications. |
| `NOTIFY-002` | Admin-configured rules, templates and preferences | target | missing |  | No notification rules, templates, branding or preferences. |
| `ACCESS-001` | Microsoft Entra ID | target | done | `src/features/execution/connectors.ts`, `src/features/execution/identity.ts`, `tests/execution/runtime.mjs`, `tests/ui/connected-lifecycle.mjs` |  |
| `ACCESS-002` | Okta | target | missing |  | No Okta connector. |
| `ACCESS-003` | Google Workspace | target | missing |  | No Google Workspace connector. |
| `ACCESS-004` | Auth | target | missing |  | No Auth connector. |
| `ACCESS-005` | SaaS application provisioning | target | missing |  | No GitHub, Slack, Salesforce, Atlassian, Zoom or AWS connectors. |
| `ACCESS-006` | Just-in-time and time-bound access | target | done | `src/features/work/requests.ts`, `src/features/execution/automation.ts`, `tests/ui/connected-request.mjs` |  |
| `ACCESS-007` | Self-service account recovery | target | missing |  | No password/MFA reset or unlock, in a cloud IdP or in on-premises AD. |
| `ACCESS-008` | Application catalog and owners | target | done | `src/features/work/application-registry.ts`, `src/features/work/application-catalog.ts`, `tests/work/application-cases.mjs`, `tests/adoption/application-cases.mjs`, `tests/ui/application-journey.mjs` | Local public-route and native 1440/390 proof of two Salesforce permission sets, linked catalog, owner routing, USD seat-cost snapshots, current scope/manager gates, erasure and held remapped restore. Connector metadata never claims provisioning or provider verification. |
| `ACCESS-009` | User access reviews | target | missing |  | No access reviews. |
| `ACCESS-010` | On-premises Active Directory (hybrid identity) | target | missing |  | No on-premises AD relay, source-of-authority routing or domain-controller readback. |
| `LIFE-001` | HRIS-triggered lifecycle | target | missing |  | No Rippling, Gusto, BambooHR, Workday or Willow connector; lifecycle accepts HR facts through the API only. |
| `LIFE-002` | Dated task plans across teams | target | partial | `src/features/work/lifecycle.ts`, `tests/work/runtime.mjs` | No templates by role, location or employment type. |
| `LIFE-003` | Birthright access baselines | target | partial | `src/features/work/lifecycle.ts`, `tests/ui/connected-lifecycle.mjs` | No access policies. |
| `LIFE-004` | Joiner device readiness | target | partial | `src/features/work/resources.ts`, `tests/ui/custody-journey.mjs` | No zero-touch enrollment or shipping. |
| `LIFE-005` | Leaver revocation everywhere | target | partial | `src/features/execution/identity.ts`, `src/features/work/lifecycle.ts`, `tests/ui/connected-lifecycle.mjs` | Entra only; no Okta, Google, SaaS or on-premises AD revocation, data transfer or device actions. |
| `LIFE-006` | Contractors and temporary staff | target | done | `src/features/work/contractor-sponsor.ts`, `tests/work/lifecycle-regressions.mjs`, `tests/ui/connected-lifecycle.mjs` | Local public-route and inspected 1440/390 connected-fixture proof: an end date requires an active sponsor; a 72-hour reminder reaches the sponsor's requests; only the sponsor re-attests (owner once the sponsor has left, with reassignment); without re-attestation the Graph-fixture disable and session revocation start at the end instant and are independently verified. No live HRIS or IdP claim. |
| `LIFE-007` | Lifecycle evidence pack | target | done | `src/features/work/lifecycle-evidence.ts`, `tests/work/lifecycle-evidence-cases.mjs`, `tests/ui/custody-journey.mjs` | Local public-door join/move/leave export with exact historical grants, decisions, attempts, readback, independent verification and outstanding security/custody duties; owner/HR isolation and erasure protection. JSON download exercised at 1440/390. Provider evidence remains test-only; no compliance certification or legal-hold storage claim. |
| `ASSET-001` | MDM sync | target | missing |  | No Jamf, Intune or Kandji connector and no installed-application inventory. |
| `ASSET-002` | Device actions under grant | target | missing |  | No device actions or inventory-verified app push and removal. |
| `ASSET-003` | Discovery and reconciliation | target | partial | `src/features/connections/providers.ts`, `tests/connections/runtime.mjs` | Graph device list only; no MDM, EDR, cloud-account or network discovery. |
| `ASSET-004` | Hardware lifecycle and custody | target | done | `src/features/work/assets.ts`, `tests/work/asset-custody-cases.mjs`, `tests/ui/asset-custody-journey.mjs` | Public-door procurement/receipt, assignment, loan, repair, return, retirement and disposal with serial history and attributed receipts. Disposal requires an ITAD partner, R2v3/e-Stewards standard and HTTPS certificate document reference, and refuses assigned devices even in repair. Browser journey at 1440/390. Partner certification is operator-attributed; remote certificate bytes are not retained. |
| `ASSET-005` | Stock rooms and reorder | target | partial | `src/features/work/requests.ts` | No stock locations or reorder. |
| `ASSET-006` | Software license management and compliance | target | partial | `src/features/services/economics.ts`, `tests/services/run.mjs` | No IdP usage feed, reclamation through connectors, desktop installation compliance or prohibited titles. |
| `ASSET-007` | Contracts, warranties and vendors | target | partial | `src/features/work/asset-contracts.ts`, `tests/work/asset-contract-cases.mjs`, `tests/ui/asset-contract-journey.mjs`, `tests/adoption/asset-contract-cases.mjs` | Local public-route and 1440/390 browser proof: purchase, lease, warranty and support records link assets/vendors; repair tickets show recorded coverage and current expiry alerts; official manufacturer lookup doors remain separate from recorded terms. Native archives retain vendor/asset/repair links through two generations. Authorized partner-API retrieval remains unimplemented and needs customer partner access; no automated manufacturer readback or provider acceptance claimed. |
| `ASSET-008` | Asset financials | target | done | `src/features/work/asset-financials.ts`, `src/features/work/depreciation.ts`, `tests/work/asset-financial-cases.mjs` via `tests/work/runtime.mjs`, `tests/ui/asset-financial-journey.mjs` via `tests/ui/browser.mjs`: ASSET-008 USD cost/center, both methods, month-12 value, fiscal CSV, scoped access and 1440/390 readback. | |
| `ASSET-009` | CMDB and service dependencies | target | done | `tests/services/dependency-cases.mjs`, `tests/ui/dependency-journey.mjs` | Local public-route and 1440/390 browser proof: five CI types, attributed typed dependencies, Payroll/Gusto/SSO, transitive incident/change upstream/downstream impact, stale/conflicting uncertainty, cycles and existing scope isolation. |
| `ASSET-010` | Physical audits | target | missing |  | No physical audits. |
| `ASSET-011` | Hardware requests and device swaps for existing employees | target | partial | `src/features/work/resources.ts`, `tests/ui/custody-journey.mjs` | No replacement/loaner chain, MDM enrollment, shipping, return kit or swap gate. |
| `INC-001` | Major incidents | target | partial | `src/features/services/incidents.ts`, `tests/services/run.mjs` | No war room or Oncall/PagerDuty connector. |
| `INC-002` | Monitoring and alert intake | target | partial | `src/features/services/integrations.ts`, `tests/services/run.mjs` | No named Uptime/Datadog/PagerDuty/Spool connectors or paging on intake. |
| `INC-003` | Status communication | target | partial | `src/features/services/integrations.ts`, `tests/services/run.mjs` | No Lamp or Statuspage connector. |
| `INC-004` | Engineering escalation | target | missing |  | No Jira/GitHub/Linear/Vector escalation. |
| `PROB-001` | Problem management | target | done | `src/features/services/problems.ts`, `src/features/services/problem-knowledge.ts`, `tests/work/problem-cases.mjs`, `tests/ui/problem-journey.mjs`, `tests/adoption/problem-cases.mjs` | Local public-route and 1440/390 browser proof: three incident links, reviewed root cause/known error, versioned expiring Knowledge publication and preventive change; a later request is offered guidance matched by reviewer phrases and service/cohort context. Scoped, reviewed, current and unexpired content only; request stays open. Native archive links and authorized erasure are proved. |
| `PROB-002` | Proactive problem detection | target | done | `tests/work/problem-detection-cases.mjs`, `tests/ui/problem-detection-journey.mjs`, `tests/adoption/problem-cases.mjs` | Public routes and 1440/390 journey prove eight floor Wi-Fi incidents, retained rejection without re-proposal after ninth/restart/restore, native acceptance and source links, service/app/model ticket and alert grouping, deduplication, concurrent decisions and current source/tenant/role boundaries. ct-approved restricted detector-only aggregation, including after acceptance. Local evidence only. |
| `CHANGE-001` | Change types and templates | target | done | `src/features/services/change-templates.ts`, `src/features/services/changes.ts`, `tests/services/template-cases.mjs`, `tests/services/template-integration.mjs`, `tests/adoption/template-cases.mjs`, `tests/ui/template-journey.mjs` | Local public-route and native 1440/390 evidence: exact-version owner preapproval, standard catalog CAB bypass with separate grant checks, normal/ECAB decisions, retained snapshots and explicit withdrawal, amendment invalidation and inactive restored templates. No CAB meeting, vote, live provider or owner acceptance claimed. |
| `CHANGE-002` | Risk scoring | target | partial | `src/features/services/changes.ts` | No scoring. |
| `CHANGE-003` | Change advisory board | target | partial | `src/features/services/changes.ts`, `tests/services/integration.mjs` | No CAB, meetings or votes. |
| `CHANGE-004` | Change calendar and freeze windows | target | done | `src/features/services/calendar.ts`, `tests/services/calendar-cases.mjs`, `tests/services/integration.mjs`, `tests/ui/calendar-journey.mjs`, `tests/adoption/calendar-cases.mjs` | Public routes and connected execution prove scoped calendar/maintenance/freeze/ICS, half-open CI/workspace bounds, schedule/edit/later-dispatch refusal, owner emergency scheduling with separate effect grants, current role and generic hidden conflicts. Native archive preserves links with windows inactive until owner review; native 1440/390 calendar, editor, emergency and inactive states are inspected. Local evidence only. |
| `CHANGE-005` | Rollback, change-caused incidents and post-implementation review | target | partial | `src/features/services/changes.ts`, `tests/services/integration.mjs` | No automatic incident linking, health-check gate on success or PIR. |
| `CHANGE-006` | Development-tool context | target | partial | `src/features/intelligence/engineering.ts` | No GitHub/Jira/Vector links or deployment-raised changes. |
| `CHANGE-007` | Release management | target | partial | `src/features/services/changes.ts`, `src/features/execution/deployment.ts`, `tests/ui/connected-change.mjs` | No release records, go/no-go or release notes. |
| `PROJECT-001` | IT team projects | target | missing |  | No IT projects. |
| `KB-001` | Knowledge base | target | done | `src/features/work/knowledge.ts`, `tests/work/runtime.mjs`, `tests/adoption/prior-data-upgrade.mjs` |  |
| `KB-002` | Federated knowledge sources | target | missing |  | No federated sources (Confluence, Slate, Google Drive, SharePoint, Notion). |
| `KB-003` | Deflection with verified outcome | target | done | `src/features/work/deflection.ts`, `tests/work/knowledge-draft-cases.mjs`, `tests/ui/knowledge-draft-journey.mjs` | Local public-route and inspected 1440/390 browser proof: a VPN question is answered by the readable reviewed article before filing (never an HR-only one); the asker's confirmation is the only deflection; a second employee who files anyway, and a confirmation followed by filing, are not counted; asker-only confirmation and aggregate report counts. Slack/Teams suggestions are inherited by CHANNEL-001/002. |
| `KB-004` | Articles from resolved work | target | done | `src/features/work/knowledge-drafts.ts`, `tests/work/knowledge-draft-cases.mjs`, `tests/ui/knowledge-draft-journey.mjs`, `tests/adoption/knowledge-draft-cases.mjs` | Local public-route and paid-model-edge fixtures prove three-source and known-error drafts, all-source citations, explicit generation/budget, reviewer publication/rejection and durable suppression; current scope/source/reopen/erasure gates, native restore and inspected 1440/390 journeys. No live-model quality claim. |
| `KB-005` | Article feedback, attachments and templates | target | missing |  | No article feedback, attachments or templates. |
| `REPORT-001` | Service desk dashboards | target | partial | `src/features/work/knowledge.ts`, `src/features/services/economics.ts`, `tests/adoption/prior-data-upgrade.mjs`, `tests/services/run.mjs` | No dashboards, CSAT, per-agent views or reporting on imported history. |
| `REPORT-002` | Custom and scheduled reports | target | missing |  | No report builder or scheduling. |
| `REPORT-003` | Data access for BI | target | partial | `src/features/work/index.ts`, `tests/work/runtime.mjs` | No scheduled BI or warehouse export. |
| `REPORT-004` | Human work saved | target | done | `src/features/work/effort-report.ts`, `src/features/work/effort-window.ts`, `src/features/work/labor-rates.ts`, `src/ui/work-saved.tsx`, `tests/work/work-saved-cases.mjs`, `tests/work/fulfilment-link-runtime.mjs`, `tests/ui/time-journey.mjs` | Public work/report/execution doors: a request type handled by people in a baseline window and automated in the current window, with role touches/minutes, owner-declared role rates, request-attributed estimated model charges, unknown provider charges, known cost per verified outcome and the failure in the same period; 1440/390 report journey. Live provider invoices are not received, so provider charges stay unknown by design. |
| `REPORT-005` | IT operations and asset KPIs | target | partial | `src/features/services/economics.ts`, `tests/services/run.mjs` | No MTTA/MTTR, change success, emergency share or compliance/license KPIs. |
| `ROLE-001` | Roles and permissions | target | partial | `src/platform/auth.ts`, `tests/ui/browser.mjs`, `tests/platform/runtime.mjs` | Fixed roles; no custom roles. |
| `SSO-001` | Sign-in, SSO and SCIM | target | partial | `src/platform/sso.ts`, `src/platform/base-auth`, `tests/platform/runtime.mjs`, `tests/platform/base-auth-runtime.mjs` | No SAML/OIDC with named IdPs, SCIM or MFA enforcement. |
| `AUDIT-001` | Audit log | target | done | `src/platform/privacy.ts`, `tests/platform/privacy-runtime.mjs`, `tests/platform/config-runtime.mjs` |  |
| `API-001` | REST API and webhooks | target | partial | `src/features/work/index.ts`, `src/features/execution/index.ts`, `tests/work/runtime.mjs` | No outbound event webhooks. |
| `API-002` | No-code workflow automator | target | partial | `src/features/execution/automation.ts`, `src/features/execution/plans.ts`, `tests/ui/connected-request.mjs` | No no-code builder. |
| `API-003` | Agent access by MCP | target | missing |  | No MCP server. |
| `PORT-001` | Portable native archive | target | done | `src/features/adoption/export.ts`, `src/features/adoption/import.ts`, `tests/adoption/runtime.mjs` |  |
| `ERASURE-001` | Authorized erasure | target | done | `src/features/adoption/core.ts`, `src/features/work/privacy.ts`, `tests/adoption/runtime.mjs`, `tests/work/person-binding-runtime.mjs`, `tests/platform/privacy-runtime.mjs` |  |
| `RETENTION-001` | Retention policies | target | partial | `src/features/adoption/retention.ts`, `tests/adoption/runtime.mjs` | Archive retention only; no ticket/attachment retention. |
| `BASE-001` | Base platform replacements | target | done | `src/platform/base-auth`, `src/base`, `tests/platform/base-auth-runtime.mjs`, `tests/platform/mail-edge.mjs` |  |
| `COST-001` | US pricing and budgets | target | partial | `src/features/intelligence`, `tests/intelligence/runtime.mjs` | No seat pricing or sales-tax invoices. |
| `A11Y-001` | Accessibility | target | partial | `tests/ui/viewport-evidence.mjs`, `tests/ui/browser.mjs` | No WCAG audit. |
| `L10N-001` | US English and Spanish for employees | target | missing |  | English only. |
| `SANDBOX-001` | Sub-production workspace and configuration promotion | target | missing |  | No sandbox workspace or configuration promotion. |
| `MIGRATE-001` | Freshservice migration | target | partial | `src/features/adoption/freshservice-import`, `src/features/adoption/freshservice.ts`, `tests/adoption/freshservice-import.mjs`, `tests/adoption/runtime.mjs` | Tickets and conversations only, 100 per job; no assets, catalog, KB, SLA, attachment bytes or 50,000-ticket scale run. |
| `MIGRATE-002` | Jira Service Management migration | target | missing |  | No JSM, Assets or Confluence importer or delta passes. |
| `MIGRATE-003` | ServiceNow migration | target | missing |  | No ServiceNow Table/Attachment API importer or delta passes. |
| `MIGRATE-004` | Spreadsheet and lightweight-tool move-in | target | missing |  | No CSV, Zendesk or Snipe-IT importer. |
| `MIGRATE-005` | Coexistence and cutover | target | partial | `src/features/adoption/coexistence.ts`, `tests/adoption/runtime.mjs` | Freshservice delta checkpoint and fenced cutover only; no ServiceNow or JSM deltas and no post-cutover source watch for late arrivals. |
| `A1` | Identity and privacy | published | done | `src/platform/auth.ts`, `src/features/work/privacy.ts`, `tests/ui/browser.mjs`, `tests/platform/privacy-runtime.mjs`, `tests/work/person-binding-runtime.mjs` |  |
| `A2` | Granted action | published | done | `src/features/execution/authority.ts`, `src/features/execution/grants.ts`, `tests/execution/authority-runtime.mjs`, `tests/ui/connected-request.mjs` |  |
| `A3` | Durable effects | published | done | `src/features/execution/engine.ts`, `tests/ui/connected-cancellation.mjs`, `tests/ui/connected-restart.mjs`, `tests/execution/runtime.mjs` |  |
| `A4` | Verifiable outcomes | published | done | `src/features/execution/verification.ts`, `tests/ui/connected-request.mjs`, `tests/execution/runtime.mjs` |  |
| `A5` | Legible service | published | partial | `src/ui`, `tests/ui/run.mjs`, `tests/ui/viewport-evidence.mjs` | No chat channels; bounded accessibility evidence. |
| `A6` | Data and source custody | published | partial | `src/features/adoption`, `tests/adoption/prior-data-upgrade.mjs`, `tests/adoption/runtime.mjs` | Incumbent imports bounded to Freshservice. Legacy domain `/exports` also refuses a fresh post-erasure snapshot with `erasure_invalidated_snapshot`; this gap was observed during KB-004 checks and remains open. |
| `A7` | Honest operating and cost boundaries | published | partial | `src/features/intelligence/measurement.ts`, `tests/intelligence/runtime.mjs` | Human touch counting incomplete. |
| `O1` | Service graph and major incidents | published | partial | `src/features/services/graph.ts`, `tests/services/run.mjs`, `tests/services/integration.mjs` | No real monitoring/on-call. |
| `O2` | Change, release and prevention | published | partial | `src/features/services/changes.ts`, `tests/services/integration.mjs`, `tests/ui/connected-frontier.mjs` | No live provider or sustained prevention. |
| `O3` | Lifecycle and economics | published | partial | `src/features/services/economics.ts`, `tests/services/run.mjs` | No real supplier or reclamation. |
| `AGENT-001` | Resolve routine requests end to end | push-further | partial | `src/features/intelligence/intake-execution.ts`, `tests/ui/connected-request.mjs` | Graph-only effects; no hardware chain. |
| `AGENT-002` | Revoke the leaver everywhere | push-further | partial | `src/features/work/lifecycle.ts`, `tests/ui/connected-lifecycle.mjs` | No SaaS/OAuth enumeration. |
| `AGENT-003` | Verify the employee can work again | push-further | partial | `src/features/execution/verification.ts`, `tests/ui/connected-request.mjs` | No sign-in, device-compliance or installed-app signals. |
| `AGENT-004` | Investigate multi-system failures | push-further | partial | `src/features/intelligence/research.ts`, `tests/intelligence/frontier.mjs` | No held-out live case against real IdP, MDM and monitoring logs. |
| `AGENT-005` | Build a missing connector | push-further | partial | `src/features/intelligence/engineering.ts`, `tests/ui/connected-frontier.mjs` | No released provider connector. |
| `AGENT-006` | Measure human work saved | push-further | done | `src/features/work/automation-proposal.ts`, `tests/work/work-saved-cases.mjs`, `tests/ui/time-journey.mjs` | Local public-route and inspected 1440/390 proof: REPORT-004's report for two request types with the owner's cohort and windows, a ranked next-automation proposal by human minutes it would remove, realized saving and failures as evidence, not-enough-evidence types unranked, and USD evidence for the owner only. |
| `AGENT-007` | Mine ticket history for automations | push-further | partial | `src/features/intelligence/capabilities.ts`, `tests/intelligence/frontier.mjs` | No ticket-history mining. |
| `AGENT-008` | Keep devices and licenses healthy | push-further | missing |  | No MDM/EDR signals. |
| `AGENT-009` | Carry service commitments across tickets | push-further | partial | `src/features/intelligence/commitments.ts`, `tests/intelligence/frontier.mjs` | No live provider observations (such as GitHub access readback) behind commitments. |
| `AGENT-010` | Prevent recurrence and simplify | push-further | partial | `src/features/intelligence/simplification.ts`, `tests/intelligence/frontier.mjs` | No recurrence window measured on a real provider or simplification compared with continued repair. |
| `F1` | Persistent service commitments | published | partial | `src/features/intelligence/commitments.ts`, `tests/intelligence/frontier.mjs` | Frontier evidence gate in ACCEPTANCE.md not demonstrated on real observations. |
| `F2` | Semantic observation and help | published | partial | `src/features/intelligence/events.ts`, `tests/intelligence/runtime.mjs` | Frontier evidence gate in ACCEPTANCE.md not demonstrated on real selected events. |
| `F3` | Unfamiliar causal research | published | partial | `src/features/intelligence/research.ts`, `tests/intelligence/frontier.mjs` | Frontier evidence gate in ACCEPTANCE.md not demonstrated on a held-out unfamiliar case. |
| `F4` | Autonomous service engineering | published | partial | `src/features/intelligence/engineering.ts`, `tests/ui/connected-frontier.mjs` | No change authored against real owned systems and released through the change lane. |
| `F5` | Executable service models and experiments | published | partial | `src/features/intelligence/protocol.ts` | No public-door test; frontier evidence gate in ACCEPTANCE.md not demonstrated. |
| `F6` | Reusable capabilities from solved cases | published | partial | `src/features/intelligence/capabilities.ts`, `tests/intelligence/frontier.mjs` | Frontier evidence gate in ACCEPTANCE.md not demonstrated on held-out cases. |
| `F7` | Continuous service simplification | published | partial | `src/features/intelligence/simplification.ts`, `tests/intelligence/frontier.mjs` | No substantive redesign compared with continued repair on service outcomes. |
