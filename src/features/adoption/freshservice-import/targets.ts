import type { D1TargetAdapter, D1Sql, D1Database, TargetRow } from '../../../import-kit/src/d1/index';
import { canonicalJson } from '../../../import-kit/src/d1/index';

export const workColumns = ['id','workspace_id','requester_id','beneficiary_id','kind','title','state','sensitivity','assignee_id','impact','revision','created_at','updated_at','closed_at','paused_at','paused_ms','response_at','resolution_at','context_json','dedup_key','request_hash'];
const messageColumns = ['id','workspace_id','work_id','author_id','visibility','body','source_key','created_at'];
// A later native attachment, fulfilment, execution or intake prevents deletion.
const dependents = ['work_attachments','work_lifecycle','work_obligations','work_fulfilments','work_commitments','work_catalog_reservations','execution_plans','execution_outbox','work_fulfilment_execution','work_fulfilment_amendments','work_fulfilment_approvals','intelligence_investigations','intelligence_pending_fulfilments','intelligence_fulfilment_runs','work_intake_events'];
const sql = (sql: string, ...params: any[]): D1Sql => ({ sql, params });
function predicates(table: string, columns: string[], rows: any[], where: string, params: any[]): D1Sql {
  const parts = [`(SELECT COUNT(*) FROM ${table} WHERE ${where})=?`], bindings = [...params, rows.length];
  for (const row of rows) { parts.push(`EXISTS(SELECT 1 FROM ${table} WHERE ${where} AND ${columns.map(c => `${c} IS ?`).join(' AND ')})`); bindings.push(...params, ...columns.map(c => row[c])); }
  return sql(parts.join(' AND '), ...bindings);
}
const insert = (table: string, columns: string[], row: any) => sql(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`, ...columns.map(c => row[c]));
export const freshserviceTargets: D1TargetAdapter = {
  async read(db, destination, kind, id) {
    if (kind !== 'work') throw new Error('UNSUPPORTED_FRESHSERVICE_TARGET');
    const work = await db.prepare('SELECT * FROM work_records WHERE workspace_id=? AND id=?').bind(destination,id).first();
    const marker = await db.prepare('SELECT * FROM freshservice_import_items WHERE workspace_id=? AND work_id=?').bind(destination,id).first();
    if (!work && !marker) return undefined;
    if (!work || !marker) throw new Error('FRESHSERVICE_NATIVE_INTEGRITY');
    const messages = (await db.prepare('SELECT * FROM work_messages WHERE workspace_id=? AND work_id=? ORDER BY id').bind(destination,id).all()).results;
    const related = await Promise.all(dependents.map(async table => (await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE workspace_id=? AND work_id=?`).bind(destination,id).first())!.n));
    return { destination, targetKind: kind, targetId: id, revision: marker.import_revision, value: { work, messages, related, identities: JSON.parse(marker.identities_json) } } as TargetRow;
  },
  matches(row, destination, kind, id) {
    const parts = this.matchesParts!(row,destination,kind,id);
    return sql(parts.map(p => `(${p.sql})`).join(' AND '), ...parts.flatMap(p => p.params ?? []));
  },
  matchesParts(row, destination, kind, id) {
    if (kind !== 'work') throw new Error('UNSUPPORTED_FRESHSERVICE_TARGET');
    const value = row?.value as any;
    return [
      predicates('work_records', workColumns, value ? [value.work] : [], 'workspace_id=? AND id=?', [destination,id]),
      sql('(SELECT COUNT(*) FROM work_messages WHERE workspace_id=? AND work_id=?)=?',destination,id,value?.messages.length ?? 0),
      ...(value?.messages ?? []).map((message:any)=>predicates('work_messages',messageColumns,[message],'workspace_id=? AND work_id=? AND id=?',[destination,id,message.id])),
      predicates('freshservice_import_items', ['workspace_id','work_id','import_revision','identities_json'], row ? [{workspace_id:destination,work_id:id,import_revision:row.revision,identities_json:canonicalJson(value.identities)}] : [], 'workspace_id=? AND work_id=?', [destination,id]),
      ...dependents.map((table,i) => sql(`(SELECT COUNT(*) FROM ${table} WHERE workspace_id=? AND work_id=?)=?`,destination,id,value?.related[i] ?? 0)),
    ];
  },
  write(row) {
    const value = row.value as any;
    return [...this.remove(row.destination,row.targetKind,row.targetId), insert('work_records',workColumns,value.work), ...value.messages.map((message:any) => insert('work_messages',messageColumns,message)), sql('INSERT INTO freshservice_import_items VALUES(?,?,?,?)',row.destination,row.targetId,row.revision,canonicalJson(value.identities))];
  },
  remove(destination, _kind, id) { return [sql('DELETE FROM work_messages WHERE workspace_id=? AND work_id=?',destination,id),sql('DELETE FROM work_records WHERE workspace_id=? AND id=?',destination,id),sql('DELETE FROM freshservice_import_items WHERE workspace_id=? AND work_id=?',destination,id)]; },
  async list(db, destination) {
    const ids = (await db.prepare('SELECT work_id FROM freshservice_import_items WHERE workspace_id=? ORDER BY work_id').bind(destination).all()).results;
    return Promise.all(ids.map(row => this.read(db,destination,'work',row.work_id) as Promise<TargetRow>));
  },
  matchesCount(count, destination) { return sql('(SELECT COUNT(*) FROM freshservice_import_items WHERE workspace_id=?)=?',destination,count); },
};
export const emptyRelated = () => dependents.map(() => 0);
