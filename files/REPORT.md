# Linen catalog estimate proof

Tag: sx-linen-c-f6
Repository: just-every/run-linen
Branch: cloud/sx-linen-c-f6
Candidate: 6166c604f4597edb03ba52c1a7f2caa30a80daf3
Base main observed: 8c800ef6a0097af750b5b91ed7ce46ff187f094f
Draft PR: https://github.com/just-every/run-linen/pull/146

The selected CATALOG-001 point 5 is proved locally. This branch retains the supplied predecessor's validation and clearing assertions, and adds independent estimates and persisted unknown-request proof. The product implementation already enforced the required semantics, so this round changes only the two existing journey files and their generated source lock. CATALOG-001 is proposed DONE on guarded acceptance; its Status, Gap and Evidence cells remain exactly those of main.

Before and after committed Status counts: 15 done, 147 partial, 37 missing, 199 total. If the lander accepts this claim: 16 done, 146 partial, 37 missing. The historical plan extract's counts precede the current contract conversion and are not reused. No new test registration was added; the existing applicationChecks and catalogFormJourney were extended. No assertions were skipped, narrowed, removed semantically, or moved behind a width or branch condition.

## Plan and completion

1. Read the launcher and repository instructions, the complete CATALOG-001 acceptance and current Gap, and the inline campaign, rulings and DONE-RIDERS. The only selected missing outcome was point 5's numeric and unknown-value proof. Existing code in ./src/features/work/catalog-form-schema.ts and ./src/features/work/catalog-items.ts already enforces it.
2. Start the named branch at the supplied b6574edbeaf83ea90d1112d89b57af73b2cd406b, preserving both predecessor commits. Extend applicationChecks without adding registrations: reject invalid create and edit without catalog changes, distinguish zero from unknown, clear known values independently with omitted and null inputs, and read the submitted snapshots as the employee. Extend catalogFormJourney to submit the cleared form and read Unknown after reload. Complete.
3. Run the touched work runtime, typecheck, first-party check and focused native browser proof. Use an isolated local database, native sign-in with CSRF, and Chromium at /usr/bin/chromium. Assert at 1440 and capture the same editor and request states at 1440 and 390. All pass, with no page errors. Complete.
4. Fetch main, rebase the unpublished branch, generate and check the contract views, restore both views from main, regenerate and check the source lock last. No contract conflicts or changes; no generated views committed. Complete.
5. Inspect every candidate author, committer and trailer, push only the named product branch with the fleet guard, open its one draft PR as the Verify entry point, and publish this packet to the separate evidence ref. Product push succeeded on attempt 1. CI and evidence details are updated below before handoff.

Plan row completed: CATALOG-001 selected point 5, numeric-validation and unknown-value proof. No plan file was available or edited in cloud. No further clause sharing these files was selected: CATALOG-008 has its own separate campaign. CATALOG-002, CATALOG-010 and CATALOG-011 provider accounts, mapped approvers, CHANNEL-005 devices, and live mailbox, SES and SendGrid receipts remain outside this claim. No new policy default was adopted.

## Acceptance proof register

All line references below are on the candidate. The work runtime loads applicationChecks, catalogAudienceChecks and catalogQuoteChecks; scripts/verify.mjs invokes it as Service desk and lifecycle. The native browser entry invokes catalogFormJourney and catalogAudienceJourney as part of Employee service desk browser. Those entries remain in normal Verify and are not behind an evidence flag; only screenshots depend on LINEN_CAPTURE.

| Point | Outcome and evidence | Local result and CI binding |
| --- | --- | --- |
| 1 | Conditional $250 monitor and eligible versus ineligible employees in two departments: ./tests/work/application-cases.mjs#catalogAudienceChecks lines 195–215; ./tests/ui/application-journey.mjs#catalogAudienceJourney lines 166–214 | Runtime PASS. Existing native audience journey INSPECTED; normal Verify invokes it on this head. |
| 2 | Editing leaves the in-flight request unchanged: ./tests/work/application-cases.mjs#applicationChecks lines 138–148; ./tests/ui/application-journey.mjs#catalogFormJourney lines 114–123 and 157–158 | Runtime and focused browser PASS. |
| 3 | Owner-only editing and supported field types: ./tests/work/application-cases.mjs#applicationChecks lines 74–86 and 129–148; software edit in ./tests/work/catalog-quote-cases.mjs#catalogQuoteChecks lines 203–208. Access forms use the same owner-only edit route in ./src/features/work/catalog-items.ts#editCatalogForm | Runtime PASS for field types, device and software editing and employee refusal; common access edit path INSPECTED. No new authority is introduced. |
| 4 | Exact prior-answer condition, visible required questions, hidden and unknown answer refusal, required no accepted: ./tests/work/application-cases.mjs#applicationChecks lines 129–148; ./tests/ui/application-journey.mjs#catalogFormJourney lines 101–113 | Runtime and focused browser PASS. |
| 5 | Negative and fractional cents, negative, zero and fractional delivery refuse create and edit without configuration or revision changes; zero remains a known cost; omitted and null values independently remain unknown on create, edit, submit and read: ./tests/work/application-cases.mjs#applicationChecks lines 87–127. Native clear, reload, request display, submit and submitted Unknown display: ./tests/ui/application-journey.mjs#catalogFormJourney lines 124–158 | Runtime and focused browser PASS. Additional authenticated native-session route probes in ./catalog-proof.mjs and ./browser/catalog-runtime-receipt.json PASS. |
| 6 | Revision increment, original questions, answers, cost and delivery retained; stale new submissions refused: ./tests/work/application-cases.mjs#applicationChecks lines 114–123 and 138–148; ./tests/ui/application-journey.mjs#catalogFormJourney lines 114–158 | Runtime and focused browser PASS. |
| 7 | Ticket scopes and subject and staff-filer erasure: ./tests/work/application-cases.mjs#applicationChecks lines 149–159. Every bundle child validated before work: ./tests/work/catalog-quote-cases.mjs#catalogQuoteChecks lines 38–48 | Runtime PASS. |
| 8 | Five kinds, account and service owner tasks, no provider authority, wrong owner refused: ./tests/work/catalog-quote-cases.mjs#catalogQuoteChecks lines 25–29 and 162–173 | Runtime PASS. |

