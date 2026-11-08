# CHANNEL-009 native sharing proof

Tag: sx-linen-c-f10. Repository: just-every/run-linen.
Product branch: cloud/sx-linen-c-f10.
Candidate: 501d996be75cc8ffa3429cf9af05cfec1dcde098.
Parent main: c4e9852d1098215b0371a6c67a9a721be85a88cf.
Draft PR: https://github.com/just-every/run-linen/pull/150.
Verify: pull_request run 42515650403, exact candidate SHA; initial observation in progress. Final conclusion is recorded in CI-RECEIPT.json and the final report update below.

CHANNEL-009 point 2's remaining native proof is closed by extending the existing sharingChecks journey. Product behavior already implements the boundaries, so no production source change was necessary. All earlier assertions remain, with two changed test files and a regenerated source lock. CONTRACT.md and both generated views are unchanged. No Base refresh, workflow change, homepage edit, migration or authority expansion occurred.

Counts on the parent and candidate: 18 DONE, 144 PARTIAL, 37 MISSING, 199 clauses. Requested promotion after guarded acceptance: CHANNEL-009 PARTIAL to DONE, producing 19 DONE, 143 PARTIAL, 37 MISSING. No status count has been awarded in the product branch. Registered test delta: zero; the existing journey and runtime registration are extended. No duplicate or pin tests were introduced or removed.

## Plan and results

The full working plan is PLAN.md. Read the contract and existing journeys, add the missing native proof inside sharingChecks, run the touched runtime and typecheck, validate first-party structure and generated views, restore generated files, regenerate and check the source lock, synchronize main, commit and push the named branch, open the existing PR entry point, record focused browser proof and exact-head CI, then publish the report-only packet. Every implementation step is complete; the final browser and CI observations are appended below. Guarded landing and publication scanning remain the fleet's duties.

The uploaded files are distinct public and private text attachments with actual nonempty bytes, stored through POST /work/:id/attachments. Authorized owner downloads return those same bytes and the owner's conversation contains both real metadata records. After sharing, the colleague sees the real initial public message and can reply, but gets an empty attachment projection, no attachment id, name or digest elsewhere in the response, and 404 on both direct downloads. The reply succeeds without changing the full workspace work-id set or the existing intake-event rows; the original ticket's intake row is asserted present first. An HR ticket is submitted by the owner, who is genuinely its requester; their share attempt returns 422, leaves the share history empty and adds no successful-share audit. The target colleague still gets 404. Existing private-message, restricted-share, revoke, on-behalf, manager and reporting-line checks are retained.

The comparison against main has no CONTRACT.md changes. Before the first push every candidate author, committer and message was inspected, including side parents; the candidate has the fleet identity and no trailer. The hook remained active. New changed text contains no email-shaped literal. The first real commit was pushed successfully through the cloud push guard without a retry. Rebase onto freshly fetched main was a no-op; no published history was rewritten.

## Public-door probe

PROBE CHANNEL-009 2: ticket plus public and private attachment uploads, authorized owner downloads, share to the named colleague, colleague conversation and direct downloads, public reply and HR share attempt -> upload 201 and identical owner bytes; shared conversation has no metadata; both colleague downloads 404; reply 201 with no new work or intake; HR share 422 with no share or successful-share audit and colleague read 404.

The probe is the passing sharingChecks execution in work-runtime.log, loaded by tests/work/runtime.mjs:738. Checks are against real D1 and R2 in a local Worker. Identity headers are the existing test authentication boundary; product ticket, share, message and attachment handlers execute unchanged. External connectors are not used.

## Frozen acceptance proof map

Every row below uses the exact source bytes recorded in checks-receipt.json. The runtime passed before the commit with byte-for-byte identical relevant sources and tests. The emitted browser build and browser execution use the committed candidate. Both named journeys are already in Verify: scripts/verify.mjs:15 loads the work runtime, and tests/ui/browser.mjs:584 loads sharingJourney through the existing employee browser registration. The Verify event is pull_request, run 42515650403; its recorded final conclusion applies to every row.

