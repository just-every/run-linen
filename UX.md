# Linen experience and journeys

The interaction design Linen is built toward. The app has screens today, but the six journeys
below are design targets, not observed performance. [CONTRACT.md](CONTRACT.md) retains the complete
release floor and the flagship destination.

## The everyday experience

Most people need one conversation to ask for help, follow progress, correct the request, change a
date, cancel, or say “still not working.” Beside it, a small **Needs your decision** view contains
only work requiring this person's authority or judgment. Nobody opens a queue just to see if Linen
is doing its job.

Linen interprets and routes work, correlates reports, follows up, retries only known-safe
operations and checks outcomes. It does not ask people to classify requests, link incidents,
acknowledge routine progress, confirm authoritative facts, or approve work covered by a current
grant. It asks for unavailable facts or a real choice, bundles related unknowns and retains
context.

Incident, decision, service, asset, change, evidence and owner controls open in context when
needed; they are not nine required destinations or a service-graph/workflow builder. Evidence
expands on demand. The normal view states the outcome, status, exception owner, what happened and
the next safe step. Technical traces do not replace that explanation.

Standing grants are scoped, versioned and revocable; Linen checks them at each effect and cannot
silently widen them. If a fact, grant or judgment is missing, it names the right person, bundles
the request with context and preserves work. Unavailable people trigger preauthorised escalation;
silence is never approval. A correction, pause, cancellation or privileged takeover fences
competing work and explains known, stopped and uncertain effects. Machine-verifiable completion
needs no acknowledgement or digest.

After a correction or cancellation, Linen says what it has verified stopped, what already took
effect, and what remains uncertain. In the same conversation it offers any available reversal or
compensating action, explaining what can still be stopped or reversed, what is irreversible or
uncertain, and the material consequences. It checks the current grant before acting and proceeds
without another approval when the existing request or grant covers it; it asks only when a real
decision or authority is missing. It never promises universal undo or claims work stopped before
verifying it.

The words shown in these journeys are illustrative design copy. They do not describe an existing
connector, grant, provider result or measured experience.

## Journey 1: connect Linen and start safely

**Trigger and person.** The service owner starts Linen beside an incumbent desk or for a
greenfield team. They choose the target account and authorise each supported connection through
its normal sign-in and consent flow. Linen shows what each connection can read or change before
that consent is granted.

**Linen does the preparation.** It discovers permitted identities, work, services, groups,
approvals, channels, automations, devices and existing mappings, then prefills record/effect
ownership, approval sources, observable state and verifiable outcomes with provenance and
freshness. It finds incumbent automation that could compete. For greenfield, it proposes a small
native desk from connected identity and communication sources. Unknowns stay visible; discovery
does not create grants or imply provider support.

**The one review.** Linen presents the actual sources and boundaries, proposed effect ownership,
read/write rights, standing grants, material privacy/recovery choices, gaps and conflicts. Its
plain summary might say: “Keep the current desk as request and approval owner; let Linen execute
these selected actions and write back evidence.” The owner corrects only undiscovered facts.
Current policy sends each grant to its actual authority holder; the packet does not merge
distinct approvers. Writes stay off if executor ownership or approval evidence cannot be validated.

**Result and exception.** The owner first sees what Linen is taking care of and the genuine
gaps: “Requests and identity are connected. I’ll handle authorised access changes; a laptop
return still needs an assigned person.” The proposed service map is optional detail. An
ambiguous source or missing authority is bundled into the review for the person who can resolve
it.

**Proposed effort budget.** One setup session and consolidated review; at most 15 active owner
minutes for one supported environment, including every provider sign-in and consent. Count extra
authentication, correction, vendor and technician work as effort and a budget breach. Routine
manual mapping/workflow-building target: zero. Report external wait beside active time.

## Journey 2: one request for access or help

**Trigger and words.** An employee writes once in their existing channel: “I need Orders for the
west-region cover this week.” Linen uses permitted context to resolve purpose, the exact Friday
expiry and the employee's timezone; it asks only if a material fact such as the end date is
genuinely ambiguous.

**Linen does the work.** It resolves the authenticated person, beneficiary, service, purpose and
expiry from the request and permitted context, then checks current access, role, licence, policy
and safe verification. A current standing grant carries covered work forward in the same
conversation. The employee does not classify the request, find its approver or repeat known
facts. Linen asks one specific question only for a genuinely missing material fact.

**What the employee sees.** “I found the Orders request and Friday expiry. I’m checking access.”
After independent checks: “You can enter orders until Friday at 17:00 Brisbane time. Reply here
if it is still not working.” Role/sign-in evidence can expand; no reply gates the machine-verified
result.

