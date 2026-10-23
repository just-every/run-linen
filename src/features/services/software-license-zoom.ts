import { check, type SoftwareContext } from './software-license-core';
import { softwareClient } from './software-license-connections';

/** Complete pages or refuse; a truncated directory cannot establish spare seats. */
async function zoomPages(client: Awaited<ReturnType<typeof softwareClient>>, path: string) {
  const users: any[] = [], seen = new Set<string>(); let next = path;
  for (let page = 0; page < 100; page++) {
    const data = await client.json(next);
    check(Array.isArray(data.users) && data.users.length <= 1000, 'software_zoom_schema', 502);
    users.push(...data.users); check(users.length <= 20000, 'software_inventory_limit', 502);
    if (!data.next_page_token) {
      check(data.total_records === undefined || data.total_records === users.length, 'software_zoom_incomplete', 502);
      return users;
    }
    check(typeof data.next_page_token === 'string' && !seen.has(data.next_page_token), 'software_cursor_denied', 502);
    seen.add(data.next_page_token); const u = new URL(path, client.origin); u.searchParams.set('next_page_token',data.next_page_token); next = u.href;
  }
  throw new Error('software_inventory_limit');
}
export async function readZoom(ctx: SoftwareContext, row: any, periodStart: string, periodEnd: string) {
  const client = await softwareClient(ctx,row);
  const account = await client.json('/v2/users/me');
  check(account.account_id === row.config.accountId, 'software_zoom_account_mismatch', 403);
  const assigned = await zoomPages(client,'/v2/users?page_size=300&status=active');
  const active = await zoomPages(client,`/v2/report/users?type=active&page_size=300&from=${periodStart.slice(0,10)}&to=${periodEnd.slice(0,10)}`);
  const activeIds = new Set(active.flatMap(u => [u.id,u.email?.toLowerCase()].filter(Boolean)));
  check(new Set(assigned.map(u=>u.id)).size === assigned.length && assigned.every(u=>typeof u.id==='string'&&typeof u.email==='string'&&[1,2,4,99].includes(u.type)), 'software_zoom_schema', 502);
  return assigned.map(u => ({id:u.id,email:u.email.toLowerCase(),licensed:u.type===2,active:activeIds.has(u.id)||activeIds.has(u.email.toLowerCase())}));
}
export async function reclaimZoom(client: Awaited<ReturnType<typeof softwareClient>>, userId: string, operationId: string) {
  const response = await client.call('/v2/users/'+encodeURIComponent(userId),{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':operationId},body:JSON.stringify({type:1})});
  // The caller durably marks sending before entering the network. Any lost or
  // non-2xx response remains uncertain and must be read, never replayed.
  check(response.status === 204, 'software_reclaim_unconfirmed', 502);
}
