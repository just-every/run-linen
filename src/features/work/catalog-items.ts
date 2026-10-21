import { normalizeAudience, validateValues, restrictedAudience } from './catalog-audience';
import { resolveApplication } from './application-catalog';
import { currentWorkPrincipal } from './identity';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { normalizeCatalogForm, validateCatalogAnswers } from './catalog-form-schema';

export async function createCatalogItem(
  ctx: WorkContext,
  input: {
    name: string;
    kind: "access" | "software" | "device";
    target?: string;
    ownerId?: string;
    applicationId?: string;
    entitlementId?: string;
    requiresManager?: boolean;
    capacity?: number;
    form?: unknown;
    audience?: unknown;
  },
) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ["owner"]);
  const application = input.applicationId && input.entitlementId ? await resolveApplication(ctx,input.applicationId,input.entitlementId) : null;
  if(Boolean(input.applicationId)!==Boolean(input.entitlementId))throw new ApiError(422,'application_link','Application and entitlement must be selected together');
  if(application) {
    if(input.kind==='device' || (input.target && input.target!==application.target) || (input.ownerId && input.ownerId!==application.ownerId))
      throw new ApiError(422,'application_link','Linked catalog target and owner come from the application');
    input={...input,target:application.target,ownerId:application.ownerId};
  }
  if (
    !input.name ||
    !input.target ||
    !input.ownerId ||
    !["access", "software", "device"].includes(input.kind) ||
    (input.capacity !== undefined &&
      (!Number.isInteger(input.capacity) || input.capacity < 0))
  )
    throw new ApiError(
      422,
      "catalog_invalid",
      "Name, target, owner, kind and nonnegative capacity required",
    );
  const itemId = id(), form = normalizeCatalogForm(input.form), audience=normalizeAudience(input.audience), values=await validateValues(ctx,audience), guard=id();
  await ctx.env.DB.batch([
    ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${values.sql}
      AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner') THEN 1 ELSE 0 END)`)
      .bind(guard,...values.bindings,ctx.principal.workspaceId,ctx.principal.userId),
    ctx.env.DB.prepare("INSERT INTO work_catalog(id,workspace_id,name,kind,target,owner_id,requires_manager,capacity,revision,application_id,entitlement_id,form_json,audience_json) VALUES(?,?,?,?,?,?,?,?,1,?,?,?,?)")
    .bind(
      itemId,
      ctx.principal.workspaceId,
      input.name,
      input.kind,
      input.target,
      input.ownerId,
      Number(input.requiresManager || false),
      input.capacity ?? null,
      input.applicationId || null,
      input.entitlementId || null,
      JSON.stringify(form),
      JSON.stringify(audience),
    ),
    ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
      .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'catalog.created',itemId,JSON.stringify({revision:1}),now()),
    ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guard),
  ]);
  return { id: itemId };
}

/** Item bindings keep their existing action semantics; editing versioned form metadata grants no authority. */
export async function editCatalogForm(ctx: WorkContext, catalogId: string, input: Record<string, unknown>) {
  await currentWorkPrincipal(ctx); permit(ctx, ['owner']);
  if (!Number.isInteger(input.revision)) throw new ApiError(422,'catalog_revision','Current item revision required');
  const form = normalizeCatalogForm(input.form), name = requiredString(input.name,'name',200);
  const results = await ctx.env.DB.batch([ctx.env.DB.prepare(`UPDATE work_catalog SET name=?,form_json=?,revision=revision+1
    WHERE workspace_id=? AND id=? AND revision=?`).bind(name,JSON.stringify(form),ctx.principal.workspaceId,catalogId,input.revision),
    ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,'catalog.form_edited',?,?,? WHERE changes()=1")
      .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,catalogId,JSON.stringify({fromRevision:input.revision,toRevision:Number(input.revision)+1}),now()),
  ]);
  if (!results[0].meta.changes) throw new ApiError(409,'catalog_changed','Catalog item changed; refresh before editing');
  return {id:catalogId,revision:Number(input.revision)+1};
}
export async function catalogRequestSnapshot(ctx: WorkContext, workId: string, catalog: any,
  input: {catalogRevision?: number; answers?: unknown}) {
  const prior = await ctx.env.DB.prepare('SELECT catalog_snapshot_json FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?')
    .bind(ctx.principal.workspaceId,workId,catalog.id).first<{catalog_snapshot_json:string|null}>();
  if (prior?.catalog_snapshot_json) {
    const saved=JSON.parse(prior.catalog_snapshot_json);
    if(input.answers!==undefined && JSON.stringify(validateCatalogAnswers(saved.form,input.answers))!==JSON.stringify(saved.answers))
      throw new ApiError(409,'catalog_answers_changed','Existing request keeps its submitted answers; start a separate request for a different form');
    return saved;
  }
  const form=normalizeCatalogForm(JSON.parse(catalog.form_json));
  if ((restrictedAudience(catalog) || form.fields.length || form.costCents!==null || form.deliveryHours!==null || input.catalogRevision!==undefined) && input.catalogRevision!==catalog.revision)
    throw new ApiError(409,'catalog_changed','Review the current catalog form and price before requesting');
  return {catalogId:catalog.id,revision:catalog.revision,name:catalog.name,submittedBy:ctx.principal.userId,form,answers:validateCatalogAnswers(form,input.answers??{})};
}
