import type { WorkContext } from './core';
import { workDepartmentStaffSql } from './department-spaces';

/** The same current destination/retained scope is checked before and inside handoff commit. */
export function destinationAssignee(ctx:WorkContext,userId:string|null,departmentId:string|null,protectedJson:string,sensitivity:string,groupId:string|null) {
  return {sql:`SELECT 1 FROM memberships m CROSS JOIN (SELECT ? workspace_id,? department_id,? protected_departments_json) w
    WHERE m.workspace_id=w.workspace_id AND m.user_id=? AND m.active=1 AND ${workDepartmentStaffSql('w','m')}
    AND (?<>'hr' OR EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN ('owner','hr')))
    AND (? IS NULL OR EXISTS(SELECT 1 FROM work_group_members gm WHERE gm.workspace_id=m.workspace_id AND gm.group_id=? AND gm.user_id=m.user_id))`,
    bindings:[ctx.principal.workspaceId,departmentId,protectedJson,userId,sensitivity,groupId,groupId]};
}