## Inherited duties

| Duty | Evidence | Result |
| --- | --- | --- |
| D-1 current revision and validation at existing selected catalog doors | Application checks and browser form journey above; audience and quote checks are also loaded by the work runtime. No new door or channel was added. | PASS on selected doors; later channel obligations remain with their receiving clauses. |
| A1 ticket scopes | ./tests/work/application-cases.mjs#applicationChecks line 150 refuses an unrelated employee; ./tests/work/catalog-quote-cases.mjs#catalogQuoteChecks lines 97–159 exercises exact readers and exclusions | Runtime PASS. |
| ERASURE-001 content removal | ./tests/work/application-cases.mjs#applicationChecks lines 155–159; ./tests/work/catalog-quote-cases.mjs#catalogQuoteChecks lines 213–215 removes quote record and bytes | Runtime PASS. |

## DONE-RIDERS register

| Rider | Result | Evidence or remaining landing responsibility |
| --- | --- | --- |
| 1 | LOCAL PASS; exact-SHA Verify pending | Every outcome is mapped above through the existing sanity journeys. CI is required before acceptance; this report does not invent a green run. |
| 2 | PASS | Numeric refusal and allowed zero are exercised both ways; the entire catalog including revision is compared before and after each refused create and edit. Persisted snapshots and native submitted Unknown are checked with real seeded records. |
| 3 | PENDING CI | ./scripts/verify.mjs entries Service desk and lifecycle and Employee service desk browser load these journeys. Screenshot capture is optional; assertions are always loaded. |
| 4 | PASS | ./RECEIPT.json records Git blobs and SHA-256 for every relevant source and test. No relevant byte changed between local passing commands and the candidate commit. |
| 5 | PASS | CATALOG-001 acceptance point 7 explicitly names A1 and ERASURE-001; its metadata names D-1. |
| 6 | MECHANICAL PASS; landing metadata pending | Contract write then check exits 0; both views restored from main; source lock check exits 0. Builder changed no Status cells or provenance. Lander owns judged status and generated output. |
| 7 | PASS | CONTRACT.md has no diff against main. No acceptance point or ruling changed. |
| 8 | PASS | Existing employee form-edit denial and exact quote-reader boundaries run in the work runtime; no new authority or effect path. |
| 9 | PASS | No live provider, device, mailbox, legal or compliance result is claimed. Held downstream work is explicitly excluded above. |
| 10 | PASS | No new policy default; existing estimate validation and owner-only configuration semantics are unchanged. |
| 11 | ACCEPT ON LANDING | Product is branch-only. Observed main remains 8c800ef6a0097af750b5b91ed7ce46ff187f094f, so main equality is false. The Mac lander owns complete publication scan, green exact-head Verify, main update and exact-main Run site. |

## Public-door probe

PROBE CATALOG-001 5: native authenticated session with CSRF, catalog create and form edit with costCents -1 and 0.5 or deliveryHours -1, 0 and 1.5 -> each 422; catalog configuration and revision unchanged. Allowed zero cents and omitted or null estimates -> exact numeric zero or null on catalog read; native clear then submit then reload -> both submitted estimates display Unknown and persist null, while the earlier request retains 25000 cents and 48 hours.

## Mechanical and pre-ready checks

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0 (no migration changes).

- Local runtime, browser proof, typecheck, first-party check, build, generator and source integrity all pass. Every new assertion checks an observable route or native-page outcome, with no implementation or pin-only test added.
- Existing assertions are preserved semantically. The original omitted and null cases remain, with four mixed cases added to the same behavior table.
- Authority, erasure and replay continue through existing work-runtime fences. Numeric edits create no credential, erasure, capture or provider path. No production source was changed.
- Existing native form controls have visible labels; no icon-only control was added. Screens were inspected at 1440 and 390. Configuration remains under Settings. The source scope is test-only; no new UI design or homepage change.
- Added text was checked for email-shaped strings and provider-shaped credentials: none. Candidate ancestry includes both owner-authored predecessor commits and the fleet-authored new commit; all identities are allowed and all three messages have no co-author trailer.

Publication scan receipt: commit=6166c604f4597edb03ba52c1a7f2caa30a80daf3 complete=false historyScanned=false findings=unestablished status=NOT_RUN_IN_CLOUD. Cloud branch push does not require this scan; the guarded Mac lander must complete it with zero findings before landing. This is not a claimed COMPLETE scan or acceptance receipt.

CI: exact-SHA Verify 42504998134, event pull_request, is in_progress at 2026-11-08T17:31:47Z. No workflow was dispatched or rerun. The immediate post-PR discovery was empty; the next discovery respected the 300-second interval. Ancillary PR run 42504994934 is successful; it is not substituted for Verify. Run site is not run on the product branch. Main equality is false. There is no local product blocker; remote CI and guarded landing remain unestablished.
