# sx-linen-c-f38 — DESK-020 read proof

Candidate: `9043ff599964452f9824b1aaa1ad049034e95d53` on `cloud/sx-linen-c-f38`.
Repository: https://github.com/just-every/run-linen
Draft PR: https://github.com/just-every/run-linen/pull/172
Base inspected and fetched: `fcc2e53de937ab2ae17938147920b871b5fe70f5`.

DESK-020 point 4 is the only selected gap. The live Status row says agents and auditors reading each ticket's targets and the period report were unasserted; the owner reads, requester refusals, pauses and breach times were already asserted. This round extends that existing sanity journey. No production authority or contract acceptance text changed. The auditor is an explicit beneficiary of the two tested ordinary tickets; the auditor role alone still cannot read an unrelated ticket. That preserves the lease's permitted-ticket boundary rather than granting a new reader capability.

## Plan and completed work

1. Read the live clause, existing journey, public route handlers, current membership checks, ticket readership, report scope, supplied plan extract, rulings and DONE-RIDERS. The only unproved selected outcome was the operator and auditor allowed read case. Kept the supplied ROLE-001 hold and all unselected account, Base, device and ct obligations unchanged. Did not rebuild or write a lane plan.
2. Extended `tests/work/sla-policy-cases.mjs` through the existing `tests/work/runtime.mjs` adapter. Created distinct active memberships holding only operator and auditor, pinned this journey's request clock to 30 January 2026, and created ordinary tickets with business and calendar policies through native work and classification routes. The operator and owner create the two requests for the auditor as beneficiary using existing authority.
3. Read both tickets' SLA targets as owner, operator and auditor. Asserted the bound policy, hour mode and all three configured target durations; literal first-response and resolution deadlines, breach state and exact breach times; and equality with those same tickets' report rows. Report requests declare the same explicit period and time zone. Asserted every returned ordinary row, exact denominator five, five first-response breaches, five resolution breaches and one met next response. Added real restricted, HR and upper-boundary fixtures to prove they do not inflate the report. Retained requester 403s, restricted and HR 404s, and unrelated-auditor ticket 404.
4. Ran the touched work runtime, typecheck, first-party check, contract generation write and check, and source lock generation and check. Fetched main, made the first real commit, performed the required no-op rebase against the fetched unchanged main, regenerated views for checking and restored them, and regenerated and checked the source lock last. Checked every candidate identity and message and pushed through the fleet guard on its first attempt. Opened the one draft PR because Verify is triggered by pull requests for this branch. No CI dispatch or rerun.
5. Keep all reports and receipts outside the product tree, publish explicitly selected non-secret files only to this run's evidence ref, and hand the exact product head to the guarded Mac lander. The lander owns publication scanning, final promotion, landing and Run site.

## Acceptance and inherited duty register

All line references below are in the candidate tree. All public routes run in real D1 through `tests/work/runtime.mjs`, which existing Verify invokes under the Service desk and lifecycle journey in `scripts/verify.mjs:15`. Native authentication principals use the existing test adapter; live membership is checked by production services.

| Item | Public proof and candidate lines | Local result | Exact-SHA Verify |
| --- | --- | --- | --- |
| DESK-020 point 1: named requester or vendor pauses stop the configured clocks; internal holds do not | `tests/work/sla-policy-cases.mjs` slaPolicyChecks lines 56–75, plus escalationChecks lines 200–249 for a pre-deadline vendor hold and resume | PASS, preserved | Verify 42569904535, pull_request, completed and success |
| DESK-020 point 2: a late pause never clears a breach | slaPolicyChecks lines 59–62 | PASS, preserved | Verify 42569904535, pull_request, completed and success |
| DESK-020 point 3: late-met or still-unmet targets breach at the due time | slaPolicyChecks lines 43–47, 78–86 and 110–126; tests check late first response and unmet resolution, exact due time and breach timestamp | PASS, preserved and extended | Verify 42569904535, pull_request, completed and success |
| DESK-020 point 4: owner, agent and auditor read permitted ticket targets and period report | slaPolicyChecks lines 6–10 and 96–137, two real ordinary policies, three distinct readers, scoped exact rows and counts, both public read doors | PASS, newly closed | Verify 42569904535, pull_request, completed and success |
| Inherited DESK-004 policy and calendar duty | Existing slaPolicyChecks lines 12–54: owner ordering, requester-group match, New York calendar and federal holiday; new read cases retain these policy bindings | PASS | Verify 42569904535, pull_request, completed and success |
| Existing ticket authority and report scope | slaPolicyChecks lines 96–137: beneficiary-bound auditor, requester role refusal, unrelated auditor refusal, restricted and HR exclusions and explicit period | PASS | Verify 42569904535, pull_request, completed and success |

## DONE-RIDERS

