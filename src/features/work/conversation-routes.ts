import { ticketActivity } from './activity';
import { fileAfterSuggestion } from "./deflection";
import { listPendingPeople, savePendingPerson, withdrawPendingPerson } from './pending-people';
import { listFulfilmentDecisions } from "./fulfilment-decisions";
import { approveFulfilment } from "./fulfilment-authority";
import { getFulfilment, amendFulfilment } from "./fulfilment-amend";
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
import { storeCatalogQuote, readCatalogQuote } from "./catalog-quotes";
import { erasePerson } from "./privacy";
import { mapMailSender, receiveMail } from "./intake";
import { deliverMailReply } from "./mail-send";
import {
  requestFulfilment,
  createCatalogItem,
  listObligations,
  recordPhysicalHandoff,
} from "./requests";
import { saveCalendar, setCommitment } from "./calendar";
import { executionPort, bindObligationExecution } from "./execution";
export function registerConversationRoutes(app: Hono<AppEnv>) {
  app.get('/work/:id/activity', async c => c.json(await ticketActivity({ env: c.env, principal: c.get('principal') }, c.req.param('id'))));
  app.get('/pending-people',async c=>c.json({items:await listPendingPeople({env:c.env,principal:c.get('principal')})}));
  app.post('/pending-people',async c=>c.json(await savePendingPerson({env:c.env,principal:c.get('principal')},await jsonBody(c) as never),201));
  app.post('/pending-people/:id/edit',async c=>c.json(await savePendingPerson({env:c.env,principal:c.get('principal')},await jsonBody(c) as never,c.req.param('id'))));
  app.post('/pending-people/:id/withdraw',async c=>c.json(await withdrawPendingPerson({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c) as never)));
  app.get('/work/:id/conversation',async c=>c.json(await conversation({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.get("/fulfilment-decisions",async c=>c.json(await listFulfilmentDecisions({env:c.env,principal:c.get("principal")})));
  app.get("/work/:id/fulfilments/:catalogId", async c => c.json(await getFulfilment(
    {env:c.env,principal:c.get("principal")},c.req.param("id"),c.req.param("catalogId"))));
  app.post("/work/:id/fulfilment/approve", async c => c.json(await approveFulfilment(
    {env:c.env,principal:c.get("principal")},c.req.param("id"),(await jsonBody(c)) as never)));
  app.post("/work/:id/fulfilment/amend", async c => c.json(await amendFulfilment(
    {env:c.env,principal:c.get("principal")},c.req.param("id"),(await jsonBody(c)) as never)));
  app.post("/mail/senders", async (c) =>
    c.json(
      await mapMailSender(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
    ),
  );
  app.post("/mail/intake", async (c) =>
    c.json(
      await receiveMail(
        { env: c.env, principal: c.get("principal") },
        (await jsonBody(c)) as never,
      ),
    ),
  );
  app.get("/work/:id/obligations", async (c) =>
    c.json({
      items: await listObligations(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
      ),
    }),
  );
  app.post("/work/process-due", async (c) =>
    c.json({
      items: await processDueWork(
        { env: c.env, principal: c.get("principal") },
        executionPort,
      ),
    }),
  );
  app.get("/work", async (c) =>
    c.json({
      items: await listWork({ env: c.env, principal: c.get("principal") }, {departmentId:c.req.query("departmentId")===undefined?undefined:["","legacy"].includes(c.req.query("departmentId")!)?null:c.req.query("departmentId")}),
    }),
  );
  app.get("/work/:id", async (c) =>
    c.json(
      await conversation(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
      ),
    ),
  );
  for (const path of ["/work", "/requests"])
    app.post(path, async (c) => {
      const b = await jsonBody(c);
      const ctx = { env: c.env, principal: c.get("principal") };
      const input = {
        title: requiredString(b.title, "title"),
        body: requiredString(b.body, "body", 50000),
        deduplicationKey: requiredString(b.deduplicationKey, "deduplicationKey"),
        kind: typeof b.kind === "string" ? b.kind : undefined,
        beneficiaryId: typeof b.beneficiaryId === "string" ? b.beneficiaryId : undefined,
        sensitivity: typeof b.sensitivity === "string" ? b.sensitivity : undefined,
        context: b.context,
        departmentId: b.departmentId as string | null | undefined,
        pendingPersonId: typeof b.pendingPersonId === 'string' ? b.pendingPersonId : undefined,
        catalogIds: b.catalogIds as string[] | undefined,
      };
      // KB-003: filing after reviewed articles were offered records the request on that suggestion.
      return c.json(
        await (typeof b.suggestionId === "string" ? fileAfterSuggestion(ctx, b.suggestionId, input) : createWork(ctx, input)),
        201,
      );
    });
  app.post("/work/:id/messages", async (c) => {
    const b = await jsonBody(c), ctx = { env: c.env, principal: c.get("principal") };
    const message = await appendMessage(ctx, {
      workId: c.req.param("id"),
      body: requiredString(b.body, "body", 50000),
      visibility: b.visibility === "private" ? "private" : "public",
      sourceMessageId: requiredString(b.sourceMessageId, "sourceMessageId"),
    });
    // CHANNEL-003: a public staff reply on a mailbox ticket also goes back by mail; its outcome never fails the reply.
    if (message && (message as { visibility: string }).visibility === "public" && !String((message as { source_key: string }).source_key).startsWith("mail:"))
      await deliverMailReply(ctx, c.req.param("id"), (message as { id: string }).id).catch(() => null);
    return c.json(message, 201);
  });
  app.post("/work/:id/commands", async (c) => {
    const b = await jsonBody(c);
    return c.json(
      await transitionWork(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        Number(b.revision),
        requiredString(b.command, "command"),
        requiredString(b.reason, "reason"),
        typeof b.assigneeId === "string" ? b.assigneeId : undefined,
        b.waitingOn,
        { resolutionCode: b.resolutionCode, statusId: b.statusId },
      ),
    );
  });
  app.post("/work/:id/attachments", async (c) =>
    c.json(
      await storeAttachment(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        {
          name: requiredString(c.req.header("X-Filename"), "X-Filename"),
          contentType:
            c.req.header("Content-Type") || "application/octet-stream",
          visibility:
            c.req.header("X-Visibility") === "private" ? "private" : "public",
          bytes: await c.req.arrayBuffer(),
        },
      ),
      201,
    ),
  );
  // CATALOG-008: a vendor quote PDF for a catalog item, attached before the item is submitted.
  app.post("/work/:id/catalog-quote", async (c) =>
    c.json(
      await storeCatalogQuote(
        { env: c.env, principal: c.get("principal") },
        c.req.param("id"),
        {
          catalogId: requiredString(c.req.header("X-Catalog-Id"), "X-Catalog-Id"),
          name: requiredString(c.req.header("X-Filename"), "X-Filename"),
          contentType: c.req.header("Content-Type") || "application/octet-stream",
          bytes: await c.req.arrayBuffer(),
        },
      ),
      201,
    ),
  );
  app.get("/catalog-quotes/:id", async (c) => {
    const result = await readCatalogQuote({ env: c.env, principal: c.get("principal") }, c.req.param("id"));
    return new Response(result.blob.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
  app.get("/attachments/:id", async (c) => {
    const result = await readAttachment(
      { env: c.env, principal: c.get("principal") },
      c.req.param("id"),
    );
    return new Response(result.blob.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
