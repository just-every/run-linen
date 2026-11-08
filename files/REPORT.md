# sx-linen-c-f8 — CATALOG-008

Candidate: `6e2c621999c666abc23667ff7166f4e7f87ac0b8` on `cloud/sx-linen-c-f8` in the declared Linen repository. Draft PR: https://github.com/just-every/run-linen/pull/147.

The selected missing behavior is closed locally: a quote uploaded through the public catalog-quote route is downloaded before submission by three distinct authorized members, with identical bytes and attachment disposition. Only the owner's successful read records a privileged-read audit. Unrelated employees, approvers and the future fulfilment operator receive 404 with no filename, content, attachment header or successful-read audit. Reads and refusals leave the draft unsubmitted.

The native clause is proposed DONE after its independent landing gate. No Status, Gap or Evidence cell was edited. Existing holds on chat approval accounts, mapping and consent, native mobile devices and actual receiving-provider proof remain owned by their existing clauses; this round grants no extra quote-reader authority or approval and makes no provider claim.

## Plan and work performed

1. Read the launcher instructions and the shipped rules, plan extract, DONE riders and Linen rulings. Read current AGENTS.md, README.md, CONTRACT.md, ACCEPTANCE.md, the quote reader implementation and complete catalogQuoteChecks journey. Current main's CATALOG-008 Gap names only the unsubmitted-reader proof.
2. Use a fresh full-history clone and create the named branch from main `8c800ef6a0097af750b5b91ed7ce46ff187f094f`. Replay the predecessor's unfinished test change from `8427a0e45e1da64e2456c26bfa1fc61718b7babc` without carrying its old base or lock hashes. Preserve all current-main writers' work. No published history was rewritten.
3. Extend the existing catalogQuoteChecks registration with the predecessor's 28-line draft-reader block. The upload uses POST `/work/:id/catalog-quote`; downloads use GET `/catalog-quotes/:id`; public request-history reads prove no submission exists before or after. D1 audit reads check the internal audit consequence, not an alternative access door.
4. Run the existing work runtime, typecheck, first-party check and build. Run the existing catalogQuoteJourney in a focused external driver with real Chromium, at 1440 for assertions and captures of the same states at 1440 and 390. Product code and all existing assertions remain unchanged.
5. Fetch main and rebase the unpublished change onto it. Main was unchanged. Run the contract generator's write and check, restore both generated views from main, regenerate the source lock last and check it. Stage only the quote test and source lock; inspect that both cached and candidate CONTRACT.md diffs are empty.
6. Commit with the fleet author and committer, validate every candidate commit's identity and trailers, and push immediately through the required guard. Push succeeded on its first attempt. Create the single draft PR required by this repository's pull_request Verify entry point. No push, merge, deployment or status write to main occurred.
7. Publish this actual report, command receipts, logs and synthetic browser evidence only on the separate evidence ref. Hand off product landing, full-history publication scan and main-only Run site to the maintained Mac lander.

Plan row updated by this report only: CATALOG-008 selected draft-reader proof complete on the candidate; proposed partial to done after the independent gate. No campaign or other clause was selected.

## Acceptance coverage and frozen rubric

Every row below maps the current clause, without adding or narrowing an acceptance point. The existing names still say CATALOG-001 because CATALOG-008 was split from it; these are actual journey names, not new registrations. `catalogQuoteChecks` is invoked by `tests/work/runtime.mjs:125`, which Verify loads as Service desk and lifecycle through `scripts/verify.mjs`. The native browser journey is loaded by `tests/ui/browser.mjs:575`, also in Verify. The runtime and focused browser runs passed locally on source bytes identical to the candidate. Exact event and conclusion are in the CI section and receipt.