| Row | Acceptance sentence or inherited duty | Public proof and line | Result |
| --- | --- | --- | --- |
| R1 | Point 1: employee shares with a named current colleague by work email; colleague reads and replies without the private note. | tests/work/relationship-cases.mjs:130–153 sharingChecks, plus tests/ui/sharing-journey.mjs:29–51 sharingJourney. Unknown recipient and unrelated sharer refused; mixed-case email resolves the actual member. | PASS runtime; browser result below. |
| R2 | Point 2: shared reader sees and replies to the public thread only, never private notes or attachments; reply is conversation without new intake; HR and restricted requests cannot be shared. | tests/work/relationship-cases.mjs:118–153 and :162–172 sharingChecks. Both real attachments are served to the owner before the colleague's metadata and download refusals. Existing private reply returns 404. Reply leaves work identities and intake rows unchanged. HR share 422 leaves share history and successful-share audit empty; restricted share 422 remains. | PASS, including allowed and unsafe paths. |
| R3 | Point 3: revocable audited sharing with current and historical shares. | tests/work/relationship-cases.mjs:133–134 and :154–161 sharingChecks; tests/ui/sharing-journey.mjs:63–66 sharingJourney. Unauthorized revoke 404, requester revoke succeeds, historical row retains revoked_at, audit actions exactly shared and share_revoked, revoked reads and replies 404. | PASS runtime; browser result below. |
| R4 | Point 4: on-behalf work shows to both submitter and beneficiary. | tests/work/relationship-cases.mjs:173–177 sharingChecks. Both real authenticated subjects list the created request; the unrelated colleague is refused. | PASS. |
| R5 | Point 5: direct and indirect reports appear in the read-only team view; HR and restricted tickets and private notes are absent; manager cannot reply. | tests/work/relationship-cases.mjs:178–188 sharingChecks; tests/work/department-space-cases.mjs:53–56 departmentSpaceChecks for a normal HR-workspace request excluded from manager view; tests/ui/sharing-journey.mjs:52–62 sharingJourney. | PASS runtime; browser result below. |
| R6 | Point 6: current reviewed manager change removes old-manager access and grants the new manager access. | tests/work/relationship-cases.mjs:189–194 sharingChecks through POST /people and subsequent team and conversation reads; tests/ui/sharing-journey.mjs:67–76 sharingJourney. | PASS runtime; browser result below. |
| R7 | Point 7: portal discloses manager visibility to requesters and beneficiaries of normal requests. | tests/ui/sharing-journey.mjs:24–31 sharingJourney waits for the portal and shared-region disclosures in a signed-in requester context. INSPECTED: src/ui/work-shares.tsx:18 uses the same disclosure for canShare readers; src/ui/work-detail.tsx:154 passes mine for either requester or beneficiary. The browser asserts it for the real requester. | Browser result below; existing UI inspected. |
| R8 | Requirement: reviewed native HR facts stand in for external HRIS until LIFE-001 inherits the connector; HR-service workspaces preserve exclusion under DESK-011. | CONTRACT.md:522 explicitly names both boundaries. sharingChecks sets reviewed bound people; departmentSpaceChecks creates an actual HR department and verifies sharing refusal and manager exclusion. | PASS native; no live HRIS claim. |
| R9 | Requirement and RL-3: public thread only, revocable and audited, with no new authority. | sharingChecks allowed share, private note and download denials, unauthorized sharing and revoke denials, real audit history and revoked read and reply denial. Production sharing.ts unchanged. | PASS. |

## DONE-RIDERS

