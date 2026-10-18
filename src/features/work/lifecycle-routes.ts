import { assetHistory } from "./assets";
import { lifecycleEvidencePack } from "./lifecycle-evidence";
import { reviewPersonBinding } from './person-binding';
import { delegateManager } from "./delegation";
import type { Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { jsonBody, requiredString } from "../../platform/http";
import {
  permit,
  listWork,
  createWork,
  conversation,
  appendMessage,
  transitionWork,
} from "./core";
import { createLifecycle, amendLifecycle, processDueWork } from "./lifecycle";
import {
  upsertPerson,
  changePerson,
  acquireAsset,
  moveAsset,
} from "./resources";
import {
  searchKnowledge,
  saveArticle,
  escalateKnowledge,
  workReport,
} from "./knowledge";
import { storeAttachment, readAttachment } from "./attachments";
import { erasePerson } from "./privacy";
import { mapMailSender, receiveMail } from "./intake";
import {
  requestFulfilment,
  createCatalogItem,
  listObligations,
  recordPhysicalHandoff,
} from "./requests";
import { saveCalendar, setCommitment } from "./calendar";
import { executionPort, bindObligationExecution } from "./execution";
export function registerLifecycleRoutes(app: Hono<AppEnv>) {
  app.post('/people/:id/binding', async c => c.json(await reviewPersonBinding(
    {env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c) as never)));

  app.post("/people/delegations", async (c) =>
    c.json(
      await delegateManager(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.get("/assets", async (c) => {
    const ctx = { env: c.env, principal: c.get("principal") };
    permit(ctx, ["owner", "operator"]);
    return c.json({
      items: (
        await c.env.DB.prepare(
          "SELECT * FROM work_assets WHERE workspace_id=? ORDER BY serial",
        )
          .bind(ctx.principal.workspaceId)
          .all()
      ).results,
    });
  });
  app.get("/assets/:id/history", async (c) => c.json(await assetHistory(
    { env:c.env, principal:c.get("principal") }, c.req.param("id"),
  )));
  app.get("/people", async (c) => {
    const ctx = { env: c.env, principal: c.get("principal") };
    permit(ctx, ["owner", "hr", "operator"]);
    const columns = ctx.principal.roles.some((r) => ["owner", "hr"].includes(r))
      ? "*"
      : "id,name,active,merged_into,revision";
    return c.json({
      items: (
        await c.env.DB.prepare(
          `SELECT ${columns} FROM work_people WHERE workspace_id=? ORDER BY name`,
        )
          .bind(ctx.principal.workspaceId)
          .all()
      ).results,
    });
  });
  app.get("/lifecycle", async (c) => {
    const ctx = { env: c.env, principal: c.get("principal") };
    permit(ctx, ["owner", "hr"]);
    return c.json({
      items: (
        await c.env.DB.prepare(
          "SELECT * FROM work_lifecycle WHERE workspace_id=? ORDER BY effective_at",
        )
          .bind(ctx.principal.workspaceId)
          .all()
      ).results,
    });
  });
  app.get("/lifecycle/:id/evidence", async (c) => {
    const pack = await lifecycleEvidencePack(
      { env: c.env, principal: c.get("principal") }, c.req.param("id"),
    );
    c.header("Content-Disposition", `attachment; filename="lifecycle-${c.req.param("id").replace(/[^a-zA-Z0-9-]/g, "_")}.json"`);
    c.header("Cache-Control", "private, no-store");
    return c.json(pack);
  });
  app.get("/lifecycle/:id", async (c) => {
    const ctx = { env: c.env, principal: c.get("principal") };
    permit(ctx, ["owner", "hr"]);
    const item = await c.env.DB.prepare(
      "SELECT * FROM work_lifecycle WHERE workspace_id=? AND id=?",
    )
      .bind(ctx.principal.workspaceId, c.req.param("id"))
      .first<{ work_id: string }>();
    return c.json({
      lifecycle: item,
      obligations: item ? await listObligations(ctx, item.work_id) : [],
    });
  });
  app.post("/obligations/:id/physical", async (c) =>
    c.json(
      await recordPhysicalHandoff(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        (await jsonBody(c)) as never,
      ),
    ),
  );
  app.post("/obligations/:id/execution", async (c) =>
    c.json(
      await bindObligationExecution(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        (await jsonBody(c)) as never,
      ),
    ),
  );
  app.post("/lifecycle", async (c) =>
    c.json(
      await createLifecycle(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.post("/lifecycle/:id/amend", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await amendLifecycle(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        Number(b.revision),
        typeof b.effectiveAt === "string" ? b.effectiveAt : undefined,
        b.cancel === true,
      ),
    );
  });
  app.post("/people", async (c) =>
    c.json(
      await upsertPerson(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.post("/people/:id/erase", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await erasePerson(
        { env: c.env, principal: c.get("principal") },
        {
          personId: c.req.param("id"),
          revision: Number(b.revision),
          reason: requiredString(b.reason, "reason"),
        },
      ),
    );
  });
  app.post("/people/:id/commands", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await changePerson(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        Number(b.revision),
        b.command as never,
        b.target as string | undefined,
      ),
    );
  });
  app.post("/assets", async (c) =>
    c.json(
      await acquireAsset(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.post("/assets/:id/commands", async (c) =>
    c.json(
      await moveAsset(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        (await jsonBody(c)) as never,
      ),
    ),
  );
}
