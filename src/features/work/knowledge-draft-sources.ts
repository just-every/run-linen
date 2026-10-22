import { requireDepartmentStaff } from './department-operations';
import { ApiError } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { getService } from '../services/store';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import { workReadable } from './scope';

export interface DraftGuard {
  table: 'work_records' | 'svc_records'; id: string; revision: number;
  /** Exact SQL projection, including the public-message set for ticket sources. */
  projection: string;
}
export interface DraftSource {
  type: 'ticket' | 'known-error'; id: string; revision: number; fingerprint: string;
  title: string; content: string; guards: DraftGuard[];
}
export const sourceCitation = (s: Pick<DraftSource, 'type' | 'id'>) => `${s.type}:${s.id}`;
export const sourceHref = (s: Pick<DraftSource, 'type' | 'id'>) => `#/${s.type === 'ticket' ? 'work' : 'problems'}/${encodeURIComponent(s.id)}`;
const unavailable = () => new ApiError(409, 'knowledge_sources_changed', 'A source changed, reopened, was erased or is no longer eligible. Detect a current candidate before generating or publishing.');

// These projections are used unchanged both at read time and inside the effect transaction.
const ticketProjection = `json_object('revision',r.revision,'title',r.title,'state',r.state,'sensitivity',r.sensitivity,
  'departmentId',r.department_id,'requester',r.requester_id,'beneficiary',r.beneficiary_id,'closedAt',r.closed_at,'context',r.context_json,
  'messages',json((SELECT json_group_array(json_object('id',m.id,'author',m.author_id,'body',m.body,'sourceKey',m.source_key,'at',m.created_at))
    FROM (SELECT * FROM work_messages WHERE workspace_id=r.workspace_id AND work_id=r.id AND visibility='public' ORDER BY created_at,id) m)))`;
const serviceProjection = `json_object('revision',r.revision,'kind',r.kind,'visibility',r.visibility,'owner',r.owner_id,'participants',r.participants_json,'data',r.data_json)`;
const projection = (table: DraftGuard['table']) => table === 'work_records' ? ticketProjection : serviceProjection;

export async function knowledgeDraftActor(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  return ctx;
}
async function captureGuard(ctx: WorkContext, table: DraftGuard['table'], key: string) {
  if (table === 'svc_records') await getService(ctx.env.DB, ctx.principal, key);
  const row = await ctx.env.DB.prepare(`SELECT r.revision,${projection(table)} projection FROM ${table} r WHERE r.workspace_id=? AND r.id=?`)
    .bind(ctx.principal.workspaceId, key).first<{revision:number;projection:string}>();
  if (!row) throw unavailable();
  if (table === 'work_records') {
    const work = JSON.parse(row.projection);
    if(ctx.principal.roles.some(r=>['owner','operator','hr'].includes(r)))await requireDepartmentStaff(ctx,work.departmentId);
    if (!workReadable(ctx.principal, { department_id:work.departmentId,sensitivity: work.sensitivity, requester_id: work.requester, beneficiary_id: work.beneficiary }))
      throw new ApiError(404, 'not_found', 'Knowledge source unavailable');
  }
  return { table, id: key, revision: row.revision, projection: row.projection };
}
function assertPublicTicket(g: DraftGuard, resolved: boolean) {
  const r = JSON.parse(g.projection);
  if (r.sensitivity !== 'normal' || r.title === '[erased]' || (resolved && (r.state !== 'closed' || !r.closedAt)) ||
      !Array.isArray(r.messages) || !r.messages.length || r.messages.some((m: any) => m.body === '[erased]')) throw unavailable();
  return r;
}
function assertNonrestricted(g: DraftGuard) {
  const r = JSON.parse(g.projection);
  if (!['workspace','operators'].includes(r.visibility) || r.data.includes('[erased]')) throw unavailable();
  return { ...r, data: JSON.parse(r.data) };
}
/** Content sent to the model is exclusively public ticket messages or reviewed known-error fields.
 * Private messages and attachments are never selected. Dependency guards never enter the prompt. */
