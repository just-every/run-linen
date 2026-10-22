/** Canonical privacy rewrites use an exact, single-use permit in the same batch.
 * Every service event identity, kind and timestamp remains immutable. */
export function serviceHistoryRewrite(db:D1Database,i:{workspaceId:string;eventId:string;beforeActor:string;beforePayload:string;afterActor:string;afterPayload:string}):D1PreparedStatement[] {
  return [
    db.prepare(`INSERT INTO history_service_rewrite_permits(workspace_id,event_id,before_actor,before_payload,after_actor,after_payload)
      SELECT workspace_id,id,actor_id,data_json,?,? FROM svc_events
      WHERE workspace_id=? AND id=? AND actor_id=? AND data_json=?`).bind(i.afterActor,i.afterPayload,i.workspaceId,i.eventId,i.beforeActor,i.beforePayload),
    db.prepare('UPDATE svc_events SET actor_id=?,data_json=? WHERE workspace_id=? AND id=? AND actor_id=? AND data_json=?').bind(i.afterActor,i.afterPayload,i.workspaceId,i.eventId,i.beforeActor,i.beforePayload),
    db.prepare('DELETE FROM history_service_rewrite_permits WHERE workspace_id=? AND event_id=?').bind(i.workspaceId,i.eventId),
  ];
}
