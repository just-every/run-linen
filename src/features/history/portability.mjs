// Native RER policy is synchronous on export. Pending privacy evaluation is a
// visible refusal, never permission to copy an unevaluated payload into custody.
export function historyExportRow(table,row) {
  const column=table==='audit_events'?'detail_json':table==='svc_events'?'data_json':null;
  if(column){const payload=JSON.parse(row[column]);if(payload?.pendingErasure)throw new Error('History privacy reconciliation is required before export');
    if(payload?.schema==='linen.history'&&!payload.redacted){for(const c of payload.changes??[])if(c.field?.startsWith('custom:')||['group','groupId','group_id'].includes(c.field)){delete c.evidence;delete c.beforeEvidence;delete c.afterEvidence;}return {...row,[column]:JSON.stringify(payload)};}}
  return row;
}
export async function validateHistoryStaged(db,tables) {
  const quote=name=>'"'+name.replaceAll('"','""')+'"';
  const markers=await db.prepare('SELECT * FROM history_redactions').all();
  // A pre-erasure snapshot cannot replace an installation's durable removal.
  // Refusal also covers older schemas without the marker table.
  for(const marker of markers.results){
    const staged=tables.history_redactions;
    if(!staged)return false;
    const same=await db.prepare(`SELECT 1 FROM ${quote(staged)} WHERE workspace_id=? AND event_key=? AND envelope_json=? AND redacted_at=?`).bind(marker.workspace_id,marker.event_key,marker.envelope_json,marker.redacted_at).first();
    if(!same)return false;
  }
  if(tables.history_redactions){
    const incoming=await db.prepare(`SELECT * FROM ${quote(tables.history_redactions)}`).all();
    for(const marker of incoming.results){
      let payload;try{payload=JSON.parse(marker.envelope_json);}catch{return false;}
      if(payload?.redacted!=='erasure'||typeof payload.redactedAt!=='string')return false;
      if(payload?.changes?.some(c=>(c.field?.startsWith('custom:')||['group','groupId','group_id'].includes(c.field)) && [c.before,c.after].some(v=>v!==null && !(v && typeof v==='object' && v.redacted==='erasure')))) {
        if(!markers.results.some(known=>known.workspace_id===marker.workspace_id && known.event_key===marker.event_key && known.envelope_json===marker.envelope_json))return false;
      }
      const table=marker.store==='audit'?'audit_events':marker.store==='service'?'svc_events':null;
      if(!table)continue;
      const staged=tables[table];if(!staged)return false;
      const column=table==='audit_events'?'detail_json':'data_json';
      const event=await db.prepare(`SELECT ${column} payload FROM ${quote(staged)} WHERE workspace_id=? AND id=?`).bind(marker.workspace_id,marker.event_id).first();
      if(event && event.payload!==marker.envelope_json)return false;
    }
  }
  for(const table of ['audit_events','svc_events'])if(tables[table]){
    const column=table==='audit_events'?'detail_json':'data_json';
    if(await db.prepare(`SELECT 1 FROM ${quote(tables[table])} WHERE json_valid(${column}) AND json_extract(${column},'$.pendingErasure')=1 LIMIT 1`).first())return false;
  }
  return true;
}
