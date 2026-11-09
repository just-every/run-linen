# Linen f19fix1 merge fix

Repository: just-every/run-linen
Branch: cloud/sx-linen-f19fix1-merge-fix
Product head: 3a902ef8a1189ca94d1cc9a0c4f455c5381c213f
PR: https://github.com/just-every/run-linen/pull/171 (draft, left for the lane)
Verify: https://github.com/just-every/run-linen/actions/runs/42556940934

## Result and scope

Merged candidate fc7a01bf5e248f098736700955713f752a93a7b3 with main f9dcb5212d7beca66a3c926de9bcf4c2b4f56812, retaining both parents. The only new product behavior is in src/styles/base.css: tooltips have zero fade duration while retaining their 300 ms hover dwell and immediate keyboard-focus display. The existing reduced-motion override continues to remove transitions. sources.lock.json was regenerated last and its check passes.

Relative to main, the final tree changes exactly five files: the tooltip CSS and lock, plus the original candidate's search-match.ts, application-cases.mjs and search-cases.mjs. CONTRACT.md, docs/contract/ID-MAP.json, ACCEPTANCE.md, docs/CLAIMS.md, response-journey.mjs and connected-browser.mjs are byte-for-byte main's versions. No generated view, clause judgment, migration, workflow or unrelated prose change was added. No new committed test or assertion was added. No publication scan was run, as expressly directed by the one-conflict brief. The fleet owns its publication scan and landing.

## What the reproduction actually showed

The 0.08 s comes from `[data-tip]::after { transition: opacity 80ms linear 0s; }` in shared src/styles/base.css. This CSS is identical on the original candidate and current main; it was not introduced by their merge. The keyboard selector already sets transition:none, and the global prefers-reduced-motion override already sets transition:none!important. The response journey's browser context does not explicitly request reduced motion.

The unchanged responseJourney passed in the focused baseline run and the complete baseline connected-browser plus Worker-restart run at both existing widths in this VM. Therefore the earlier lander's exact journey failure was not reproduced locally, and this report does not claim otherwise. An isolated Chromium probe reconstructed the native account-control markup with main's exact CSS. After normal hover settled, the same strict duration equality used by response-journey.mjs:53 failed with `'0.08s' !== '0s'`; the full actual assertion and stack are in tooltip-before-assertion.log. A separate baseline probe measured normal hover duration 0.08s/delay 0.3s and reduced-motion duration 0s/delay 0s. This does not establish a reduced-motion CSS defect: the brief's reduced-motion premise was not borne out by these observations.

The small product correction removes the optional 80 ms opacity fade in every tooltip state, eliminating the offending duration without depending on focus modality. Normal hover still waits 300 ms. It does not alter the test or focus behavior. Afterward, the exact CSS probe measures normal hover duration 0s/delay 0.3s and reduced-motion duration 0s/delay 0s. The unchanged response journey's keyboard-focus equality, hover-hidden-at-start assertion and 0.3 s hover-delay assertion all pass on the rebuilt native app.

## Executed plan and checks

PLAN.md records the full plan. All commands ran in the fresh full-history declared clone, using the fleet credential helper, commit hooks and identity. The pinned public RER setup and build commands ran through cloud_run. Setup, before build and after build completed successfully. The provided toolchain selected Node v24.19.0 and pnpm 10.12.4; RER's own setup also acquired its Node 22.20.0 runtime. Headless browser commands used /usr/bin/chromium with --no-sandbox and the real account HOME.

- Baseline focused unchanged responseJourney: PASS.
- Baseline complete tests/ui/connected-run.mjs, including responseJourney at its existing 1440/390 widths and restart: PASS, no page errors. This was used to investigate the reported sequence, not as a claim of a failing baseline journey.
- Rebuilt native app: applicationJourney, lifecycleTemplateJourney, unsentReplyJourney and responseJourney imported unchanged into the external targeted runner and asserted at 1440: PASS. applicationJourney completed before the lifecycle PASS line. It covers native registry creation, two entitlements, catalog linking, owner routing, cost snapshots, reload and edits. lifecycleTemplateJourney covers task editing, named and undated tasks, owner/manager completion, and unrelated-operator queue/read/search privacy.
- ACCESS-008 applicationChecks through the existing classification Worker/public routes: PASS. In particular, point 3's metadata-only active employee receives 403 against an active exact-current-revision approval stage; decisions, grants, memberships and roles remain unchanged, then the authorized holder succeeds. The existing candidate proof is retained.
- LIFE-002 lifecycleTemplateChecks through the same public-route harness: PASS, including reviewed matching, business-day dates/reminders, 1099 benefits exclusion and current-assignee privacy.
- searchChecks through public routes: PASS, including the candidate's numeric-identifier regression, ordinary typo matching, scopes and revoked roles. The lifecycle native journey still asserts zero unrelated-operator reminder-subject search hits. The prior candidate's 3-to-0 fix remains present.
- pnpm typecheck: PASS.
- node src/base/contract-docs.mjs check: PASS; no contract regeneration was needed because the final source is unchanged from main.
- node scripts/edition-authoring/cli.mjs lock, then check: PASS. Check was repeated after commit to confirm the committed lock.
- git diff --check and byte comparisons against main for protected contracts, ID map, generated views and response tests: PASS.
- Every candidate commit, including side parents: author/committer and trailer audit PASS. Four commits are reachable from the candidate but not main; all have the fleet identity and no OpenAI/Codex co-author trailer.

