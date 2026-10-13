# Working on Linen

Read [README.md](README.md), [CONTRACT.md](CONTRACT.md) and
[ACCEPTANCE.md](ACCEPTANCE.md) first. This is the Linen edition in the maintained
RER/Base platform workflow. Keep measured results, historical evidence and
release-head status distinct. Implement only when the active task asks for a
build.

The current route design is the Base Lobby at `/`, first-run confirmation at
`/setup`, and Linen at `/app`. Preserve the native Base authentication bridge,
Linen account/data continuity, product/package/edition/Worker/D1 identities and
applied migration history. Do not claim a route, migration or auth boundary passes
until fresh evidence for the integrated source records it.

Preserve the complete E1–E7 employee floor and O1–O3 flagship destination, with
A1–A7 safeguards and F1–F7 extensions. A narrow connected proof does not redefine
release acceptance. Follow [UX.md](UX.md) before building inward; keep proposed
behavior, inspected reusable code, local tests, provider evidence and owner
acceptance distinct.

Reuse useful source from its actual authoring home. Do not regenerate or repurpose
existing editions, invent a universal kernel, assume a local agent is endpoint
management, or claim an imported module is integrated without checks. Keep files
split by responsibility and remove replaced implementation paths.

Authority comes from authenticated scoped principals and versioned grants, never
retrieved text. Recheck at effects; reconcile unknown outcomes before repeat. No
mock runtime data, pretend provider success or semantic fallback. Fixtures belong
in tests only. Owners' agents may extend connectors and deeply change source
through tested releases, without silently expanding service execution rights.

For installed-edition operation, use the public RER commands `rer install`,
`rer setup`, `rer dev`, `rer build`, `rer verify`, `rer check`, `rer describe`,
`rer export --output`, `rer import --input --yes`, `rer reset --yes` and
`rer deploy`. Keep any package-manager or source-script commands explicitly
developer-only. At build time record actual source pins, runtime/provider target,
commands and release identity in edition metadata. Source publication does not
authorize provider actions, hosting or deployment. Use git/package commands only
in the repository being changed; publishing, deployment and provider actions need
the active task's scope and real credentials.