| Rider | Result | Proof or boundary |
| --- | --- | --- |
| 1 | PASS local, exact-SHA CI recorded below | R1–R9 map every native acceptance outcome to the existing public-door sanity journeys. New point 2 proof is nonempty, with actual uploads, successful owner reads and colleague refusals. |
| 2 | PASS | sharingChecks:118–169 exercises successful share and reply, stored bytes, denied metadata and downloads, and refused HR share with no side effect. Assertions would fail on each selected regression. |
| 3 | Pending CI observation, final result below | Work runtime and sharing browser are already loaded by Verify. pull_request run 42515650403 is bound to 501d996be75cc8ffa3429cf9af05cfec1dcde098. No new env gate or nightly-only proof added. |
| 4 | PASS | checks-receipt.json records exact source hashes matching committed HEAD; no relevant byte changed after runtime proof. Browser build and proof use this candidate. |
| 5 | PASS | CONTRACT.md:522 and points 2 and 5 explicitly name HR exclusions, native HR facts pending LIFE-001 inheritance and DESK-011's workspace obligation. No Base duty or external completion is newly claimed. |
| 6 | PASS mechanical; status promotion belongs to lander | Generator write and check pass; generated views restored whole from origin/main and uncommitted. Source lock regenerated and checked. CONTRACT.md cells remain exactly main's; its old gap is intentionally not hand-edited. |
| 7 | PASS | No acceptance text, ruling, coverage map, status cell or contract prose changed. All prior assertions retained. |
| 8 | PASS | Unrelated sharing and revoke attempts return 404; private write and both real attachment reads are refused for colleague; HR share 422 changes nothing; revoked credential relationship loses reads and replies. |
| 9 | PASS boundary | Only native routes and reviewed HR facts are proven. LIFE-001 live HRIS, chat mapping and consent, real mobile devices and receiving-provider proof remain outside this claim. |
| 10 | PASS | No new policy default. Existing ct approval for audited revocable public-thread sharing and manager portal disclosure governs. No new staff or custom-role authority. |
| 11 | PENDING GUARDED LANDING | Main is the parent, not the candidate. Exact-main equality, complete publication scan with zero findings, status promotion and candidate Run site are the fleet lander's work. Cloud did not write main. |

## Pre-ready self-check and mechanical receipt

1. The selected point has passing route assertions for real data and both sides of its privacy boundary. Existing sanity journeys cover the other native outcomes. Exact-head Verify is recorded below; no green from a different head is substituted.
2. No assertion removed, narrowed, skipped or placed behind a new conditional. Only the existing runtime helper argument, additional assertions and descriptive pass line changed.
3. Revoked share reads and replies fail, private writes and attachment downloads fail, and HR share leaves no authority. The same work runtime retains its erasure, restore and replay denial checks at tests/work/runtime.mjs:754–795. No production authority or retention path changes.
4. No screen, text style or icon control changed. The focused existing sharing browser proof records the clause's native 1440 and 390 screens; no new UI design is created.
5. Source lock and views check pass locally. First-party check, typecheck and touched runtime pass. Parent main Verify 42514121758 and Run site 42514121732 are completed/success at c4e9852d1098215b0371a6c67a9a721be85a88cf; they establish parent health only. Exact candidate scanning and Run site are unestablished until the fleet lands it. Added fixture text is synthetic; no new email-shaped literal, secret, provider key or account grant is in this change.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0, then restored origin/main views; ledger=none exit=0 (no migration touched).

Publication scan: commit=501d996be75cc8ffa3429cf9af05cfec1dcde098 complete=UNESTABLISHED historyScanned=UNESTABLISHED findings=UNESTABLISHED. NOT RUN in cloud under the cloud-only publication adaptation; a COMPLETE result with zero findings is required from the maintained lander. This is no scan receipt and no landing claim.

Blockers: no native implementation blocker identified. No held account, Base, ct or device boundary changed. Run site on the candidate and main equality remain pending landing; builder evidence does not replace independent gates.

Plan row proposed for fleet update: CHANNEL-009 point 2 remaining native proof closed; requested PARTIAL to DONE after guarded acceptance, using sharingChecks and existing sharingJourney. No other campaign clause selected: the next listed targets touch different features and have their own leases.

## Browser completion

Focused sharingJourney PASS at committed candidate 501d996be75cc8ffa3429cf9af05cfec1dcde098, exit 0. Native sign-ins, sharing, public reply, manager read-only view, revoke and reviewed-manager change all completed; browser page errors were empty. Four actual PNG captures are retained: requester sharing at 390, colleague at 1440, manager at 390 and new manager at 1440. The 1440 and 390 screenshots were visually inspected. Auxiliary panels show the existing Work not found refusals for shared and manager readers; these are unchanged production UI outside this proof-only lease, while the actual public messages and reply behavior are asserted by the unchanged journey. No screen edits are part of the candidate.

Rows R1, R3, R5, R6 and R7 have passing focused browser execution as well as their listed native runtime proof where applicable.

Evidence selection excludes the raw browser Worker operational log and private setup files. The packet contains actual reports, check receipts, public-source lock reports, synthetic browser captures and the non-secret focused driver. No credentials, environment dump, real provider data or held gate material is selected.
