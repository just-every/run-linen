import { editCatalogForm } from './catalog-items';
import { projectSnapshot } from './catalog-quotes';
import { editTaskPlan, completeTask, waiveObligation } from './catalog-tasks';
import { catalogItems } from './application-routes';
import { suggestWorkarounds } from './workaround-suggestions';
import { suggestArticles, confirmSuggestion } from './deflection';
import type { Hono } from "hono";
import type { AppEnv } from "../../platform/types";
import { jsonBody, requiredString } from "../../platform/http";
import {
  permit,
  getWork,
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
export function registerKnowledgeRoutes(app: Hono<AppEnv>) {
  app.get('/work/:id/workarounds', async c => c.json({ items: await suggestWorkarounds({env:c.env,principal:c.get('principal')},c.req.param('id')) }));
  app.get("/catalog", async (c) =>
    c.json({
      items: await catalogItems({env:c.env,principal:c.get('principal')}),
    }),
  );
  app.post('/catalog/:id/form',async c=>c.json(await editCatalogForm({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/catalog/:id/tasks',async c=>c.json(await editTaskPlan({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/work/:id/tasks/:obligationId/complete',async c=>c.json(await completeTask({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.param('obligationId'),await jsonBody(c))));
  app.post('/work/:id/obligations/:obligationId/waive',async c=>c.json(await waiveObligation({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.param('obligationId'),await jsonBody(c))));
  app.post("/catalog", async (c) =>
    c.json(
      await createCatalogItem(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.get('/work/:id/catalog-requests',async c=>{
    const ctx={env:c.env,principal:c.get('principal')};
    await getWork(ctx,c.req.param('id'));
    const rows=(await c.env.DB.prepare('SELECT id,catalog_snapshot_json FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_snapshot_json IS NOT NULL').bind(ctx.principal.workspaceId,c.req.param('id')).all<{id:string;catalog_snapshot_json:string}>()).results;
    return c.json({items:await Promise.all(rows.map(async r=>({id:r.id,catalogSnapshot:await projectSnapshot(ctx,JSON.parse(r.catalog_snapshot_json))})))});
  });
  app.post("/work/:id/fulfilment", async (c) =>
    c.json(
      await requestFulfilment(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.post("/calendars", async (c) =>
    c.json(
      await saveCalendar(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  app.post("/work/:id/commitment", async (c) =>
    c.json(
      await setCommitment(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        (await jsonBody(c)) as never,
      ),
    ),
  );
  app.get("/knowledge", async (c) =>
    c.json({
      items: await searchKnowledge(
        { env: c.env, principal: c.get("principal") },
        c.req.query("q") || "",
      ),
    }),
  );
  app.post("/knowledge", async (c) =>
    c.json(
      await saveArticle(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
  // KB-003: answer before filing; only the asker's confirmation counts as a deflection.
  app.post("/knowledge/suggestions", async (c) => {
    const b = await jsonBody(c);
    return c.json(await suggestArticles({ env: c.env, principal: c.get("principal") }, requiredString(b.question, "question", 50000)), 201);
  });
  app.post("/knowledge/suggestions/:id/confirm", async (c) => {
    const b = await jsonBody(c);
    return c.json(await confirmSuggestion({ env: c.env, principal: c.get("principal") }, c.req.param("id"), requiredString(b.articleId, "articleId")));
  });
  app.post("/knowledge/:id/escalate", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await escalateKnowledge(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        requiredString(b.question, "question"),
        requiredString(b.deduplicationKey, "deduplicationKey"),
      ),
      201,
    );
  });
  app.get("/reports/work", async (c) =>
    c.json(
      await workReport(
        { env: c.env, principal: c.get("principal") },
        c.req.query("from") || "",
        c.req.query("to") || "",
        c.req.query("timezone") || "UTC",
      ),
    ),
  );
}
