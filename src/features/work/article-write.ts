import { assertDepartmentConfig } from './department-spaces';
import { requireDepartmentStaff } from './department-operations';
import { ApiError, now } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
export interface ArticleInput {
  id?: string; revision?: number; departmentId?: string|null; title: string; body: string;
  scope: 'employees' | 'operators' | 'hr'; expiresAt: string; review: boolean;
}
export async function validateArticle(ctx: WorkContext, input: ArticleInput) {
  await currentWorkPrincipal(ctx);
  permit(ctx, input.scope === 'hr' ? ['owner', 'hr'] : ['owner', 'operator']);
  if(input.id){
    const saved=await ctx.env.DB.prepare('SELECT department_id FROM work_knowledge WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,input.id).first<{department_id:string|null}>();
    if(!saved)throw new ApiError(404,'not_found','Article unavailable');
    await requireDepartmentStaff(ctx,saved.department_id);
    if(!Object.hasOwn(input,'departmentId'))input.departmentId=saved.department_id;
    else if(input.departmentId!==saved.department_id)input.departmentId=await assertDepartmentConfig(ctx,input.departmentId);
  }
  else if(input.departmentId!=null)input.departmentId=await assertDepartmentConfig(ctx,input.departmentId);
  if (!['employees', 'operators', 'hr'].includes(input.scope) || typeof input.title !== 'string' || !input.title.trim() || typeof input.body !== 'string' || !input.body.trim()
    || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now())
    throw new ApiError(422, 'invalid_article', 'Valid content, scope and future expiry required');
}
/** Shared native article write; an optional internal predicate makes publication part of its source transaction. */
export function newArticleWrites(ctx: WorkContext, articleId: string, input: ArticleInput,
  predicate = '1=1', bindings: (string | number)[] = []) {
  const t = now(), p = ctx.principal;
  const roles=input.scope==='hr'?"'owner','hr'":"'owner','operator'";
  const authority=`EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value IN (${roles})) AND (? IS NULL OR EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner') AND EXISTS(SELECT 1 FROM work_departments d WHERE d.workspace_id=m.workspace_id AND d.id=? AND d.active=1)))`;
  return [
    ctx.env.DB.prepare(`INSERT INTO work_knowledge(id,workspace_id,title,body,scope,revision,reviewer_id,reviewed_at,expires_at,updated_at,department_id) SELECT ?,?,?,?,?,1,?,?,?,?,? WHERE (${predicate}) AND ${authority}`)
      .bind(articleId, p.workspaceId, input.title, input.body, input.scope, input.review ? p.userId : null,
        input.review ? t : null, new Date(input.expiresAt).toISOString(), t,input.departmentId??null, ...bindings,p.workspaceId,p.userId,input.departmentId??null,input.departmentId??null),
    ctx.env.DB.prepare('INSERT INTO work_article_versions SELECT ?,?,1,?,? WHERE changes()=1')
      .bind(p.workspaceId, articleId, JSON.stringify(input), t),
  ];
}
