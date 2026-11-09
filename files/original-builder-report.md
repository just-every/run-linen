# sx-linen-c-f19 report

Repository: just-every/run-linen
Branch: cloud/sx-linen-c-f19
Candidate: e8dd72e6b634e11559de32489a60388912fa53e7
Base inspected and rebased: 3bf801acbe2ed85026ba5aa397dd4982fed09b37
Draft PR: https://github.com/just-every/run-linen/pull/157

The selected ACCESS-008 point 3 metadata-only approver exclusion is closed locally. The final candidate extends applicationChecks, without changing runtime authority or the contract. It is submitted for the independent gate; no landing or full-clause DONE count has happened in this environment.

## Plan and results

1. Read the launcher and repository instructions, the complete ACCESS-008 clause, its Status gap, the supplied campaign extract, the Linen rulings and all eleven DONE-RIDERS. The only recorded ACCESS-008 gap on this base was the missing metadata authority exclusion assertion. Read the four named runtime sources, the stage guard and current-principal resolution, and the existing application, archive and native browser journeys.
2. Extend the existing applicationChecks journey rather than add a test registration. Seed a distinct active employee with an opaque synthetic identity, register that employee only in application approver metadata, create a linked entitlement catalog item, configure a currently open stage naming the owner, and submit a request for a different employee.
3. Read exact decision revisions from the authorized holder's public approval queue. Attempt the stage decision as the metadata-only employee. Assert 403 with the missing-stage-authority explanation, a still-active pending stage and unsatisfied chain, identical stored decisions, and identical execution grants, membership, department roles, group membership and delegation records. Then submit the same revisions as the actual holder and observe one approved decision and a satisfied chain, still without issuing authority.
4. Run the touched work runtime and typecheck, the first-party check, contract write and check, and source lock generation and check. Fetch and rebase onto main before the candidate commit; main did not move. Restore generated views from origin/main and regenerate the source lock last. The candidate contains only the test extension and generated source lock.
5. Inspect every candidate commit's author, committer, message and trailers. Commit with the fleet identity and active cleanup hook, and push the first real commit using the supplied cloud guard. The product push succeeded on attempt one. Open the draft PR because this repository's Verify entry point is pull_request rather than this cloud branch's push. Publish this packet separately to the evidence ref, then remove the clean product clone.

Two local test-authoring errors were corrected before the passing run: catalog creation returns an ID rather than a revision, so the test now reads the revision through GET catalog; the work harness exposes an error explanation rather than a structured error code. No product defect or CI repair was involved, and no existing assertion was removed or weakened.

Only the ACCESS-008 campaign row is returned as selected-point complete and eligible for the independent DONE gate. No other campaign target is taken; all omitted registry, role, account, Base, provider and device work stays unchanged. The plan itself is not edited from cloud.

## Actual checks

All commands used the repository toolchain; runtime execution used cloud_run with a 600-second timeout. The available Node was 24.19.0, satisfying the setup shim's minimum-version rule; pnpm was the repository's pinned 10.12.4. The repository's existing rer pin, Base pin and workflow were retained.

- Work runtime: `node tests/work/runtime.mjs`, exit 0, complete passing log in work-runtime.log. The final test bytes are exactly those committed in the candidate. This includes applicationChecks plus the existing authority withdrawal, erasure, restore and replay checks in the same runtime.
- Typecheck: `pnpm typecheck`, exit 0, typecheck.log.
- First-party validation: `pnpm exec rer check --profile first-party`, exit 0, first-party.log. This command emitted no output on success.
- Contract: `node src/base/contract-docs.mjs write` then `node src/base/contract-docs.mjs check`, both exit 0, views.log. Zero generated documents needed updating. Both generated views were restored from main regardless.
- Lock: `node scripts/edition-authoring/cli.mjs lock` then `node scripts/edition-authoring/cli.mjs check`, both exit 0, source-lock.log. The complete actual JSON output is retained.
- Migration ledger: not applicable; no migration was added or edited.
- Test registrations: unchanged; one existing runtime assertion script was extended. No test was deleted, skipped, narrowed or made conditional.
- UI: no product screen changed. Existing applicationJourney remains in normal Verify. No new browser screenshot or browser result is claimed.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0
PROBE ACCESS-008 3: exact-current-revision POST approval-stage route as metadata-only active employee -> 403; public chain remains pending and unsatisfied, decisions and grants unchanged, membership and roles unchanged; same revisions approved by the authorized holder.

