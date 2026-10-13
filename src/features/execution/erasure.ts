import { hashToken } from "../../platform/crypto";
import { now } from "../../platform/http";
import { assert, membership } from "./authority";
import type { CoreContext } from "./types";
export async function eraseExecutionPerson(ctx: CoreContext, identity: string) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  const db = ctx.env.DB,
    w = ctx.principal.workspaceId;
  assert(
    await db
      .prepare(
        "SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?",
      )
      .bind(w, await hashToken(identity))
      .first(),
    "erasure_tombstone_required",
  );
  const grants = await db
    .prepare(
      "SELECT id,version FROM execution_grants WHERE workspace_id=? AND (principal_id=? OR issuer_id=? OR beneficiary_id=? OR target=?)",
    )
    .bind(w, identity, identity, identity, identity)
    .all<{
      id: string;
      version: number;
    }>();
  for (const g of grants.results)
    await db
      .prepare(
        "INSERT OR IGNORE INTO execution_grant_revocations VALUES(?,?,?,?,?)",
      )
      .bind(w, g.id, g.version, ctx.principal.userId, now())
      .run();
  const operations = await db
    .prepare(
      "SELECT * FROM execution_operations WHERE workspace_id=? AND (actor_id=? OR json_extract(step_json,'$.beneficiaryId')=? OR json_extract(step_json,'$.target')=?)",
    )
    .bind(w, identity, identity, identity)
    .all<any>();
  for (const op of operations.results)
    if (["queued", "blocked", "needs_configuration"].includes(op.state))
      await db
        .prepare(
          "UPDATE execution_operations SET state='cancelled',cancel_requested=1 WHERE workspace_id=? AND id=?",
        )
        .bind(w, op.id)
        .run();
  assert(
    !operations.results.some((op) =>
      [
        "running",
        "unknown",
        "submitted",
        "cancel_requested",
        "effect_verified",
      ].includes(op.state),
    ),
    "erasure_pending_remote_reconciliation",
  );
  for (const op of operations.results) {
    await db.batch([
      db
        .prepare(
          "DELETE FROM execution_secrets WHERE workspace_id=? AND operation_id=?",
        )
        .bind(w, op.id),
      db
        .prepare(
          "UPDATE execution_operations SET step_json='{}',actor_id='[erased]',cancel_requested=1 WHERE workspace_id=? AND id=?",
        )
        .bind(w, op.id),
      db
        .prepare(
          "UPDATE execution_verifications SET target='[erased]',beneficiary_id='[erased]',evidence_json='{}' WHERE workspace_id=? AND operation_id=?",
        )
        .bind(w, op.id),
      db
        .prepare(
          "UPDATE execution_plans SET actor_id='[erased]',steps_json='[]',context_snapshot_json='{}',state='erased' WHERE workspace_id=? AND id=?",
        )
        .bind(w, op.plan_id),
    ]);
  }
  const decisions = await db
    .prepare(
      "SELECT id FROM execution_decisions WHERE workspace_id=? AND actor_id=?",
    )
    .bind(w, identity)
    .all<{
      id: string;
    }>();
  for (const g of grants.results) {
    await db
      .prepare("INSERT OR IGNORE INTO execution_erasure_permits VALUES(?,?,?)")
      .bind(w, g.id, now())
      .run();
    await db
      .prepare("DELETE FROM execution_grants WHERE workspace_id=? AND id=?")
      .bind(w, g.id)
      .run();
  }
  for (const d of decisions.results) {
    await db
      .prepare("INSERT OR IGNORE INTO execution_erasure_permits VALUES(?,?,?)")
      .bind(w, d.id, now())
      .run();
    await db
      .prepare("DELETE FROM execution_decisions WHERE workspace_id=? AND id=?")
      .bind(w, d.id)
      .run();
  }
  await db
    .prepare(
      "DELETE FROM execution_outbox WHERE workspace_id=? AND (recipient_id=? OR actor_id=?)",
    )
    .bind(w, identity, identity)
    .run();
}