| Rubric | Acceptance outcome | Public-door proof and line references | Observed local result |
| --- | --- | --- | --- |
| R1, point 1 | Software purchase requires a quote; current approver sees it and another employee cannot | `tests/work/catalog-quote-cases.mjs` catalogQuoteChecks lines 50–61, 94–114, 134–143; `tests/ui/catalog-quote-journey.mjs` catalogQuoteJourney lines 87–120 | PASS: missing quote 422; actual uploaded quote readable by approver; unrelated reader 404 |
| R2, point 2 | Requester or beneficiary uploads PDF before submission, bounded size, replacement of draft, non-PDF refusal | catalogQuoteChecks lines 31–36, 54–69, 145–147 | PASS: accepted requester and beneficiary uploads; invalid type and over-limit size refused; prior draft record and blob removed |
| R3, point 3 | Bind once and freeze id, hash and size atomically; hash drift refuses without fulfilment; no replacement or inherited approval | catalogQuoteChecks lines 71–89, 145–148 | PASS: drift 409 with zero fulfilments; immutable bound snapshot and replaced submission refusal; new request carries zero earlier approvals |
| R4, point 4 | Exact submitted readers, decided-approver retention, replaced undecided approver denial, current fulfilment owner, and three distinct draft readers | catalogQuoteChecks lines 94–105, 134–153, **155–190**, 211–228 | PASS: requester q-op, beneficiary q-ben and owner download identical unsubmitted bytes; current and decided approvers retained only as specified; old undecided approver and old application owner denied |
| R5, point 5 | Other roles and shares get not found; projection reveals attached-only; download rather than inline | catalogQuoteChecks lines 106–126, 175–184; `tests/platform/mcp-tools-cases.mjs` mcpToolCases lines 84–88, 128, 171–172 | PASS locally for native reads, shared colleague, operator, auditor, integration and HR denials and projection. Existing MCP proof INSPECTED, loaded in candidate Verify, not separately rerun locally |
| R6, point 6 | No conversation-list, search, history, notification or AI quote exposure; owner export, erasure and retention include the file | catalogQuoteChecks lines 117–133, 238–244; `tests/adoption/application-cases.mjs` attachArchiveApplications lines 10–17 and checkArchiveApplications lines 46–51; `tests/adoption/retention-cases.mjs` retentionChecks lines 10–16, 27–44 | PASS locally for exclusions and erasure including blob removal and subsequent 404. Existing native archive and retention journeys INSPECTED, loaded in candidate Verify, not separately rerun locally |
| R7, point 7 | Privileged successful reads audited by relation and id; upload, replacement and binding audited without name or content | catalogQuoteChecks lines 90–105, **159–184** | PASS: empty initial audit, none for requester or beneficiary, exactly owner relation and attachment id for owner, unchanged audits after five refused draft readers |
| R8, point 8 | Quote never supplies price, approval or provider authority; approval view carries frozen quote | catalogQuoteChecks lines 72–73, 83, 134–139, 192–201; catalogQuoteJourney lines 84–85, 103–118 | PASS: explicit price answer required; frozen quote id and hash in decision; no execution grant minted; assigned task authority enforced |

The new runtime probe is the ordinary public-door part of R4, not a synthetic direct call to quoteRelation. Seeded distinct memberships establish requester, beneficiary, unrelated employees, managers and operators. Product currentWorkPrincipal still checks live membership at read time. No authorization implementation was edited.

## DONE-RIDERS

| Row | Result | Candidate-specific basis |
| --- | --- | --- |
| 1 | Local PASS; exact Verify recorded separately | R1–R8 above cover each current acceptance point through public doors. Existing archive, retention and MCP outcomes run in Verify; their code was inspected here |
| 2 | PASS | Allowed and refused security paths executed on seeded data; R4 proves exact bytes and audit consequences, including five real denied reads and unchanged submission state |
| 3 | Pending exact-SHA Verify conclusion | Verify event is pull_request, run 42505785833, head 6e2c621999c666abc23667ff7166f4e7f87ac0b8; both ordinary work runtime and browser journeys are in existing Verify commands |
| 4 | PASS | checks-receipt.json records relevant candidate blob and SHA-256 identities; no runtime, browser or source byte changed after the recorded local passes |
| 5 | PASS, inspected | Current CATALOG-008 declares D-1 and its own exact reader, exclusion, export, erasure and retention outcomes. D-1 assigns inheritance to future doors; no Base duty was added or silently claimed |
| 6 | Mechanical PASS; status publication belongs to lander | Generator write and check exit 0, zero prose errors or warnings; both views restored whole from main. Current main's Gap is deliberately untouched for the one-writer rule |
| 7 | PASS | CONTRACT.md and both generated views have no candidate diff; no acceptance sentence or coverage map changed |
| 8 | PASS | Native route reads allowed for the three named distinct draft members and denied for unrelated employees, approvers and future fulfilment operator; no successful audit or submission effect on refusal |
| 9 | PASS | No provider, mobile-device, legal, delivery or production-readback claim; existing external holds remain unchanged |
| 10 | PASS, not applicable | No new authority, consent, custody, pricing or policy default; existing reader semantics implemented on main are preserved |
| 11 | Pending guarded landing | Candidate is branch-only. Main equality false; candidate Run site not run. The Mac lander owns exact-SHA publication scan, Verify, guarded landing and Run site receipt |

The proposed DONE is not a claim that the candidate has landed or that the pending landing conditions have passed.

## Pre-ready self-check

