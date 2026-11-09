# sx-linen-c-f79 report

CLAIM PROB-003 PARTIAL points=3 tests=tests/work/problem-detection-cases.mjs#problemDetectionChecks
GAP PROB-003: Unselected acceptance and retained persistence, rolling-window, later-source and restart proof obligations remain owed. PROB-002's feeder-held remainder, INC-002's Datadog and Spool adapters, live Oncall paging, named-source binding consent, ROLE-001's acting-role decisions and all account, ct, Base and device holds remain unchanged.

Candidate: 5764273d6f3df670a571b7f924474f4fa9d7a992
Branch: cloud/sx-linen-c-f79
Draft PR: https://github.com/just-every/run-linen/pull/208
Counts before and after: 31 DONE, 131 PARTIAL, 37 MISSING.
Clause status changes: none. Point 3's selected proof is established; the whole clause stays PARTIAL.

The brief's starting commit already implemented exactly the selected behavior. This run inspected and executed that proof, preserved it without duplicate assertions or an empty commit, and published the same committed tree on the requested branch. There are no new product commits from this continuation. Relative to current main, the inherited commit adds 37 lines to the existing problemDetectionChecks and its generated source-lock hash. No production source, UI, acceptance text, contract cell or generated view changed.

Full plan: PLAN.md. Result of each step: launcher, identity, helper, push guard and commit hook installed; full-history clone created at the requested start; current main fetched and rebase was already up to date; selected assertion and all existing exclusions reviewed; touched checks and mechanical checks passed; branch push succeeded on attempt 1; draft PR created; report packet prepared for separate evidence publication. No lane plan files were edited. The plan row to relay is PROB-003: point 3 proven, PARTIAL retained.

## Public-door probe

PROBE PROB-003 3: owner POST /work creates three normal native incidents, owner POST /problem-proposals/detect creates their proposal, then a distinct active built-in operator GET /problem-proposals and GET /problem-proposals/:id -> 200, same full proposal, exact complete evidence IDs and projected source IDs, no membership, role, participant, share or proposal changes.

Proof: tests/work/problem-detection-cases.mjs, problemDetectionChecks, lines 201–236. The operator is distinct from the owner, is active with only the built-in operator role, and is neither a source participant nor a share recipient. The owner is the source requester and beneficiary. Existing restricted-source checks at lines 238–272 still run: another owner cannot see detector-only records; an inaccessible source hides the entire proposal, count and accepted problem; inactive and revoked membership are refused. No new reader authority is introduced.

## Acceptance map

| Point | Outcome and proof | Result for this lease |
| --- | --- | --- |
| 1 | One linked native problem, unknown cause and unchanged source state: problemDetectionChecks lines 35–50 | Existing proof retained; not selected for a new completion claim |
| 2 | Accepted and rejected decisions across later sources, rolling windows, restart and restore | UNMET as a complete outcome; retained proof obligations remain owed. Existing restart assertions at tests/work/runtime.mjs lines 793–795 and archive cases do not close the entire point |
| 3 | Owner-created normal incident proposal read by a distinct active built-in operator with every source reference and unchanged authority: problemDetectionChecks lines 201–236 | PASS locally; exact-SHA historical Verify success; new branch Verify pending |
| 4 | Detector-only restricted proposal and accepted problem; no inferred participants: problemDetectionChecks lines 238–254 | Existing assertions retained and work runtime passed |
| 5 | Every source rechecked; inaccessible source hides full cluster and count: problemDetectionChecks lines 255–265 | Existing assertions retained and work runtime passed |
| 6 | Accepted problem uses proposal owner and visibility: source decision insert in src/features/services/problem-proposals.ts; restricted accepted-problem exclusion at test lines 248–250 | Existing implementation and proof retained, inspected; no new claim |
| 7 | Evidence retains references without report bodies: problemDetectionChecks lines 24–26, 231–232 | Existing assertions retained and work runtime passed |
| Inherited duty | Source audience restrictions from PROB-002 and RL-14 remain in the clause and existing route checks | INSPECTED; no acceptance or authority rewrite |

## DONE-RIDERS

No whole-clause DONE claim is made. Each row is evaluated honestly for this candidate.

