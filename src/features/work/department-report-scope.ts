import type { WorkContext } from './core';

/** Apply before aggregation: an employee's own public thread is no staff report grant. */
export function departmentReportScope(ctx: WorkContext) {
  return {
    sql: `(w.department_id IS NULL OR EXISTS(SELECT 1 FROM memberships report_member WHERE report_member.workspace_id=w.workspace_id AND report_member.user_id=? AND report_member.active=1 AND
      ((?=1 AND EXISTS(SELECT 1 FROM json_each(report_member.roles_json) WHERE value='owner')) OR
       (?=1 AND EXISTS(SELECT 1 FROM json_each(report_member.roles_json) WHERE value IN ('operator','hr')) AND EXISTS(SELECT 1 FROM work_department_members dm JOIN work_departments d ON d.workspace_id=dm.workspace_id AND d.id=dm.department_id WHERE dm.workspace_id=w.workspace_id AND dm.department_id=w.department_id AND dm.user_id=report_member.user_id AND dm.active=1 AND d.active=1)))))`,
    bindings: [ctx.principal.userId, Number(ctx.principal.roles.includes('owner')), Number(ctx.principal.roles.some(role=>['operator','hr'].includes(role)))],
  };
}
