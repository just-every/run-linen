# sx-linen-f19fix1 results

Repository: just-every/run-linen
Branch: cloud/sx-linen-f19fix1
Head: fc7a01bf5e248f098736700955713f752a93a7b3
Draft PR: https://github.com/just-every/run-linen/pull/163
Starting blocked candidate: e8dd72e6b634e11559de32489a60388912fa53e7
Integrated main: ce86a9413f41103d066aa66c3db8d43fb40da248

## Result and root cause

The original LIFE-002 ticket-search assertion reproduces **3 rows before and 0 after** at the failed CI clock. ACCESS-008 point 3 continues to pass: the metadata-only active employee receives 403 at exact current revisions, with decisions, membership, roles and execution grants unchanged; the actual authorized holder can approve the same stage. The original applicationChecks, lifecycleTemplateChecks and work-runtime files are unchanged byte for byte from e8dd72e6. One regression assertion was added to the existing searchChecks file. No original assertion was removed, skipped, weakened or made conditional.

The three hits are unrelated ordinary handoff tickets, titled synthetic-linen-9707 laptop slow, synthetic-linen-9711 vpn and synthetic-linen-9712 printer. Their readable transcript includes a generated expected-reply time of **3:20 PM**. Search normalized synthetic-linen-20 into three independent tokens and combined synthetic/linen from an unrelated title with 20 from the deadline. None of those tickets contains the lifecycle subject marker. This is a clock-dependent search false positive; the inspection did not show approval metadata widening authority or disclosure of the lifecycle subject.

The blocked candidate changed only its approval test and lock. The product matching source was identical to main. The added journey changes suite timing; the decisive reproduced condition is the handoff deadline's minute token, rather than a new authority path. Local runs at the actual 00:4x UTC clock passed on both Node 24 and Node 22. Replaying the original suite with a progressing clock starting at 2026-11-08T21:20:00Z reproduced the same three hits, and printed their real synthetic fixture rows and readable messages. The same clock replay passes after the product correction. Date changes exist only in the external diagnostic harness; no repository test or product clock was altered.

The product correction keeps a punctuated identifier containing letters and numbers in one contiguous normalized field span. It cannot borrow a numeric segment from another field. Unicode NFKC/case/separator normalization and one-edit matching of eligible long tokens still apply inside that span. Ordinary prose can still span readable fields. This intentionally narrows scattered-token matches for numeric identifiers; it does not change readership, approval authorization, handoff deadlines or generic lifecycle reminders.

## Plan executed

1. Configured fleet global/local identity and the commit cleanup hook, refreshed the fleet launcher and installed the bundle-backed Git helper and cloud push guard. Cloned only the declared product repository with full history, fetched the original candidate and main, and started the named branch at e8dd72e6.
2. Read the supplied rules and repository instructions, contract and acceptance sources, source differences and the failing workflow evidence. Initial touched-runtime runs passed on Node 24 and Node 22. A focused application/lifecycle run also passed, which ruled out a deterministic authority change from the new fixture.
3. Used the required failed-job archive command once. It downloaded the archive but gh 2.46 produced empty --log-failed text. Read the already-downloaded cache archive locally, without another network/log request, to recover the actual assertion and failure at tests/work/lifecycle-template-cases.mjs:155. The excerpt is ci-failure-excerpt.log. Original Verify 42524581296, failed shard job 128865352710, head e8dd72e6.
4. Replayed the failure-time clock with the unchanged LIFE-002 assertion. The matching-record diagnostics identify the three handoff tickets and their deadline text. Added one independent deterministic public-route assertion: an actual numbered ticket must be the sole match when another ticket's unrelated numeric identifier and 3:20 PM body can supply scattered tokens. It failed before the fix with two results instead of one, and passes after with exactly the requested record.
5. Merged main b5b4639acb7d202bb277560c3f2919a0cfa48317 and published merge save 1a7719a4be4fe1ed14c9a8c707f9e6aafaaa22a2 with [skip ci]. Main advanced once more; merged ce86a9413f41103d066aa66c3db8d43fb40da248 into the final fix commit. Main's complete contract, generated views and ID map were retained. There were no migration changes to renumber. Regenerated/check-tested the contract, restored generated views from main, and regenerated/checked the lock last.
6. Ran the corrected clock scenario and normal committed-candidate work runtime, typecheck, first-party check, source-lock checks and build. Captured the changed search behavior through a signed-in ordinary operator's native search at 1440 and 390, asserting at 1440 only. The browser shows the requested numbered record and excludes the unrelated deadline ticket. Browsers and isolated workers were closed by their own runners.
7. Committed with explicit fleet author/committer environment and active hooks. Inspected all candidate commits, including merge ancestry, for identities and trailers before both successful guarded pushes. Product commit fc7a01bf5e248f098736700955713f752a93a7b3 is pushed; no main push, force push, history rewrite or deployment occurred. Created draft PR 163 for the existing pull_request Verify entry point, retaining that workflow unchanged.
8. Recorded actual reports and hash-bound receipts in this separate packet. Selected only non-secret regular report, proof and receipt files for the evidence ref; excluded setup state, worker logs containing runtime metadata, the raw CI environment sections, credentials and environment dumps. Evidence publication is separate from product READY and acceptance. No publication scan was run, as the FIX brief expressly requires; the fleet retains publication and landing gates.

