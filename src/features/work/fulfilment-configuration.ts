type ConfigurationContext={env:{DB:D1Database};principal:{workspaceId:string}};
/** Current people and grants remain authoritative; the submitted workflow keeps its manager gate. */
export async function fulfilmentRequiresManager(ctx:ConfigurationContext,catalog:{id?:string;requires_manager?:number},fulfilment:{id?:string;catalog_snapshot_json?:string|null}) {
 const saved=fulfilment.catalog_snapshot_json===undefined&&fulfilment.id
  ?await ctx.env.DB.prepare('SELECT catalog_snapshot_json FROM work_fulfilments WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,fulfilment.id).first<{catalog_snapshot_json:string|null}>():fulfilment;
 const snapshot=saved?.catalog_snapshot_json?JSON.parse(saved.catalog_snapshot_json):null;
 if(typeof snapshot?.requiresManager==='boolean')return snapshot.requiresManager;
 if(snapshot?.catalogId&&Number.isInteger(snapshot.revision)) {
  const retained=await ctx.env.DB.prepare('SELECT requires_manager FROM configuration_catalog_versions WHERE workspace_id=? AND catalog_id=? AND revision=?').bind(ctx.principal.workspaceId,snapshot.catalogId,snapshot.revision).first<{requires_manager:number}>();
  if(retained)return Boolean(retained.requires_manager);
 }
 return Boolean(catalog.requires_manager);
}
/** SQL queues select the same saved gate, including catalog snapshots admitted before this field existed. */
export const fulfilmentManagerSql="COALESCE(json_extract(f.catalog_snapshot_json,'$.requiresManager'),(SELECT v.requires_manager FROM configuration_catalog_versions v WHERE v.workspace_id=f.workspace_id AND v.catalog_id=f.catalog_id AND v.revision=json_extract(f.catalog_snapshot_json,'$.revision')),c.requires_manager)";
