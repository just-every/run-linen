# sx-linen-c-f12 — DESK-019 empty eligible cohort

Repository: https://github.com/just-every/run-linen
Branch: cloud/sx-linen-c-f12
Candidate: 3ed22f7464b132584cc0f895531da83b918ef4c3
Base integrated: c4e9852d1098215b0371a6c67a9a721be85a88cf
Draft pull request: https://github.com/just-every/run-linen/pull/149

## Result and scope

Closed the selected acceptance point 3 proof in the existing deskRoutingChecks journey. The production implementation already supports the behavior; no runtime implementation change was necessary. Two active members belong to the selected group, but neither has the routing rule's required skill. For each of round_robin and load, public ticket creation selects that group with a null assignee. Explicit rerouting at the read revision returns the same group and null assignee, identifies no_available_agent, and increments the revision. Subsequent reads verify persistence and exactly two truthful routing entries with their rule actor, parseable time, method and before and after placement. The requester is still refused history with 403. Assignment mode none is never used for the new cases.

The selected lease names only point 3. Main's existing acceptance text, Status, Gap and Evidence cells are byte-for-byte preserved. No policy default or new authority was adopted. ROLE-001's acting-role grants, revision reconfirmation and custom-agent seat decisions remain held as stated in the brief. DESK-017, DESK-027 and DESK-028's maintained keyed-identity port and coordinated legacy-marker migration remain owed. No helper patch, erased-value reconstruction, new assignment authority, account or device claim is included.

## Full plan and execution

The actual plan is PLAN.md. Read the inline fleet rules, plan extract, rulings index, Linen rulings, DONE-RIDERS, launcher AGENTS.md, repository AGENTS.md, README.md, generated acceptance view, DESK-019 and DESK-003 source clauses, routing implementation and existing work runtime invocation. No fleet inbox or state file was read or written.

Extended one existing journey by 33 lines. Added no test registrations, removed or narrowed no assertion, and added no width or branch condition around existing coverage. Runtime proof remains in the Verify command's Service desk and lifecycle journey through tests/work/runtime.mjs, invoked at line 133. No UI screen changed; browser proof and icon-control audit are not applicable to this test-only change. No permanent pin or copy test was introduced.

Ran setup, touched work runtime, typecheck and first-party check successfully. Generated and checked contract views, restored the generated files from origin/main, regenerated the source lock last and ran its integrity check. Initial rebase was refused because of unstaged work; saved the complete diff outside the clone, restored tracked files, rebased cleanly onto fetched main and reapplied the diff. No source or test bytes changed across this integration. All source and test byte bindings are recorded in receipt.json. No published history was rewritten. Fleet hooks were reinstalled after dependency setup. The first real commit was immediately pushed by cloud-push.py, with all candidate authors, committers and trailers inspected. Push succeeded on attempt 1. Opened the single draft PR because Verify accepts pull requests, while ordinary cloud branches do not trigger its push entry point.

## Acceptance evidence map

The round changes point 3 only. Existing evidence for other points is retained; it is not a new campaign on other clauses. All line numbers below refer to the candidate's ./tests/work/desk-routing-cases.mjs unless otherwise stated. Local execution of deskRoutingChecks passed through the work runtime, on bytes identical to this SHA. Exact candidate Verify 42515634381, event pull_request, completed successfully on this SHA; see CI.md and the actual REST receipt files.

