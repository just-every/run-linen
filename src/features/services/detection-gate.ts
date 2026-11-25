import type { Env } from '../../platform/types';
import { now } from '../../platform/http';

const RERUN_MS = 3_600_000;
/** Scheduled problem detection reads every incident of the trailing 30 days, so it runs again only after the service
 * accepted a write (the list clock moved) or an hour has passed for the window to slide. `env` must be the untracked
 * binding: recording the run is bookkeeping, not a change anyone needs to refetch. */
export async function detectionGate(env: Env, workspaceId: string) {
  const [clock, last] = await Promise.all([
    env.DB.prepare('SELECT version FROM work_list_clock WHERE id=1').first<{ version: number }>(),
    env.DB.prepare('SELECT clock,ran_at FROM svc_detection_state WHERE workspace_id=?').bind(workspaceId).first<{ clock: number; ran_at: string }>(),
  ]);
  const version = clock?.version ?? 0;
  const due = !last || last.clock !== version || Date.now() - Date.parse(last.ran_at) >= RERUN_MS;
  return {
    due,
    record: () => env.DB.prepare('INSERT INTO svc_detection_state VALUES(?,?,?) ON CONFLICT(workspace_id) DO UPDATE SET clock=excluded.clock,ran_at=excluded.ran_at')
      .bind(workspaceId, version, now()).run(),
  };
}