CHECKS.json binds the actual logs, source files and test files by SHA-256 to the full candidate. It records the distinction between local execution and remote CI. candidate-messages.txt and product-push.log retain actual custody records.

## Acceptance evidence map

This is the frozen rubric for the selected round. Other acceptance remains inherited from the existing journeys; no acceptance sentence is added, narrowed or deleted. The proposed whole-clause promotion below relies on the independent gate and the existing Verify journeys, including the unmodified archive proof.

| Item | Public proof and lines on candidate | Actual result here | Exact-candidate Verify |
| --- | --- | --- | --- |
| R1, point 1: two permission sets, owner routing and seat cost | tests/work/application-cases.mjs applicationChecks, lines 13–38; tests/ui/application-journey.mjs applicationJourney, lines 4–65 | PASS work runtime; native screen journey inspected, not rerun | pull_request pending |
| R2, point 2: owner maintenance, owner and operator metadata readership, safe employee projection | applicationChecks lines 10–11, 40–42 and 213–216; src/features/work/application-registry.ts applications and saveApplication; applicationProjection in src/features/work/application-catalog.ts | PASS owner maintenance and employee exclusion and projection; operator branch inspected, unchanged | pull_request pending |
| R3, point 3: active recorded members and no authority from approver metadata | applicationChecks lines 29, 45–96; POST applications, linked catalog, approval queue and stage decision routes | PASS: active metadata-only employee refused at current revisions, unchanged state and authority; authorized holder succeeds | pull_request pending |
| R4, point 4: selected entitlement controls linked target | applicationChecks lines 30–44; catalog creation refuses forged target and foreign application | PASS work runtime | pull_request pending |
| R5, point 5: routed access and expiry duties, mandatory manager and separate grant | applicationChecks lines 33–39 and 108–111, plus authority snapshots lines 49–95; request expiry set on line 33 | PASS work runtime; no provider effect claimed | pull_request pending |
| R6, point 6: immutable request snapshots and new-request edits | applicationChecks lines 97–107; tests/adoption/application-cases.mjs checkArchiveApplications lines 30–45 | PASS work runtime snapshot and retry checks; unchanged archive journey inspected | pull_request pending |
| R7, point 7: integer cents and explicit billing period, descriptive connector | applicationChecks lines 20–29 and 33–36; invalid negative and fractional costs and invalid billing period refused | PASS work runtime | pull_request pending |
| R8, point 8: restore references without historical authority, and erasure | applicationChecks lines 112–120; tests/adoption/application-cases.mjs checkArchiveApplications lines 30–45 and 53–63, invoked by tests/adoption/runtime.mjs | PASS work runtime erasure and refused erased owner; unchanged application archive journey inspected, not rerun locally | pull_request pending |
| R9, inherited duty: ACCESS-005 owns live SaaS provisioning | ACCESS-008 requirement explicitly assigns that duty to ACCESS-005; applicationChecks execution grant snapshots and manager gate | INSPECTED ownership boundary; PASS no new grant; no live provisioning claimed | no expanded provider claim |

The supplied campaign explicitly selects only R3's metadata exclusion. R2 operator and R8 archive rows are not presented as new local runtime executions. The independent gate can retain PARTIAL if it finds a substantive unproved outcome in those inherited rows; the source Status is intentionally untouched.

## DONE-RIDERS

