# sx-linen-c-f48 report

Product: just-every/run-linen, branch `cloud/sx-linen-c-f48`, full candidate `68c3c916c54265ff262b177759352ddf57c7cb83`. Draft PR: https://github.com/just-every/run-linen/pull/185.

ASSET-009 remains PARTIAL under the point-limited lease. This round closes the selected non-dependency connection proof in point 4 and unknown, non-outage inference proof in point 8. No Status, Gap or Evidence cell, acceptance sentence, generated view or homepage changed. Counts remain **28 DONE, 134 PARTIAL, 37 MISSING, 199 total**. The plan extract has no ASSET-009 target row; this report records the selected queue entry's proof without rebuilding or modifying the plan.

## Changes and observations

The existing dependency implementation already excludes `connects_to` from traversal. The existing native UI already explains unknown coverage and separates inferred impact from an outage. The product commit extends two existing journeys and regenerates their source lock; no runtime or UI implementation change was needed.

`tests/services/dependency-cases.mjs#dependencyChecks` now creates a reporting integration, its archive dependency, a dashboard dependent and an unlinked hardware CI through the native routes. It records two opposing non-dependency connections and reads their exact retained edge data through the graph. Service, change and incident impact reads exclude connected nodes and the separate chain transitively, while ordinary dependency paths remain present. The connected chain retains exactly its own upstream archive and downstream dashboard. The unlinked item remains in the register with empty impact sets and unknown coverage. Complete public snapshots of service, incident, change and graph records match before the first impact read and after the final one.

`tests/ui/dependency-journey.mjs#dependencyJourney` now creates an unlinked meeting-room display beside the existing Payroll, Gusto and SSO map. It checks empty impact and no invented visible relationship rows through the built native application. It does not assert the explanatory paragraph's exact wording. The existing capture helper uses actual 1440 and 390 viewports and restores desktop width for behavioral assertions.

No test registration was added or removed. All existing assertions, scope refusals, stale and conflicting path assertions and cycle checks are preserved. There is no new email-shaped fixture or prose-only slash token in the added test text. No policy default or new authority is introduced. Authorized MDM and cloud-account readback, native mobile builds and devices, Base restrictions and every retained account, ct and device hold remain outside this proof.

## Plan and local checks

The full executed plan is in `PLAN.md`. Public-door inputs and observed outputs are in `PROBES.md`. Acceptance coverage, all eleven DONE-rider results and the pre-publication self-check are in `COVERAGE.md`. These records claim only the selected outcomes; the whole clause is not promoted by this report.

- Fleet launcher refresh, bundle-backed Git helper and preserved repository commit hooks installed.
- Public setup, service-route runner, typecheck, public build and first-party check: exit 0.
- Contract write and check: exit 0; generator wrote zero changed documents. Generated views were restored from main.
- Final fetch and rebase: already current at main `e9aa94360d01ae5c8ae48557a61aca3c565f3236`.
- Source lock regenerated last and checked: exit 0. No migration changed; ledger check not applicable.
- Every tested source and test file hash recorded in `receipts.json` matches the committed candidate.
- Every candidate author and committer is fleet identity; no trailers or OpenAI co-author survived. The cloud push guard succeeded on attempt 1. Product checkout is clean.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check then restore from main exit=0; ledger=none exit=0

## Browser inspection

The ASSET-009 journey passed through `tests/ui/browser.mjs` in the real built application. Twelve screenshots cover item creation, linked dependencies, unlinked hardware, change impact, incident impact and stale relationships, each at actual 1440 and 390 widths. PNG dimensions and hashes are recorded in `screens.json`. The linked Payroll map and unlinked Denver meeting-room display were visually inspected at both widths: the existing paragraph explains unknown relationship coverage and inferred, non-outage impact; the unlinked screen shows no invented dependency or dependent rows. Fact freshness remains distinct from service health. No horizontal document overflow was reported.

Behavioral assertions are at desktop width; screenshot evidence is at both actual widths. No explanatory UI paragraph is pinned to a literal. Existing shared icon-only account access already has its tooltip behavior; no new control was added. Existing small status pills and the broader shell layout were inspected as inherited styling, not changed by this proof-only round.

The containing full screenshot-enabled browser driver later reached its 1200-second SIGALRM deadline while in the unrelated `sharingJourney`, waiting for its shared-reply text. Its overall exit was 242. The ASSET-009 journey had already printed PASS and saved all twelve screens; no selected assertion failed. The driver was not blindly rerun or patched. Only this run's owned browser and worker descendants were stopped, and its isolated scratch directory was removed. This report does **not** claim that the entire local browser suite passed. The retained complete log and `browser-timeout.json` distinguish the selected passing proof from the broader timed-out command. The branch Verify remains the independent full-suite gate.

## CI and landing custody

Baseline main has green push Verify **42570589451** and Run site **42570589486** at `e9aa94360d01ae5c8ae48557a61aca3c565f3236`. Candidate Verify **42584432064**, event `pull_request`, remained in progress at the final 08:25:36 UTC observation on exactly `68c3c916c54265ff262b177759352ddf57c7cb83`. This baseline is not presented as candidate CI proof.

The candidate is branch-only. Main does not equal the candidate. Exact-candidate publication scan: commit `68c3c916c54265ff262b177759352ddf57c7cb83`; complete=not-run-in-cloud; historyScanned=not-run-in-cloud; findings=not-evaluated. Full history is present. The maintained fleet performs its independent exact-head Verify gate, complete publication scan and guarded landing, then exact-main Run site. No cloud landing, source publication acceptance or provider success is claimed.

CLAIM ASSET-009 PARTIAL points=4,8 tests=tests/services/dependency-cases.mjs#dependencyChecks; tests/ui/dependency-journey.mjs#dependencyJourney
GAP ASSET-009: All acceptance outside the leased portions of points 4 and 8 remains outside this claim; existing account, ct, Base and device holds remain unchanged. No provider observation, verified outage or new reader authority is claimed.
