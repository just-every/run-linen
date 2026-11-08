# sx-linen-c-f13 results

Repository: https://github.com/just-every/run-linen
Product branch: cloud/sx-linen-c-f13
Candidate: 0541d6cfdb64829d55c8bdb4892504097f0db108
Base: c4e9852d1098215b0371a6c67a9a721be85a88cf
Draft PR: https://github.com/just-every/run-linen/pull/151

CLAIM MIGRATE-008 PARTIAL points=3,7 tests=tests/adoption/lightweight-import-cases.mjs#lightweightImportChecks; tests/adoption/freshservice-import.mjs#Incumbent import

GAP MIGRATE-008: The maintained Base import-kit keyed-identity port and coordinated legacy-marker migration remain owed by gr. No maintained helper patch or erased-value reconstruction was attempted. Live Freshservice, JSM and ServiceNow accounts, attachment and scale imports, and delta and cutover readback remain excluded; other existing holds are unchanged.

The two selected proof gaps are closed on the candidate. Product source already enforced both behaviors, so the product change extends the existing integration journey and its real storage harness, then regenerates the source lock. No clause text, Status, Gap or Evidence cell changed. Counts remain 18 DONE, 144 PARTIAL, 37 MISSING, 199 total, before and after. No new permanent test registration, removed assertion, skipped case, narrowed branch or UI change. No pin, dependency, workflow or migration changed. No new policy default was needed.

The full execution plan is PLAN.md. The only plan result to relay is the MIGRATE-008 selected point row: later-native-change refusal and people and asset CSV non-retention proven; the row remains PARTIAL with its Base hold. No other campaign row was changed or retargeted.

## Acceptance map

The existing journey continues to exercise all eight points. Only points 3 and 7 receive new proof in this lease; this map awards no broader DONE credit. Line numbers below refer to tests/adoption/lightweight-import-cases.mjs on the exact candidate. The entrypoint is tests/adoption/freshservice-import.mjs, and scripts/verify.mjs invokes it as Incumbent import in branch Verify.

| Item | Public-door evidence and result |
| --- | --- |
| Point 1, ticket CSV source IDs, quoted text and qualified times | Lines 46–69: authenticated dry run, apply, native ticket and message reads, exact original artifact read and stable repeated source target. Existing assertions retained; local journey PASS. |
| Point 1, saved Zendesk authors, times and visibility | Lines 122–125 and 144–156: saved synthetic full-ticket export, native public and private messages, explicit malformed history refusals, exact original readback. Existing assertions retained; local journey PASS. |
| Point 2, paused restricted historical tickets | Lines 57–61: real native ticket readback, paused and restricted state, employee 404, source-door isolation and owner-readable exact originals. Line 159 checks execution grants, plans, outbox, intake and obligations stay empty. Local journey PASS. |
| Point 3, checkpoint and repeat resume | Lines 53–63: idempotent create, bounded resume to completed, repeated completed resume and deep equality of native records and their messages. Local journey PASS. |
| Point 3, later native change refuses undo | Lines 126–141: each source has a successful clean undo control; a real native private correction makes undo and retry return 409 NATIVE_EDIT_CONFLICT; complete corrected record and untouched peer tickets survive. Local journey PASS. |
| Point 4, source facts without people authority | Lines 85–107: people readback checks exact names, source and source ID, both source times, null member and manager; repeated identities can only be skipped; concurrent native admission refuses atomic apply without a partial person. Existing assertions retained and source fact checks extended; local journey PASS. |
| Point 5, asset reviewed atomic custody | Lines 110–120: reviewed stock device, serial, asset tag, location, null assigned person, typed record custody and quoted source status. The same entrypoint also runs snipeitImportChecks over 500 devices, conflict choices and concurrent destination refusal. Local journey PASS. |
| Point 6, no-write dry run and reviewed apply | Lines 18–19, 47–55, 72–96 and 110–116: non-owner denial, exact fingerprint, accepted omissions, unchanged complete database and attachment storage after reviews, and a revoked in-flight authenticated session cannot persist people. Existing assertions retained; local journey PASS. |
| Point 7, people CSV not retained | Lines 21–45 and 85–96: inspect every D1 table, nested JSON and byte arrays, and all private attachment objects for original UTF-8 text or base64 after review and apply. Independently computed original SHA-256 remains the audit target and admitted person IDs remain recorded. Local journey PASS. |
| Point 7, asset CSV not retained | Lines 21–45 and 110–118: same complete storage inspection after review and apply; independent SHA-256 remains in import audit and custody evidence. Source facts survive without retaining the file. Local journey PASS. |
| Point 8, erasure refuses source replay | Lines 151–158: Zendesk related erasure withdraws retained originals, unsafe source replay fails and unrelated ticket CSV remains readable; people erasure refuses reimport. Existing assertions retained; local journey PASS. |
| Inherited current-owner and A1 restricted history duties | Lines 18–19 and 57–60 exercise denied non-owner writes, outsider native reads and artifact reads through authenticated public routes. Lines 72–84 exercise revoked-session fencing. Local journey PASS. |
| Inherited A6 inert import duty | Line 159 checks real persistent execution and intake tables, in addition to paused historical ticket readback. The import suite also retains existing Freshservice inertness and revocation assertions. Local journey PASS. |

