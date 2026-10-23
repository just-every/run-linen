import type { ServiceRecord } from './store';
import { softwareConnection } from './software-license-connections';
import type { SoftwareContext } from './software-license-core';
import { currentSoftwareDeviceUser } from './software-license-device-users';
import { ApiError } from '../../platform/http';

export async function softwareSummary(ctx: SoftwareContext, r: ServiceRecord) {
  const o=r.data.observation, unknowns:string[]=[];
  if(!o)unknowns.push('No complete provider observation');
  if(r.data.observationError)unknowns.push(r.data.observationError);
  if(o && Date.parse(o.observedAt)+r.data.freshnessMs<=Date.now())unknowns.push('Usage observation is stale');
  for(const s of o?.sources||[]) {
    try {const current=await softwareConnection(ctx,s.connectionId);if(current.revision!==s.revision||current.status!=='active')unknowns.push('Connection changed since observation');}
    catch {unknowns.push('A source connection is unavailable');}
  }
  if(o?.devices?.some((d:any)=>Date.parse(d.observedAt)+r.data.freshnessMs<=Date.now()))unknowns.push('Device application inventory is stale');
  if(o?.devices?.some((d:any)=>!d.serial))unknowns.push('Device serial is missing');
  const desktop=r.data.sourceBindings.some((s:any)=>['jamf','intune'].includes(s.kind));
  const saas=r.data.sourceBindings.some((s:any)=>s.kind==='zoom');
  if(!desktop&&!saas)unknowns.push('No consumption source is configured');
  if(r.data.metric==='concurrent'&&!o?.concurrency)unknowns.push('Concurrent usage requires a dated peak observation; installations are not concurrent usage');
  if(o?.concurrency&&Date.parse(o.concurrency.observedAt)+r.data.freshnessMs<=Date.now())unknowns.push('Concurrent peak observation is stale');
  if(desktop&&r.data.metric==='per-user'&&o?.installations.some((i:any)=>!i.userId))unknowns.push('Some installations have no mapped current user');
  if(desktop&&r.data.metric==='per-user')for(const i of o?.installations||[]) {
    if(!i.userId)continue;
    try {
      const conn=await softwareConnection(ctx,i.connectionId);
      if((await currentSoftwareDeviceUser(ctx,r,conn,i.deviceId))?.userId!==i.userId)unknowns.push('A device-user confirmation is no longer current');
    } catch(error) {
      if(!(error instanceof ApiError))throw error;
      unknowns.push('A device-user confirmation is unavailable');
    }
  }
  if(o?.conflictingSerials?.length)unknowns.push('Device serial appears in multiple MDM sources; reconcile before acting');
  const fresh=unknowns.length===0;
  const consumed=!fresh?null:r.data.metric==='concurrent'?o.concurrency.peak:saas?o.users.filter((u:any)=>u.licensed).length:
    r.data.metric==='per-user'?new Set(o.installations.map((i:any)=>i.userId)).size:new Set(o.installations.map((i:any)=>i.serial.toUpperCase())).size;
  const entitled=r.data.contract.seats;
  const activeUsers=fresh&&saas?o.users.filter((u:any)=>u.active&&u.licensed).length:null;
  const reclaimable=fresh&&saas?o.users.filter((u:any)=>u.licensed&&!u.active).length:null;
  return {entitled,consumed,overLicensed:consumed===null?null:Math.max(0,consumed-entitled),underLicensed:consumed===null?null:Math.max(0,entitled-consumed),activeUsers,reclaimable,
    trueUpUsd:consumed===null?null:Math.round(Math.max(0,consumed-entitled)*r.data.contract.trueUpUnitUsd*100)/100, fresh,unknowns:[...new Set(unknowns)],
    basis:r.data.metric==='concurrent'?'Owner-recorded peak, not inferred from installations':desktop?'Complete provider installed-application inventories':saas?'Zoom assigned licenses; activity is union of SaaS admin report and configured IdP sign-ins':'No consumption source configured',
    observedAt:o?.observedAt||null};
}
