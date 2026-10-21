import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, jsonBody, now, requiredString } from '../../platform/http';
import { permit } from './core';
import { currentWorkPrincipal } from './identity';
import { dimensions, normalizeAudience, validateValues } from './catalog-audience';

export function registerCatalogAudienceRoutes(app:Hono<AppEnv>) {
  app.get('/catalog-values',async c=>{
    const ctx={env:c.env,principal:c.get('principal')};await currentWorkPrincipal(ctx);permit(ctx,['owner','hr']);
    return c.json({items:(await c.env.DB.prepare('SELECT * FROM work_catalog_values WHERE workspace_id=? ORDER BY dimension,label').bind(ctx.principal.workspaceId).all()).results});
  });
  app.post('/catalog-values',async c=>{
    const ctx={env:c.env,principal:c.get('principal')};await currentWorkPrincipal(ctx);permit(ctx,['owner']);
    const b=await jsonBody(c),label=requiredString(b.label,'label',120),dimension=requiredString(b.dimension,'dimension');
    if(!dimensions.includes(dimension as never))throw new ApiError(422,'catalog_value_invalid','Choose a known dimension');
    const valueId=id();
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO work_catalog_values(id,workspace_id,dimension,label) SELECT ?,?,?,? WHERE EXISTS(
        SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`)
        .bind(valueId,ctx.principal.workspaceId,dimension,label,ctx.principal.workspaceId,ctx.principal.userId),
      c.env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,'catalog.value_created',?,?,? WHERE changes()=1`)
        .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,valueId,JSON.stringify({dimension}),now()),
    ]);
    const row=await c.env.DB.prepare('SELECT * FROM work_catalog_values WHERE id=?').bind(valueId).first();
    if(!row)throw new ApiError(403,'owner_required','Current owner required');
    return c.json(row,201);
  });
  app.post('/catalog-values/:id',async c=>{
    const ctx={env:c.env,principal:c.get('principal')};await currentWorkPrincipal(ctx);permit(ctx,['owner']);
    const b=await jsonBody(c),label=requiredString(b.label,'label',120);
    if(!Number.isSafeInteger(b.revision)||typeof b.active!=='boolean')throw new ApiError(422,'catalog_value_invalid','Current revision and explicit active flag required');
    const result=await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE work_catalog_values SET label=?,active=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?
        AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`)
        .bind(label,Number(b.active),ctx.principal.workspaceId,c.req.param('id'),Number(b.revision),ctx.principal.workspaceId,ctx.principal.userId),
      c.env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,'catalog.value_edited',?,?,? WHERE changes()=1`)
        .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,c.req.param('id'),JSON.stringify({revision:Number(b.revision)+1,active:b.active}),now()),
    ]);
    if(!result[0].meta.changes)throw new ApiError(409,'revision_conflict','Value or owner authority changed');
    return c.json({id:c.req.param('id'),revision:Number(b.revision)+1});
  });
  app.post('/catalog/:id/audience',async c=>{
    const ctx={env:c.env,principal:c.get('principal')};await currentWorkPrincipal(ctx);permit(ctx,['owner']);
    const b=await jsonBody(c),audience=normalizeAudience(b.audience),guard=await validateValues(ctx,audience),guardId=id();
    if(!Number.isSafeInteger(b.revision))throw new ApiError(422,'catalog_revision','Current catalog revision required');
    try {
      const result=await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${guard.sql}
          AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') THEN 1 ELSE 0 END)`)
          .bind(guardId,...guard.bindings,ctx.principal.workspaceId,ctx.principal.userId),
        c.env.DB.prepare('UPDATE work_catalog SET audience_json=?,revision=revision+1 WHERE workspace_id=? AND id=? AND revision=?')
          .bind(JSON.stringify(audience),ctx.principal.workspaceId,c.req.param('id'),Number(b.revision)),
        c.env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,'catalog.audience_edited',?,?,? WHERE changes()=1`)
          .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,c.req.param('id'),JSON.stringify({revision:Number(b.revision)+1}),now()),
        c.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guardId),
      ]);
      if(!result[1].meta.changes)throw new ApiError(409,'catalog_changed','This item changed while you were filling it in. Review it and submit again.');
    } catch(error) {if(/CHECK constraint/.test(String(error)))throw new ApiError(409,'catalog_changed','Item, values or owner authority changed');throw error;}
    return c.json({id:c.req.param('id'),revision:Number(b.revision)+1,audience});
  });
}