| Point | Outcome | Evidence and result |
| --- | --- | --- |
| 1 | Round-robin uses eligible join order after the last automatic assignee. | Retained public creation at lines 41–46, available-agent result; implementation ordering inspected in ./src/features/work/desk-routing.ts lines 45–52. Existing main proof retained, local runtime PASS. |
| 2 | Load uses fewest open tickets with round-robin tie order. | Retained public creation at lines 47–50 after two busy-agent tickets; implementation stable ordering and load reduction inspected at ./src/features/work/desk-routing.ts lines 45–52. Existing main proof retained, local runtime PASS. |
| 3 | No candidate leaves the ticket in its chosen group unassigned. | New public configuration, creation, read, explicit reroute and history at lines 105–136; both automatic methods execute against members lacking the required skill. Local runtime PASS. |
| 4 | Restricted and HR tickets are placed without automatic assignee. | Retained restricted creation and read at lines 53–59, local runtime PASS. HR is excluded by the same normal-only guard at ./src/features/work/desk-routing.ts line 63; that unchanged branch was INSPECTED, not represented as a new HR journey receipt. |
| 5 | Routing, placement and manual assignment have actor, time and before and after readable to agents. | Retained public assignment and reroute with ordered history at lines 90–102; new empty-cohort history at lines 129–135. Group placement remains covered by deskGroupChecks in ./tests/work/desk-group-cases.mjs, also executed by the passing runtime. |
| 6 | Requesters do not read groups or routing. | Retained requester reroute denial and history refusal at lines 92 and 103–104; new history refusal at line 136. Local runtime PASS. |

## Frozen selected-point rubric

| Row | Public-door requirement | Result |
| --- | --- | --- |
| R1 | Automatic assignment with genuinely no eligible member. | MET: two active members lack the required skill, each configured automatic method is executed; no none substitution. |
| R2 | Create through /work and read chosen group with null assignee. | MET: lines 113–118, both methods. |
| R3 | Explicitly reroute through /work/:id/route and read persisted placement. | MET: lines 119–128, both methods; no_available_agent and revision advance asserted. |
| R4 | Truthful readable routing history. | MET: lines 129–135 assert exactly two entries, actual method, before and after, actor and time. |
| R5 | Restricted-ticket and requester-history exclusions retained. | MET: existing lines 53–59 and 92–104 unchanged; line 136 adds requester history refusal on both unassigned tickets. |

## DONE-RIDERS and inherited duties

These results distinguish the selected point's proof from unchanged main evidence and the lander's independent custody conditions. This packet does not certify whole-product acceptance.

| Rider | Result | Evidence |
| --- | --- | --- |
| 1 | PASS for selected point; retained other-point evidence mapped above. | Public create, reroute and reads in deskRoutingChecks lines 105–136. Exact-SHA Verify event and conclusion recorded in CI.md. |
| 2 | PASS for selected point. | Real seeded D1 membership and rules, expected null assignee and chosen group; member selection, dropping the group, missing a route record or exposing history would break these assertions. Existing restricted denial and requester refusal assertions retained. |
| 3 | PASS. | Verify invokes the existing work runtime through ./scripts/verify.mjs line 15 and ./tests/work/runtime.mjs line 133. No optional flag or nightly-only registration. |
| 4 | PASS. | receipt.json binds SHA and hashes. Source and test bytes were identical for passing local checks and the commit; only the generated source-lock hash was updated afterward. |
| 5 | INSPECTED, unchanged. | DESK-019 explicitly derives from DESK-003; no new inherited Base duty is asserted and no citation or acceptance text changed. |
| 6 | PASS mechanically; final status judgment belongs to the lander. | Contract generator write changed zero documents and check passed. Main's Status, Gap and Evidence cells preserved. No generated view committed. |
| 7 | PASS. | CONTRACT.md and all acceptance text unchanged; no ruling, rewrite or coverage loss. |
| 8 | PASS for changed path; inherited security behavior retained. | New operator reroute succeeds; employee history reads return 403; existing employee reroute refusal and restricted placement pass in the same runtime. No production authority change. |
| 9 | PASS, bounded claim. | Native public-route proof only. No provider, legal, retention, external account or device proof claimed; existing holds remain explicit. |
| 10 | PASS. | No new policy choice, delegation or grant. Existing owner-only configuration is used. |
| 11 | PENDING guarded landing. | Product branch only. Main equality, exact landing scan and Run site belong to the Mac lander. No main push occurred. |

