import type { Env } from './platform/types'
import { MAIL_PROVIDERS } from './features/work/mail-ingest'

/** Is anything for a lane to look at? One statement per workspace, each probe an indexed EXISTS.
 * A probe is deliberately looser than the lane's own due test (it ignores due times): a lane that
 * wrongly runs does what it always did, a lane that wrongly stays idle would drop work. A lane with
 * nothing to look at takes no lease and writes no row, so an idle installation costs reads only. */
export const workspaceLanes = ['work', 'execution', 'services', 'software-renewals', 'notifications', 'mail', 'phone', 'handoff'] as const
export const globalLanes = ['mcp-credentials', 'intelligence', 'reporting', 'bi-exports', 'retention', 'adoption'] as const
export type WorkspaceLane = typeof workspaceLanes[number]
export type GlobalLane = typeof globalLanes[number]

const OPEN_WORK = `EXISTS(SELECT 1 FROM work_records WHERE workspace_id=?1 AND state IN ('open','paused'))`
/** Problem detection reads the incidents of the trailing 30 days; whether it runs is the detection gate's call, not a lane's. */
const DETECTABLE = `(EXISTS(SELECT 1 FROM work_records WHERE workspace_id=?1 AND kind='incident' AND created_at>=?3)
    OR EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=?1 AND kind='incident' AND created_at>=?3))`
const WORKSPACE_PROBES: Record<WorkspaceLane, string> = {
  work: `(EXISTS(SELECT 1 FROM work_obligations WHERE workspace_id=?1 AND state IN ('pending','blocked','executing','unknown'))
    OR EXISTS(SELECT 1 FROM work_recurring_plans WHERE workspace_id=?1 AND enabled=1)
    OR EXISTS(SELECT 1 FROM work_lifecycle WHERE workspace_id=?1 AND sponsor_id IS NOT NULL AND cancelled_at IS NULL)
    OR EXISTS(SELECT 1 FROM work_followups WHERE workspace_id=?1 AND state='scheduled')
    OR EXISTS(SELECT 1 FROM work_fulfilment_amendments WHERE workspace_id=?1 AND state='prepared')
    OR (${OPEN_WORK} AND (EXISTS(SELECT 1 FROM work_escalation_levels WHERE workspace_id=?1)
      OR EXISTS(SELECT 1 FROM work_waiting_rules WHERE workspace_id=?1)
      OR EXISTS(SELECT 1 FROM work_followup_versions WHERE workspace_id=?1 AND kind IN ('escalation','waiting'))
      OR EXISTS(SELECT 1 FROM work_approval_stages WHERE workspace_id=?1 AND applies=1)
      OR EXISTS(SELECT 1 FROM work_approval_mail_config WHERE workspace_id=?1 AND enabled=1))))`,
  execution: `EXISTS(SELECT 1 FROM execution_operations WHERE workspace_id=?1 AND state IN ('queued','needs_configuration','blocked','retry_wait','running','unknown','submitted','cancel_requested'))`,
  services: `(EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=?1 AND kind IN ('monitor','supplier','decision'))
    OR EXISTS(SELECT 1 FROM svc_records INDEXED BY svc_incident_open WHERE workspace_id=?1 AND kind='incident' AND COALESCE(json_extract(data_json,'$.status'),'')<>'closed')
    OR EXISTS(SELECT 1 FROM svc_records WHERE workspace_id=?1 AND kind='incident' AND updated_at>=?2)
    OR EXISTS(SELECT 1 FROM svc_records INDEXED BY svc_records_notices WHERE workspace_id=?1 AND json_extract(data_json,'$.employeeNotices') IS NOT NULL)
    OR EXISTS(SELECT 1 FROM svc_outbox WHERE workspace_id=?1 AND state IN ('pending','sending')))`,
  'software-renewals': `EXISTS(SELECT 1 FROM svc_records INDEXED BY svc_records_software WHERE workspace_id=?1 AND kind='asset' AND json_extract(data_json,'$.softwareLicense') IS NOT NULL)`,
  notifications: `EXISTS(SELECT 1 FROM execution_outbox WHERE workspace_id=?1 AND state IN ('queued','rate_limited','needs_configuration'))`,
  mail: `EXISTS(SELECT 1 FROM connections WHERE workspace_id=?1 AND status='active' AND provider IN (${MAIL_PROVIDERS.map(provider => `'${provider}'`).join(',')}))`,
  phone: `EXISTS(SELECT 1 FROM connections WHERE workspace_id=?1 AND status='active' AND provider='ringcentral')`,
  handoff: `EXISTS(SELECT 1 FROM work_handoffs WHERE workspace_id=?1 AND state='requested')`,
}
const GLOBAL_PROBES: Record<GlobalLane, string> = {
  'mcp-credentials': `EXISTS(SELECT 1 FROM mcp_credentials WHERE state='active' AND expires_at<=?1)`,
  intelligence: `(EXISTS(SELECT 1 FROM intelligence_commitments WHERE due_at<=?1)
    OR EXISTS(SELECT 1 FROM work_intake_events WHERE connection_id='' AND state IN ('pending','needs_configuration','budget_held'))
    OR EXISTS(SELECT 1 FROM intelligence_pending_fulfilments WHERE state IN ('waiting','blocked'))
    OR EXISTS(SELECT 1 FROM intelligence_fulfilment_runs WHERE state IN ('verified','fulfilling'))
    OR EXISTS(SELECT 1 FROM intelligence_engineering_jobs WHERE state='adopted')
    OR EXISTS(SELECT 1 FROM intelligence_investigations WHERE state NOT IN ('verified','erased','unknown')))`,
  reporting: `EXISTS(SELECT 1 FROM work_report_schedules WHERE active=1 AND next_at<=?1)`,
  'bi-exports': `EXISTS(SELECT 1 FROM work_bi_exports WHERE active=1 AND next_at<=?1)`,
  retention: `(EXISTS(SELECT 1 FROM work_retention WHERE closed_ticket_days IS NOT NULL OR attachment_days IS NOT NULL)
    OR EXISTS(SELECT 1 FROM configuration_masked_records WHERE expires_at IS NOT NULL AND expires_at<=?1))`,
  adoption: `(EXISTS(SELECT 1 FROM audit_events WHERE json_valid(detail_json) AND json_extract(detail_json,'$.pendingErasure')=1)
    OR EXISTS(SELECT 1 FROM svc_events WHERE json_valid(data_json) AND json_extract(data_json,'$.pendingErasure')=1)
    OR EXISTS(SELECT 1 FROM adoption_deletions WHERE state='pending')
    OR EXISTS(SELECT 1 FROM adoption_retention)
    OR EXISTS(SELECT 1 FROM adoption_erasure_jobs WHERE state='blob_cleanup_pending'))`,
}

