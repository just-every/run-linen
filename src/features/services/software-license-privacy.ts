import { prepareHistoryErasure } from '../history/erasure';
import type { Env, Principal } from '../../platform/types';
import { now } from '../../platform/http';
import type { RecordRow } from './store';

/** Provider opaque IDs are aliases of personal inventory, not business facts. */
export async function eraseSoftwareLicenseAliases(ctx:{env:Env;principal:Principal},userId:string,tokens:string[]) {
  const rows=(await ctx.env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='asset' AND json_extract(data_json,'$.softwareLicense')=1")
    .bind(ctx.principal.workspaceId).all<RecordRow>()).results;
  const aliases=new Set<string>();
  for(const row of rows) {
    if(row.owner_id!==userId&&!JSON.parse(row.participants_json).includes(userId)&&!tokens.some(t=>row.data_json.includes(t)))continue;
    const data=JSON.parse(row.data_json),o=data.observation;
    for(const u of o?.users||[])for(const v of [u.id,u.email])if(v)aliases.add(v);
    for(const i of [...o?.devices||[],...o?.installations||[]])for(const v of [i.id,i.deviceId,i.serial])if(v)aliases.add(v);
    for(const target of data.effectTargets||[])if(target.targetId)aliases.add(target.targetId);
    for(const target of data.grant?.targets||[])if(target)aliases.add(target);
    for(const mapping of data.deviceUsers||[])if(mapping.deviceId)aliases.add(mapping.deviceId);
    if(data.lastDeviceUserChange?.deviceId)aliases.add(data.lastDeviceUserChange.deviceId);
  }
  if(aliases.size) {
    const history=await prepareHistoryErasure(ctx,[userId,...aliases],now());
    await ctx.env.DB.batch(history.statements);
  }
}
export function erasedSoftwareLicense(original:Record<string,any>,redacted:Record<string,any>) {
  if(original.softwareLicense!==true)return redacted;
  return {...redacted,observation:null,grant:null,grantVersion:(original.grantVersion||0)+1,
    deviceUsers:[],lastDeviceUserChange:null,effectTargets:[],complianceWork:[],usage:[],decisions:[],history:[],executionHeld:true,
    softwarePrivacyReview:true,softwareConsentRevokedAt:now()};
}
