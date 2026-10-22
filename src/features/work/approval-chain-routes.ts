import {revokeDelegation} from './delegation';
import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody, requiredString } from '../../platform/http';
import { approvalChain, decideStage, editApprovals, listStageDecisions } from './approval-chain';
import { approvalMailConfig, configureApprovalMail } from './approval-mail-provider';
import { currentWorkPrincipal } from './identity';
import { permit } from './core';

/** CATALOG-002: the owner edits an item's approval stages; approvers decide in their own queue or by authenticated email reply. */
export function registerApprovalChainRoutes(app: Hono<AppEnv>) {
  const ctxOf = (c: { env: AppEnv['Bindings']; get(key: 'principal'): AppEnv['Variables']['principal'] }) => ({ env: c.env, principal: c.get('principal') });
  app.get('/approval-delegations',async c=>{const ctx=ctxOf(c);await currentWorkPrincipal(ctx);permit(ctx,['owner']);return c.json({items:(await c.env.DB.prepare('SELECT d.id,d.starts_at,d.expires_at,d.revoked_at,u.name holder_name,v.name delegate_name FROM work_delegations d LEFT JOIN users u ON u.id=d.manager_id LEFT JOIN users v ON v.id=d.delegate_id WHERE d.workspace_id=? ORDER BY d.starts_at DESC LIMIT 100').bind(ctx.principal.workspaceId).all()).results});});
  app.post('/people/delegations/:id/revoke',async c=>c.json(await revokeDelegation(ctxOf(c),c.req.param('id'))));
  app.get('/approval-calendars',async c=>{const ctx=ctxOf(c);await currentWorkPrincipal(ctx);permit(ctx,['owner']);return c.json({items:(await c.env.DB.prepare('SELECT id,name,timezone,revision FROM work_calendars WHERE workspace_id=? ORDER BY name,id').bind(ctx.principal.workspaceId).all()).results});});
  app.post('/catalog/:id/approvals', async c => c.json(await editApprovals(ctxOf(c), c.req.param('id'), await jsonBody(c))));
  app.get('/work/:id/approvals/:catalogId', async c => c.json(await approvalChain(ctxOf(c), c.req.param('id'), c.req.param('catalogId'))));
  app.get('/approval-stages', async c => c.json(await listStageDecisions(ctxOf(c))));
  app.post('/work/:id/approval-stage', async c => {
    const b = await jsonBody(c);
    if (![b.expectedWorkRevision, b.expectedFulfilmentRevision, b.expectedCatalogRevision].every(Number.isInteger)) throw new ApiError(422, 'approval_input', 'Exact current revisions required');
    return c.json(await decideStage(ctxOf(c), c.req.param('id'), { catalogId: requiredString(b.catalogId, 'catalogId'), stageKey: requiredString(b.stageKey, 'stageKey'), decision: requiredString(b.decision, 'decision'), comment: b.comment,
      expectedWorkRevision: b.expectedWorkRevision as number, expectedFulfilmentRevision: b.expectedFulfilmentRevision as number, expectedCatalogRevision: b.expectedCatalogRevision as number, idempotencyKey: requiredString(b.idempotencyKey, 'idempotencyKey') }));
  });
  app.get('/approval-mail/config', async c => { const ctx=ctxOf(c);await currentWorkPrincipal(ctx);permit(ctx,['owner']);const config=await approvalMailConfig(ctx);const subscription=config?await c.env.DB.prepare('SELECT confirmation_url FROM work_approval_mail_subscriptions WHERE workspace_id=? AND config_revision=? AND expires_at>?').bind(ctx.principal.workspaceId,config.revision,new Date().toISOString()).first<{confirmation_url:string}>():null;return c.json({...config??{revision:0,enabled:0},confirmationUrl:subscription?.confirmation_url??null}); });
  app.post('/approval-mail/config', async c => c.json(await configureApprovalMail(ctxOf(c),await jsonBody(c))));
}
