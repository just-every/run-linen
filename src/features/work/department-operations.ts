import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';
import { departmentStaff } from './department-spaces';

/** Department ownership only narrows existing staff authority. NULL retains legacy scope. */
export async function departmentRows<T extends {department_id?: unknown}>(ctx: WorkContext, rows: T[]) {
  const visible: (T & {departmentId: string|null})[] = [];
  for (const row of rows) if (row.department_id==null || await departmentStaff(ctx, row.department_id as string|null))
    visible.push({...row, departmentId: row.department_id as string|null ?? null});
  return visible;
}
export async function requireDepartmentStaff(ctx: WorkContext, departmentId: string|null|undefined) {
  if (!await departmentStaff(ctx, departmentId)) throw new ApiError(404,'not_found','Department resource unavailable');
}
export async function activeCatalogDepartment(ctx: WorkContext, catalog: {id?:string;department_id?:string|null}) {
  const row = catalog.department_id !== undefined ? catalog : catalog.id
    ? await ctx.env.DB.prepare('SELECT department_id FROM work_catalog WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,catalog.id).first<{department_id:string|null}>() : null;
  if(!row)return false;
  return !row.department_id || Boolean(await ctx.env.DB.prepare('SELECT 1 FROM work_departments WHERE workspace_id=? AND id=? AND active=1').bind(ctx.principal.workspaceId,row.department_id).first());
}