## DONE-RIDERS assessment

No DONE claim is made. These rows describe the selected scope and preserve the external boundary.

| Rider | Result | Evidence |
| --- | --- | --- |
| 1 | PASS for selected points; exact-head Verify completed successfully | Public route journey reaches both targeted outcomes, including readback. Acceptance map above; Verify 42515785018, pull_request, completed success on the exact candidate. |
| 2 | PASS | Lines 126–141 exercise clean undo and unsafe undo with seeded records; lines 85–118 verify admitted facts as well as absence of source files. |
| 3 | PASS | Verify pull_request run 42515785018 completed successfully on 0541d6cfdb64829d55c8bdb4892504097f0db108 invokes the unchanged existing journey entrypoint. No unrecorded browser flag is needed. |
| 4 | PASS | Exact-head runtime rerun PASS, exit 0 in 80.584 seconds; the worktree remains clean. import-exact-head-receipt.json records the full SHA and command. |
| 5 | INSPECTED | The receiving clause explicitly names current-owner, A1 and A6 rules in its Requirement and D-6 metadata. No new inheritance claim. |
| 6 | PASS mechanical; status judgment deferred | Contract generation write and check passed, wrote zero documents, and generated views were restored from origin/main. Status cells remain untouched under the single-writer rule. |
| 7 | PASS | No acceptance sentence or contract cell changed. No rewrite or new acceptance point. |
| 8 | PASS for selected doors | Lines 18–19 deny employee review and apply, lines 72–84 fence revocation; owner clean undo and later-native-change refusal both execute. No new authority. |
| 9 | PARTIAL boundary retained | Only synthetic documented file exports and real local application storage are claimed. Maintained Base port and legacy marker migration remain held. No live provider, scale, settlement or device assertion. |
| 10 | NOT APPLICABLE | No custody, consent, spending or authority policy changed. |
| 11 | PENDING guarded landing | The named cloud branch is pushed. Main remains c4e9852d1098215b0371a6c67a9a721be85a88cf. Candidate publication scan, main equality and candidate Run site belong to the fleet lander. |

## Checks and receipts

- timeout 1200 node tests/adoption/freshservice-import.mjs: PASS. The complete existing import journey runs the new assertions. The logged malformed JSON D1 error is an existing intentional invalid ServiceNow audit refusal; the journey exits zero.
- pnpm typecheck: PASS. Node 24.19.0 was already newer than the repository's Node 22.20.0 minimum; pnpm 10.12.4 matches its pin. No toolchain metadata was changed.
- pnpm exec rer check --profile first-party: PASS.
- node src/base/contract-docs.mjs write, then check: PASS; wrote zero documents.
- git checkout origin/main -- ACCEPTANCE.md docs/CLAIMS.md: completed; neither generated view is in the commit.
- node scripts/edition-authoring/cli.mjs lock, then check: PASS, after final edits and main integration.
- Migration ledger: not applicable, no migration changed.
- git diff --check: PASS. Added product text contains zero email-shaped strings. Existing fixtures were retained without new credentials or provider-shaped keys.
- Every candidate author and committer is the fleet identity; no trailers. Hooks stayed active. Product push succeeded on attempt 1.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0

PROBES.md records the public-door input and observed result for each selected point. receipt.json binds local checks, file digests, clean worktree, identity inspection and successful product custody to the full candidate SHA. import-exact-head-receipt.json records the additional exact-head runtime execution: exit 0 in 80.584 seconds on the clean committed candidate.

Pre-ready self-check: targeted data-loss and privacy outcomes have meaningful route assertions; no existing assertion was removed or weakened; existing revocation, erasure and replay paths still pass; no screens were touched; the source lock is fresh. Candidate Verify 42515785018 completed successfully on the exact head. Guarded publication scan and Run site remain with the fleet and are never inferred from local proof. A broader DONE claim is withheld because the brief retains the Base obligation.

Publication scan: NOT RUN in cloud, as directed. commit=0541d6cfdb64829d55c8bdb4892504097f0db108 complete=unestablished historyScanned=unestablished findings=unestablished. The Mac lander must perform the complete full-history scan and require zero findings. Main's baseline Verify 42514121758 and Run site 42514121732 were completed successfully on c4e9852d1098215b0371a6c67a9a721be85a88cf; they do not certify the candidate.

Candidate Verify: 42515785018, pull_request, completed SUCCESS on 0541d6cfdb64829d55c8bdb4892504097f0db108 at the permitted final status read. GH calls used: 6 of 10. No workflow was dispatched or rerun. verify-status.json and receipt.json carry the actual final response.

READY branch=cloud/sx-linen-c-f13 head=0541d6cfdb64829d55c8bdb4892504097f0db108

Final remote custody: product branch 0541d6cfdb64829d55c8bdb4892504097f0db108; observed main 0cae7fe338def5f96f52df2468f91f078a36827f. Main equality is false. No default branch was pushed. The maintained lander owns main integration, the complete publication scan and Run site.
