import { agentResponse } from './features/agent-door';
import { restBearer, registerRestCredentialRoutes } from './features/rest'
import { handleApprovalMail } from './features/work/approval-mail-provider'
import { registerMcpCredentialRoutes } from './features/mcp'
import { deploymentHealth } from './base/deployment-health'
import { Hono } from 'hono'
import type { AppEnv } from './platform/types'
import { ApiError, requireRole } from './platform/http'
import { platformApp } from './platform/routes'
import { registerWorkRoutes, brandLogo } from './features/work'
import { registerExecutionRoutes, handleNotificationWebhook, standingIntakeExecution } from './features/execution'
import { registerServiceRoutes, registerServiceWebhooks } from './features/services'
import { registerIntelligenceRoutes, setStandingIntakeExecution } from './features/intelligence'
import { registerEngineeringAgentRoutes } from './features/intelligence/engineering'
import { registerFreshserviceImportRoutes, freshserviceErasurePort } from './features/adoption/freshservice-import'
import { registerServiceNowImportRoutes, servicenowErasurePort } from './features/adoption/servicenow-import'
import { registerAdoptionErasurePort } from './features/adoption'
import { registerAdoptionRoutes } from './features/adoption'
import { registerLightweightImportRoutes } from './features/adoption/lightweight-import'
import { registerSnipeitImportRoutes } from './features/adoption/snipeit-import'
import { registerConnectionRoutes } from './features/connections'

registerAdoptionErasurePort(freshserviceErasurePort)
registerAdoptionErasurePort(servicenowErasurePort)

/** One composition root for the emitted application and its integration tests. */
export function createApplication() {
  setStandingIntakeExecution(standingIntakeExecution)

  const app = new Hono<AppEnv>()
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status as 400)
    }
    console.error('Request failed', error.name)
    return c.json({ error: { code: 'internal_error', message: 'Request could not be completed' } }, 500)
  })
  app.get('/health', c => c.json({ status: 'ok', ...deploymentHealth(c.env) }))

  app.use('*',async(c,next)=>{const response=await agentResponse(c.req.raw,c.env);if(response)return response;await next()})
  app.use('/api/v1/*',async(c,next)=>{
    if(/^Bearer linen_(?:rest|mcp)_/.test(c.req.header('Authorization')??''))return restBearer(c,next)
    await next()
  })
  app.use('/api/v1/*',async (c,next) => {
    if (c.req.header('Authorization')?.startsWith('Bearer linen_mcp_'))
      throw new ApiError(401,'credential_audience','MCP credentials do not authorize REST')
    await next()
  })

  // These integrations authenticate each request themselves. They do not mint a user session.
  const integrations = new Hono<AppEnv>()
  integrations.post('/approval-mail/webhooks/:workspaceId',async c=>c.json(await handleApprovalMail(c.env,c.req.param('workspaceId'),c.req.raw)))
  integrations.get('/branding/:workspaceId/logo', c => brandLogo(c.env, c.req.param('workspaceId')))
  registerEngineeringAgentRoutes(integrations)
  registerServiceWebhooks(integrations)
  integrations.post('/notifications/webhooks/:connectionId', async c =>
    c.json(await handleNotificationWebhook(c.env, c.req.param('connectionId'), c.req.raw)))
  app.route('/api/v1', integrations)
  app.use('/api/v1/*',restBearer)

  const authenticated = platformApp()
  registerMcpCredentialRoutes(authenticated)
  registerRestCredentialRoutes(authenticated)
  registerWorkRoutes(authenticated)
  registerExecutionRoutes(authenticated)
  registerServiceRoutes(authenticated)
  registerIntelligenceRoutes(authenticated)
  registerAdoptionRoutes(authenticated)
  registerFreshserviceImportRoutes(authenticated)
  registerServiceNowImportRoutes(authenticated)
  registerSnipeitImportRoutes(authenticated)
  registerLightweightImportRoutes(authenticated)
  registerConnectionRoutes(authenticated)
  authenticated.get('/runtime-status', async c => {
    const principal = requireRole(c, 'owner', 'operator', 'auditor')
    type Row = { lane: string; state: string; started_at: string; finished_at: string | null; error_code: string | null }
    // Two indexed reads of the newest rows each; the table keeps one row per lane, so history never widens them.
    const [own, shared] = await Promise.all([
      c.env.DB.prepare(`SELECT lane,state,started_at,finished_at,error_code FROM platform_scheduler_runs
        WHERE workspace_id=? ORDER BY started_at DESC LIMIT 200`).bind(principal.workspaceId).all<Row>(),
      c.env.DB.prepare(`SELECT lane,state,started_at,finished_at,error_code FROM platform_scheduler_runs
        WHERE workspace_id IS NULL ORDER BY started_at DESC LIMIT 200`).all<Row>(),
    ])
    const latest = new Map<string, Row>()
    let tickAt: string | null = null
    for (const row of [...own.results, ...shared.results].sort((a, b) => b.started_at.localeCompare(a.started_at))) {
      if (row.lane === 'scheduler') { tickAt ??= row.started_at; continue }
      if (!latest.has(row.lane)) latest.set(row.lane, row)
    }
    // A lane with nothing due keeps its last cycle; the scheduler's own tick says it is still being looked at.
    const alive = tickAt !== null && Date.now() - Date.parse(tickAt) <= 180_000
    return c.json({
      observedAt: new Date().toISOString(),
      meaning: 'Background processing cycles; service outcomes and provider coverage are recorded separately.',
      checkedAt: tickAt,
      lanes: [...latest.values()].map(row => ({ ...row, stale: !alive && Date.now() - Date.parse(row.started_at) > 180_000 })),
    })
  })
  app.route('/api/v1', authenticated)
  return app
}
