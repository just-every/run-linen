import type { WorkContext } from './core';

/** Reminder work is addressed to a task's assignee, but its content belongs to the lifecycle subject. */
export const lifecycleReminderWork = `SELECT r.id FROM work_records r WHERE r.workspace_id=?
  AND json_extract(r.context_json,'$.lifecycleTaskReminder.taskId') IN
    (SELECT id FROM work_obligations WHERE workspace_id=? AND beneficiary_id=? AND template_json IS NOT NULL)`;

/** Included in the erasure transaction before reminder contexts are cleared. */
export function eraseLifecycleTaskStatements(ctx: WorkContext, personId: string) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, args = [w, w, personId];
  return [
    db.prepare(`UPDATE work_messages SET body='[erased]' WHERE workspace_id=? AND work_id IN (${lifecycleReminderWork})`).bind(w, ...args),
    db.prepare(`DELETE FROM work_attachments WHERE workspace_id=? AND work_id IN (${lifecycleReminderWork})`).bind(w, ...args),
    db.prepare(`UPDATE work_time_entries SET note='[erased]' WHERE workspace_id=? AND work_id IN (${lifecycleReminderWork})`).bind(w, ...args),
    db.prepare(`UPDATE work_records SET title='[erased]',context_json='{}',revision=revision+1 WHERE workspace_id=? AND id IN (${lifecycleReminderWork})`).bind(w, ...args),
    db.prepare(`UPDATE audit_events SET detail_json='{}' WHERE workspace_id=? AND action='lifecycle.task_waived'
      AND (actor_id=? OR target IN (SELECT id FROM work_obligations WHERE workspace_id=? AND beneficiary_id=?))`).bind(w, personId, w, personId),
    db.prepare(`UPDATE work_obligations SET title='[erased]',last_error=NULL,state=CASE WHEN state IN ('pending','blocked') THEN 'cancelled' ELSE state END,revision=revision+1
      WHERE workspace_id=? AND beneficiary_id=? AND template_json IS NOT NULL`).bind(w, personId),
  ];
}
