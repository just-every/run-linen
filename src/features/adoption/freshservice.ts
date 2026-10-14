import { decryptSecret } from '../../platform/crypto';
import { ApiError } from '../../platform/http';
import { check, type AdoptionContext } from './core';
export interface FreshTicket {
    id: number;
    updated_at: string;
    workspace_id: number;
    requester_id: number;
    subject: string;
    description: string;
    status: number;
    [key: string]: unknown;
}
export class Freshservice {
    constructor(private domain: string, private apiKey: string, private transport: typeof fetch = fetch) { check(/^[a-z0-9][a-z0-9-]*\.freshservice\.com$/.test(domain), 'freshservice_domain_invalid'); }
    async request(path: string, method = 'GET', body?: unknown) {
        check(/^\/api\/v2\/[a-z0-9/?=&_.:%-]+$/i.test(path), 'provider_path_invalid');
        const response = await this.transport(`https://${this.domain}${path}`, { method, redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Authorization: `Basic ${btoa(this.apiKey + ':X')}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!response.ok)
            throw new ApiError(response.status === 429 ? 503 : 502, response.status === 429 ? 'source_rate_limited' : 'source_request_failed', 'Freshservice could not be reached; try again later');
        check(Number(response.headers.get('content-length') || 0) <= 8 * 1024 * 1024, 'provider_response_too_large');
        const text = await response.text();
        check(text.length <= 8 * 1024 * 1024, 'provider_response_too_large');
        let data: any;
        try {
            data = JSON.parse(text);
        }
        catch {
            throw new ApiError(502, 'source_invalid_json', 'Freshservice answered with something Linen could not read');
        }
        return data;
    }
    async tickets(workspace: number, since: string, page: number) {
        const data = await this.request(`/api/v2/tickets?workspace_id=${workspace}&updated_since=${encodeURIComponent(since)}&page=${page}&per_page=25`);
        check(Array.isArray(data.tickets), 'source_schema_invalid', 502);
        for (const t of data.tickets)
            check(Number.isInteger(t.id) && t.workspace_id === workspace && Number.isFinite(Date.parse(t.updated_at)), 'source_scope_invalid', 502);
        return data.tickets as FreshTicket[];
    }
    async ticket(ticketId: number, workspace: number) { const { ticket } = await this.request(`/api/v2/tickets/${ticketId}`); check(ticket?.id === ticketId && ticket.workspace_id === workspace, 'source_scope_invalid', 502); return ticket as FreshTicket; }
    async conversations(ticketId: number, page = 1) { const { conversations } = await this.request(`/api/v2/tickets/${ticketId}/conversations?page=${page}&per_page=100`); check(Array.isArray(conversations) && conversations.every((x: any) => typeof x.private === 'boolean' && Number.isInteger(x.id)), 'source_conversation_invalid', 502); return conversations as any[]; }
    async approvals(ticketId: number) {
        const { approval_groups } = await this.request(`/api/v2/tickets/${ticketId}/approval-groups`);
        check(Array.isArray(approval_groups) && approval_groups.every((g: any) => Number.isInteger(g.id) && Number.isInteger(g.approval_status?.id)), 'source_approval_invalid', 502);
        return approval_groups as {
            id: number;
            approval_status: {
                id: number;
                name: string;
            };
        }[];
    }
    async note(ticketId: number, body: string) { const result = await this.request(`/api/v2/tickets/${ticketId}/notes`, 'POST', { body, private: true }); check(Number.isInteger(result.conversation?.id), 'source_writeback_unknown', 502); return String(result.conversation.id); }
}
export async function configuredFreshservice(ctx: AdoptionContext, connectionId: string) { const connection = await ctx.env.DB.prepare('SELECT * FROM connections WHERE workspace_id=? AND id=? AND provider=?').bind(ctx.principal.workspaceId, connectionId, 'freshservice').first<any>(); check(connection && connection.secret_ciphertext && connection.status !== 'disabled', 'freshservice_not_configured', 503); const config = JSON.parse(connection.config_json); check(typeof config.domain === 'string', 'freshservice_not_configured', 503); const secret = await decryptSecret(ctx.env.ENCRYPTION_KEY, connection.secret_ciphertext); check(secret.length > 0 && secret.length < 4096, 'freshservice_credential_invalid', 503); return new Freshservice(config.domain, secret); }
