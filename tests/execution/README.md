# Execution verification

Run from the Linen repository:

- `node tests/execution/runtime.mjs`
- `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --types @cloudflare/workers-types src/features/execution/index.ts`

Executed successfully locally. The runtime suite bundles the real modules into workerd and uses real D1 migrations. Provider responses are intercepted only by the test worker. Native redirect validation additionally uses actual workerd fetch against a temporary localhost HTTP server and checks that a 302 is not followed. Miniflare, the server, and temporary files are closed in `finally`.

Checks cover immutable authority, self-approval refusal, plan deduplication/conflicts, stale revision and wrong actor/workspace, competing conditional claims, receipt loss and read-before-repeat, revocation during write-token acquisition, independent stale/wrong-target/wrong-cohort/negative/replay evidence rejection, missing configuration, restoration hold, queued cancellation, applied-effect compensation, durable expiry removal under separate authority, independently verified denial, preexisting identity ownership refusal, lost create response, encrypted generated credentials, separate identity disable and session revocation, noninteractive automation setup, ordinary employee fulfilment under standing authority, distinct local/provider identities, mapping drift and wrong-tenant mapping refusal, reconnect invalidation, signed mail delivery versus acceptance, no resend of unknown mail, held native restoration, inactive imported grants and nested erased-identity replay refusal.

The SQLite test additionally simulates a retained database which applied the earlier 0201 without the later no-delete triggers. 0205/0206 repair it without resetting rows; old grants keep their original bytes and revision 0 deliberately requires current connection reissue.

These are local fixture/runtime checks, not owner-tenant/provider/hosted acceptance. No real identity or entitlement writes, outbound messages, deployment or source publication were performed. A configured approved probe must independently exercise the real usable/denied workflow and negative control. Physical fulfilment remains separate. Whole-repository typecheck was also attempted; its latest failure was outside this module in intelligence/scheduler.ts line 13 (SQL string interpolation quoting).
