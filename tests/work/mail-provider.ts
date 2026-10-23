import type { Hono } from 'hono';
import type { AppEnv } from '../../src/platform/types';
// TEST ONLY: the Gmail, Microsoft Graph, OAuth token and public DNS network edges. The product code under test is unmodified.
interface State { rc: unknown[]; profile: string; gmail: Record<string, string>; graph: Record<string, string>; dns: Record<string, string[]>; tokenStatus: number; sendStatus: number }
const fresh = (): State => ({ rc: [], profile: '', gmail: {}, graph: {}, dns: {}, tokenStatus: 200, sendStatus: 0 });
let state = fresh();
const calls: Record<string, unknown>[] = [];
export async function mailProvider(url: URL, init?: RequestInit): Promise<Response | null> {
  const body = typeof init?.body === 'string' ? init.body : init?.body instanceof URLSearchParams ? init.body.toString() : '';
  const auth = new Headers(init?.headers).get('authorization');
  if (url.hostname === 'oauth2.googleapis.com' || url.hostname === 'login.microsoftonline.com') {
    calls.push({ kind: 'token', host: url.hostname, grant: new URLSearchParams(body).get('grant_type') });
    return state.tokenStatus === 200 ? Response.json({ access_token: 'synthetic-linen-9300' }) : new Response('denied', { status: state.tokenStatus });
  }
  if (url.hostname === 'platform.devtest.ringcentral.com') {
    if (url.pathname.endsWith('/oauth/token')) { calls.push({ kind: 'rc-token', grant: new URLSearchParams(body).get('grant_type'), basic: new Headers(init?.headers).get('authorization')?.startsWith('Basic ') }); return state.tokenStatus === 200 ? Response.json({ access_token: 'synthetic-linen-9301' }) : new Response('denied', { status: state.tokenStatus }); }
    if (new Headers(init?.headers).get('authorization') !== 'Bearer synthetic-linen-9301') return new Response('unauthenticated', { status: 401 });
    if (url.pathname.endsWith('/extension/~')) return Response.json({ id: 1234, account: { id: 5678 } });
    if (url.pathname.endsWith('/call-log')) { calls.push({ kind: 'rc-log', direction: url.searchParams.get('direction'), recordings: url.searchParams.get('withRecording') }); return Response.json({ records: state.rc }); }
    return new Response('missing', { status: 404 });
  }
  if (url.hostname === 'cloudflare-dns.com') {
    const name = url.searchParams.get('name')!, type = url.searchParams.get('type')!, values = state.dns[`${type}:${name}`];
    if (!values) return Response.json({ Status: 3 });
    return Response.json({ Status: 0, Answer: values.map(data => ({ name: name + '.', type: type === 'TXT' ? 16 : 5, data: type === 'TXT' ? JSON.stringify(data) : data })) });
  }
  if (url.hostname !== 'gmail.googleapis.com' && url.hostname !== 'graph.microsoft.com') return null;
  if (auth !== 'Bearer synthetic-linen-9300') return new Response('unauthenticated', { status: 401 });
  const path = decodeURIComponent(url.pathname);
  if (url.hostname === 'gmail.googleapis.com') {
    if (path.endsWith('/profile')) return Response.json({ emailAddress: state.profile });
    if (path.endsWith('/messages/send')) {
      calls.push({ kind: 'gmail-send', raw: JSON.parse(body).raw });
      return state.sendStatus ? new Response('x', { status: state.sendStatus }) : Response.json({ id: 'synthetic-linen-9301' });
    }
    if (path.endsWith('/messages')) { calls.push({ kind: 'gmail-list', q: url.searchParams.get('q') }); return Response.json({ messages: Object.keys(state.gmail).reverse().map(id => ({ id })) }); }
    const id = path.split('/messages/')[1];
    return state.gmail[id] ? Response.json({ id, raw: state.gmail[id] }) : new Response('missing', { status: 404 });
  }
  if (path.endsWith('/mailFolders/inbox')) return Response.json({ id: 'synthetic-linen-9302' });
  if (path.endsWith('/sendMail')) {
    calls.push({ kind: 'graph-send', contentType: new Headers(init?.headers).get('content-type'), raw: body, path });
    return new Response(null, { status: state.sendStatus || 202 });
  }
  if (path.endsWith('/messages')) { calls.push({ kind: 'graph-list', filter: url.searchParams.get('$filter') }); return Response.json({ value: Object.keys(state.graph).map(id => ({ id })) }); }
  const id = path.split('/messages/')[1]?.replace('/$value', '');
  return state.graph[id] ? new Response(state.graph[id]) : new Response('missing', { status: 404 });
}
export function registerMailProvider(app: Hono<AppEnv>) {
  app.get('/test/mail', c => c.json({ calls }));
  app.post('/test/mail', async c => {
    const b = await c.req.json();
    if (b.reset) { state = fresh(); calls.length = 0; }
    state = { ...state, ...Object.fromEntries(Object.entries(b).filter(([k]) => k in state)) };
    for (const key of ['gmail', 'graph'] as const) if (b['add' + key]) Object.assign(state[key], b['add' + key]);
    return c.json({ ok: true });
  });
}
