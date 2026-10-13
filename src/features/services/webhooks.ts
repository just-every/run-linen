import type { Hono } from 'hono';
import type { AppEnv, Principal } from '../../platform/types';
import { ApiError } from '../../platform/http';
import { ingestMonitoring } from './integrations';
import type { RecordRow } from './store';
/** Public adapter: the signed event selects no tenant or principal. Stored monitor custody does. */
export function registerServiceWebhooks(app: Hono<AppEnv>) {
    app.post('/webhooks/monitoring/:id', async (c) => {
        const row = await c.env.DB.prepare("SELECT * FROM svc_records WHERE id=? AND kind='monitor'").bind(c.req.param('id')).first<RecordRow>();
        if (!row)
            throw new ApiError(404, 'not_found', 'Monitor not found');
        const data = JSON.parse(row.data_json), userId = data.ingestionPrincipalId || row.owner_id;
        const member = await c.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(row.workspace_id, userId).first<{
            roles_json: string;
        }>();
        if (!member)
            throw new ApiError(403, 'integration_revoked', 'Monitor integration principal is inactive');
        const principal: Principal = { userId, workspaceId: row.workspace_id, roles: JSON.parse(member.roles_json) };
        return c.json(await ingestMonitoring(c.env, principal, row.id, await c.req.text(), c.req.header('X-Linen-Timestamp') || '', c.req.header('X-Linen-Signature') || ''));
    });
}
