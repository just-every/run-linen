import { ApiError, id, now, requiredString } from '../../platform/http';
import { conversation, permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';

const placeholders = ['requester.name', 'ticket.title', 'ticket.id'];
export function validateCannedBody(value: unknown) {
  const body = requiredString(value, 'Response text', 10000);
  const rest = body.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => {
    if (!placeholders.includes(key)) throw new ApiError(422, 'response_placeholder', 'Use requester.name, ticket.title or ticket.id placeholders');
    return '';
  });
  if (rest.includes('{{') || rest.includes('}}')) throw new ApiError(422, 'response_placeholder', 'Close each response placeholder with }}');
  return body;
}
async function agent(ctx: WorkContext) {
  await currentWorkPrincipal(ctx); permit(ctx, ['owner', 'operator']);
}
export async function listCannedResponses(ctx: WorkContext) {
  await agent(ctx);
  return { items: (await ctx.env.DB.prepare('SELECT * FROM work_canned_responses WHERE workspace_id=? ORDER BY title,id')
    .bind(ctx.principal.workspaceId).all()).results };
}
export async function saveCannedResponse(ctx: WorkContext, b: Record<string, unknown>) {
  await agent(ctx);
  const title = requiredString(b.title, 'Response title', 200), body = validateCannedBody(b.body), key = b.id ? requiredString(b.id, 'id') : id(), t = now();
  if (b.id && !Number.isInteger(b.revision)) throw new ApiError(422, 'revision', 'Current response revision required');
  const result = await ctx.env.DB.batch([
    b.id ? ctx.env.DB.prepare('UPDATE work_canned_responses SET title=?,body=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?')
      .bind(title, body, t, ctx.principal.workspaceId, key, b.revision as number)
      : ctx.env.DB.prepare('INSERT INTO work_canned_responses VALUES(?,?,?,?,1,?,?)').bind(key, ctx.principal.workspaceId, title, body, t, t),
    ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.canned_response_saved', key, JSON.stringify({ title }), t),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, 'response_conflict', 'Response changed; reload it before saving');
  return { id: key, revision: b.id ? Number(b.revision) + 1 : 1 };
}
export async function deleteCannedResponse(ctx: WorkContext, key: string, b: Record<string, unknown>) {
  await agent(ctx);
  if (!Number.isInteger(b.revision)) throw new ApiError(422, 'revision', 'Current response revision required');
  const result = await ctx.env.DB.batch([
    ctx.env.DB.prepare('DELETE FROM work_canned_responses WHERE workspace_id=? AND id=? AND revision=?').bind(ctx.principal.workspaceId, key, b.revision as number),
    ctx.env.DB.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()=1')
      .bind(id(), ctx.principal.workspaceId, ctx.principal.userId, 'work.canned_response_deleted', key, '{}', now()),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409, 'response_conflict', 'Response changed or is unavailable');
  return { deleted: true };
}
export async function insertCannedResponse(ctx: WorkContext, workId: string, b: Record<string, unknown>) {
  await agent(ctx);
  const detail = await conversation(ctx, workId), response = await ctx.env.DB.prepare('SELECT body,revision FROM work_canned_responses WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId, requiredString(b.templateId, 'templateId')).first<{ body: string; revision: number }>();
  if (!response || response.revision !== b.revision) throw new ApiError(409, 'response_conflict', 'Reload the current response before inserting it');
  const requester = await ctx.env.DB.prepare('SELECT name FROM users WHERE id=?').bind(detail.work.requester_id).first<{ name: string }>();
  const values: Record<string, unknown> = { 'requester.name': requester?.name, 'ticket.title': detail.work.title, 'ticket.id': workId };
  return { text: validateCannedBody(response.body).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => requiredString(values[key], `Value for ${key}`, 50000)), sent: false };
}
