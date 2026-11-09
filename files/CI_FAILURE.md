# Recorded predecessor failure

Repository: just-every/run-linen

Head: cc284ac3936b34087b78dd6233df2f20d0cabd4d

Verify: 42570916118, pull_request, completed, failure. Job: 129025246169, journeys (1).

Exact failed command: pnpm exec rer verify. Shard: 1 of 6. Built application: 1. CI: true. Node: 22.20.0.

Read once with: gh run view 42570916118 --repo just-every/run-linen --job 129025246169 --log-failed. Exit: 0.

The 1440 native sandbox journey passed. The 390 journey reached employee scope refusals and received 500 from promotion where 403 was required. No assertion has been weakened.

    2026-11-09T07:03:30.1560826Z PASS sandbox native configuration at 1440: create, all included family edits and rehearsals, complete diff, separate current non-editor owner approval, promotion, reviewed rollback, keyboard and scope refusals, production readback
    2026-11-09T07:03:55.8110953Z AssertionError [ERR_ASSERTION]: An employee cannot create, edit or apply configuration through the public doors
    2026-11-09T07:03:55.8112149Z     403,
    2026-11-09T07:03:55.8112382Z     403,
    2026-11-09T07:03:55.8112576Z +   500
    2026-11-09T07:03:55.8113239Z     at sandboxJourney (file://[REDACTED]/tests/ui/sandbox-journey.mjs:236:9)
    2026-11-09T07:03:55.8113644Z     at async file://[REDACTED]/tests/ui/browser.mjs:559:49 {
    2026-11-09T07:03:55.8114346Z   actual: [ 403, 403, 500 ],
    2026-11-09T07:03:55.8114573Z   expected: [ 403, 403, 403 ],
    2026-11-09T07:03:55.9678730Z PASS sandbox native configuration at 1440: create, all included family edits and rehearsals, complete diff, separate current non-editor owner approval, promotion, reviewed rollback, keyboard and scope refusals, production readback
    2026-11-09T07:03:55.9680501Z AssertionError [ERR_ASSERTION]: An employee cannot create, edit or apply configuration through the public doors
    2026-11-09T07:03:55.9681353Z     403,
    2026-11-09T07:03:55.9681537Z     403,
    2026-11-09T07:03:55.9681697Z +   500
    2026-11-09T07:03:55.9682683Z   actual: [ 403, 403, 500 ],
    2026-11-09T07:03:55.9682902Z   expected: [ 403, 403, 403 ],
