# Owned engineering companion

This owner-controlled source-authoring tool is separate from the installed
edition's public `rer` command surface. Run the maintainer command
`node engineering-agent/cli.mjs /absolute/private-config.json` only with an
active engineering grant. One claim per invocation; schedule with the owner's
process manager. Config contains `origin`, separate engineering `token`,
`grantId`, exact owner-issued `grantConfig`, `receiptDirectory`. Keep it private
(0600). Never supply service/model credentials to this process. The locally
pinned grant must exactly equal the authenticated server grant.

Owner grant config: absolute clean Git `repository`, full `baseCommit`, `allowedPaths` (exact files or directory prefixes ending `/`), protected `independentPaths`, local `releaseRef` under refs/heads, and exact argv arrays in `commands.reproducer/test/check/canary/release/adoption`. Commands come from the engineering owner, never model text. macOS sandbox-exec or Linux bubblewrap is mandatory; commands have no network and writes are restricted to disposable checkouts/scratch. Reproducer must fail before patch; tests and separately configured independent check must pass. Grant should protect tests and checker assets outside all editable paths. Additional OS identity/container isolation is recommended for hostile native code; this is an owned source lane, not a remote arbitrary-code service.

The companion clones the exact pin, verifies SHA256 edit preimages and denies symlinks/traversal, applies real edits, captures diff and command outputs, checks in a separate clone, runs granted canary/release commands, and adopts the exact tested commit to the granted local ref with compare-and-swap. The owner's current branch/worktree is preserved. `adoption` runs on the validated checkout and the adopted ref is independently read back. This proves local source adoption, not hosted rollout or business-service recovery. External release connectors belong to execution, and need separate active task scope.

Every stage rechecks the bearer claim. Expired claims become unknown, not requeued. Local receipts survive connection loss and are submitted before new work. Interrupted running receipts become unknown and require repository reconciliation; the companion never repeats uncertain edits automatically. Server result admission accepts only the engineering bearer and claim token, not cookie/service/model output.

Root mounts `registerEngineeringAgentRoutes` on the API router BEFORE authenticated cookie middleware (paths `/engineering-agent/*`). No cookie authorization bypass is added to any other endpoint.
