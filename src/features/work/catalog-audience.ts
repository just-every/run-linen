import { departmentStaff } from './department-spaces';
import { activeCatalogDepartment } from './department-operations';
import { ApiError, id, now } from '../../platform/http';
import { personForMember, bindingErasureGuard } from './person-binding';
import { permit, type WorkContext } from './core';

export const dimensions = ['department', 'location', 'employmentType'] as const;
export type Dimension = typeof dimensions[number];
/** Reviewed person facts also carry a title; an item audience never does (CATALOG-007). */
export const attributeDimensions = [...dimensions, 'title'] as const;
export type AttributeDimension = typeof attributeDimensions[number];
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
export function normalizeAttributes(input: unknown): Partial<Record<AttributeDimension, string>> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !attributeDimensions.includes(k as AttributeDimension)))
    throw new ApiError(422,'person_attributes','Review known dimensions with a stable value id, or null for unknown');
  const result: Partial<Record<AttributeDimension, string>> = {};
  for (const [key,value] of Object.entries(input)) {
    if (value === null) continue;
    if (typeof value !== 'string' || !value || value.length > 200)
      throw new ApiError(422,'person_attributes','One stable value id per dimension is required');
    result[key as AttributeDimension] = value;
  }
  return result;
}
/** The same reference check is used at review and inside the committing batch. */
export function valuePredicate(workspaceId: string, values: Partial<Record<AttributeDimension,string[]>>) {
  const clauses: string[] = [], bindings: string[] = [];
  for (const d of attributeDimensions) for (const value of values[d] ?? []) {
    clauses.push('EXISTS(SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=? AND active=1)');
    bindings.push(workspaceId,d,value);
  }
  return {sql:clauses.join(' AND ') || '1',bindings};
}
export async function validateValues(ctx: WorkContext, values: Partial<Record<AttributeDimension,string[]>>) {
  const guard=valuePredicate(ctx.principal.workspaceId,values);
  if (!await ctx.env.DB.prepare('SELECT 1 WHERE '+guard.sql).bind(...guard.bindings).first())
    throw new ApiError(422,'catalog_value_invalid','Choose active values from this workspace and the matching dimension');
  return guard;
}

/** A reviewed pending person's facts count from review; any other person's count from their effective date. */
const factsKnown = (person: any) => person && (person.source === 'pending-reviewed' ? Date.parse(person.observed_at) : Date.parse(person.effective_at)) <= Date.now();
export async function evaluateAttributes(ctx: WorkContext, catalog: {id?:string;department_id?:string|null;audience_json?:string}, person: any) {
  const audience=catalogAudience(catalog), needed=dimensions.filter(d=>audience[d].length);
  const attributes=needed.length && factsKnown(person) ? normalizeAttributes(JSON.parse(person.attributes_json)) : {};
  const failed:Dimension[]=[], unknown:Dimension[]=[];
  for(const d of needed) {
    if(!attributes[d] || !await ctx.env.DB.prepare('SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=?')
      .bind(ctx.principal.workspaceId,d,attributes[d]??'').first()){failed.push(d);unknown.push(d);}
    else if(!audience[d].includes(attributes[d]!))failed.push(d);
  }
  return {audience,person,failed,unknown,allowed:failed.length===0 && await activeCatalogDepartment(ctx,catalog)};
}
export async function audienceEvaluation(ctx: WorkContext, catalog: {id?:string;department_id?:string|null;audience_json?:string}, memberId: string) {
  const needed=restrictedAudience(catalog);
  return evaluateAttributes(ctx,catalog,needed ? await personForMember(ctx,memberId) : null);
}
export async function requireCatalogAudience(ctx: WorkContext, catalog: {id:string;name?:string;department_id?:string|null;audience_json?:string}, beneficiaryId:string) {
  if(!await activeCatalogDepartment(ctx,catalog))throw new ApiError(409,'catalog_department_inactive','This catalog department is unavailable');
  // Staff filing on behalf checks the beneficiary only. Employee capacity also checks the filer.
  const staff=ctx.principal.roles.some(r=>['owner','operator','hr'].includes(r)) && await departmentStaff(ctx,catalog.department_id);
  const members=[...new Set([beneficiaryId,...(staff?[]:[ctx.principal.userId])])];
  const evaluations=await Promise.all(members.map(member=>audienceEvaluation(ctx,catalog,member)));
  const failed=[...new Set(evaluations.flatMap(e=>e.failed))];
  if (failed.length) {
    await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
      .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'catalog.audience_refused',catalog.id,
        JSON.stringify({dimensions:failed}),now()).run();
    const unknown=[...new Set(evaluations.flatMap(e=>e.unknown))], name=(catalog as {name?:string}).name??'This item';
    // Staff see the failing dimension, never an attribute value; employees see only that it is unavailable.
    throw new ApiError(403,'catalog_audience',staff
      ? unknown.length ? `${name} has no reviewed ${unknown.join(', ')}; the owner or HR must record it.`
        : `${name} isn't available for the beneficiary: ${failed.join(', ')} does not match.`
      : "This item isn't available for you. If you think that's wrong, ask the service desk.");
  }
  const guards: string[] = [`EXISTS(SELECT 1 FROM work_catalog c WHERE c.workspace_id=? AND c.id=? AND (c.department_id IS NULL OR EXISTS(SELECT 1 FROM work_departments d WHERE d.workspace_id=c.workspace_id AND d.id=c.department_id AND d.active=1)))`], bindings: (string|number)[] = [ctx.principal.workspaceId,catalog.id];
  for (const evaluation of evaluations) if (evaluation.person) {
    const person=evaluation.person, erasure=await bindingErasureGuard(ctx,person,person.member_id,null);
    guards.push(`EXISTS(SELECT 1 FROM work_people p JOIN memberships m ON m.workspace_id=p.workspace_id AND m.user_id=p.member_id
      WHERE p.workspace_id=? AND p.id=? AND p.revision=? AND p.member_id=? AND p.binding_id=?
      AND p.active=1 AND p.merged_into IS NULL AND m.active=1
      AND (julianday(p.effective_at)<=julianday('now') OR (p.source='pending-reviewed' AND julianday(p.observed_at)<=julianday('now')))
      AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=p.workspace_id AND e.person_id IN (p.id,p.source||':'||p.source_id,p.member_id,'member:'||p.member_id))
      AND ${erasure.sql})`);
    bindings.push(ctx.principal.workspaceId,person.id,person.revision,person.member_id,person.binding_id,...erasure.bindings);
  }
  return {audience:evaluations[0].audience,
    people:evaluations.flatMap(e=>e.person?[{id:e.person.id,revision:e.person.revision}]:[]),
    sql:guards.join(' AND ')||'1',bindings};
}
