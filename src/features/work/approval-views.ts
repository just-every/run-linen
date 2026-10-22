import {approvalCostCents} from './approval-cost';
import { ApiError, id, now } from '../../platform/http';
import type { WorkContext, WorkRecord } from './core';
import { getWork } from './core';
import { currentWorkPrincipal } from './identity';
import { managerHolder, managerStageApproved } from './fulfilment-authority';
import { chainStatus } from './approval-stages';

/** The chain as its readers see it: stages, who may decide, what was decided, through which channel, and the timers. */
export async function approvalChain(ctx: WorkContext, workId: string, catalogId: string) {
  const work = await getWork(ctx, workId), db = ctx.env.DB, w = ctx.principal.workspaceId;
  const f = await db.prepare('SELECT * FROM work_fulfilments WHERE workspace_id=? AND work_id=? AND catalog_id=?').bind(w, workId, catalogId).first<any>();
  const catalog = await db.prepare('SELECT * FROM work_catalog WHERE workspace_id=? AND id=?').bind(w, catalogId).first<any>();
  if (!f || !catalog) throw new ApiError(404, 'not_found', 'Fulfilment not found');
  const managerApproved = await managerStageApproved(ctx, work, catalog, f), manager = catalog.requires_manager ? await managerHolder(ctx, f) : null;
  const chain = await chainStatus(ctx, work, catalog, f, managerApproved);
  const names = new Map((await db.prepare('SELECT id,name FROM users WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...chain.stages.flatMap(s => [...s.approvers, ...s.decisions.map(d => d.approverId)]), ...(manager ? [manager] : [])])).all<{ id: string; name: string }>()).results.map(u => [u.id, u.name]));
  const managerTimer=await db.prepare("SELECT active_at,remind_at,reminded_at,sla_at,breached_at FROM work_approval_stages WHERE workspace_id=? AND fulfilment_id=? AND stage_key='manager'").bind(w,f.id).first();
  const staff = ctx.principal.roles.some(r => ['owner', 'operator', 'hr'].includes(r));
  return { manager: catalog.requires_manager ? { timer:managerTimer,state: managerApproved ? 'approved' : 'pending', holder: manager ? { id: manager, name: names.get(manager) ?? manager } : null } : null,
    stages: chain.stages.map(s => ({ key: s.key, name: s.name, mode: s.mode, state: s.state, applies: s.applies, approvers: staff ? s.approvers.map(a => ({ id: a, name: names.get(a) ?? a })) : undefined,
      decisions: s.decisions.map(d => ({ approver: names.get(d.approverId) ?? d.approverId, decision: d.decision, comment: d.comment, channel: d.channel, at: d.at })),
      activeAt: s.activeAt, remindAt: s.remindAt, remindedAt: s.remindedAt, slaAt: s.slaAt, breachedAt: s.breachedAt })), satisfied: managerApproved && chain.satisfied, rejected: chain.rejected };
}

/** The stage decisions the caller may take now, for their own approval queue. */
export async function listStageDecisions(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const db = ctx.env.DB, w = ctx.principal.workspaceId, items = [];
  const rows = (await db.prepare(`SELECT s.stage_key,s.definition_json,f.id fulfilment_id,f.work_id,f.catalog_id,f.revision f_revision,f.beneficiary_id,f.purpose,f.expires_at,f.catalog_snapshot_json,f.application_json,r.revision w_revision,r.title,r.requester_id,c.name catalog_name,c.revision c_revision,c.owner_id,c.requires_manager,c.approvals_json,c.target
    FROM work_approval_stages s JOIN work_fulfilments f ON f.workspace_id=s.workspace_id AND f.id=s.fulfilment_id JOIN work_records r ON r.workspace_id=f.workspace_id AND r.id=f.work_id
    JOIN work_catalog c ON c.workspace_id=f.workspace_id AND c.id=f.catalog_id
    WHERE s.workspace_id=? AND s.applies=1 AND r.state NOT IN ('closed','cancelled') AND (f.expires_at IS NULL OR f.expires_at>?) ORDER BY r.created_at LIMIT 300`).bind(w, now()).all<any>()).results;
  for (const row of rows) {
    const work = { id: row.work_id, revision: row.w_revision, state: 'open' } as WorkRecord, catalog = { id: row.catalog_id, owner_id: row.owner_id, revision: row.c_revision, approvals_json: row.approvals_json, requires_manager: row.requires_manager, target: row.target };
    const f = { id: row.fulfilment_id, revision: row.f_revision, beneficiary_id: row.beneficiary_id, application_json: row.application_json,purpose:row.purpose,expires_at:row.expires_at };
    const chain = await chainStatus(ctx, work, catalog, f, await managerStageApproved(ctx, work, { ...catalog }, f));
    const stage = chain.pending;
    if (!stage || stage.key !== row.stage_key || !stage.approvers.includes(ctx.principal.userId) || stage.decisions.some(d => d.approverId === ctx.principal.userId)) continue;
    const names = new Map((await db.prepare('SELECT id,name FROM users WHERE id IN (?,?)').bind(row.requester_id, row.beneficiary_id).all<{ id: string; name: string }>()).results.map(u => [u.id, u.name]));
    const quote = await db.prepare("SELECT id,name,size,sha256 FROM work_attachments WHERE workspace_id=? AND fulfilment_id=? AND visibility='catalog_quote'").bind(w, f.id).first<any>();
    const snapshot=row.catalog_snapshot_json?JSON.parse(row.catalog_snapshot_json):null,def=JSON.parse(row.definition_json);
    const costCents=snapshot?snapshot.approvalAmounts?.[def.key]?.cents??approvalCostCents(def,snapshot):null;
    items.push({ workId: row.work_id, title: row.title, catalogId: row.catalog_id, catalogName: row.catalog_name, stageKey: stage.key, stageName: stage.name, mode: stage.mode,
      beneficiaryName: names.get(row.beneficiary_id) ?? 'Unknown person', requesterName: names.get(row.requester_id) ?? 'Unknown person', purpose: row.purpose,
      expectedWorkRevision: row.w_revision, expectedFulfilmentRevision: row.f_revision, expectedCatalogRevision: row.c_revision, slaAt: stage.slaAt,remindAt:stage.remindAt,remindedAt:stage.remindedAt,breachedAt:stage.breachedAt,costCents, quote: quote ?? null });
  }
  return { items };
}
