import { processDueReporting, processDueBiExports } from './features/work';
import { expireMcpCredentials } from './features/mcp/credentials'
import type { Env, Principal, Role } from './platform/types'
import { ApiError, id, now } from './platform/http'
import { processDueWork, processDueRetention, executionPort, pollMailboxes, pollPhoneLines, processDueHandoffs } from './features/work'
import { processDueExecution, processNotifications } from './features/execution'
import { processDueServices, processSoftwareRenewals } from './features/services'
import { processDueIntelligence } from './features/intelligence'
import { processDueAdoption } from './features/adoption'
import { bumpListClock } from './platform/list-clock'
import { trackWrites } from './platform/write-tracker'
import { detectionGate } from './features/services/detection-gate'
import { workspaceDue, globalDue, workspaceLanes, globalLanes, type WorkspaceLane, type GlobalLane } from './scheduler-due'

/** The heartbeat row proves the scheduler is ticking; lanes with nothing to look at write nothing. */
export const SCHEDULER_HEARTBEAT = 'scheduler:tick'

async function runLane(env: Env, lane: string, workspaceId: string | null, run: (env: Env) => Promise<unknown>) {
  const holder = id()
  const key = `${lane}:${workspaceId || 'all'}`
  const start = now()
  const lease = await env.DB.prepare(`
    INSERT INTO platform_scheduler_leases(name,holder,expires_at) VALUES(?,?,?)
    ON CONFLICT(name) DO UPDATE SET holder=excluded.holder,expires_at=excluded.expires_at
    WHERE platform_scheduler_leases.expires_at<=?
  `).bind(key, holder, new Date(Date.now() + 900_000).toISOString(), start).run()
  if (!lease.meta.changes) return { lane, state: 'already_running', wrote: false }
  // One row per lane and workspace, rewritten each run: the table stays as small as the lane list.
  await env.DB.prepare(`
    INSERT INTO platform_scheduler_runs VALUES(?,?,?,'running',?,NULL,NULL)
    ON CONFLICT(id) DO UPDATE SET state='running',started_at=excluded.started_at,finished_at=NULL,error_code=NULL
  `).bind(key, lane, workspaceId, start).run()
  const tracked = trackWrites(env)
  try {
    await run(tracked.env)
    await env.DB.prepare("UPDATE platform_scheduler_runs SET state='completed',finished_at=? WHERE id=?")
      .bind(now(), key).run()
    return { lane, state: 'completed', wrote: tracked.wrote }
  } catch (error) {
    const code = error instanceof ApiError ? error.code : 'scheduled_work_failed'
    await env.DB.prepare("UPDATE platform_scheduler_runs SET state='failed',finished_at=?,error_code=? WHERE id=?")
      .bind(now(), code, key).run()
    console.error('Scheduled lane failed', lane, code)
    return { lane, state: 'failed', code, wrote: tracked.wrote }
  } finally {
    await env.DB.prepare('DELETE FROM platform_scheduler_leases WHERE name=? AND holder=?').bind(key, holder).run()
  }
}

type LaneContext = { env: Env; principal: Principal }
const workspaceRuns: Record<WorkspaceLane, (ctx: LaneContext, untracked: Env) => Promise<unknown>> = {
  work: ctx => processDueWork(ctx, executionPort),
  execution: ctx => processDueExecution(ctx),
  services: async (ctx, untracked) => {
    const detection = await detectionGate(untracked, ctx.principal.workspaceId)
    const result = await processDueServices(ctx.env, ctx.principal, { detect: detection.due })
    if (detection.due) await detection.record()
    return result
  },
  'software-renewals': ctx => processSoftwareRenewals(ctx),
  notifications: ctx => processNotifications(ctx),
  mail: ctx => pollMailboxes(ctx),
  phone: ctx => pollPhoneLines(ctx),
  handoff: ctx => processDueHandoffs(ctx),
}
const globalRuns: Record<GlobalLane, (env: Env) => Promise<unknown>> = {
  'mcp-credentials': env => expireMcpCredentials(env),
  intelligence: env => processDueIntelligence(env),
  reporting: env => processDueReporting(env),
  'bi-exports': env => processDueBiExports(env),
  retention: env => processDueRetention(env),
  adoption: env => processDueAdoption(env),
}

/** The probe only decides whether to look; if it cannot answer, every lane looks, as before it existed. */
async function probe<T extends string>(lanes: readonly T[], ask: () => Promise<Record<T, boolean>>) {
  try { return await ask() } catch (error) {
    console.error('Scheduler due probe failed; running every lane', error instanceof Error ? error.message : error)
    return Object.fromEntries(lanes.map(lane => [lane, true])) as Record<T, boolean>
  }
}

/** Current membership starts work; each effect still checks its own original actor and grant. */
export async function processScheduledWork(env: Env) {
  const at = new Date()
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
  const [global, ...perWorkspace] = await Promise.all([
    probe(globalLanes, () => globalDue(env, at)),
    ...[...owners.values()].map(async principal => {
      const due = await probe([...workspaceLanes, 'detectable' as const], () => workspaceDue(env, principal.workspaceId, at))
      // A gate that cannot answer sends the services lane in, where its own failure is recorded.
      if (!due.services && due.detectable && await detectionGate(env, principal.workspaceId).then(gate => gate.due, () => true)) due.services = true
      return due
    }),
  ])
  const work = [...owners.values()].map((principal, index) => {
    // Failure in one independent duty must not prevent expiry, recovery or other workspaces.
    return Promise.allSettled(workspaceLanes.filter(lane => perWorkspace[index][lane])
      .map(lane => runLane(env, lane, principal.workspaceId, laneEnv => workspaceRuns[lane]({ env: laneEnv, principal }, env))))
  })
  const results = await Promise.allSettled([
    ...work,
    ...globalLanes.filter(lane => global[lane]).map(lane => runLane(env, lane, null, laneEnv => globalRuns[lane](laneEnv))),
  ])
  const wrote = (value: unknown): boolean => Array.isArray(value)
    ? value.some(entry => entry.status === 'fulfilled' && wrote(entry.value))
    : Boolean((value as { wrote?: boolean } | undefined)?.wrote)
  if (results.some(result => result.status === 'fulfilled' && wrote(result.value))) await bumpListClock(env)
  const stamp = now()
  await env.DB.prepare(`
    INSERT INTO platform_scheduler_runs VALUES(?,'scheduler',NULL,'completed',?,?,NULL)
    ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,finished_at=excluded.finished_at
  `).bind(SCHEDULER_HEARTBEAT, stamp, stamp).run()
  return results
}
