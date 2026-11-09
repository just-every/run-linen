# sx-linen-f19fix1-push-1 results

Repository: just-every/run-linen
Product branch: cloud/sx-linen-f19fix1-push-1
Product head: fc7a01bf5e248f098736700955713f752a93a7b3
Source branch: cloud/sx-linen-f19fix1
Source head: fc7a01bf5e248f098736700955713f752a93a7b3

## Outcome

The existing source commit was published unchanged to the named product branch. The push guard succeeded on attempt 1; a subsequent Git remote advertisement confirms the exact full SHA. There are no new product commits, no source changes, no contract edits, no generated-view edits and no clause promotions. No PR was created; the narrow task requests branch republication for the fleet lander. The default branch was not changed. No DONE claim is made.

## Verification and custody

Existing Verify run 42542451567 is completed/success on fc7a01bf5e248f098736700955713f752a93a7b3:
https://github.com/just-every/run-linen/actions/runs/42542451567

The run was inspected with `gh run view 42542451567 -R just-every/run-linen --json conclusion,headSha,status,name,url,databaseId`, with GH_TOKEN loaded only from the approved decrypted bundle into the subprocess environment. No workflow or local test was rerun. The existing exact-SHA success satisfies this task's republication brief. The product branch's Verify workflow does not run automatically for this branch name; the existing exact-SHA run is the requested proof. Publication and landing remain separate fleet operations.

The filtered shallow clone fetched 64 commits for main and the source branch, found a shared merge base, and inspected all three candidate commits, including the side-parent commit. All authors and committers are Run Edit Run fleet <fleet@runeditrun.com>; all three messages have no trailers. Full candidate messages and the exact requested identity-log output are in COMMIT-MESSAGES.txt and IDENTITY.txt. The source branch, local HEAD and new remote product branch are identical. The checkout is clean, and its tree is recorded in RECEIPT.json.

The original fix retains ACCESS-008 point 3 and restores LIFE-002 operator-search behavior. This task changes no behavior or assertion and makes no new acceptance claim.

## Before / after counts

These are the unchanged generated-view counts at the source/candidate SHA, not current main's newer counts and not a fresh acceptance judgment.

| Tier | Before done/partial/missing/total | After done/partial/missing/total |
| --- | --- | --- |
| Core | 21/128/29/178 | 21/128/29/178 |
| Agent surface | 0/13/8/21 | 0/13/8/21 |
| Later | 0/0/0/0 | 0/0/0/0 |
| Full target | 21/141/37/199 | 21/141/37/199 |

Clause status changes: none. CONTRACT.md and sources.lock.json are unchanged from the supplied source commit. No merge, rebase, amend, cherry-pick, force push, provider action or deployment occurred.

## Plan and evidence

PLAN.md records the full plan. VERIFY.json is the actual workflow response. PUSH.txt contains the actual product push command, sanitized output and exit status, omitting credential fingerprint metadata. RECEIPT.json records actual source/product/remote provenance, verification and counts. Only explicitly selected regular non-secret packet files are returned through refs/heads/evidence/sx-linen-f19fix1-push-1; reports are outside the product tree.

The successful product clone is scheduled for deletion after evidence publication and remote verification, as requested. The packet remains outside it. The terminal message records completion of cleanup and the exact evidence ref/head.

Blockers: none. No runtime or provider work was authorized or performed. The Mac fleet performs its independent publication scan and landing checks; this cloud result does not claim landing.
