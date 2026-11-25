import assert from 'node:assert/strict';
import { runtimeHarness } from '../intelligence/runtime-harness.mjs';

// A small company on Workers Free shares 5,000,000 rows read and 100,000 rows written a day across everything it runs.
// The minute cron and the 30-second queue poll must stay far below that after 30 days of history at defaults, and
// must not grow with that history. Ceilings are generous: they catch a return to scans, not a row or two.
const DAY_MS = 86_400_000, days = 30, perDay = 30, open = 20, MINUTES = 1440;
const h = await runtimeHarness('tests/work/read-budget-worker.ts');
const origin = h.origin;
async function call(path, { cookie, headers = {}, body } = {}) {
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null,
    read: Number(response.headers.get('x-d1-rows-read')), written: Number(response.headers.get('x-d1-rows-written')) };
}
try {
  const created = await call('/api/v1/setup', { body: { email: 'owner@budget.test', name: 'Owner', workspaceName: 'Budget', password: 'isolated read budget passphrase' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const cookie = created.headers.get('set-cookie').split(';')[0];
  const { principal, csrfToken } = (await call('/api/v1/session', { cookie })).body;
  const db = await h.db, w = principal.workspaceId, u = principal.userId;
  const tickets = days * perDay;
  const series = n => `WITH RECURSIVE c(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM c WHERE i<${n - 1})`;
  const ago = i => `strftime('%Y-%m-%dT%H:%M:%fZ','now','-'||(${i}/${perDay})||' days','-'||(${i}%${perDay})||' minutes')`;
  await db.exec(`${series(tickets)} INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,state,created_at,updated_at,dedup_key)
    SELECT 'wr'||i,'${w}','${u}','${u}',CASE WHEN i%20=0 THEN 'incident' ELSE 'request' END,'Ticket '||i,CASE WHEN i<${tickets - open} THEN 'closed' ELSE 'open' END,${ago(`(${tickets}-1-i)`)},${ago(`(${tickets}-1-i)`)},'d'||i FROM c`.replace(/\n/g, ' '));
  await db.exec(`${series(tickets * 8)} INSERT INTO audit_events(id,workspace_id,actor_id,action,target,detail_json,created_at)
    SELECT 'ae'||i,'${w}','${u}','work.update','wr'||(i/8),'{}',${ago(`((${tickets}*8-1-i)/8)`)} FROM c`.replace(/\n/g, ' '));
  await db.exec(`${series(tickets * 2)} INSERT INTO svc_events(id,workspace_id,record_id,actor_id,kind,data_json,created_at)
    SELECT 'se'||i,'${w}','r'||i,'${u}','service.update','{}',${ago(`((${tickets}*2-1-i)/2)`)} FROM c`.replace(/\n/g, ' '));
  // Cron history the old scheduler left behind: one row per lane per minute.
  await db.exec(`${series(7 * MINUTES)} INSERT INTO platform_scheduler_runs SELECT 'old'||i,'work','${w}','completed',strftime('%Y-%m-%dT%H:%M:%fZ','now','-'||i||' minutes'),NULL,NULL FROM c`.replace(/\n/g, ' '));

  // 1. The minute cron on a company with 30 days of tickets, 20 of them open, one in twenty an incident.
  const busy = await call('/tick');
  assert.equal(busy.status, 200);
  assert.ok(busy.read <= 1_000, `minute cron read ${busy.read} rows with 30 days of history; Workers Free allows 3,500 a minute for everything`);
  assert.ok(busy.written <= 40, `minute cron wrote ${busy.written} rows; Workers Free allows 69 a minute`);
  // With nothing written since, the next minute has nothing to look at: problem detection waits for a write or an hour.
  const again = await call('/tick');
  assert.ok(again.read <= 100 && again.written <= 6, `second run read ${again.read}, wrote ${again.written}`);

  // 2. Nothing open, nothing configured: the cron reads a few rows and writes only its heartbeat.
  await db.exec(`UPDATE work_records SET state='closed',kind='request'`);
  const idle = await call('/tick');
  assert.ok(idle.read <= 100 && idle.written <= 6, `idle cron read ${idle.read}, wrote ${idle.written}`);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM platform_scheduler_runs WHERE id LIKE '%:%'").first()).n <= 20, true, 'run bookkeeping holds one row per lane');

  // 3. The queue poll: a full read is bounded; an unchanged poll costs a row or two; a write invalidates it.
  await db.exec(`UPDATE work_records SET state='open' WHERE id IN (SELECT id FROM work_records ORDER BY created_at DESC LIMIT ${open})`);
  const full = await call('/api/v1/work', { cookie });
  assert.equal(full.status, 200);
  const etag = full.headers.get('etag');
  assert.ok(etag && /no-cache/.test(full.headers.get('cache-control')), 'queue is revalidated on every poll');
  assert.equal(full.body.items.length, 200);
  assert.ok(full.read <= 5_000, `full queue read ${full.read} rows`);
  const unchanged = await call('/api/v1/work', { cookie, headers: { 'If-None-Match': etag } });
  assert.equal(unchanged.status, 304);
  assert.ok(unchanged.read <= 30, `unchanged poll read ${unchanged.read} rows, session sign-in included`);
  const filed = await call('/api/v1/work', { cookie, headers: { 'X-Linen-CSRF': csrfToken }, body: { title: 'Printer', body: 'It is out of toner', deduplicationKey: 'budget-1' } });
  assert.equal(filed.status, 201, JSON.stringify(filed.body));
  const changed = await call('/api/v1/work', { cookie, headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200, 'a write the service accepted changes the validator');
  assert.ok(changed.body.items.some(item => item.id === filed.body.id));
  console.log(`PASS read budget: 30 days of history; busy cron ${busy.read} rows read, ${busy.written} written; next minute ${again.read} read, ${again.written} written; idle cron ${idle.read} read, ${idle.written} written; queue ${full.read} read, unchanged poll ${unchanged.read}`);
} finally {
  await h.close();
}