PLAN.md records the work plan. CHECKS.json records observed command exits and hashes. PROVENANCE.json binds the product and untouched proof blobs to the exact head and main. reproduce-clock.py reconstructs the external progressing-clock diagnostic from a checkout; run it from the checkout root, then run its /tmp/linen-clock-runtime.mjs with Node 22. reproduce-focused.py reconstructs the smaller diagnostic. search-browser-proof.mjs is the actual native browser driver. Runtime logs contain only repository fixtures.

## Validation

| Check | Before | After |
| --- | --- | --- |
| Original LIFE-002 search at failing clock | FAIL, 3 ticket hits, expected 0 | PASS, 0 ticket hits |
| New public-route numeric-identifier regression | FAIL, unrelated ticket included (2 vs 1) | PASS, exactly the requested ticket (1) |
| ACCESS-008 point 3 | PASS, metadata-only 403, authorized holder succeeds | PASS, identical authority boundary |
| Normal touched work runtime | PASS at actual local clock | PASS on committed candidate, Node 22.20.0 |
| Typecheck / first-party / build | baseline inspected | PASS |
| Contract generator write and check | PASS | PASS, views restored from main |
| Source lock generation and check | PASS | PASS, lock regenerated last |
| Native operator search | no prior screen change | PASS, assertion at 1440; screenshots at 1440 and 390 |

The exact candidate's normal work runtime includes existing search serial/tag/native-ID lookups, ordinary typo matching, scope and revoked-role checks, all existing LIFE-002 tasks/reminders/privacy assertions, and the unchanged ACCESS-008 authority proof. Browser proof is for the fixed search flow; no new execution of the original application archive or application UI journey is claimed beyond exact-SHA Verify.

## CI, counts and clause custody

Verify 42542451567 is in_progress on exact head fc7a01bf5e248f098736700955713f752a93a7b3. GitHub API budget used: 8/10.
CI URL: https://github.com/just-every/run-linen/actions/runs/42542451567
One watcher, no polling more often than 300 seconds, no dispatch or rerun of an existing run.

Starting blocked candidate counts: **20 DONE / 142 PARTIAL / 37 MISSING / 199 total**. Current main before this fix and final candidate: **21 DONE / 141 PARTIAL / 37 MISSING / 199 total**. The one-count shift is inherited from main's DESK-021 lander judgment. The fix itself changes no Status, Gap or Evidence cell, adds no clause or acceptance point, and makes zero clause status changes. ACCESS-008 remains PARTIAL in the source, with the existing builder claim below preserved for the independent gate. No new test registration, no test cap change, one additional regression assertion inside the existing search test.

CLAIM ACCESS-008 DONE points=1,2,3,4,5,6,7,8 tests=tests/work/application-cases.mjs#applicationChecks; tests/adoption/application-cases.mjs#checkArchiveApplications; tests/ui/application-journey.mjs#applicationJourney

This is the builder's existing claim, retained verbatim; the independent gate and fleet own acceptance and landing. This FIX takes no other acceptance point, campaign continuation, redesign, release or provider work. No new ruling or policy default was needed. There is no observed product blocker after the passing local checks; remote Verify custody is recorded above. Publication, deployment and landing are not performed by this cloud task.
