// Paid provider edge only. The adoption test uses the real connection and model routes.
const providerFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.hostname !== 'api.openai.com') return providerFetch(input, init);
  if (url.pathname.startsWith('/v1/models/')) return Response.json({ id: decodeURIComponent(url.pathname.split('/').at(-1)!) });
  const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.input);
  if (packet.purpose !== 'knowledge_article_draft') throw new Error('Unexpected paid-provider request in native knowledge archive test');
  const value = { title: 'Network session guidance', body: 'Use a fresh network session and check whether access returns. Keep unresolved work open.',
    citations: request.text.format.schema.properties.citations.items.enum };
  return Response.json({ status: 'completed', usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
}) as typeof fetch;