Actual external harnesses are included for reproducibility; they were never committed to the product. They call the existing functions without rewriting or removing their assertions. RECEIPT.json records commands, exit codes and product ancestry. Logs and the two screenshots are explicitly selected for evidence transport. Runtime private state, setup credentials, environment dumps, Worker logs and engineering grant material are excluded.

## Browser proof and before/after counts

The changed native account tooltip is visible in after/tooltip-1440.png and after/tooltip-390.png. The same post-journey page was captured once at each width with actual reduced motion enabled; both were visually inspected.

| Measure | Before | After |
| --- | --- | --- |
| Normal hover fade duration | 0.08s | 0s |
| Normal hover dwell | 0.3s | 0.3s |
| Reduced-motion duration | 0s | 0s |
| Prior LIFE-002 operator-search false hits | 3 before the original candidate's fix | 0, preserved here |
| Verify script check registrations | 31 | 31 |
| New committed test registrations/assertions in this round | 0 | 0 |
| Clause changes made by this fix | 0 | 0 |

The original candidate source has 21 DONE / 141 PARTIAL / 37 MISSING (199 total). Main and the final candidate both have 24 DONE / 138 PARTIAL / 37 MISSING (199 total). The three inherited main judgments are DESK-008, DESK-011 and KB-001, each PARTIAL to DONE. This round changes no Status, Gap or Evidence cell. ACCESS-008 and LIFE-002 remain PARTIAL in the source.

CLAIM ACCESS-008 DONE points=1,2,3,4,5,6,7,8 tests=tests/work/application-cases.mjs#applicationChecks; tests/adoption/application-cases.mjs#checkArchiveApplications; tests/ui/application-journey.mjs#applicationJourney

The above is the original candidate's claim preserved verbatim, not a status edit or a new archive-proof claim. This round reran the route and native application checks; the independent gate retains responsibility for the claim and the original archive evidence. The known LIFE-002 Slack reminder gap remains unchanged. No new ruling/default was needed.

## Product custody and CI

Product push succeeded on attempt 1 using cloud-push.py. Draft PR #171 supplies Verify's existing pull_request entry point, because named cloud branches are not in this workflow's push filter. No workflow was dispatched or rerun, and main was never pushed. Exact-SHA Verify 42556940934 was discovered in_progress on product head 3a902ef8a1189ca94d1cc9a0c4f455c5381c213f. PR's dynamic run 42556938340 is recorded separately and is not treated as Verify. One watcher polls at intervals of at least 300 seconds after discovery; the ten-call GitHub budget is enforced. Final observed status and API usage will be appended below.

Evidence publication is separate report-only custody. It does not mean acceptance, landing or product READY. The cloud leaves the PR for the fleet; the fleet performs publication scanning, final main integration and landing.

## Final result

Verify 42556940934 completed/success on exact product head 3a902ef8a1189ca94d1cc9a0c4f455c5381c213f, observed at 2026-11-09T03:47:32.185018+00:00. GitHub budget used: 5/10 calls (one PR creation, one exact-SHA discovery, three run polls). No failed-job logs, workflow dispatches or reruns were needed. The run reads occurred at least 300 seconds apart.

No blocker remains. The baseline reproduction limitation above is retained honestly; no unchanged baseline journey failure is claimed. The branch is pushed and is a READY candidate for the fleet, with draft PR #171 left for the lane. Product landing, main-only Run site and the fleet publication scan remain the fleet’s work.

READY branch=cloud/sx-linen-f19fix1-merge-fix head=3a902ef8a1189ca94d1cc9a0c4f455c5381c213f
