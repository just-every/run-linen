import { ApiError, id, now } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { attributeDimensions, normalizeAttributes, type AttributeDimension } from './catalog-audience';

/** LIFE-003: a birthright baseline is the union of every active policy whose reviewed values match. */
export const grantKinds = ['group', 'app', 'license'] as const;
export type PolicyMatch = Partial<Record<AttributeDimension, string[]>>;
export type PolicyGrant = { kind: typeof grantKinds[number]; target: string };
export type Attributes = Partial<Record<AttributeDimension, string>>;
export interface PolicyRow { id: string; name: string; match_json: string; grants_json: string; active: number; revision: number }
export interface Baseline { from?: unknown; to?: unknown }
export interface BaselineDiff {
  from: Attributes | null; to: Attributes | null;
  retained: string[]; added: string[]; removed: string[];
  policies: { id: string; revision: number; name: string }[];
}

export function normalizeMatch(input: unknown = {}): PolicyMatch {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !attributeDimensions.includes(k as AttributeDimension)))
    throw new ApiError(422, 'access_policy_match', 'Match on department, title, location and employmentType lists of reviewed value ids');
  const source = input as Record<string, unknown>, match: PolicyMatch = {};
  for (const d of attributeDimensions) {
    const values = source[d] ?? [];
    if (!Array.isArray(values) || values.length > 100 || values.some(v => typeof v !== 'string' || !v || v.length > 200) || new Set(values).size !== values.length)
      throw new ApiError(422, 'access_policy_match', 'Choose distinct reviewed value ids for each dimension');
    if (values.length) match[d] = [...values as string[]].sort();
  }
  return match;
}

export function normalizeGrants(input: unknown): PolicyGrant[] {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    throw new ApiError(422, 'access_policy_grants', 'One to 100 baseline entitlements required');
  const grants = input.map(g => {
    if (!g || typeof g !== 'object' || Array.isArray(g) || Object.keys(g).some(k => !['kind', 'target'].includes(k)) ||
      !grantKinds.includes(g.kind) || typeof g.target !== 'string' || !g.target.trim() || g.target.length > 500)
      throw new ApiError(422, 'access_policy_grants', 'Each entitlement names its kind (group, app or license) and its provider target');
    return { kind: g.kind, target: g.target.trim() } as PolicyGrant;
  });
  if (new Set(grants.map(g => g.target)).size !== grants.length)
    throw new ApiError(422, 'access_policy_grants', 'A provider target appears once per policy');
  return grants;
}

export const parsePolicy = (row: PolicyRow) => ({
  id: row.id, name: row.name, active: row.active === 1, revision: row.revision,
  match: JSON.parse(row.match_json) as PolicyMatch, grants: JSON.parse(row.grants_json) as PolicyGrant[],
});

export async function listPolicies(ctx: WorkContext, activeOnly = false) {
  const rows = await ctx.env.DB.prepare(`SELECT id,name,match_json,grants_json,active,revision FROM work_access_policies
    WHERE workspace_id=? ${activeOnly ? 'AND active=1' : ''} ORDER BY name,id`).bind(ctx.principal.workspaceId).all<PolicyRow>();
  return rows.results.map(parsePolicy);
}

/** Same string the committing batch compares, so a policy edit during admission refuses the record. */
export const policyFingerprint = (policies: { id: string; revision: number }[]) =>
  [...policies].sort((a, b) => a.id < b.id ? -1 : 1).map(p => `${p.id}:${p.revision}`).join(',');
export const policyGuardSql = `IFNULL((SELECT group_concat(id||':'||revision,',') FROM (SELECT id,revision FROM work_access_policies WHERE workspace_id=? AND active=1 ORDER BY id)),'')=?`;

const matches = (match: PolicyMatch, attributes: Attributes) =>
  attributeDimensions.every(d => !match[d]?.length || (attributes[d] !== undefined && match[d]!.includes(attributes[d]!)));

export function entitlements(policies: ReturnType<typeof parsePolicy>[], attributes: Attributes) {
  const result = new Map<string, { id: string; revision: number; name: string }[]>();
  for (const policy of policies) if (matches(policy.match, attributes))
    for (const grant of policy.grants) result.set(grant.target, [...result.get(grant.target) ?? [], { id: policy.id, revision: policy.revision, name: policy.name }]);
  return result;
}

async function knownValues(ctx: WorkContext, attributes: Attributes, label: string) {
  for (const [dimension, value] of Object.entries(attributes))
    if (!await ctx.env.DB.prepare('SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=?').bind(ctx.principal.workspaceId, dimension, value).first())
      throw new ApiError(422, 'baseline_values', `${label} uses a ${dimension} value this workspace does not define; ask the owner to add it`);
}

