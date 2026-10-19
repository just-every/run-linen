import app from './worker';
import { responseProvider, registerResponseProvider } from './response-provider';
registerResponseProvider(app);
// Paid provider interception is confined to this test Worker. Product classification uses callModel.
const providerFetch = globalThis.fetch;
let release: (() => void) | null = null;
let waiting = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  if (url.hostname !== 'api.openai.com') return providerFetch(input, init);
  const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.input);
  if (['ticket_reply','ticket_summary'].includes(packet.purpose)) return responseProvider(packet);
  if (packet.purpose !== 'ticket_classification') throw new Error('Unexpected model request in classification test');
  if (packet.request.includes('Delay provider')) {
    waiting = true;
    await new Promise<void>(resolve => { release = resolve; });
    waiting = false;
  }
  if (packet.request.includes('Lose provider')) throw new Error('Fixture paid provider transport unavailable');
  const value = packet.request.includes('Invalid provider') ? { type: 'incident', category: 'network', subcategory: 'printer', impact: 'high', urgency: 'high', reason: 'Invalid category pairing' }
    : packet.request.includes('How do I') ? { type: 'question', category: 'general', subcategory: 'guidance', impact: 'low', urgency: 'low', reason: 'The employee asks for instructions; no interruption or immediate deadline is reported.' }
    : packet.request.includes('New laptop') ? { type: 'service_request', category: 'hardware', subcategory: 'laptop', impact: 'low', urgency: 'medium', reason: 'The employee requests new equipment for an upcoming start; this is individual fulfillment, not an outage.' }
    : { type: 'incident', category: 'network', subcategory: 'vpn', impact: 'high', urgency: 'high', reason: '“VPN down for whole Denver office” reports an office-wide interruption and work blocked now. Impact is reported, not independently verified.' };
  return Response.json({ status: 'completed', usage: { input_tokens: 120, output_tokens: 70, total_tokens: 190 }, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
}) as typeof fetch;
app.get('/test/classification-provider', c => c.json({ waiting }));
app.post('/test/classification-provider/release', c => { release?.(); release = null; return c.json({ released: true }); });
export default app;
