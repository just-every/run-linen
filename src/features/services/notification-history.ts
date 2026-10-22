import type { Principal } from '../../platform/types';
import { id, now } from '../../platform/http';
import { serviceEvent } from './history';
import type { ServiceRecord } from './store';

export function notificationEvent(db:D1Database,p:Principal,r:Pick<ServiceRecord,'id'|'kind'|'ownerId'|'visibility'|'participants'>,
  job:{id:string;recipient_id:string},before:string|null,after:string,at=now()) {
  return serviceEvent(db,p,r,{deliveryState:before,notificationId:before===null?null:job.id,recipientId:before===null?null:job.recipient_id},
    {deliveryState:after,notificationId:job.id,recipientId:job.recipient_id},'notification-state-changed',at);
}
/** The insert and its original queued state share the same duplicate fence. */
export function queueNotification(db:D1Database,p:Principal,r:ServiceRecord,recipient:string,kind:string,payload:unknown,due:string) {
  const key=id();
  return [db.prepare('INSERT OR IGNORE INTO svc_outbox(id,workspace_id,record_id,recipient_id,kind,payload_json,next_at) VALUES(?,?,?,?,?,?,?)')
    .bind(key,p.workspaceId,r.id,recipient,kind,JSON.stringify(payload),due),
    notificationEvent(db,p,r,{id:key,recipient_id:recipient},null,'pending')];
}
