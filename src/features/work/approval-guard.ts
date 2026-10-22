import { id } from '../../platform/http';
import type { WorkContext } from './core';

/** Capture the decision's authority inputs before evaluating them. The transaction compares these again before any
 * decision/token write, including group withdrawal, delegation changes and competing decisions on a parallel stage. */
export async function approvalGuard(ctx: WorkContext, workId: string, catalogId: string) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, guardId = id();
  const sources = [
    ['work_records', 'id,revision,state', 'id=?', [workId]],
    ['work_fulfilments', 'id,revision,beneficiary_id,purpose,expires_at,application_json', 'work_id=?', [workId]],
    ['work_catalog', 'id,revision,owner_id,requires_manager,approvals_json', 'id IN (SELECT catalog_id FROM work_fulfilments WHERE workspace_id=? AND work_id=?)', [w, workId]],
    ['work_people', 'id,revision,member_id,binding_id,manager_id,active,merged_into', 'member_id IN (SELECT beneficiary_id FROM work_fulfilments WHERE workspace_id=? AND work_id=?)', [w, workId]],
    ['memberships', 'user_id,active,roles_json', '1', []],
    ['work_group_members', 'group_id,user_id', '1', []],
    ['work_delegations', 'id,manager_id,delegate_id,starts_at,expires_at,revoked_at', '1', []],
    ['work_approval_decisions', 'id,stage_key,approver_id,decision,work_revision,fulfilment_revision,catalog_revision', 'work_id=? AND fulfilment_id IN (SELECT id FROM work_fulfilments WHERE workspace_id=? AND catalog_id=?)', [workId,w,catalogId]],
    ['work_approval_stages', 'fulfilment_id,stage_key,definition_json,applies,active_at', 'work_id=? AND fulfilment_id IN (SELECT id FROM work_fulfilments WHERE workspace_id=? AND catalog_id=?)', [workId,w,catalogId]],
    ['svc_records', 'id,revision,owner_id', "kind='application'", []],
  ] as const;
  const conditions: string[] = [], bindings: unknown[] = [];
  for (const [table, columns, condition, args] of sources) {
    const sql = `SELECT json_group_array(json_array(${columns})) value FROM (SELECT ${columns} FROM ${table} WHERE workspace_id=? AND ${condition} ORDER BY ${columns.split(',')[0]},rowid)`;
    const params = [w, ...args];
    const row = await db.prepare(sql).bind(...params).first<{ value: string }>();
    conditions.push(`(${sql})=?`); bindings.push(...params, row!.value);
  }
  return {
    start: db.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${conditions.join(' AND ')} THEN 1 ELSE 0 END)`).bind(guardId, ...bindings),
    end: db.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guardId),
  };
}
