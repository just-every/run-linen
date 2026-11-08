# sx-linen-c-f17 report

Repository: just-every/run-linen
Product branch: cloud/sx-linen-c-f17
Candidate: d7e6c7dc15809b4af88aacd108dad41bb0595bcd
Base main: 3bf801acbe2ed85026ba5aa397dd4982fed09b37
Draft PR: https://github.com/just-every/run-linen/pull/155

## Result and lease

The sole selected missing acceptance outcome is KB-001 point 2. The existing source already filters reviewed knowledge by future expiry. This round extends the existing public runtime journey; it changes only that test and its generated source lock entry. No application or screen changes were necessary.

The reviewed employee article is created by owner POST to /knowledge with a real deadline ten seconds in the future. Existing employee search, private-HR exclusion and revision-bearing escalation assertions remain. A second reviewed matching article is created through the owner route with a later deadline. Employee GET to /knowledge?q=VPN returns both exact identities before the first deadline. After a real timer crosses that deadline, the identical employee query returns only the control, with its full returned article unchanged. There is no expiry update in D1, no application clock replacement, no test clock header and no fake provider in this knowledge proof.

The full work plan is PLAN.md. Its six steps were completed except for final remote gates as recorded below. The shipped plan's KB-001 entry should record point 2 proven by the expiry case, with point 1 retained by the reviewed search and escalation case. No other campaign target was selected, no lane file was changed, and no historical plan was rebuilt.

Live stored counts remain 20 DONE, 142 PARTIAL, 37 MISSING of 199 before and after this product commit. If the fleet accepts KB-001 DONE, the proposed counts are 21 DONE, 141 PARTIAL, 37 MISSING. No contract Status, Gap, Evidence, summary, acceptance text or generated view was committed.

## Acceptance proof and frozen rubric

| Item | Outcome and public door | Exact test and lines | Result |
| --- | --- | --- | --- |
| P1a | Employee searches a reviewed article created by owner | tests/work/runtime.mjs:574–585, reviewed knowledge search | PASS in exact-head runtime |
| P1b | Employee escalates that article into a request carrying revision 1 | tests/work/runtime.mjs:597–603, reviewed knowledge escalation | PASS in exact-head runtime |
| P2 | A previously visible reviewed article disappears from employee search after its actual expiry | tests/work/runtime.mjs:573–640, KB-001 reviewed article expires from employee search | PASS in exact-head runtime |
| P2 control | The unexpired matching article remains visible with unchanged returned content and revision | tests/work/runtime.mjs:604–634, same expiry case | PASS in exact-head runtime |
| E7 knowledge duty | Reviewed employee search and escalation preserve the article revision; reports remain owned by E7 | tests/work/runtime.mjs:574–603 | PASS in exact-head runtime; no broader E7 claim |
| Scope safeguard | The existing employee knowledge list omits the reviewed HR article | tests/work/runtime.mjs:586–595 | PASS in exact-head runtime; preserved assertion |

The incumbent named by the contract is Freshservice. Article expiry should remove stale guidance from the employee knowledge results. The committed test distinguishes that visible outcome from clearing the entire result set because the unexpired match must survive.

These behaviours use the actual seed knowledge routes and persistent Miniflare D1, with the existing test-only authenticated-principal fixture. No live account or provider is required by either KB-001 acceptance point. Existing provider, Base, account, ct and device holds remain unchanged; KB-002 still owes authorized Confluence, Google Drive, SharePoint and Notion sources and readers and the maintained Base egress door for local Slate. That omitted scope is neither credited nor waived.

## Actual exact-head run

Run identity: sx-linen-c-f17-work-runtime-20261108T211536Z.
Command: timeout 600 python3 /tmp/rer-reap.py node tests/work/runtime.mjs.
Started: 2026-11-08T21:15:36.947840Z. Elapsed: 71.161 seconds. Exit: 0.
This is the committed timing journey executed directly in the dedicated cloud VM, outside push Verify, as the cloud adaptation requires. expiry-probe.json and work-runtime.log contain the actual observations.

