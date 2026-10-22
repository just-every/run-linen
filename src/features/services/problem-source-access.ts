import type { Principal } from '../../platform/types';
import { ApiError } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { workReadable } from '../work/scope';
import { getService, type ServiceRecord } from './store';
/** Accepted derived records retain the existing source boundaries on every service door. */
export async function assertProblemSources(db:D1Database, principal:Principal, record:ServiceRecord) {
  const p=await currentPrincipal(db,principal);
  for (const ref of record.data.evidence || []) {
    if(ref.type==='ticket') {
      const work=await db.prepare('SELECT sensitivity,requester_id,beneficiary_id,department_id FROM work_records WHERE workspace_id=? AND id=?').bind(p.workspaceId,ref.id).first<{sensitivity:string;requester_id:string;beneficiary_id:string;department_id:string|null}>();
      if(!work || !workReadable(p,work)) throw new ApiError(404,'not_found','Problem evidence not found');
    } else {
      const alert=await getService(db,p,ref.id,'incident');
      if(alert.data.monitorEventKey!==ref.monitorEventKey) throw new ApiError(404,'not_found','Problem evidence not found');
    }
    if(ref.serviceId)await getService(db,p,ref.serviceId,'service');
  }
}
