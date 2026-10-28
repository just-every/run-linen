import { id, now } from '../../platform/http';
import { serviceEvent, serviceSnapshot } from './history';
import { check, type SoftwareContext } from './software-license-core';
import { getService, type ServiceRecord } from './store';

/** A failed CAS rolls the whole append and effect intent back, including history. */
export async function softwareCommit(ctx: SoftwareContext, r: ServiceRecord, data: Record<string,any>, event: string,
  extra: D1PreparedStatement[] = []) {
  const p=ctx.principal,t=now(),guard=id();
  try {
    await ctx.env.DB.batch([
      ctx.env.DB.prepare(`UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?
        AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value IN ('owner','operator'))`)
        .bind(JSON.stringify(data),t,p.workspaceId,r.id,r.revision,p.workspaceId,p.userId),
      ctx.env.DB.prepare('INSERT INTO svc_software_guards VALUES(?,changes())').bind(guard),
      ctx.env.DB.prepare('DELETE FROM svc_software_guards WHERE id=?').bind(guard),
      serviceEvent(ctx.env.DB,p,r,serviceSnapshot(r),serviceSnapshot({...r,data}),event,t),
      ...extra,
    ]);
  } catch(error) {
    check(!String(error).includes('CHECK constraint failed'), 'revision_conflict'); throw error;
  }
  return getService(ctx.env.DB,p,r.id,'asset');
}
