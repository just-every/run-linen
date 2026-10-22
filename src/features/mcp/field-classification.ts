import type { Hono } from 'hono';
import type { AppEnv, Env } from '../../platform/types';
import { ApiError, jsonBody, now } from '../../platform/http';
import { currentOwner } from './credentials';

export interface ClassifiedDropdown {
  id: string;
  name: string;
  options_json: string;
  kinds_json: string;
}

/** Closed to dropdowns even if a future schema adds more custom field types.
 * Each new type must implement classification and value projection explicitly. */
export async function classifiedDropdowns(env: Env, workspaceId: string) {
  return (await env.DB.prepare(`SELECT id,name,options_json,kinds_json FROM work_custom_fields
    WHERE workspace_id=? AND privacy_class='nonpersonal' AND field_type='dropdown'
    AND privacy_classified_by IS NOT NULL AND privacy_classified_at IS NOT NULL ORDER BY id`)
    .bind(workspaceId).all<ClassifiedDropdown>()).results;
}

export function dropdownValue(field: ClassifiedDropdown, value: unknown): string | null | undefined {
  if (value === null) return null;
  const options: unknown = JSON.parse(field.options_json);
  return typeof value === 'string' && Array.isArray(options) && options.includes(value) ? value : undefined;
}

/** Mounted under the existing session-authenticated /api/v1 router, never MCP.
 * The database rechecks current owner authority and appends the audit in the
 * same write. Neither the request nor the audit contains field values. */
export function registerMcpFieldClassificationRoutes(app: Hono<AppEnv>) {
  app.post('/mcp-fields/:id/classification', async c => {
    c.header('Cache-Control', 'no-store');
    const p = await currentOwner(c), input = await jsonBody(c), fieldId = c.req.param('id');
    if (Object.keys(input).some(key => key !== 'nonpersonal') || typeof input.nonpersonal !== 'boolean')
      throw new ApiError(422, 'field_classification_invalid', 'Supply a nonpersonal boolean');
    const field = await c.env.DB.prepare('SELECT field_type FROM work_custom_fields WHERE workspace_id=? AND id=?')
      .bind(p.workspaceId, fieldId).first<{ field_type: string }>();
    if (!field) throw new ApiError(404, 'not_found', 'Field not found');
    if (input.nonpersonal && !['dropdown','multiselect','number','boolean','date'].includes(field.field_type))
      throw new ApiError(422, 'field_type_personal', 'Only dropdown, multiselect, number, boolean and date fields can be classified nonpersonal');
    let result: D1Result;
    try {
      result = await c.env.DB.prepare(`UPDATE work_custom_fields SET privacy_class=?,privacy_classified_by=?,privacy_classified_at=?
        WHERE workspace_id=? AND id=? AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
          WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND r.value='owner')`)
        .bind(input.nonpersonal ? 'nonpersonal' : 'personal', p.userId, now(), p.workspaceId, fieldId, p.workspaceId, p.userId).run();
    } catch (error) {
      if (String(error).includes('mcp_field_type_personal'))
        throw new ApiError(422, 'field_type_personal', 'Only dropdown, multiselect, number, boolean and date fields can be classified nonpersonal');
      if (String(error).includes('mcp_field_owner_required'))
        throw new ApiError(403, 'owner_required', 'Current owner required');
      throw error;
    }
    if (!result.meta.changes) {
      await currentOwner(c);
      throw new ApiError(404, 'not_found', 'Field not found');
    }
    return c.json({ id: fieldId, nonpersonal: input.nonpersonal });
  });
}