The original reviewed article was observed before expiry at 2026-11-08T21:16:27.434Z. Its expiry was 2026-11-08T21:16:37.392Z. The employee response recorded at 2026-11-08T21:16:37.508Z contained only the unexpired control. Both identities and both result sets are in expiry-probe.json.

The same full touched runtime passed before committing. The exact-head rerun additionally passed typecheck, first-party validation, lock freshness and contract view freshness. local-checks.json binds every command, start time, elapsed duration, exit and log hash to the full candidate SHA. Local runtime was Node v24.19.0 with pnpm 10.12.4; CI uses the repository Node 22.20.0 pin. Runtime registration count changed by zero; no permanent test was added or removed.

## DONE riders

| Rider | Assessment | Evidence |
| --- | --- | --- |
| 1 | Local outcome proof PASS; exact-head Verify recorded separately below | P1 and P2 rows above; work-runtime.log and expiry-probe.json |
| 2 | PASS | Real seeded articles, exact identities before and after expiry, nonempty unchanged control; tests/work/runtime.mjs:574–634 |
| 3 | REMOTE VERIFICATION PENDING | Existing Service desk and lifecycle journey in scripts/verify.mjs:15 invokes tests/work/runtime.mjs; Verify 42524298160, pull_request, candidate SHA |
| 4 | PASS | Every local-checks.json entry binds the unchanged test and application to the exact candidate; no edit followed the candidate commit |
| 5 | INSPECTED | KB-001 cites no separate Base duty; its knowledge duty names E7 explicitly and point 1 names search and escalation with the article revision. No inheritance rewrite |
| 6 | MECHANICAL PASS; judgment bookkeeping deferred | Generator write reported zero documents, check passed; generated files restored from origin main; Status cells intentionally untouched for the lander |
| 7 | PASS INSPECTED | CONTRACT.md, RULINGS.md and acceptance wording unchanged |
| 8 | PASS INSPECTED for this lease | No authority or dangerous operation changed; owner creation, employee read and existing HR exclusion remain in the passing runtime. No broader authority claim |
| 9 | PASS INSPECTED | No live provider, legal, device or federated-source claim. All held scope remains explicitly outside this result |
| 10 | PASS INSPECTED | No policy default adopted and no new authority or scope |
| 11 | PENDING GUARDED LANDING | Product remains branch-only. Main equality, full-history publication scan and candidate Run site belong to the maintained Mac lander |

## Pre-ready self-check

1. Behaviour proof: the expiry case checks actual route output before and after real elapsed time. If the expiry predicate is removed, the expired ID remains and the exact after-ID assertion fails; if search drops everything, the control assertion fails. This is inspected from the query and assertions, not a claimed mutation run. Exact-head Verify is recorded below.
2. Existing assertions: none removed, narrowed, skipped, or placed behind conditions. Only the reviewed article's old fixed expiry is replaced by a relative future deadline.
3. Authority, erasure and replay: no product path changed. Existing current-membership, private-HR exclusion, erasure and replay assertions run in the same exact-head work runtime. No new provider effect or authority is claimed.
4. Screens: no screen or control touched, so viewport proof and tooltip audits are not applicable to this test-only change.
5. Local mechanical checks pass. Publication scan, main equality and candidate Run site remain unestablished in cloud. No email-shaped string, provider key or prose repository token was added by the diff. The only product changes are the runtime test and its generated lock digest.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0
PROBE KB-001 2: owner POST /knowledge for two reviewed matching articles; employee GET /knowledge?q=VPN before and after actual expiry -> two matching IDs before, only the identical unexpired control after; exit=0

## Custody and remote gates

Product push succeeded on attempt 1 through the supplied cloud push guard. The full candidate author and committer are Run Edit Run fleet at the fleet address, with no co-author trailers. identity-audit.txt records every candidate message and identity, including any side parents (there are none). Product diff and current-source lock are preserved in the packet.