**Exception and recovery.** On timeout, Linen checks remote state under the same operation
identity before a safe retry; the employee does not investigate an ambiguous effect. A missing
licence or physical task goes to its accountable owner while the employee sees what remains.
“Still not working” or a changed end date updates this request and invalidates affected authority.
A separately authorised expiry obligation removes access Friday, then verifies remote removal
and denial without asking the employee to remember or confirm. Failure or missing authority is
an urgent owned obligation. Cancellation never erases completed effects.

**Proposed effort budget.** One employee request; zero routine follow-up, operator interruptions
or approvals under current grants. Target at most 2 active employee minutes. Count every actual
decision and manual/vendor/technician task for each person as an exception.

## Journey 3: authoritative join, move and leave

**Trigger.** An authorised HR event starts work without duplicate employee/IT requests. HR is
authoritative for employment facts. Linen checks source identity, effective time and grants; it
never infers a hire, move or departure from a suggestive message.

| Event | Linen carries the distinct obligation | Status the person can understand |
|---|---|---|
| **Join** | Prepare only the role's authorised baseline access, scheduled for the effective start; reserve and verify required software/device fulfilment; preserve a physical pickup or delivery task when one is needed. | “The approved day-one access is ready for Monday. Laptop pickup is the remaining physical task, assigned to Casey.” |
| **Move** | Compare old and new role/location facts; retain still-valid access, add newly authorised access, and remove old access only under its own current grant. Re-evaluate dates, manager, licence and device/custody dependencies. | “The new role starts 1 October. Two existing entitlements remain; one change is waiting for the service owner's authority.” |
| **Leave** | Apply authorised access/session removal at the effective time; preserve independently valid entitlements; keep device return, custody and disposal as open obligations until evidenced. Handle urgent dates and already-disabled users explicitly. | “Account access is disabled and the removal is verified. The laptop return is still open with its named owner.” |

These example statuses require real future evidence. A changed start date updates the same
record and schedule; a cancelled hire stops unstarted work and reconciles effects already made.
Urgent departures use authorised escalation. An unreturned or conflicting device stays an owned
custody task after account closure. Conflicting HR facts or a missing service owner are bundled
for the right authority holder while unrelated safe work continues.

**Proposed effort budget.** Zero new employee/IT tickets, routine manager confirmation, repeat
approval or operator touch when grants suffice. Count each physical pickup/return, vendor visit
or technician task and all participant minutes; do not claim a handoff was automated. Report
corrections and exceptional decisions by role, separate from external wait.

## Journey 4: a detected or reported service outage

**Trigger and words.** An authorised service signal can start work before a ticket, or an employee
can write: “I get an SSO error at the order page and cannot submit a renewal.” Linen checks the
workflow, not just component health, and proposes shared impact from identity/service/time
evidence while preserving each person's report. No one manually links duplicates; reports can
correct the proposed service or impact.

**Visible progress.** “New sign-ins to Orders are failing. We’re checking the service and will
update you here.” Linen says this only when evidence supports it. Operators see an exception
only for real authority or judgment; diagnostic scope, evidence freshness, competing changes and
cohort gaps open in context. Progress needs no acknowledgement.

**Familiar and unfamiliar cause.** Linen runs scoped read-only checks in parallel, tests rival
causes with predicted observations and safe probes, and pursues frontier research when known
repairs do not fit. A missing diagnostic or repair becomes an engineering change in its owned
source. Engineering grants cover development, tests and preauthorised canaries; a separate
current service grant covers production effects. The service agent creates neither. Covered work
and independent checks proceed without a human click; otherwise Linen asks only the authority
holder for the missing choice.

**Recovery and exception.** An independent verifier checks new sessions and the order workflow
across affected groups, including negative and unobserved scope. It may say: “London teams can
enter orders again. We’re still checking Sydney.” Expandable evidence shows which roles, places
and workflows passed or remain unchecked. A failed rollback, late receipt, changed grant or
conflicting deployment stays unresolved with its effects and next owner. Linen reconciles before
retry, sends preauthorised escalation when a person is unavailable, and never treats silence as
approval. Employees can ask, correct impact or say “still not working” in context. Verified
recovery needs no human confirmation.

**Proposed effort budget.** A granted prevention fix targets zero human interruptions or employee
tickets; a reported incident targets no further employee questions when evidence suffices. No
routine operator touch, incident-linking, progress acknowledgement or post-incident form. A real
authority decision targets one interruption and at most 5 active minutes per required holder.
Count vendor, technician, rollback and takeover effort. These are not recovery claims.

## Journey 5: make a material business decision