/** join grants the baseline for the new values, a move compares old and new, a leave removes the old baseline. */
export async function computeBaseline(ctx: WorkContext, kind: string, baseline: Baseline): Promise<{ diff: BaselineDiff; snapshot: { id: string; revision: number }[] }> {
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline) || Object.keys(baseline).some(k => !['from', 'to'].includes(k)))
    throw new ApiError(422, 'baseline_input', 'Baseline names the reviewed values before (from) and after (to) the change');
  const needsFrom = kind !== 'join', needsTo = kind !== 'leave';
  if ((needsFrom && baseline.from === undefined) || (!needsFrom && baseline.from !== undefined) || (needsTo && baseline.to === undefined) || (!needsTo && baseline.to !== undefined))
    throw new ApiError(422, 'baseline_input', 'A join names "to", a move names "from" and "to", a leave names "from"');
  const from = needsFrom ? normalizeAttributes(baseline.from) : null, to = needsTo ? normalizeAttributes(baseline.to) : null;
  if (from) await knownValues(ctx, from, 'The earlier baseline');
  if (to) await knownValues(ctx, to, 'The new baseline');
  const policies = await listPolicies(ctx, true);
  const before = from ? entitlements(policies, from) : new Map(), after = to ? entitlements(policies, to) : new Map();
  const used = new Map<string, { id: string; revision: number; name: string }>();
  for (const list of [...before.values(), ...after.values()]) for (const p of list) used.set(p.id, p);
  const keys = (m: Map<string, unknown>) => [...m.keys()];
  const diff: BaselineDiff = {
    from, to,
    added: keys(after).filter(t => !before.has(t)).sort(),
    removed: keys(before).filter(t => !after.has(t)).sort(),
    retained: keys(after).filter(t => before.has(t)).sort(),
    policies: [...used.values()].sort((a, b) => a.id < b.id ? -1 : 1),
  };
  // Every active policy revision read here must still hold when the record commits, so a concurrent edit refuses it.
  return { diff, snapshot: policies.map(p => ({ id: p.id, revision: p.revision })) };
}

export async function savePolicy(ctx: WorkContext, input: { policyId?: string; revision?: number; name: unknown; match: unknown; grants: unknown; active?: unknown }) {
  permit(ctx, ['owner']);
  const name = typeof input.name === 'string' && input.name.trim() && input.name.length <= 200 ? input.name.trim() : null;
  if (!name) throw new ApiError(422, 'access_policy_name', 'A policy name of at most 200 characters is required');
  const match = normalizeMatch(input.match), grants = normalizeGrants(input.grants), w = ctx.principal.workspaceId, policyId = input.policyId ?? id(), at = now();
  const guardId = id(), values = attributeDimensions.flatMap(d => (match[d] ?? []).map(v => [d, v]));
  const guard = values.map(() => 'EXISTS(SELECT 1 FROM work_catalog_values WHERE workspace_id=? AND dimension=? AND id=? AND active=1)').join(' AND ') || '1';
  const ownerSql = "EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')";
  const editing = input.policyId !== undefined;
  if (editing && (!Number.isSafeInteger(input.revision) || typeof input.active !== 'boolean'))
    throw new ApiError(422, 'access_policy_revision', 'Current revision and explicit active flag required');
  const before = editing ? await ctx.env.DB.prepare('SELECT * FROM work_access_policies WHERE workspace_id=? AND id=?').bind(w, policyId).first<PolicyRow>() : null;
  if (editing && !before) throw new ApiError(404, 'not_found', 'Access policy not found');
  const detail = (p: { match: PolicyMatch; grants: PolicyGrant[]; active: boolean; revision: number }) => ({ revision: p.revision, active: p.active, match: p.match, grants: p.grants.map(g => g.target) });
  const revision = editing ? Number(input.revision) + 1 : 1, active = editing ? Boolean(input.active) : true;
  try {
    const result = await ctx.env.DB.batch([
      ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN ${guard} AND ${ownerSql} THEN 1 ELSE 0 END)`)
        .bind(guardId, ...values.flatMap(([d, v]) => [w, d, v]), w, ctx.principal.userId),
      editing
        ? ctx.env.DB.prepare('UPDATE work_access_policies SET name=?,match_json=?,grants_json=?,active=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?')
          .bind(name, JSON.stringify(match), JSON.stringify(grants), Number(active), at, w, policyId, input.revision)
        : ctx.env.DB.prepare('INSERT INTO work_access_policies(id,workspace_id,name,match_json,grants_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
          .bind(policyId, w, name, JSON.stringify(match), JSON.stringify(grants), at, at),
      ctx.env.DB.prepare("INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1")
        .bind(id(), w, ctx.principal.userId, editing ? 'access_policy.edited' : 'access_policy.created', policyId,
          JSON.stringify({ before: before ? detail(parsePolicy(before)) : null, after: detail({ match, grants, active, revision }) }), at),
      ctx.env.DB.prepare('DELETE FROM work_fulfilment_link_guards WHERE id=?').bind(guardId),
    ]);
    if (!result[1].meta.changes) throw new ApiError(409, 'revision_conflict', 'This policy changed; reload it and review again');
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (/CHECK constraint/.test(String(error))) throw new ApiError(409, 'access_policy_changed', 'Choose active values from this workspace; owner authority or a value changed');
    throw error;
  }
  return parsePolicy((await ctx.env.DB.prepare('SELECT * FROM work_access_policies WHERE workspace_id=? AND id=?').bind(w, policyId).first<PolicyRow>())!);
}
