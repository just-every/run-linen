# sx-linen-c-f7 result

Repository: https://github.com/just-every/run-linen
Product branch: cloud/sx-linen-c-f7
Candidate: 5e52e541ebd2e0ec760df7ec132559d75e647ad4
Base main: 8c800ef6a0097af750b5b91ed7ce46ff187f094f
Draft PR: https://github.com/just-every/run-linen/pull/145

CLAIM DESK-005 PARTIAL points=6 tests=tests/work/sla-policy-cases.mjs#escalationChecks
GAP DESK-005: The selected scheduled-deadline recomputation proof is complete. The lease's held remainder is unchanged: NOTIFY-001 recipient adapters for Slack and M365 and live mail delivery; ROLE-001 acting-role grants, revision reconfirmation and custom-agent seat implementation. This round claims no outbound delivery, expanded role authority or whole-clause completion.

The plan entry changed in this report is DESK-005 POINTS: acceptance point 6's missing recomputation proof is closed on the candidate. No other campaign row changed. No contract Status, Gap or Evidence cell changed. Contract counts before and after are 15 DONE, 147 PARTIAL, 37 MISSING, 199 total. DESK-005 stays PARTIAL. Permanent test registrations before and after are unchanged (delta zero); the existing escalationChecks sanity journey was extended, and no assertion was removed, narrowed, skipped or placed behind a condition. No test-budget.json exists in this checkout.

## Plan and implementation

1. Read the shipped plan extract, rulings, builder rules and DONE-RIDERS, then the launcher's and product's AGENTS.md, README.md, CONTRACT.md and ACCEPTANCE.md. Map DESK-005 point 6 to escalationChecks and the existing route handlers.
2. Start a full-history clone at the required f26372a65a3031c43c186e0c4f4a146a5e8e6fab continuation. Preserve its existing public-door proof and test-only clock seam. Rebase the fresh named branch onto main before publication; main was already its parent, so both rebase checks reported up to date.
3. Validate the inherited journey, then extend it with a later tick during the open pause and a later tick after firing. Preserve all inherited assertions. Keep product sources, workflow configuration, Base pins, contract cells and generated views unchanged.
4. Run the touched work runtime, typecheck, first-party check, contract generator write and check, restore generated views from main, regenerate the source lock last, and check lock freshness. Commit with the fleet identity and active cleanup hook, inspect every candidate author, committer and trailer, and push only the named cloud branch with cloud-push.py.
5. Open the single draft PR that starts Verify. Record exact-candidate local receipts and the exact-SHA CI result. Publish this report and the actual non-secret receipts only to the separate evidence branch. Leave publication scanning, landing and exact-main Run site to the guarded Mac lander.

The existing product implementation already recalculates scheduled followups from the SLA clock. The continuation retains the prior 49-line pause proof and test-only serial clock middleware in tests/work/worker.ts. This round adds assertions that an additional paused tick retains the same row and null deadline, and a later fired tick retains the original firing time and the same single private note. It also emits the actual probe result. sources.lock.json was regenerated after the final test edit. Only tests and the source lock differ from main.

## Frozen selected-point rubric and proof

Every MET runtime row below is covered by exact-SHA Verify 42504939771, event pull_request, conclusion success, completed by the 17:36:51 UTC observation. All runtime paths below are public work routes against real local D1, with only the serial test Worker's time pinned. The clock shim is absent from the production Worker. No direct SQL sets the new ticket's pause, resume, due time, followup row or firing state. The policy and escalation configuration, ticket creation and assignment, pause and resume, scheduler tick, SLA read, followup read and conversation read use their normal routes.

R1 MET: Configure a policy that pauses for the vendor, create and assign a P1, and persist its first scheduled escalation at 16:45 UTC on 2 February 2026. tests/work/sla-policy-cases.mjs lines 102-114 and 151-160.
R2 MET: Pause through the ticket command at 10:00 UTC. SLA reports paused, and process-due followed by followup reads returns the original scheduled row with next_due_at null and fired_at null. A second tick at 10:59 retains the identical row and no note. Lines 161-171.
R3 MET: Resume at 11:00 UTC after a one-hour pause. SLA target moves from 17:00 to 18:00 UTC and the same escalation row moves from 16:45 to 17:45 UTC. Lines 172-177.
R4 MET: The former 16:45 deadline and the tick one millisecond before 17:45 do not fire or create a note. Lines 178-184.
R5 MET: The first tick at 17:45 fires the same row exactly then. One private note names level 1, the acting assignee and the updated 18:00 target; the requester reads zero escalation notes. Lines 185-193.
R6 MET: Replaying the same tick and a later tick at 17:47 preserves both the entire fired row and the single original private note. Lines 194-200.

PROBE DESK-005 6: public SLA configuration and ticket pause and resume commands, POST /work/process-due, GET /work/:id/followups and ticket conversation reads -> scheduled 16:45 UTC; open pause clears deadline; resume after one hour moves it to 17:45 UTC; former deadline stays silent; first tick at 17:45 fires once; one staff-private note and zero requester escalation notes; repeated and later ticks unchanged.

The exact stdout appears in work-runtime.log. The test is loaded by tests/work/runtime.mjs at line 130, which the Service desk and lifecycle check in scripts/verify.mjs runs in the existing sharded Verify workflow. No workflow edit or new test entry point was needed.

## Acceptance sentence map

This is a selected point 6 claim, not a whole-clause DONE claim. All line references below are in tests/work/sla-policy-cases.mjs and refer to escalationChecks.

