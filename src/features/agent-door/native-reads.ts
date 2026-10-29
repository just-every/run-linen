import type { Env, Role } from '../../platform/types';
import type { ToolContext } from '../../modules/agent-door/index.ts';
import { ToolRefusal } from '../../modules/agent-door/index.ts';
import { nativeStore } from '../../platform/base-auth/store';
import { getWork, listWork, type WorkContext, type WorkRecord } from '../work/core';
import { projectTicket, projectHistory } from '../mcp/projection';

export async function personContext(env: Env, ctx: ToolContext): Promise<WorkContext> {
  const p = await nativeStore(env).byId(ctx.person.id);
  if (!p || p.status !== 'active') throw new ToolRefusal('not_found');
  const membership = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
    .bind(p.workspaceId,p.id).first<{roles_json:string}>();
  if (!membership) throw new ToolRefusal('not_found');
  return { env, principal: { userId:p.id, workspaceId:p.workspaceId, roles:JSON.parse(membership.roles_json) as Role[] } };
}
export function normal(row: WorkRecord) {
  return row.sensitivity === 'normal' && row.department_kind !== 'hr' && JSON.parse(row.protected_departments_json ?? '[]').length === 0;
}
export async function personTicket(env: Env, ctx: ToolContext, id: string) {
  const native = await personContext(env,ctx), row = await getWork(native,id);
  if (!normal(row)) throw new ToolRefusal('not_found');
  return { native, row };
}
/** Same native person/department check as the screen, followed by the MCP privacy projection. */
export async function personRead(env: Env, ctx: ToolContext, verb: 'work.list'|'work.get'|'work.history'|'work.search', args: Record<string, any>) {
  const native = await personContext(env,ctx);
  const reader = {workspace_id:native.principal.workspaceId,principal_id:native.principal.userId};
  if (verb === 'work.get' || verb === 'work.history') {
    const {row} = await personTicket(env,ctx,args.workId);
    const result = verb === 'work.get' ? await projectTicket(env,reader,row) : await projectHistory(env,reader,row);
    await personTicket(env,ctx,row.id);
    return result;
  }
  const candidates = await listWork(native,{restricted:false,...(args.groupId?{groupId:args.groupId}:{})});
  const items = [];
  for (const row of candidates as WorkRecord[]) {
    if (!normal(row)) continue;
    const projected = await projectTicket(env,reader,row);
    const history = verb==='work.search' ? await projectHistory(env,reader,row) : undefined;
    if (verb==='work.search' && !JSON.stringify({...projected,history}).normalize('NFKC').toLowerCase().includes(args.query.normalize('NFKC').toLowerCase())) continue;
    await personTicket(env,ctx,row.id);
    items.push(projected);
  }
  const offset=args.offset??0,limit=args.limit??50;
  return {items:items.slice(offset,offset+limit),total:items.length,nextOffset:offset+limit<items.length?offset+limit:null};
}
