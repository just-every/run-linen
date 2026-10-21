import { ApiError, id, now } from '../../platform/http';
import { personForMember, bindingErasureGuard } from './person-binding';
import { permit, type WorkContext } from './core';

export const dimensions = ['department', 'location', 'employmentType'] as const;
export type Dimension = typeof dimensions[number];
export type Audience = Record<Dimension, string[]>;
export function normalizeAudience(input: unknown = {}): Audience {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !dimensions.includes(k as Dimension)))
    throw new ApiError(422,'catalog_audience_invalid','Use department, location and employmentType lists');
  const source = input as Record<string, unknown>;
  return Object.fromEntries(dimensions.map(d => {
    const values = source[d] ?? [];
    if (!Array.isArray(values) || values.length > 100 || values.some(v => typeof v !== 'string' || !v || v.length > 200) || new Set(values).size !== values.length)
      throw new ApiError(422,'catalog_audience_invalid','Choose distinct stable value ids for each dimension');
    return [d,[...values].sort()];
  })) as Audience;
}
export const catalogAudience = (catalog: {audience_json?: string}) => normalizeAudience(JSON.parse(catalog.audience_json ?? '{}'));
export const restrictedAudience = (catalog: {audience_json?: string}) => dimensions.some(d => catalogAudience(catalog)[d].length > 0);
export function normalizeAttributes(input: unknown): Partial<Record<Dimension, string>> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !dimensions.includes(k as Dimension)))
    throw new ApiError(422,'person_attributes','Review known dimensions with a stable value id, or null for unknown');
  const result: Partial<Record<Dimension, string>> = {};
  for (const [key,value] of Object.entries(input)) {
    if (value === null) continue;
    if (typeof value !== 'string' || !value || value.length > 200)
      throw new ApiError(422,'person_attributes','One stable value id per dimension is required');
    result[key as Dimension] = value;
  }
  return result;
}
/** The same reference check is used at review and inside the committing batch. */
export function valuePredicate(workspaceId: string, values: Partial<Record<Dimension,string[]>>) {
  const clauses: string[] = [], bindings: string[] = [];
  for (const d of dimensions) for (const value of values[d] ?? []) {
    clauses.push('EXISTS(SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=? AND active=1)');
    bindings.push(workspaceId,d,value);
  }
  return {sql:clauses.join(' AND ') || '1',bindings};
}
export async function validateValues(ctx: WorkContext, values: Partial<Record<Dimension,string[]>>) {
  const guard=valuePredicate(ctx.principal.workspaceId,values);
  if (!await ctx.env.DB.prepare('SELECT 1 WHERE '+guard.sql).bind(...guard.bindings).first())
    throw new ApiError(422,'catalog_value_invalid','Choose active values from this workspace and the matching dimension');
  return guard;
}

export async function audienceEvaluation(ctx: WorkContext, catalog: {audience_json?:string}, memberId: string) {
  const audience=catalogAudience(catalog), needed=dimensions.filter(d=>audience[d].length);
  const person=needed.length ? await personForMember(ctx,memberId) : null;
  const known=person && Date.parse(person.effective_at)<=Date.now();
  const attributes=known ? normalizeAttributes(JSON.parse(person.attributes_json)) : {};
  const failed:Dimension[]=[];
  for(const d of needed) {
    if(!attributes[d] || !audience[d].includes(attributes[d]!) || !await ctx.env.DB.prepare(
      'SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=?')
      .bind(ctx.principal.workspaceId,d,attributes[d]??'').first())failed.push(d);
  }
  return {audience,person,failed,allowed:failed.length===0};
}
export async function requireCatalogAudience(ctx: WorkContext, catalog: {id:string;audience_json?:string}, beneficiaryId:string) {
  // Staff filing on behalf checks the beneficiary only. Employee capacity also checks the filer.
  const staff=ctx.principal.roles.some(r=>['owner','operator','hr'].includes(r));
  const members=[...new Set([beneficiaryId,...(staff?[]:[ctx.principal.userId])])];
  const evaluations=await Promise.all(members.map(member=>audienceEvaluation(ctx,catalog,member)));
  const failed=[...new Set(evaluations.flatMap(e=>e.failed))];
  if (failed.length) {
    await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
      .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'catalog.audience_refused',catalog.id,
        JSON.stringify({dimensions:failed}),now()).run();
    throw new ApiError(403,'catalog_audience',staff
      ? `This item isn't available for the beneficiary. Review ${failed.join(', ')} with the owner or HR; missing reviewed facts count as unknown.`
      : "This item isn't available for you. If you think that's wrong, ask the service desk.");
  }
  const guards: string[] = [], bindings: (string|number)[] = [];
  for (const evaluation of evaluations) if (evaluation.person) {
    const person=evaluation.person, erasure=await bindingErasureGuard(ctx,person,person.member_id,null);
    guards.push(`EXISTS(SELECT 1 FROM work_people p JOIN memberships m ON m.workspace_id=p.workspace_id AND m.user_id=p.member_id
      WHERE p.workspace_id=? AND p.id=? AND p.revision=? AND p.member_id=? AND p.binding_id=?
      AND p.active=1 AND p.merged_into IS NULL AND m.active=1
      AND julianday(p.effective_at)<=julianday('now')
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=p.workspace_id AND e.person_id IN (p.id,p.source||':'||p.source_id,p.member_id,'member:'||p.member_id))
      AND ${erasure.sql})`);
    bindings.push(ctx.principal.workspaceId,person.id,person.revision,person.member_id,person.binding_id,...erasure.bindings);
  }
  return {audience:evaluations[0].audience,
    people:evaluations.flatMap(e=>e.person?[{id:e.person.id,revision:e.person.revision}]:[]),
    sql:guards.join(' AND ')||'1',bindings};
}
