import type { WorkContext } from './core';
export type WorkNotificationEvent = 'ticket.received'|'ticket.public_update'|'ticket.requester_reply'|'ticket.resolved'|'ticket.closed'|'ticket.waiting_on_you'|'ticket.assigned'|'approval.requested'|'security.task'|'leaver.task';
type Event={workId:string;event:WorkNotificationEvent;sourceId:string};
let emit:((ctx:WorkContext,event:Event)=>Promise<unknown>)|undefined;
/** Bound by the execution module before the application accepts requests. */
export function setWorkNotificationPort(handler:NonNullable<typeof emit>){emit=handler}
export async function notifyWorkEvent(ctx:WorkContext,event:Event){if(emit)await emit(ctx,event)}
