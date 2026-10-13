import type { Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { id, jsonBody, now } from "../../platform/http";
import { mapProviderSubject, listSubjectMappings } from "./mappings";
import {
  listAutomationPrincipals,
  dispatchGrantedPlan,
  createAutomationPrincipal,
  revokeAutomationPrincipal,
} from "./automation";
import { discoverMicrosoft } from "./connectors";
import { enqueueNotification, processNotifications } from "./notifications";
import { accessiblePlan } from "./access";
import { privileged, membership, assert } from "./authority";
import { createGrant } from "./grants";
import { proposePlan, dispatchPlan } from "./plans";
import {
  cancelOrTakeover,
  reconcileOperation,
  verifyOutcome,
  processDueExecution,
} from "./engine";
export {
  proposePlan,
  dispatchPlan,
  cancelOrTakeover,
  reconcileOperation,
  verifyOutcome,
  processDueExecution,
};
export type { CoreContext, PlanInput, Step } from "./types";
export function registerExecutionRoutes(app: Hono<AppEnv>) {
  app.get("/subject-mappings", async c => c.json(await listSubjectMappings({ env: c.env, principal: c.get("principal") })));
  app.get("/automation-principals", async c => c.json(await listAutomationPrincipals({ env: c.env, principal: c.get("principal") })));
  app.post("/subject-mappings", async (c) =>
    c.json(
      await mapProviderSubject(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as any,
      ),
      201,
    ),
  );

  app.post("/automation-principals", async (c) =>
    c.json(
      await createAutomationPrincipal(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as any,
      ),
      201,
    ),
  );
  app.post("/automation-principals/:id/revoke", async (c) =>
    c.json(
      await revokeAutomationPrincipal(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
      ),
    ),
  );

  app.post("/plans/granted", async (c) =>
    c.json(
      await dispatchGrantedPlan(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as any,
      ),
      201,
    ),
  );
  app.post("/execution/discover/:id", async (c) => {
    const ctx = { env: c.env, principal: c.get("principal") };
    await privileged(ctx);
    return c.json(await discoverMicrosoft(ctx, c.req.param("id")));
  });
  app.post("/notifications", async (c) =>
    c.json(
      await enqueueNotification(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as any,
      ),
      201,
    ),
  );
  app.post("/notifications/process", async (c) =>
    c.json(
      await processNotifications({ env: c.env, principal: c.get("principal") }),
    ),
  );
  for (const [path, table] of [
    ["plans", "execution_plans"],
    ["operations", "execution_operations"],
    ["authority-decisions", "execution_decisions"],
    ["grants", "execution_grants"],
  ] as const)
    app.get("/" + path, async (c) => {
      const ctx = { env: c.env, principal: c.get("principal") };
      const roles = await membership(ctx);
      assert(
        roles.some((r) =>
          ["owner", "operator", "approver", "auditor", "integration"].includes(
            r,
          ),
        ),
        "execution_read_denied",
        403,
      );
      const rows = await c.env.DB.prepare(
        `SELECT * FROM ${table} WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200`,
      )
        .bind(ctx.principal.workspaceId)
        .all();
      await c.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
        .bind(
          id(),
          ctx.principal.workspaceId,
          ctx.principal.userId,
          "execution.read",
          path,
          "{}",
          now(),
        )
        .run();
      const visible = [];
      for (const raw of rows.results) {
        const r: any = raw;
        if (table === "execution_grants") {
          if (
            roles.includes("owner") ||
            r.issuer_id === ctx.principal.userId ||
            r.principal_id === ctx.principal.userId
          )
            visible.push(r);
        } else {
          try {
            await accessiblePlan(
              ctx,
              table === "execution_plans" ? r.id : r.plan_id,
            );
            visible.push(r);
          } catch {}
        }
      }
      return c.json(visible);
    });
  app.post("/plans", async (c) =>
    c.json(
      await proposePlan(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as any,
      ),
      201,
    ),
  );
  app.post("/plans/:id/dispatch", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await dispatchPlan(
        { env: c.env, principal: c.get("principal") },
        {
          planId: c.req.param("id"),
          expectedRevision: Number(b.expectedRevision),
        },
      ),
    );
  });
  for (const command of ["cancel", "takeover"])
    app.post("/operations/:id/" + command, async (c) => {
      const b = await jsonBody(c);
      return c.json(
        await cancelOrTakeover(
          { env: c.env, principal: c.get("principal") },
          {
            operationId: c.req.param("id")!,
            expectedRevision: Number(b.expectedRevision),
            reason: String(b.reason || ""),
          },
        ),
      );
    });
  app.post("/operations/:id/reconcile", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await reconcileOperation(
        { env: c.env, principal: c.get("principal") },
        {
          operationId: c.req.param("id"),
          grantId: typeof b.grantId === "string" ? b.grantId : undefined,
          grantVersion: Number(b.grantVersion),
        },
      ),
    );
  });
  app.post("/operations/:id/verify", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await verifyOutcome(
        { env: c.env, principal: c.get("principal") },
        {
          operationId: c.req.param("id"),
          verifierVersion: Number(b.verifierVersion),
        },
      ),
    );
  });
  app.post("/execution/process", async (c) =>
    c.json(
      await processDueExecution({ env: c.env, principal: c.get("principal") }),
    ),
  );
  app.post("/grants", async (c) =>
    c.json(
      await createGrant(
        { env: c.env, principal: c.get("principal") },
        await jsonBody(c),
      ),
      201,
    ),
  );
  app.post("/grants/:id/revoke", async (c) => {
    const ctx = { env: c.env, principal: c.get("principal") };
    assert((await membership(ctx)).includes("owner"), "owner_required", 403);
    const b = await jsonBody(c);
    const g = await c.env.DB.prepare(
      "SELECT 1 FROM execution_grants WHERE workspace_id=? AND id=? AND version=?",
    )
      .bind(ctx.principal.workspaceId, c.req.param("id"), b.version)
      .first();
    assert(g, "grant_missing", 404);
    await c.env.DB.prepare(
      "INSERT OR IGNORE INTO execution_grant_revocations VALUES(?,?,?,?,?)",
    )
      .bind(
        ctx.principal.workspaceId,
        c.req.param("id"),
        b.version,
        ctx.principal.userId,
        now(),
      )
      .run();
    return c.json({ revoked: true, remoteStopped: false });
  });
}
export { changeExecutionPort } from "./change-port";
export { restoreExecutionRecord } from "./restore";
export {
  enqueueNotification,
  processNotifications,
  handleNotificationWebhook,
} from "./notifications";
export { eraseExecutionPerson } from "./erasure";

export { dispatchGrantedPlan } from "./automation";

export { standingIntakeExecution } from "./intake";