Main was green when checked at base 3bf801acbe2ed85026ba5aa397dd4982fed09b37: Verify 42523282288 (push) and 42522115743 (workflow_dispatch), Run site 42523282290 (push), all completed success. The exact candidate branch was independently read back from origin at d7e6c7dc15809b4af88aacd108dad41bb0595bcd; main still named the base at that check.

Exact candidate Verify: 42524298160, pull_request, still in_progress with no conclusion at 2026-11-08T21:25:50.410750+00:00. No dispatch or rerun was issued. The additional PR dynamic run is 42524295451; it is not treated as Verify.

Publication scan for d7e6c7dc15809b4af88aacd108dad41bb0595bcd: NOT RUN IN CLOUD; complete=unestablished, historyScanned=unestablished, findings=unestablished. The full-history clone was available to the cloud task. The guarded lander must run the required complete scan and require zero findings on its candidate before landing. No scan success or landed main is claimed.

No local failure requires a repair. No application or scope blocker was found. Remote verification and landing remain as named above. Evidence publication is separate from product readiness and must not count as acceptance or landing.

## Packet and publication boundary

The explicitly selected packet contains PLAN.md, REPORT.md, local-checks.json, expiry-probe.json, handoff-receipt.json, diff-hygiene.json, product.diff, identity-audit.txt, product-push.log, pr.json, main-ci.json, candidate-ci-discovery.json, candidate-ci-status.json, work-runtime.log, typecheck.log, first-party.log, source-lock.log, contract-views.log, contract-views-write.log and contract-views-precommit-check.log. The terminal EVIDENCE line identifies the report-only commit for the fleet to fetch and verify. No credential file, environment dump, private held-out gate material or symlink is selected.

The task's next terminal result must distinguish the candidate's own Verify from base main's green runs. If Verify remains pending, no exact-head green or landed count is claimed. The report does not substitute for the maintained lander's independent gates.

## Terminal assessment

CLAIM KB-001 PARTIAL points=1,2 tests=tests/work/runtime.mjs#Service desk and lifecycle
GAP KB-001: Both native acceptance points pass locally on the exact pushed head; exact-head Verify 42524298160 is still running, so rider 3 is not yet established. No real product failure or external dependency was found for KB-001.

Point 2's implementation proof is complete. KB-001 is not counted DONE in this cloud return because its exact-head CI has not finished. The full contract remains unchanged and its stored counts remain 20 DONE, 142 PARTIAL, 37 MISSING. Promotion to 21 DONE, 141 PARTIAL, 37 MISSING is a proposed lander result only after the independent gates accept it.

Five GitHub API calls were made: one exact-base run discovery, one draft PR creation, one exact-candidate run discovery, and two exact-run status reads spaced at least five minutes apart. No CI dispatch, rerun, failed-log fetch, API polling loop or additional pull request was used. No workflow failure is reported; the candidate run remains in progress. The cloud return is PUSHED, not BLOCKED and not a claim of green CI.

The clone is eligible for cleanup after successful packet publication because the full product head has been pushed and independently read back. The durable packet remains outside that clone. The terminal EVIDENCE line records the independent report-only ref and head.

POST lanes/sx/INBOX.md: sx-linen-c-f17 KB-001 point 2 real-deadline expiry proof closed locally; points 1 and 2 pass in the exact-head work runtime; claim PARTIAL pending Verify 42524298160 (pull_request, in_progress); branch cloud/sx-linen-c-f17 head=d7e6c7dc15809b4af88aacd108dad41bb0595bcd PR=https://github.com/just-every/run-linen/pull/155; counts unchanged 20 DONE, 142 PARTIAL, 37 MISSING; no contract cells or held scope changed; base Verify 42523282288 and Run site 42523282290 were green.
PUSHED branch=cloud/sx-linen-c-f17 head=d7e6c7dc15809b4af88aacd108dad41bb0595bcd
