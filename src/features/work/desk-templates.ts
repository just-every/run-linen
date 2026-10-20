import { ApiError, id, now, requiredString } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';

/** DESK-015: ticket record templates. Agents save them; anyone in the workspace reads one as the draft of a new ticket,
 * which they may change before submitting it through the ordinary ticket door. */
const kinds = ['service_request', 'incident', 'question'];
interface TemplateRow { id: string; name: string; kind: string; title: string; body: string; context_json: string }
const template = (r: TemplateRow) => ({ id: r.id, name: r.name, draft: { kind: r.kind, title: r.title, body: r.body, context: JSON.parse(r.context_json) } });

export async function saveRecordTemplate(ctx: WorkContext, body: Record<string, unknown>) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner', 'operator']);
  const name = requiredString(body.name, 'name', 120), kind = body.kind;
  if (!kinds.includes(kind as string)) throw new ApiError(422, 'template_kind', 'A ticket template is a service request, incident or question');
  const context = body.context ?? {};
  if (typeof context !== 'object' || Array.isArray(context) || !Object.values(context as object).every((v) => typeof v === 'string' && v.length <= 2000))
    throw new ApiError(422, 'template_context', 'Template details are named text values');
  const templateId = id();
  const saved = await ctx.env.DB.prepare('INSERT OR IGNORE INTO work_record_templates(id,workspace_id,name,kind,title,body,context_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(templateId, ctx.principal.workspaceId, name, kind, requiredString(body.title, 'title', 300), requiredString(body.body, 'body', 10000),
      JSON.stringify(context), ctx.principal.userId, now()).run();
  if (!saved.meta.changes) throw new ApiError(409, 'template_exists', 'A template with this name exists');
  return readRecordTemplate(ctx, templateId);
}

export async function listRecordTemplates(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  return { items: (await ctx.env.DB.prepare('SELECT * FROM work_record_templates WHERE workspace_id=? ORDER BY name')
    .bind(ctx.principal.workspaceId).all<TemplateRow>()).results.map(template) };
}

export async function readRecordTemplate(ctx: WorkContext, templateId: string) {
  await currentWorkPrincipal(ctx);
  const row = await ctx.env.DB.prepare('SELECT * FROM work_record_templates WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId, templateId).first<TemplateRow>();
  if (!row) throw new ApiError(404, 'template_not_found', 'Template not found');
  return template(row);
}
