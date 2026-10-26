/** Only contiguous sandbox promotions preserve a recorded decision across catalog revisions. */
export function approvalCatalogSql(alias:string) {
 return `(${alias}.catalog_revision=? OR (${alias}.catalog_revision<? AND
  (SELECT COUNT(*) FROM configuration_catalog_versions v WHERE v.workspace_id=${alias}.workspace_id
   AND v.catalog_id=(SELECT f.catalog_id FROM work_fulfilments f WHERE f.workspace_id=${alias}.workspace_id AND f.id=${alias}.fulfilment_id)
   AND v.revision>=${alias}.catalog_revision AND v.revision<?)=?-${alias}.catalog_revision))`;
}
export const approvalCatalogBindings=(revision:number)=>[revision,revision,revision,revision];