1. Existing coverage retained: lines 123-138 create a near-target P1 and check level 1 followed by level 2.
2. Existing coverage retained: lines 103-114 set and read three first-response levels and refuse non-owner configuration. Exhaustive levels 1 to 5 and resolution configuration are not newly certified by this round.
3. Existing coverage retained: lines 105-113 configure named active operators and assignee notification; the new paused flow checks the negative offset from the recomputed target. Broader role authority is not claimed.
4. Existing and new coverage retained: lines 139-143 and 189-193 read the staff's private note and prove requester exclusion. Outbound channel delivery is owned by NOTIFY-001 and is not represented as provider proof.
5. Existing and new coverage retained: lines 144-149 stop level 3 after the target is met; lines 194-200 prove once-only firing after the pause.
6. Selected gap closed: lines 151-200 exercise the scheduled deadline through pause and resume, scheduler ticks and reads; existing requester reminder and stop-reason assertions remain later in this same journey.

## DONE-RIDERS scoring

1. PASS for selected point 6: R1-R6 above perform and inspect every selected outcome; no whole-clause completion claimed.
2. PASS: populated ticket and followup reads compare expected literal instants and row identity, and check both staff and requester conversations. A broken recomputation, premature firing or duplicate note fails the assertions.
3. PASS: exact-candidate Verify 42504939771, event pull_request, completed with conclusion success. The existing sharded Verify loads and runs the journey. ci-receipt.json records the API observation and full head.
4. PASS: local-receipt.json records execution on the full candidate SHA and the test file digest. No relevant bytes changed afterward.
5. INSPECTED: DESK-005 already names DESK-004, ROLE-001 and NOTIFY-001 in its own points. No inherited duty or receiving clause was rewritten.
6. PASS mechanical: generator write and check exited zero, generated views restored whole from main, contract Status and counts unchanged, source lock fresh. Historical Judged from provenance remains owned by the lander.
7. PASS: no acceptance sentence, ruling, coverage map, Status row or generated view changed.
8. PASS within scope: inherited owner-only configuration refusal and requester-private-note exclusion remain asserted. No new permission or authority is added.
9. PASS boundary: only native scheduling is claimed. No provider, live recipient, legal or billing receipt is implied.
10. PASS: no new policy default adopted and no ct scope question required.
11. PENDING landing: candidate differs from main. Publication scan and exact-main Run site belong to the guarded lander. Baseline main Verify 41346803124 and Run site 41209839706 are successful at the recorded base SHA; they are not candidate proof.

## Pre-ready self-check

1. Selected user-visible behavior is covered by the public-door journey, the exact-SHA local runtime receipt and successful exact-SHA Verify 42504939771.
2. No existing assertion was removed or weakened; this round adds only repeated-tick assertions and a probe log. The prior continuation is retained intact.
3. No production authorization, retention, erasure or replay code changed. Existing full work-runtime authority, membership revocation, erasure and replay assertions passed along with this journey. The selected replay effect, duplicate private notes, is explicitly refused by the repeated and later tick assertions.
4. No screen or UI code changed; browser proof and icon-control audit are not applicable to this test-only lease.
5. Source lock, contract generator, first-party check and typecheck pass locally; exact-candidate Verify 42504939771 is successful. No new email-shaped fixture string or prose slash token was added. Publication scan is NOT RUN in cloud, as authorized by the cloud route; no COMPLETE or zero-findings result is claimed.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; restored=ACCEPTANCE.md and docs/CLAIMS.md from origin/main; ledger=none exit=0 (no migration changed).

Scan receipt: commit=5e52e541ebd2e0ec760df7ec132559d75e647ad4 complete=NOT_RUN historyScanned=NOT_RUN findings=NOT_ESTABLISHED custody=guarded-lander.

## Validation and custody

See local-receipt.json for exact commands, exit codes, timings, output filenames and hashes. Work-runtime output is complete in work-runtime.log. The source-lock check's complete JSON output is retained in source-lock-check.json. The contract write and check output is in views-generation.log. Product ancestry, identity checks and the complete candidate diff are separate packet files.

The runtime uses Node v24.19.0 under the supplied toolchain shim; the repository declares Node 22.20.0, and the shim keeps an existing newer Node. The typecheck prints the resulting engine warning and succeeds. This is recorded, not hidden.

The first guarded product push succeeded without retry. Candidate commits are f26372a65a3031c43c186e0c4f4a146a5e8e6fab (the owner's existing continuation) and 5e52e541ebd2e0ec760df7ec132559d75e647ad4 (fleet). Both author and committer identities are allowed, and both messages have no co-author trailer. product-remote-ref.txt independently records the advertised branch head matching the candidate. No product push, commit, PR or clone was made outside the declared repository. No main branch was pushed or changed.

Verify: https://github.com/just-every/run-linen/actions/runs/42504939771 (pull_request, exact candidate). At 17:36:51 UTC it was completed with conclusion success; six GitHub calls had been used. This is the candidate run, not a success borrowed from main. Final observed status and conclusion are in ci-receipt.json. Run site on the candidate and equality to main await guarded landing. No product blocker is known from local checks. The product remote ref has been verified at the candidate SHA. After the evidence publication succeeds and its advertised ref is verified, the task clone and its node_modules are removed; this packet remains outside the clone.

READY branch=cloud/sx-linen-c-f7 head=5e52e541ebd2e0ec760df7ec132559d75e647ad4