export async function captureDraftSource(ctx: WorkContext, type: DraftSource['type'], key: string): Promise<DraftSource> {
  const guard = await captureGuard(ctx, type === 'ticket' ? 'work_records' : 'svc_records', key);
  let title: string, content: string;
  const guards = [guard];
  if (type === 'ticket') {
    const work = assertPublicTicket(guard, true);
    title = work.title;
    content = work.messages.map((m: any) => m.body).join('\n\n');
    const context = JSON.parse(work.context || '{}');
    if (typeof context.serviceId === 'string') {
      const dependency = await captureGuard(ctx, 'svc_records', context.serviceId);
      if (assertNonrestricted(dependency).kind !== 'service') throw unavailable();
      guards.push(dependency);
    }
  } else {
    const problem = assertNonrestricted(guard), data = problem.data;
    if (problem.kind !== 'problem' || data.causeState !== 'known-error' || !data.reviewedBy ||
      !Number.isFinite(Date.parse(data.reviewedAt)) || typeof data.cause !== 'string' || !data.cause.trim()) throw unavailable();
    title = String(data.title);
    content = JSON.stringify({ symptoms: data.symptoms || '', cause: data.cause, reviewedAt: data.reviewedAt });
    // A reviewed label cannot launder restricted or missing upstream evidence.
    const tickets = new Set<string>([...(data.ticketIds || []), ...(data.evidence || []).filter((e: any) => e.type === 'ticket').map((e: any) => e.id)]);
    const services = new Set<string>([data.serviceId, ...(data.serviceIds || []), ...(data.incidentIds || []),
      ...(data.alertIncidentIds || []), ...(data.evidence || []).flatMap((e: any) => [e.type === 'alert' ? e.id : null, e.serviceId])].filter((v):v is string => typeof v === 'string' && !!v));
    for (const ticket of tickets) {
      const dependency = await captureGuard(ctx, 'work_records', ticket);
      assertPublicTicket(dependency, false); guards.push(dependency);
    }
    for (const service of services) {
      const dependency = await captureGuard(ctx, 'svc_records', service);
      assertNonrestricted(dependency); guards.push(dependency);
    }
  }
  const fingerprint = await hashToken(JSON.stringify(guards));
  return { type, id: key, revision: guard.revision, fingerprint, title, content, guards };
}
/** Published articles can have an employee audience; source eligibility is independent of that
 * audience. This function returns no source content and never grants source-record readership. */
export async function recheckDraftSources(ctx: WorkContext, sources: DraftSource[]) {
  if (!Array.isArray(sources) || !sources.length || sources.length > 100) throw unavailable();
  for (const source of sources) {
    const current = await captureDraftSource(ctx, source.type, source.id);
    if (current.fingerprint !== source.fingerprint || current.title !== source.title || current.content !== source.content ||
        JSON.stringify(current.guards) !== JSON.stringify(source.guards)) throw unavailable();
  }
}
/** Membership and every projected source are fenced in the same D1 transaction as the effect. */
export async function knowledgeDraftFence(ctx: WorkContext, sources: DraftSource[]) {
  await knowledgeDraftActor(ctx);
  await recheckDraftSources(ctx, sources);
  const sql = ["EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1 AND EXISTS(SELECT 1 FROM json_each(roles_json) WHERE value IN ('owner','operator')))"];
  const values: (string | number)[] = [ctx.principal.workspaceId, ctx.principal.userId];
  const guards = new Map(sources.flatMap(s => s.guards).map(g => [g.table + ':' + g.id, g]));
  sql.push(`NOT EXISTS(SELECT 1 FROM json_each(?) g JOIN work_records r ON r.workspace_id=? AND r.id=json_extract(g.value,'$.id') WHERE r.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.workspace_id=r.workspace_id AND m.user_id=? AND m.active=1 AND (EXISTS(SELECT 1 FROM json_each(m.roles_json) WHERE value='owner') OR EXISTS(SELECT 1 FROM work_department_members dm JOIN work_departments d ON d.workspace_id=dm.workspace_id AND d.id=dm.department_id WHERE dm.workspace_id=m.workspace_id AND dm.user_id=m.user_id AND dm.department_id=r.department_id AND dm.active=1 AND d.active=1))))`);
  values.push(JSON.stringify([...guards.values()].filter(g=>g.table==='work_records')),ctx.principal.workspaceId,ctx.principal.userId);
  for (const table of ['work_records','svc_records'] as const) {
    sql.push(`NOT EXISTS(SELECT 1 FROM json_each(?) g WHERE NOT EXISTS(SELECT 1 FROM ${table} r WHERE r.workspace_id=? AND r.id=json_extract(g.value,'$.id') AND ${projection(table)}=json_extract(g.value,'$.projection')))`);
    values.push(JSON.stringify([...guards.values()].filter(g => g.table === table)), ctx.principal.workspaceId);
  }
  return { sql: sql.join(' AND '), values };
}
/** The parent wires this into all native KB read and edit doors. */
export async function assertKnowledgeArticleSources(ctx: WorkContext, articleId: string) {
  await currentWorkPrincipal(ctx);
  const article=await ctx.env.DB.prepare('SELECT scope,department_id FROM work_knowledge WHERE workspace_id=? AND id=?').bind(ctx.principal.workspaceId,articleId).first<{scope:string;department_id:string|null}>();
  if(article && article.scope!=='employees')await requireDepartmentStaff(ctx,article.department_id);
  const row = await ctx.env.DB.prepare('SELECT state,sources_json FROM work_knowledge_drafts WHERE workspace_id=? AND article_id=?')
    .bind(ctx.principal.workspaceId, articleId).first<{state:string;sources_json:string}>();
  if (row) {
    try {
      if (row.state !== 'published') throw unavailable();
      const sources:DraftSource[]=JSON.parse(row.sources_json);
      await recheckDraftSources(ctx, sources);
      return sources.map(s=>({type:s.type,id:s.id,title:s.title,href:sourceHref(s),citation:sourceCitation(s)}));
    } catch (error) {
      if (!(error instanceof ApiError) || ![403,404,409].includes(error.status)) throw error;
      throw new ApiError(404, 'not_found', 'Current knowledge sources unavailable');
    }
  }
  return [];
}
