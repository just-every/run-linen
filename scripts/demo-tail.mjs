// Live Workers tail for one script: every event's time, path (no query), status, outcome,
// wall time, our JSON log lines and exception names. No headers, cookies or bodies.
// node tail.mjs <worker-name> <out.jsonl> <ready-file>
import { appendFileSync, writeFileSync } from 'node:fs';
const [name, out, ready] = process.argv.slice(2), account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (account !== 'b20c0ca9cab0c2b70e13d7cf724b89bd') throw Error('wrong-account');
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${name}/tails`;
const headers = { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' };
async function open() {
  const r = await fetch(base, { method: 'POST', headers, body: '{}' }), value = await r.json();
  if (!value.success) throw Error('tail-create-failed ' + r.status);
  return value.result;
}
let tail = await open(), socket, stopping = false;
const row = value => appendFileSync(out, JSON.stringify(value) + '\n');
function connect() {
  socket = new WebSocket(tail.url, 'trace-v1'); socket.binaryType = 'arraybuffer';
  socket.addEventListener('message', message => {
    try {
      const e = JSON.parse(typeof message.data === 'string' ? message.data : new TextDecoder().decode(message.data));
      const req = e.event?.request, url = req?.url ? new URL(req.url) : null;
      // Who started or opened a demo: user agent and network owner only (no IP, cookie or other header).
      const who = req && ['/', '/__demo/start'].includes(url?.pathname) ? { ua: String(req.headers?.['user-agent'] ?? '').slice(0, 200), asOrg: req.cf?.asOrganization, asn: req.cf?.asn, country: req.cf?.country, botCategory: req.cf?.verifiedBotCategory } : undefined;
      row({ ts: e.eventTimestamp, entrypoint: e.entrypoint, outcome: e.outcome, host: url?.host, method: req?.method, path: url?.pathname, who,
        status: e.event?.response?.status, rpc: e.event?.rpcMethod, alarm: e.event?.scheduledTime ? true : undefined, wallMs: e.wallTime, cpuMs: e.cpuTime,
        logs: (e.logs ?? []).map(log => ({ ts: log.timestamp, level: log.level, message: (log.message ?? []).map(part => typeof part === 'string' ? part.slice(0, 4000) : part) })),
        exceptions: (e.exceptions ?? []).map(x => ({ ts: x.timestamp, name: x.name, message: String(x.message ?? '').slice(0, 300) })) });
    } catch (error) { row({ parseError: error.name }); }
  });
  socket.addEventListener('close', async event => {
    if (stopping) return;
    row({ tailClosed: event.code, at: new Date().toISOString() });
    await fetch(base + '/' + tail.id, { method: 'DELETE', headers }).catch(() => {});
    tail = await open(); connect();
  });
  return new Promise((ok, no) => { socket.addEventListener('open', ok, { once: true }); socket.addEventListener('error', () => no(Error('tail-connect-failed')), { once: true }); });
}
await connect();
row({ observationStarted: new Date().toISOString() });
console.log('TAIL_READY'); writeFileSync(ready, 'ready');
await new Promise(ok => { const t = setTimeout(ok, 15 * 60 * 1000); process.on('SIGTERM', () => { clearTimeout(t); ok(); }); process.on('SIGINT', () => { clearTimeout(t); ok(); }); });
row({ observationEnded: new Date().toISOString() });
stopping = true; socket?.close();
const d = await fetch(base + '/' + tail.id, { method: 'DELETE', headers });
console.log('TAIL_DELETED ' + d.status); process.exit(d.ok ? 0 : 1);