1. PASS locally: user-visible quote behavior exercised through routes and native built pages. R4's comparisons detect wrong byte content, widened readers, absent attachment headers, missing or excessive audit, or an accidental submission. Exact-SHA Verify is recorded separately; no green from main or predecessor is substituted.
2. PASS: no existing assertion, registration, branch or viewport condition removed or narrowed. Permanent test registration count unchanged, zero added and zero removed. No pin tests or duplicates added. No test-budget file exists on this current main.
3. PASS for the touched security boundary: current membership is rechecked by unchanged readCatalogQuote, exact quote readership enforced, erased quote metadata and bytes removed and later owner read refused. Work runtime's existing membership, erasure and replay checks pass. This test-only change creates no credential, erasure or replay path.
4. Not applicable to UI creation: no screen or component changed. Existing quote journey passed and captured native owner editing, requester missing-quote refusal and submitted form, and approver view at 1440 and 390. No new icon-only controls or text were added. Legacy screen polish was not changed or represented as a new conformance audit.
5. Source lock PASS. Contract generation PASS. Candidate Verify and publication scan are recorded honestly below; candidate Run site awaits landing. Added product-test lines contain no email-shaped string or provider-shaped key. Existing synthetic fixtures remain intact.

## Commands and mechanical receipts

All command results are in checks-receipt.json. Runtime output: work-runtime.log. Browser output: browser.log with catalog-browser.mjs as the external focused driver. Build and typecheck output: build.log and typecheck.log. First-party check completed successfully with empty output: first-party.log. Generator and lock output: mechanical.log. Product push output: product-push.log.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check, restore ACCEPTANCE.md and docs/CLAIMS.md exit=0; ledger=none exit=0

PROBE CATALOG-008 4: POST /work/:id/catalog-quote with synthetic PDF before fulfilment, then GET /catalog-quotes/:id as requester q-op, beneficiary q-ben and owner -> 201 upload; three 200 responses with identical bytes, attachment disposition and nosniff; owner-only successful privileged audit. Two unrelated employees, two approvers and future fulfilment operator -> five 404s without filename, content or attachment header; audit and empty submission history unchanged.

## CI, custody and counts

Candidate Verify: https://github.com/just-every/run-linen/actions/runs/42505785833, pull_request, exact head `6e2c621999c666abc23667ff7166f4e7f87ac0b8`. Initial discovery recorded in ci-discovery.json: in_progress with no conclusion. This report will include any subsequent permitted REST result in ci-status.json.

Main at clone and final fetch: `8c800ef6a0097af750b5b91ed7ce46ff187f094f`; completed-success Verify 41346803124 (workflow_dispatch) and Run site 41209839706 (push). Historical Verify 41209839714 failed on that same main SHA; a later exact-SHA Verify succeeded, so it is not treated as a current unrepaired main blocker. The first main-run discovery used an incorrect SHA and returned no runs; a corrected request supplied these exact-main results. Four GitHub API calls were used through candidate discovery, including that empty request; no dispatch or rerun was issued.

Publication scan: commit=6e2c621999c666abc23667ff7166f4e7f87ac0b8 complete=NOT_RUN historyScanned=NOT_RUN findings=NOT_ESTABLISHED. Cloud route explicitly delegates the full-history scan to the maintained Mac lander; zero findings is not claimed. Main equality=false. Candidate Run site=not run, main-only after guarded landing. Product push succeeded; evidence publication is separate from READY and acceptance.

Current counts before and after the candidate are 15 done, 147 partial, 37 missing of 199. Proposed count after CATALOG-008 alone is accepted DONE: 16 done, 146 partial, 37 missing. No counts, status cells or generated views were committed. New work closes the remainder of acceptance point 4; existing proof for points 1–3 and 5–8 is retained. No plan table or other clause was changed.

CLAIM CATALOG-008 DONE points=1,2,3,4,5,6,7,8 tests=tests/work/catalog-quote-cases.mjs#catalogQuoteChecks; tests/ui/catalog-quote-journey.mjs#catalogQuoteJourney; tests/adoption/application-cases.mjs#attachArchiveApplications; tests/adoption/application-cases.mjs#checkArchiveApplications; tests/adoption/retention-cases.mjs#retentionChecks; tests/platform/mcp-tools-cases.mjs#mcpToolCases

No DEFAULT or substantive CATALOG-008 GAP is introduced. Existing channel approval accounts, mapping and consent, mobile devices and live receiving-provider proof stay held under their own clauses. No known real product test failure or required missing account blocks this scoped test change. Landing gates remain pending as stated.

Final REST observation, after the permitted 300-second interval: run 42505785833 remains in_progress with conclusion null on the exact candidate. Stored in ci-status.json. Five GitHub API calls used in total; no dispatch, rerun or failed-job log request. Per the cloud no-wait handoff rule, this is READY for the maintained lander to continue its exact-SHA gates, not a claim that Verify is already green. No known real candidate failure was observed.

Evidence transfer independently fetched and verified: initial evidence head 54d4de2f0eb1ad7080b4c86a2ec60b0d22431763, 25 manifested files restored with matching bytes, SHA-256 and Git blob identities. transfer-receipt.json and initial-evidence-publication.log preserve that actual readback. A final report-only evidence publication includes those receipts; its terminal EVIDENCE line identifies the exact final ref and head. Product HEAD, branch and clean index were unchanged. Remote product branch was read back as the exact candidate before checkout cleanup.
