import app from './worker';
// Paid/network edge only. Production source and model validation are unchanged.
const originalFetch=globalThis.fetch;
let mode='ok',calls=0,packets:unknown[]=[],waiting=false,release:(()=>void)|null=null;
globalThis.fetch=(async (input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.hostname!=='api.openai.com')return originalFetch(input,init);
  calls++;
  const request=JSON.parse(String(init?.body)),packet=JSON.parse(request.input);
  packets.push(packet.priorResearch);
  if(mode==='delay'){waiting=true;await new Promise<void>(resolve=>{release=resolve;});waiting=false;}
  if(mode==='transport')throw new Error('Paid-edge fixture transport loss');
  const citations=request.text.format.schema.properties.citations.items.enum;
  let value:unknown=['ticket_reply','ticket_summary'].includes(packet.purpose)
    ? {text:'Use the reviewed network guidance and keep the ticket open if the issue remains.',citations}
    : {title:'Recover network access',body:'Open a fresh network session. Use this guidance only for the recorded access symptoms; confirm the result before assuming recovery.',citations};
  if(mode==='unknown-citation')value={title:'Invalid citation',body:'Untrusted citation',citations:['ticket:invented']};
  if(mode==='missing-citation')value={title:'Missing citation',body:'One source omitted',citations:citations.slice(0,-1)};
  if(mode==='schema')value={authorized:true};
  return Response.json({status:'completed',usage:{input_tokens:100,output_tokens:30,total_tokens:130,input_tokens_details:{cached_tokens:0}},
    output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
}) as typeof fetch;
app.post('/test/knowledge-provider',async c=>{mode=(await c.req.json()).mode;return c.json({mode});});
app.get('/test/knowledge-provider',c=>c.json({calls,packets,waiting}));
app.post('/test/knowledge-provider/release',c=>{release?.();release=null;return c.json({released:true});});
export default app;