| Inherited duty | Result |
| --- | --- |
| DESK-003 chooses the group and filters eligible members by existing skill and authority. | PASS for selected point through owner configuration and two ineligible members, compared with retained successful skill assignment. |
| Current ticket revision and ordinary role authority apply at reroute. | PASS: current read revision used; retained stale revision 409 and requester 403 assertions executed. |
| Restricted-ticket automatic assignment remains refused. | PASS: existing assertion unchanged and passing. HR branch is unchanged and inspected as described above. |
| History remains agent-readable, with no requester routing disclosure. | PASS: existing and added public reads and refusals executed. |
| Held keyed-identity and coordinated legacy-marker migration duties. | UNCHANGED and not credited by this point. No reconstruction or maintained helper replacement. |

## Pre-ready self-check

1. Changed outcome has a real seeded public-door journey checking visible results. Exact-SHA workflow state is recorded honestly in CI.md; no earlier SHA substitutes for it.
2. No existing assertion was removed, narrowed, skipped or conditionalized.
3. No credential, erasure, replay, storage or authority implementation changed. Existing work runtime also passed live membership withdrawal, erasure, replay refusal and private-data exclusions. No broad identity migration completion is claimed.
4. No screen changed; screen typography, tooltip and 1440 and 390 proof requirements are not applicable.
5. Source lock fresh. Product push and candidate identity checks passed. Candidate publication scan: NOT RUN IN CLOUD under the explicit cloud adaptation. No claim of COMPLETE or zero findings is made. Scan receipt fields for candidate 3ed22f7464b132584cc0f895531da83b918ef4c3: complete=unestablished; historyScanned=unestablished; findings=unestablished. The maintained Mac lander must run its independent full-history scan. Run site on the candidate and main equality are pending landing. New text contains no email-shaped fixture string or bare prose repository token; unchanged legacy fixtures were preserved.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0

PROBE DESK-019 3: POST /work and POST /work/:id/route with round_robin and load and members lacking the required skill -> chosen group retained with null assignee; explicit routing reports no_available_agent; revision advances; creation and reroute history show actual method, actor, time and transitions; requester history reads return 403.

## Counts, plan rows and remaining custody

Live contract before and candidate after: 18 DONE, 144 PARTIAL, 37 MISSING, 199 total. Contract cells are unchanged. Test registrations before and after are identical; this round adds zero registrations inside the existing journey. The plan extract has no target table row for DESK-019. The only plan result to relay is its selected point 3 proof closure. No other campaign row was changed or selected; adjacent candidates and all stated holds were preserved.

Exact main at the initial read was c4e9852d1098215b0371a6c67a9a721be85a88cf. Recorded main Verify 42514121758 (push) and 42512931164 (workflow_dispatch) both succeeded; Run site 42514121732 succeeded. These are baseline health only, not candidate proof.

No product blocker was found. Guarded landing, final publication scan, status promotion and main Run site remain fleet duties. Full actual check receipts and logs accompany this report on the separate evidence branch, never on the product branch.

## Final candidate judgment and handoff

CLAIM DESK-019 DONE points=1,2,3,4,5,6 tests=tests/work/desk-routing-cases.mjs#deskRoutingChecks; tests/work/desk-group-cases.mjs#deskGroupChecks

Point 3 is newly closed; other clause evidence is retained from main and re-executed in the same work runtime, with the HR source-inspection limit stated explicitly above. This claim closes main's stated sole gap and proposes DONE for the guarded landing judgment; no contract cells have been edited. Before and candidate counts remain 18 DONE, 144 PARTIAL and 37 MISSING. If the lander accepts the promotion, the proposed counts are 19 DONE, 143 PARTIAL and 37 MISSING.

Candidate Verify 42515634381 (pull_request) completed/success on full SHA 3ed22f7464b132584cc0f895531da83b918ef4c3. All local checks passed. No product blocker and no CI repair round. Rider 11 remains pending guarded landing; publication scan, main equality and candidate Run site are unestablished here, not waived or claimed successful. No other clause hold or plan row changed.

The selected point is supported by the committed public-door probe and exact-SHA Verify. No new provider, Base, device, role authority or erasure-migration completion is claimed. Source pin and workflow files are unchanged.
