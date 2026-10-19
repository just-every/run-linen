import type { Hono } from 'hono';
import type { AppEnv } from '../../src/platform/types';
let mode = 'normal', release: (() => void) | null = null, waiting = false;
let last: { purpose: string; sources: any[] } | null = null;
export async function responseProvider(packet: any) {
  const sources = JSON.parse(packet.request.slice(packet.request.indexOf('\n') + 1));
  last = { purpose: packet.purpose, sources };
  if (mode === 'delay') { waiting = true; await new Promise<void>(resolve => { release = resolve; }); waiting = false; }
  if (mode === 'failure') throw new Error('Paid provider unavailable');
  const citations = mode === 'invalid' ? ['message:invented'] : sources.map((s: any) => s.id);
  const value = { text: packet.purpose === 'ticket_summary' ? 'Twenty messages describe VPN failures and a reviewed restart workaround. The ticket remains unresolved.' : 'Please follow the reviewed VPN restart guidance; tell us if the connection still fails.', citations };
  return Response.json({ status: 'completed', usage: { input_tokens: 150, output_tokens: 100, total_tokens: 250 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
}
export function registerResponseProvider(app: Hono<AppEnv>) {
  app.get('/test/response-provider', c => c.json({ waiting, last }));
  app.post('/test/response-provider', async c => { mode = (await c.req.json()).mode; return c.json({ mode }); });
  app.post('/test/response-provider/release', c => { release?.(); release = null; return c.json({ released: true }); });
}