**Trigger.** A commitment or incident exposes a choice that policy and technical evidence cannot
settle. An identity-service renewal might retain current coverage, buy the supplier's quoted
failover option or defer. Linen does not invent the quote or risk preference.

**One clear decision.** The accountable business owner sees a recommendation, material
alternatives, affected people/services, quoted cost and period, service impact, reversibility,
evidence and uncertainty. The summary states the consequence of acting or deferring, ongoing
risk, deadline and blocked work. Identity, decision duration and intended effect are visible;
technical detail expands without hiding material consequences.

**Example decision copy.** “Recommendation: add failover for $[quoted monthly cost] through
[contract term]. It covers [named regions]. If you defer, single-region exposure remains until
[date]. Cancellation is available [verified contract condition]. Choose failover, keep current
coverage or defer?” Bracketed values come from the quote, cohort and contract; unknowns stay
unknown. No actual price or recommendation is implied.

The owner chooses, amends, rejects or defers. Policy-required manager, security or finance
decisions remain distinct, each with current relevant facts. A business choice is not an
execution grant. Linen rechecks action authority at the effect boundary and independently
verifies the supplier/service result.

**Exception and result.** Unknown quote, cohort or reversibility is bundled for its real
source/owner; the affected decision waits. A material change invalidates that decision and
returns updated consequences in context. Deferral records live exposure and a next date, never
approval. Verified outcomes and unresolved effects remain in the conversation.

**Proposed effort budget.** One concise packet and action per actual approver; count each
separately. Target at most 3 active minutes per person; report extra reading, consultation,
delay, correction and missing evidence rather than trimming material detail or waiving a role.

## Journey 6: keep improving until work disappears

**Trigger and commitment.** The owner establishes an outcome such as “Every scheduled starter can
do their first job by the first shift.” Linen proposes cohort, source events, checks, freshness,
dependencies and coverage for correction in the setup review, then carries the commitment
across case closure, restarts, changed staff and later releases.

**Observe and investigate.** Authorised events and checks show whether the outcome is
threatened; ordinary unchanged telemetry is filtered without waking people or calling a model
for every log line. A gap is not healthy silence. For example, if the start-time check fails but
account and device systems look healthy, Linen can investigate an unfamiliar handoff between
them. It preserves rival causes, predicts which evidence distinguishes them and develops a
missing probe where needed. No one has to open a problem ticket, run a weekly review or restate
the service goal.

**Repair and simplify.** Under separate engineering and service grants, Linen can create a
diagnostic, test a fix, release a bounded change and observe whether the actual first-work
outcome improves. An independent verifier tests the changed path, affected roles and a
near-match with a different cause. A verified case can become a versioned reusable
detector/action/verifier package; material source, provider or context drift triggers fresh
validation. Linen compares continued repair with a service redesign that could remove the
repeated handoff. It counts migration, owner, employee, vendor and technician effort, shifted
work, failures and adverse outcomes, not merely fewer tickets. A genuine business tradeoff goes
through Journey 5; the system never expands its own authority.

**Result and exception.** The conversation reports the observed outcome, cohort and freshness
limits, work removed, remaining unknowns and any open obligation. It retains an optional digest
for people who want it, but no routine review, confirmation or digest is required. If an
observation is stale, a fix does not generalise, a grant is missing or a person must perform
physical work, Linen says so and names the next owner. A similar symptom with a different cause
starts investigation rather than replaying a repair.

**Proposed effort budget.** Zero mandatory routine review, acknowledgement, report-building or
employee follow-up. Existing grants carry eligible work continuously; each genuine decision uses
Journey 5's budget. Measure all human minutes and interruptions from setup through missing
configuration, correction, failure, physical work, vendor/technician handoff, takeover and
upkeep, alongside verified outcomes and unresolved work. Fewer notifications or tickets alone do
not meet the budget if work was missed or shifted elsewhere.

## Reviewing the app against the journeys

The running app should be walked through all six journeys, including discovery gaps, refusal,
denied authority, partial and ambiguous effects, changed facts, recovery, physical custody,
business deferral, takeover and “still not working.” Show what is preauthorised, what asks for a
human decision, and what continues in the background. Keep deep operational detail expandable
from the person's current work; do not require navigation through a service graph or workflow
builder.

Have employees and operators explain what is happening, whether they need to act and what has
actually been verified. Include keyboard/mobile access, private and public separation,
notification failure and outage recovery access. Count active minutes and interruptions by
employee, operator, owner, vendor and technician, including setup, correction and failure paths.
Passing this review establishes only that the experience is understandable; it does not
establish a provider effect or pass a product release gate.
