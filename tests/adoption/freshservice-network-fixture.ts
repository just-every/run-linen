import type { Hono } from 'hono';
import { ApiError } from '../../src/platform/http';
import type { AppEnv } from '../../src/platform/types';
import type { FreshTicket } from '../../src/features/adoption/freshservice';

interface FixtureRecord {
  ticket: FreshTicket;
  conversations: { id: number; private: boolean; body: string; [key: string]: unknown }[];
  approvalGroups: { id: number; approval_status: { id: number; name: string } }[];
}
interface NetworkCall {
  method: string;
  path: string;
  ticketId?: number;
  since?: string;
  workspace?: number;
  page?: number;
}
interface FixtureState {
  workspaceId: string;
  records: FixtureRecord[];
  calls: NetworkCall[];
}
const fixtures = new Map<string, FixtureState>();
let installed = false;
const credentialPattern = /^synthetic-linen-[1-9]\d*$/;
const refusal = (code: string, status = 400) => Response.json({ error: code }, { status });

function credential(headers: Headers) {
  const encoded = headers.get('Authorization')?.match(/^Basic ([A-Za-z0-9+/=]+)$/)?.[1];
  if (!encoded) return undefined;
  try {
    const decoded = atob(encoded);
    if (!decoded.endsWith(':X')) return undefined;
    const key = decoded.slice(0, -2);
    return credentialPattern.test(key) ? key : undefined;
  } catch { return undefined; }
}

function pageQuery(url: URL, perPage: number, names: string[]) {
  if ([...url.searchParams.keys()].some(key => !names.includes(key))) return undefined;
  if (names.some(key => url.searchParams.getAll(key).length !== 1)) return undefined;
  const page = Number(url.searchParams.get('page'));
  if (!Number.isSafeInteger(page) || page < 1 || url.searchParams.get('per_page') !== String(perPage)) return undefined;
  return page;
}

function providerResponse(url: URL, method: string, state: FixtureState): Response {
  if (method !== 'GET') return refusal('unexpected_fixture_method', 405);
  if (url.pathname === '/api/v2/tickets') {
    const page = pageQuery(url, 25, ['workspace_id', 'updated_since', 'page', 'per_page']);
    const workspace = Number(url.searchParams.get('workspace_id'));
    const since = url.searchParams.get('updated_since') || '';
    if (!page || !Number.isSafeInteger(workspace) || workspace < 1 || !Number.isFinite(Date.parse(since))) return refusal('invalid_fixture_ticket_query');
    state.calls.push({ method, path: url.pathname, workspace, since, page });
    const tickets = state.records.map(record => record.ticket)
      .filter(ticket => ticket.workspace_id === workspace && Date.parse(ticket.updated_at) >= Date.parse(since))
      .sort((a, b) => a.id - b.id).slice((page - 1) * 25, page * 25);
    return Response.json({ tickets });
  }
  const match = url.pathname.match(/^\/api\/v2\/tickets\/([1-9]\d*)(?:\/(conversations|approval-groups))?$/);
  if (!match) return refusal('unexpected_fixture_path', 404);
  const ticketId = Number(match[1]), record = state.records.find(row => row.ticket.id === ticketId);
  if (!record) return refusal('fixture_ticket_not_found', 404);
  if (match[2] === 'conversations') {
    const page = pageQuery(url, 100, ['page', 'per_page']);
    if (!page) return refusal('invalid_fixture_conversation_query');
    state.calls.push({ method, path: url.pathname, ticketId, page });
    return Response.json({ conversations: record.conversations.slice((page - 1) * 100, page * 100) });
  }
  if (url.search) return refusal('unexpected_fixture_query');
  state.calls.push({ method, path: url.pathname, ticketId });
  return match[2] === 'approval-groups'
    ? Response.json({ approval_groups: record.approvalGroups })
    : Response.json({ ticket: record.ticket });
}

/** Only this exact synthetic provider host is intercepted; all application work stays real. */
export function installFreshserviceNetworkFixture() {
  if (installed) return;
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname !== 'fixture.freshservice.com') return original(input, init);
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return refusal('invalid_fixture_origin');
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const key = credential(headers);
    if (!key) return refusal('fixture_credential_required', 401);
    const state = fixtures.get(key);
    if (!state) return refusal('fixture_not_configured', 503);
    if (init?.redirect !== 'manual') return refusal('fixture_redirect_policy_required');
    return providerResponse(url, (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase(), state);
  }) as typeof fetch;
}

function records(value: unknown): FixtureRecord[] {
  if (!Array.isArray(value) || value.length > 100) throw new ApiError(400, 'invalid_fixture_records', 'Expected synthetic provider records');
  const ids = new Set<number>();
  for (const row of value) {
    const ticket = row?.ticket;
    if (!Number.isSafeInteger(ticket?.id) || ticket.id < 1 || ids.has(ticket.id)
      || !Number.isSafeInteger(ticket.workspace_id) || ticket.workspace_id < 1
      || !Number.isFinite(Date.parse(ticket.updated_at))
      || !Array.isArray(row.conversations) || !row.conversations.every((note: any) => Number.isSafeInteger(note.id) && typeof note.private === 'boolean' && typeof note.body === 'string')
      || !Array.isArray(row.approvalGroups) || !row.approvalGroups.every((group: any) => Number.isSafeInteger(group.id) && Number.isSafeInteger(group.approval_status?.id))) {
      throw new ApiError(400, 'invalid_fixture_records', 'Expected synthetic provider records');
    }
    ids.add(ticket.id);
  }
  return structuredClone(value);
}

/** Protected controls change network-edge state only, never adoption or connection rows. */
export function registerFreshserviceNetworkFixture(api: Hono<AppEnv>) {
  for (const method of ['post', 'put'] as const) {
    api[method]('/fixtures/freshservice-network', async c => {
      const principal = c.get('principal');
      const member = await c.env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1')
        .bind(principal.workspaceId, principal.userId).first<{ roles_json: string }>();
      if (!member || !JSON.parse(member.roles_json).includes('owner')) throw new ApiError(403, 'forbidden', 'Owner required');
      const body = await c.req.json<{ credential: string; records: unknown; inspect?: boolean }>();
      if (typeof body.credential !== 'string' || !credentialPattern.test(body.credential)) throw new ApiError(400, 'invalid_fixture_credential', 'Use a synthetic Linen fixture credential');
      const prior = fixtures.get(body.credential);
      if (prior && prior.workspaceId !== principal.workspaceId) throw new ApiError(404, 'fixture_not_found', 'Fixture not found');
      if (body.inspect === true) {
        if (!prior) throw new ApiError(404, 'fixture_not_found', 'Fixture not found');
        return c.json({ calls: prior.calls });
      }
      if (method === 'put' && !prior) throw new ApiError(404, 'fixture_not_found', 'Fixture not found');
      fixtures.set(body.credential, { workspaceId: principal.workspaceId, records: records(body.records), calls: prior?.calls ?? [] });
      return c.json({ configured: true });
    });
  }
}
