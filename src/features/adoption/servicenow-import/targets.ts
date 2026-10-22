import type { D1TargetAdapter, D1Sql, D1Database, TargetRow } from '../../../modules/import-kit/src/d1/index';
import { canonicalJson } from '../../../modules/import-kit/src/d1/index';

export const workColumns = ['id','workspace_id','requester_id','beneficiary_id','kind','title','state','sensitivity','assignee_id','impact','revision','created_at','updated_at','closed_at','paused_at','paused_ms','response_at','resolution_at','context_json','dedup_key','request_hash','pending_person_id','merged_into','split_from','parent_id','department_id','protected_departments_json'];
const auditColumns=['id','workspace_id','actor_id','action','target','detail_json','created_at'];
const messageColumns = ['id','workspace_id','work_id','author_id','visibility','body','source_key','created_at'];
// A later native attachment, fulfilment, execution or intake prevents deletion.
const dependents = ['work_attachments','work_lifecycle','work_obligations','work_fulfilments','work_commitments','work_catalog_reservations','execution_plans','execution_outbox','work_fulfilment_execution','work_fulfilment_amendments','work_fulfilment_approvals','intelligence_investigations','intelligence_pending_fulfilments','intelligence_fulfilment_runs','work_intake_events','work_pending_services'];
const sql = (sql: string, ...params: any[]): D1Sql => ({ sql, params });
function predicates(table: string, columns: string[], rows: any[], where: string, params: any[]): D1Sql {
  const parts = [`(SELECT COUNT(*) FROM ${table} WHERE ${where})=?`], bindings = [...params, rows.length];
  for (const row of rows) { parts.push(`EXISTS(SELECT 1 FROM ${table} WHERE ${where} AND ${columns.map(c => table==='audit_events'&&c==='detail_json'?"json_remove(detail_json,'$.pendingErasure') IS json_remove(?,'$.pendingErasure')":`${c} IS ?`).join(' AND ')})`); bindings.push(...params, ...columns.map(c => row[c])); }
  return sql(parts.join(' AND '), ...bindings);
}
const insert = (table: string, columns: string[], row: any) => sql(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`, ...columns.map(c => row[c]));
export const servicenowTargets: D1TargetAdapter = {
  async read(db, destination, kind, id) {
    if (kind !== 'work') throw new Error('UNSUPPORTED_SERVICENOW_TARGET');
    // Only the columns an import writes: native columns added later (DESK-001's group) are not import state.
    const work = await db.prepare(`SELECT ${workColumns.join(',')} FROM work_records WHERE workspace_id=? AND id=?`).bind(destination,id).first();
    const marker = await db.prepare('SELECT * FROM servicenow_import_items WHERE workspace_id=? AND work_id=?').bind(destination,id).first();
    if (!work && !marker) return undefined;
    if (!work || !marker) throw new Error('SERVICENOW_NATIVE_INTEGRITY');
    const messages = (await db.prepare('SELECT * FROM work_messages WHERE workspace_id=? AND work_id=? ORDER BY id').bind(destination,id).all()).results;
    const audits=(await db.prepare("SELECT id,workspace_id,actor_id,action,target,detail_json,created_at FROM audit_events WHERE workspace_id=? AND target=? AND action='work.imported_field' ORDER BY id").bind(destination,id).all()).results.map((audit:any)=>{const payload=JSON.parse(audit.detail_json);delete payload.pendingErasure;return {...audit,detail_json:canonicalJson(payload)};});
    const related = await Promise.all(dependents.map(async table => (await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE workspace_id=? AND work_id=?`).bind(destination,id).first())!.n));
    return { destination, targetKind: kind, targetId: id, revision: marker.import_revision, value: { work, messages, audits, related, identities: JSON.parse(marker.identities_json),privacy:JSON.parse(marker.privacy_json) } } as TargetRow;
  },
  matches(row, destination, kind, id) {
    const parts = this.matchesParts!(row,destination,kind,id);
    return sql(parts.map(p => `(${p.sql})`).join(' AND '), ...parts.flatMap(p => p.params ?? []));
  },
  matchesParts(row, destination, kind, id) {
    if (kind !== 'work') throw new Error('UNSUPPORTED_SERVICENOW_TARGET');
    const value = row?.value as any;
    return [
      predicates('work_records', workColumns, value ? [value.work] : [], 'workspace_id=? AND id=?', [destination,id]),
      sql('(SELECT COUNT(*) FROM work_messages WHERE workspace_id=? AND work_id=?)=?',destination,id,value?.messages.length ?? 0),
      ...(value?.messages ?? []).map((message:any)=>predicates('work_messages',messageColumns,[message],'workspace_id=? AND work_id=? AND id=?',[destination,id,message.id])),
      sql("(SELECT COUNT(*) FROM audit_events WHERE workspace_id=? AND target=? AND action='work.imported_field')=?",destination,id,value?.audits.length??0),
      ...(value?.audits??[]).map((audit:any)=>predicates('audit_events',auditColumns,[audit],"workspace_id=? AND target=? AND action='work.imported_field' AND id=?",[destination,id,audit.id])),
      predicates('servicenow_import_items', ['workspace_id','work_id','import_revision','identities_json','privacy_json'], row ? [{workspace_id:destination,work_id:id,import_revision:row.revision,identities_json:canonicalJson(value.identities),privacy_json:canonicalJson(value.privacy)}] : [], 'workspace_id=? AND work_id=?', [destination,id]),
      ...dependents.map((table,i) => sql(`(SELECT COUNT(*) FROM ${table} WHERE workspace_id=? AND work_id=?)=?`,destination,id,value?.related[i] ?? 0)),
    ];
  },
  write(row) {
    const value = row.value as any;
    const privacy=value.privacy;
    const fence=sql(`SELECT CASE WHEN
      (? IS NULL OR EXISTS(SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1))
      AND (SELECT COUNT(*) FROM history_identity_tombstones WHERE workspace_id=?)=?
      AND NOT EXISTS(SELECT 1 FROM history_identity_tombstones WHERE workspace_id=? AND digest NOT IN(SELECT value FROM json_each(?)))
      AND (SELECT COUNT(*) FROM adoption_tombstones WHERE workspace_id=?)=?
      AND NOT EXISTS(SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash NOT IN(SELECT value FROM json_each(?)))
      THEN 1 ELSE json('SERVICENOW_REVIEW_PRIVACY_CHANGED') END`,value.work.department_id,row.destination,value.work.department_id,row.destination,privacy.history.length,row.destination,JSON.stringify(privacy.history),row.destination,privacy.legacy.length,row.destination,JSON.stringify(privacy.legacy));
    return [fence,...this.remove(row.destination,row.targetKind,row.targetId), insert('work_records',workColumns,value.work), ...value.messages.map((message:any) => insert('work_messages',messageColumns,message)), ...value.audits.map((audit:any)=>sql("INSERT INTO audit_events(id,workspace_id,actor_id,action,target,detail_json,created_at) SELECT ?,?,?,?,?,json_set(?,'$.pendingErasure',json(CASE WHEN EXISTS(SELECT 1 FROM history_identity_tombstones WHERE workspace_id=?) THEN 'true' ELSE 'false' END)),?",audit.id,audit.workspace_id,audit.actor_id,audit.action,audit.target,audit.detail_json,row.destination,audit.created_at)), sql('INSERT INTO servicenow_import_items VALUES(?,?,?,?,?)',row.destination,row.targetId,row.revision,canonicalJson(value.identities),canonicalJson(value.privacy))];
  },
  remove(destination, _kind, id) { return [sql("DELETE FROM audit_events WHERE workspace_id=? AND target=? AND action='work.imported_field'",destination,id),sql('DELETE FROM work_messages WHERE workspace_id=? AND work_id=?',destination,id),sql('DELETE FROM work_records WHERE workspace_id=? AND id=?',destination,id),sql('DELETE FROM servicenow_import_items WHERE workspace_id=? AND work_id=?',destination,id)]; },
  async list(db, destination) {
    const ids = (await db.prepare('SELECT work_id FROM servicenow_import_items WHERE workspace_id=? ORDER BY work_id').bind(destination).all()).results;
    return Promise.all(ids.map(row => this.read(db,destination,'work',row.work_id) as Promise<TargetRow>));
  },
  matchesCount(count, destination) { return sql('(SELECT COUNT(*) FROM servicenow_import_items WHERE workspace_id=?)=?',destination,count); },
};
export const emptyRelated = () => dependents.map(() => 0);
