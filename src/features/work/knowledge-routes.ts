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
export function registerKnowledgeRoutes(app: Hono<AppEnv>) {
  app.get("/catalog", async (c) =>
    c.json({
      items: (
        await c.env.DB.prepare(
          "SELECT id,name,kind,target,owner_id,capacity,revision FROM work_catalog WHERE workspace_id=?",
        )
          .bind(c.get("principal").workspaceId)
          .all()
      ).results,
    }),
  );
  app.post("/catalog", async (c) =>
    c.json(
      await createCatalogItem(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
      201,
    ),
  );
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