| Rider | Result | Evidence |
| --- | --- | --- |
| 1 | FAIL for whole clause; PASS selected point | Point 3 reaches nonempty native list and detail through public routes, test lines 201–236. Point 2's complete persistent-cluster behavior remains owed |
| 2 | PASS selected behavior | Real native tickets, exact proposal and source references, complete owner/operator equality, authority snapshots; restricted-source refusals remain at lines 238–272 |
| 3 | PASS on exact SHA historical run; current branch run pending | Verify 42646894293, pull_request, completed/success on the exact candidate from inherited branch cloud/sx-linen-c-f72. scripts/verify.mjs invokes tests/work/runtime.mjs, which invokes problemDetectionChecks. New PR Verify 42653816546 is in progress |
| 4 | PASS | Local checks executed on 5764273d6f3df670a571b7f924474f4fa9d7a992 with clean tree; historical green run has the identical SHA |
| 5 | PASS by inspection for unchanged scope | No new inherited duty; PROB-003 already states source readability and PROB-002 inheritance. No Base duty is newly claimed |
| 6 | Generator PASS; status bookkeeping retained for lander | Contract write and check exit 0; generated files restored from main. Status cells were deliberately unchanged, so the old Gap still lists operator proof; this report supplies the fresh claim without editing the cell |
| 7 | PASS | No acceptance sentence, ruling or coverage map changed; no obligations removed |
| 8 | PASS selected authority paths | Distinct operator positive reads and restricted-source, inactive and revoked-role refusals all run in the same runtime; lines 220–235 and 246–272 |
| 9 | PASS boundary | No provider receipt, live paging, legal, device or wider operational claim; all existing holds retained |
| 10 | PASS | No new policy default adopted and no new authority granted |
| 11 | PENDING fleet landing | Main is c6c7d7d79438ce0a9bfb67327f488d7226438a7b, not the candidate. Scan and exact-main Run site remain fleet duties |

## Validation and pre-ready self-check

- Work runtime: cloud_run timeout 1200 node tests/work/runtime.mjs, exit 0. The selected PROBE and retained exclusions passed. Actual complete output is work-runtime.log.
- Typecheck: pnpm typecheck, exit 0. First-party check: cloud_run npx -y @runeditrun/rer check --profile first-party, exit 0.
- Setup built the application and applied the fresh local migrations successfully. No additional full suite or browser run was added. No screen was changed, so viewport, text, tooltip and configuration-placement checks are not applicable to this route proof.
- No existing assertion was removed, narrowed, skipped or made conditional. No new test registration was added; the test budget remains unchanged. The existing suite also passed revoked membership, erasure and replay refusal paths. Production authority and storage code are byte-identical to the starting candidate.
- Contract and source lock are fresh. Both generated view files match main and remain uncommitted. There is no migration change, so the migration ledger check is not applicable. All candidate authors and committers are fleet identity, with no trailers. The diff adds no email-shaped fixture value or prose repository token.
- Branch custody is proven by product-push.log and PR 208. Branch Verify 42653816546 was in progress when discovered; no rerun or dispatch was requested. Historical exact-SHA Verify 42646894293 completed successfully. No green result from a different SHA is claimed. Four GitHub API calls were used, with no repeated run poll.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and node scripts/edition-authoring/cli.mjs check exit=0; views=node src/base/contract-docs.mjs write and node src/base/contract-docs.mjs check exit=0; ledger=none exit=0.

Exact-SHA scan result: commit=5764273d6f3df670a571b7f924474f4fa9d7a992 complete=unestablished historyScanned=unestablished findings=unestablished. The cloud route does not run the fleet's publication scanner. No COMPLETE or zero-findings claim is made. The guarded lander must run the full-history scan, require exact-SHA Verify, perform landing and establish Run site before counting a clause.

Main equality: false. Run site run id: none for this candidate. Product blockers: none for the selected point; retained substantive gaps prevent whole-clause DONE. No CI repair, policy default or scope expansion was made.

## Evidence custody

Actual report and receipt files are explicitly selected for the separate evidence ref. No credentials, private settings, environment dumps, symlinks or held-out gate material are selected. RECEIPT.json binds commands, results, PR and CI observations to the full candidate SHA. Evidence publication is not a product acceptance or landing signal.
