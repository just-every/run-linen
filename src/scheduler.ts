import { processDueReporting, processDueBiExports } from './features/work';
import { expireMcpCredentials } from './features/mcp/credentials'
import type { Env, Principal, Role } from './platform/types'
import { ApiError, id, now } from './platform/http'
import { processDueWork, processDueRetention, executionPort, pollMailboxes, pollPhoneLines, processDueHandoffs } from './features/work'
import { processDueExecution, processNotifications } from './features/execution'
import { processDueServices } from './features/services'
import { processDueIntelligence } from './features/intelligence'
import { processDueAdoption } from './features/adoption'

async function runLane(env: Env, lane: string, workspaceId: string | null, run: () => Promise<unknown>) {
  const holder = id()
  const key = `${lane}:${workspaceId || 'all'}`
  const start = now()
  const lease = await env.DB.prepare(`
    INSERT INTO platform_scheduler_leases(name,holder,expires_at) VALUES(?,?,?)
    ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
    WHERE platform_scheduler_leases.expires_at<=?
  `).bind(key, holder, new Date(Date.now() + 900_000).toISOString(), start).run()
  if (!lease.meta.changes) return { lane, state: 'already_running' }
  await env.DB.prepare('INSERT INTO platform_scheduler_runs VALUES(?,?,?,?,?,NULL,NULL)')
    .bind(holder, lane, workspaceId, 'running', start).run()
  try {
    await run()
    await env.DB.prepare("UPDATE platform_scheduler_runs SET state='completed',finished_at=? WHERE id=?")
      .bind(now(), holder).run()
    return { lane, state: 'completed' }
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'scheduled_work_failed'
    await env.DB.prepare("UPDATE platform_scheduler_runs SET state='failed',finished_at=?,error_code=? WHERE id=?")
      .bind(now(), code, holder).run()
    console.error('Scheduled lane failed', lane, code)
    return { lane, state: 'failed', code }
  } finally {
    await env.DB.prepare('DELETE FROM platform_scheduler_leases WHERE name=? AND holder=?').bind(key, holder).run()
  }
}

/** Current membership starts work; each effect still checks its own original actor and grant. */
export async function processScheduledWork(env: Env) {
  const members = await env.DB.prepare(`
    SELECT workspace_id,user_id,roles_json FROM memberships WHERE active=1 ORDER BY workspace_id,user_id
  `).all<{ workspace_id: string; user_id: string; roles_json: string }>()
  const owners = new Map<string, Principal>()
  for (const row of members.results) {
    const roles = JSON.parse(row.roles_json) as Role[]
    if (roles.includes('owner') && !owners.has(row.workspace_id)) {
      owners.set(row.workspace_id, { userId: row.user_id, workspaceId: row.workspace_id, roles })
    }
  }
  const work = [...owners.values()].map(async principal => {
    const ctx = { env, principal }
    // Failure in one independent duty must not prevent expiry, recovery or other workspaces.
    return Promise.allSettled([
      runLane(env, 'work', principal.workspaceId, () => processDueWork(ctx, executionPort)),
      runLane(env, 'execution', principal.workspaceId, () => processDueExecution(ctx)),
      runLane(env, 'services', principal.workspaceId, () => processDueServices(env, principal)),
      runLane(env, 'notifications', principal.workspaceId, () => processNotifications(ctx)),
      runLane(env, 'mail', principal.workspaceId, () => pollMailboxes(ctx)),
      runLane(env, 'phone', principal.workspaceId, () => pollPhoneLines(ctx)),
      runLane(env, 'handoff', principal.workspaceId, () => processDueHandoffs(ctx)),
    ])
  })
  return Promise.allSettled([
    ...work,
    runLane(env, 'mcp-credentials', null, () => expireMcpCredentials(env)),
    runLane(env, 'intelligence', null, () => processDueIntelligence(env)),
    runLane(env, 'reporting', null, () => processDueReporting(env)),
    runLane(env, 'bi-exports', null, () => processDueBiExports(env)),
    runLane(env, 'retention', null, () => processDueRetention(env)),
    runLane(env, 'adoption', null, () => processDueAdoption(env)),
  ])
}