| Row | Result against this candidate | Evidence |
| --- | --- | --- |
| 1 | Selected point PASS locally; whole-clause recorded Verify pending | R3 public-door unsafe and safe paths; inherited R1–R8 map above; no remote green inferred |
| 2 | PASS for selected authority boundary | applicationChecks lines 45–96 uses nonempty registered metadata and a real pending stage; refusal is followed by successful authorized approval |
| 3 | PENDING | Verify is triggered by draft PR 157; first discovery advertised no run yet; no exact-SHA green claimed |
| 4 | PASS for local proof binding | final source and test bytes match committed blobs; CHECKS.json hashes; archive and browser source unchanged |
| 5 | PASS, inspected | clause explicitly separates ACCESS-005 provisioning and names active members, approvals, grants, restore and erasure; no new Base inheritance claimed |
| 6 | PASS mechanical; status bookkeeping deferred | generator write and check exit 0; contract and generated views identical to base; source lock check exit 0; lander owns Status and Evidence |
| 7 | PASS | no contract, acceptance or ruling changes; no original obligation lost |
| 8 | PASS for selected authority boundary | unauthorized metadata-only POST 403, unchanged chain, decisions and grants; authorized holder same revisions succeeds; existing membership withdrawal and erasure paths pass in work runtime |
| 9 | PASS | no live provider, legal, device or mailbox result claimed; application connector remains metadata; existing held work unchanged |
| 10 | PASS, not applicable | no new policy default, delegation rule, pricing or authority implemented |
| 11 | PENDING GUARDED LANDER | main remains the base; full-history publication scan, exact-candidate Verify and candidate Run site are not cloud landing results |

## Pre-READY self-check

1. The changed authority outcome is exercised through native route handlers using D1, with both the denied and allowed cases and exact revisions. Assertions observe nonempty business state and would fail if metadata gained decision rights. Exact-candidate remote Verify is pending, with no green claim.
2. Every previous assertion remains intact. The only test changes are additions inside applicationChecks.
3. Authority snapshots include membership, role definitions and assignments, department and group membership, delegation and execution grants. The complete touched work runtime also passes its existing revoked-membership, erasure and replay refusals. No credential is issued or restored by this change.
4. No screen changed; screen typography, controls and configuration placement are not expanded by this test-only round.
5. Source lock is fresh; contract generation passes; new test additions contain zero email-shaped values. Publication scan and candidate Run site are deferred to the maintained lander, as required for cloud. Existing main at 3bf801acbe2ed85026ba5aa397dd4982fed09b37 has Verify 42523282288 success and Run site 42523282290 success. These are base results, never claimed as candidate results.

Publication scan receipt: commit=e8dd72e6b634e11559de32489a60388912fa53e7 complete=false historyScanned=unestablished findings=unestablished status=NOT_RUN_IN_CLOUD. The clone has full Git history; this is not a scanner result. No publication scan was bypassed for landing; the fleet must run it.

## Counts, scope and custody

Actual before and after contract counts: 20 DONE, 142 PARTIAL, 37 MISSING, 199 total. ACCESS-008 stays PARTIAL in the product Status table because this run cannot edit it. Proposed promotion after the gate: 21 DONE, 141 PARTIAL, 37 MISSING; no other clause changes. The selected point is complete; no product blocker was observed.

ROLE-001's retained role-grant, reconfirmation and seat-decision work, ACCESS-005 live provisioning, mapped Slack and Microsoft 365 approvals, mobile devices, live receiving-provider proof and all other account and Base obligations remain omitted and unchanged. This round claims no additional provider or approval authority.

Product candidate is pushed on cloud/sx-linen-c-f19, with draft PR 157. First exact-candidate workflow discovery returned no advertised runs; the PR event is the existing pre-main entry point. No workflow dispatch or rerun was sent. Main was not pushed, merged or fast-forwarded. No inbox or state file was read or written. Evidence publication is separate from product READY and does not establish acceptance or landing.

CLAIM ACCESS-008 DONE points=1,2,3,4,5,6,7,8 tests=tests/work/application-cases.mjs#applicationChecks; tests/adoption/application-cases.mjs#checkArchiveApplications; tests/ui/application-journey.mjs#applicationJourney

This is a proposed DONE claim with selected point 3 newly closed, inherited native proof identified, and riders 3 and 11 explicitly pending; it is not a claim that the clause is already DONE on main. The fleet retains the independent acceptance and landing decisions.
