# sx-linen-f19fix1 plan

1. Configure fleet identity, refresh the launcher, install bundle-backed Git authentication and commit hooks; clone run-linen with full history and start at e8dd72e6b634e11559de32489a60388912fa53e7.
2. Reproduce the LIFE-002 failure without changing its assertion. Compare source changes and inspect the failed exact-SHA Verify archive. Log matched records with non-secret fixtures to distinguish a search false positive from lifecycle disclosure.
3. Merge origin/main, retaining main's entire contract, generated views and ID map. Regenerate contract views, restore them from main, and regenerate/check the source lock last. Publish an intermediate merge save with [skip ci].
4. Fix only the identified numeric-identifier search false positive. Fold one deterministic public-route regression assertion into the existing search test. Preserve ACCESS-008 point 3 and every existing assertion.
5. Run the failing clock scenario before and after, the touched work runtime, typecheck, first-party check, contract and source lock checks. Build and capture the corrected search through the native UI at 1440 and 390.
6. Commit and push only cloud/sx-linen-f19fix1 after checking all candidate identities/messages. Open a draft PR for the existing pull_request Verify entry point and observe the exact SHA within the ten-call API budget and 300-second polling interval.
7. Save full non-secret reports and actual receipts in this packet. Publish explicitly selected files only to evidence/sx-linen-f19fix1. Return the unchanged builder CLAIM and relay the sx inbox line; do not land, deploy or run a publication scan.
