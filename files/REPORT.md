# sx-linen-c-f69-pc1 report

Repository: just-every/run-linen.
Product branch: cloud/sx-linen-c-f69-pc1.
Product HEAD: 3cc7775ff7b84a0362b6236d99aa1476b0ef995b.
Product push succeeded on the first attempt, and the advertised remote branch SHA was independently checked.
Original published candidate: a3c2ca907968fbffea738f4892a8e58c1fcfc667.
Merged main: 2fffbc6cd5d5fc4d92d958923071750ded215fdd.
PR: none; Verify provides workflow_dispatch for branch verification and the fleet owns landing.

## Plan

1. Configure fleet identity, launcher credentials, Git push guard and commit hooks.
2. Clone only just-every/run-linen with --filter=blob:none and full history; fetch main and cloud/sx-linen-c-f69.
3. Verify candidate a3c2ca907968fbffea738f4892a8e58c1fcfc667; preserve the published candidate as the first parent of cloud/sx-linen-c-f69-pc1 and merge current origin/main without rebasing or force pushing.
4. Resolve any contract conflicts in favor of main's full source rows/text and ID map. Generate and check contract views, then restore origin/main's ACCEPTANCE.md and docs/CLAIMS.md. Preserve candidate clause claims and CLAIM lines.
5. Install dependencies using the cloud toolchain. Run typecheck and candidate-touched work/runtime and native browser suites once. Regenerate sources.lock.json last and run its documented check.
6. Review the merge, identity, all side-parent commit messages and trailers. Commit with fleet identity and active hooks. Push only cloud/sx-linen-c-f69-pc1 via the cloud guard.
7. Discover and verify the exact-SHA Verify via the cloud adaptation's REST workflow (ten-call budget; one watcher; at least 300 seconds between calls per run). Keep product status separate from report publication.
8. Save complete non-secret reports/receipts outside the product repository and publish the explicit packet only on evidence/sx-linen-c-f69-pc1.

No feature development, clause-status promotion, deployment or main push is authorized. No inbox or state files are read or written.


## Merge results

The original candidate head matched a3c2ca907968fbffea738f4892a8e58c1fcfc667 exactly. New main changes only tests/services/calendar-cases.mjs, tests/services/run.mjs, tests/services/worker.ts and sources.lock.json. git diff confirmed src, tests/ui, tests/work, package.json, pnpm-lock.yaml and migrations are unchanged; local typecheck/work/browser results apply to identical code. Contract docs and source lock regenerated and checked again. Current main did not contain both candidate commits. A normal merge was prepared with the published candidate as first parent and fetched main as second parent. No conflicts occurred, no migration names collided, and no candidate test was weakened, deleted or changed. The candidate's clause claims and original commit messages were preserved.

CONTRACT.md, docs/contract/ID-MAP.json, ACCEPTANCE.md and docs/CLAIMS.md match origin/main byte for byte. Contract generation wrote zero documents and its check passed. The generated views were explicitly restored from origin/main. sources.lock.json was regenerated last with the documented command and its check passed.

Compared with main, the resulting product differs only in sources.lock.json and the candidate's two test files. The candidate test files retain the exact original a3c2ca9 bytes: 71 additions/6 removals in tests/ui/desk-console-journeys.mjs and 76 additions in tests/work/desk-scenario-cases.mjs. The lock changes two hashes (2 additions/2 removals). Total: 3 files, 149 additions and 8 removals. Other differences from the old candidate are exactly the main changes brought through the merge.

## Counts and clause judgments

Before -> after: full target 31 done / 131 partial / 37 missing / 199 total -> 31 / 131 / 37 / 199.
Core 31 done / 118 partial / 29 missing / 178 total remains unchanged.
Agent surface 0 done / 13 partial / 8 missing / 21 total remains unchanged.
DESK-015 stays PARTIAL. DESK-025 and every other clause retain their existing status. No CLAIM line was added, removed or rewritten.

## Actual local validation

- `npx -y @runeditrun/rer setup --owner-email fleet@runeditrun.com --non-interactive`: passed (exit 0).
- `node src/base/contract-docs.mjs write`: passed (exit 0); complete output in contract-generate.log.
- `node src/base/contract-docs.mjs check`: passed (exit 0); complete output in contract-check.log.
- `pnpm typecheck`: passed (exit 0); complete output in typecheck.log.
- `node tests/work/runtime.mjs`: passed (exit 0); complete output in work-runtime.log.
- `node scripts/edition-authoring/cli.mjs lock`: passed (exit 0); complete output in source-lock.log.
- `node scripts/edition-authoring/cli.mjs check`: passed (exit 0); complete output in source-check.log.
- `pnpm exec rer check --profile first-party`: passed (exit 0); complete output in rer-check.log.
- `LINEN_CHROMIUM_EXECUTABLE=/usr/bin/chromium LINEN_TEST_BUILT=1 LINEN_CAPTURE=1 node tests/ui/run.mjs`: passed (exit 0); complete output in ui-runtime.log.

Browser suite status: passed. Chromium is /usr/bin/chromium with --no-sandbox. The native browser harness uses fresh isolated D1/R2 state and actual application sessions. No hosted provider action or deployment was attempted.

The backend run includes the candidate's DESK-015 point 6 proof: permitted HR fields and pause/resume/close persist with original before/after audit entries, and forbidden classification applies nothing. The candidate browser run tests point 8 through real 390-pixel ticket/keyboard and bulk execution, persistence after reload, and saved-state captures at 1440 and 390.

## Browser proof files

The six selected screenshots cover the ticket run and both bulk-run saved records at actual widths 1440 and 390. See screenshots-receipt.json for original capture names, PNG dimensions and hashes. ui-results.json records zero page errors.

## Publication and CI custody

{
  "repository": "just-every/run-linen",
  "branch": "cloud/sx-linen-c-f69-pc1",
  "head_sha": "3cc7775ff7b84a0362b6236d99aa1476b0ef995b",
  "recorded_at": "2026-11-09T15:06:05.237350+00:00",
  "github_calls_used": 4,
  "status": "success",
  "run": {
    "conclusion": "success",
    "event": "workflow_dispatch",
    "head_sha": "3cc7775ff7b84a0362b6236d99aa1476b0ef995b",
    "html_url": "https://github.com/just-every/run-linen/actions/runs/42638687832",
    "id": 42638687832,
    "name": "Verify",
    "status": "completed"
  }
}

The publication review checks every candidate commit, including side parents, against fleet/owner names and emails and scans full messages and trailers. The only accepted owner identity in carried commits is James Peter <github@zemaj.com>. New commits use Run Edit Run fleet <fleet@runeditrun.com>. All reports and receipts remain outside the product tree. Evidence publication is separate from product readiness and is restricted to evidence/sx-linen-c-f69-pc1. The Mac fleet retains landing and independent gate responsibility.

## Limitations and blockers

No clause is promoted by local test evidence. Live-provider, hosted and owner acceptance remain as the contract records them. No product blocker has been observed; final CI status is recorded above.