function select(probes: Record<string, string>) {
  return `SELECT ${Object.entries(probes).map(([lane, sql]) => `${sql} AS "${lane}"`).join(', ')}`
}
const WORKSPACE_SQL = select({ ...WORKSPACE_PROBES, detectable: DETECTABLE }), GLOBAL_SQL = select(GLOBAL_PROBES)

/** Window the services lane reads recent incidents over: the 30 days problem detection looks back. */
const INCIDENT_WINDOW_MS = 30 * 86_400_000

export async function workspaceDue(env: Env, workspaceId: string, at: Date): Promise<Record<WorkspaceLane | 'detectable', boolean>> {
  const row = await env.DB.prepare(WORKSPACE_SQL)
    .bind(workspaceId, new Date(at.getTime() - 7 * 86_400_000).toISOString(), new Date(at.getTime() - INCIDENT_WINDOW_MS).toISOString())
    .first<Record<WorkspaceLane | 'detectable', number>>()
  return Object.fromEntries([...workspaceLanes, 'detectable' as const].map(lane => [lane, !!row?.[lane]])) as Record<WorkspaceLane | 'detectable', boolean>
}

export async function globalDue(env: Env, at: Date): Promise<Record<GlobalLane, boolean>> {
  const row = await env.DB.prepare(GLOBAL_SQL).bind(at.toISOString()).first<Record<GlobalLane, number>>()
  return Object.fromEntries(globalLanes.map(lane => [lane, !!row?.[lane]])) as Record<GlobalLane, boolean>
}
