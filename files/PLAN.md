# Plan for sx-linen-f19fix1-push-1

1. Set fleet identity, refresh the approved launcher and install the decrypted-bundle Git helper and push guard.
2. Shallow filtered clone only just-every/run-linen; set repository identity, preserve repository hooks, and read repository instructions.
3. Fetch cloud/sx-linen-f19fix1 with sufficient history and require its head to equal fc7a01bf5e248f098736700955713f752a93a7b3.
4. Inspect existing Verify run 42542451567 without rerunning it; require completed/success on the exact source SHA.
5. Inspect every candidate commit including side parents for fleet author/committer identity and permitted trailers. Require a clean checkout.
6. Publish the identical commit, without a new product commit, merge, rebase, force push, CONTRACT edit, generated-view edit or clause promotion, to cloud/sx-linen-f19fix1-push-1 with the fleet push guard.
7. Verify the advertised remote head, save actual non-secret reports and receipts outside the product checkout, and publish only explicitly selected packet files to evidence/sx-linen-f19fix1-push-1.
8. Delete the successful product clone only after product and evidence publication have been verified; report exact product/evidence custody and a lane POST entry. Retain recovery data instead if publication fails.