| Row | Result | Evidence |
| --- | --- | --- |
| 1 | PASS | Acceptance register above; genuine seeded targets and nonempty report outcomes through both public routes |
| 2 | PASS | slaPolicyChecks lines 98–137: two distinct policies, exact literal deadlines, exact row IDs and counts, and refused reader cases |
| 3 | PASS | Verify 42569904535 completed successfully as a pull_request run on the exact candidate; existing runtime entry is `scripts/verify.mjs:15` |
| 4 | PASS by source identity | `RECEIPT.json` records the relevant candidate blobs; local tests ran with the same source and test bytes before the lock-only commit operation; subsequent rebase changed no bytes |
| 5 | INSPECTED | DESK-020 retains its explicit From DESK-004 meta line and its pause and breach duties; no new Base inheritance is claimed |
| 6 | PASS mechanically; lander owns status bookkeeping | Generator write produced zero changed files and check passed; contract cells, generated documents, counts and provenance remain exactly main's |
| 7 | PASS | No acceptance point, ruling or coverage changed; no status row was edited or dropped |
| 8 | PASS for selected reads | slaPolicyChecks lines 131–136 retains requester refusal and demonstrates unrelated auditor and restricted and HR refusal; dangerous mutation verbs are outside this read-proof change |
| 9 | PASS | No provider, legal, retention or device completion claim; all held remainders remain unchanged |
| 10 | PASS | No new policy default, role, grant, assignment, approval or department readership; the selected auditor is a current authorized beneficiary |
| 11 | PENDING guarded landing | Main does not equal the candidate yet; full-history publication scan and exact-main Run site are lander duties |

## Pre-ready checks

- Every selected user-visible read outcome has a meaningful route assertion against real populated rows and independent literal target deadlines. No existing assertion was removed, narrowed, skipped or hidden behind a branch condition. Test registrations added zero; removed zero.
- Existing runtime revoked-membership, erasure and restore-replay refusals ran and passed with the entire touched runtime. No production authority, erasure or replay code changed.
- No screen, control or UI source changed. Browser proof and the touched-screen audit do not apply to this route-proof-only lease.
- Typecheck and first-party check passed. Source lock is fresh. Contract write and check passed; generated views were restored from main and are not committed. No migration changed, so ledger work does not apply.
- Added product lines contain no email-shaped string or credential-shaped fixture. Existing legacy fixture text is unchanged. The only added bare slash-token matches are the required IANA time zone already used by this test. Full publication scan is not established in cloud and is never represented as complete here.
- Branch push succeeded on attempt 1. Commit author and committer are fleet identity, with no trailers. Product checkout was clean after generation. No main or default-branch push was attempted.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0.

PROBE DESK-020 4: distinct active operator and auditor GET permitted business and calendar ticket targets and explicit period report -> 200; bound durations and exact breach times; five normal report rows and breaches; one met next response; restricted, HR and upper-boundary rows excluded; requester reads 403; unrelated auditor ticket read 404.

CLAIM DESK-020 DONE points=1,2,3,4 tests=tests/work/sla-policy-cases.mjs#slaPolicyChecks; tests/work/sla-policy-cases.mjs#escalationChecks

Before and after committed counts remain 27 DONE, 135 PARTIAL and 37 MISSING of 199. The requested post-gate promotion of DESK-020 from PARTIAL to DONE would yield 28 DONE, 134 PARTIAL and 37 MISSING, subject to independent gate and lander judgment. No plan rows were edited; report the DESK-020 selected point as closed and the candidate as ready for its independent gate. No next clause was taken because the planner lease selects this proof only. Existing ROLE-001 and other held queues remain held.

Publication scan exact-SHA receipt: commit=9043ff599964452f9824b1aaa1ad049034e95d53 complete=UNESTABLISHED historyScanned=UNESTABLISHED findings=UNESTABLISHED, cloud exemption; guarded lander must establish COMPLETE with zero findings. Main equality=false; Run site id=not yet applicable. No blocker is known from local proof.

CI observation 1: Verify 42569904535, pull_request, exact head 9043ff599964452f9824b1aaa1ad049034e95d53, status=in_progress, conclusion=null. The one watcher polls no sooner than 301 seconds after discovery or its preceding poll. GitHub API calls used so far: 3 (PR creation, exact-head discovery, one status poll).

CI observation 2: Verify 42569904535 remains in_progress on exact head 9043ff599964452f9824b1aaa1ad049034e95d53, conclusion=null. GitHub API calls used: 4. No dispatch, rerun, repair or product change occurred.

Final CI observation: Verify 42569904535 completed with success on exact candidate 9043ff599964452f9824b1aaa1ad049034e95d53, event pull_request. URL: https://github.com/just-every/run-linen/actions/runs/42569904535 . Five GitHub API calls were used: one PR creation, one exact-head discovery and three status polls spaced more than 300 seconds apart. There was no dispatch, failed-job log read, rerun or repair.

Riders 1, 2, 3, 4, 6, 7, 8, 9 and 10 pass; rider 5 passes by inspection with no newly claimed Base inheritance. Rider 11 awaits guarded landing, the full-history publication scan and exact-main Run site. All applicable pre-ready checks pass for the selected route-proof change. No blocker remains for handoff. Draft PR 172 remains open for the lane; no merge was performed.

READY repo=just-every/run-linen branch=cloud/sx-linen-c-f38 head=9043ff599964452f9824b1aaa1ad049034e95d53
