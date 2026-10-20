import type { ActivityEntry } from './activity';
import type { WorkContext } from './core';

interface ApprovalEvent {
  id: string; approval_id: string; actor_name: string; created_at: string; detail_json: string;
}

/** Called only after the timeline's full ticket-scope check. Historical approval
 * values come from the event, never from mutable authority or erased payloads. */
export async function approvalActivity(ctx: WorkContext, workId: string): Promise<ActivityEntry[]> {
  const rows = (await ctx.env.DB.prepare(`SELECT e.id,e.target approval_id,e.created_at,e.detail_json,
    CASE WHEN EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=e.workspace_id AND p.user_id=e.actor_id)
      THEN '[erased]' ELSE COALESCE(u.name,e.actor_id) END actor_name
    FROM work_fulfilment_approvals a JOIN audit_events e ON e.workspace_id=a.workspace_id
      AND e.target=a.id AND e.action='work.fulfilment_approved'
    LEFT JOIN users u ON u.id=e.actor_id
    WHERE a.workspace_id=? AND a.work_id=? ORDER BY e.created_at,e.rowid`)
    .bind(ctx.principal.workspaceId, workId).all<ApprovalEvent>()).results;
  return rows.map(event => {
    const entry: ActivityEntry = { id: event.id, at: event.created_at, kind: 'change', actor: event.actor_name,
      actorKind: 'person', action: 'fulfilment approved', visibility: 'private', changes: [] };
    let detail: Record<string, unknown>;
    try { detail = JSON.parse(event.detail_json); } catch { return entry; }
    if (!detail || typeof detail !== 'object' || detail.workId !== workId
      || typeof detail.catalogId !== 'string' || !detail.catalogId
      || typeof detail.holderId !== 'string' || !detail.holderId
      || ![detail.workRevision, detail.fulfilmentRevision, detail.catalogRevision].every(v => Number.isInteger(v) && Number(v) > 0)) return entry;
    const after = { approvalId: event.approval_id, catalogId: detail.catalogId, workRevision: detail.workRevision,
      fulfilmentRevision: detail.fulfilmentRevision, catalogRevision: detail.catalogRevision, holderId: detail.holderId,
      ...(typeof detail.grantId === 'string' && detail.grantId && Number.isInteger(detail.grantVersion) && Number(detail.grantVersion) > 0
        ? { grantId: detail.grantId, grantVersion: detail.grantVersion } : {}) };
    entry.changes = [{ field: 'approval', before: null, after }];
    return entry;
  });
}
