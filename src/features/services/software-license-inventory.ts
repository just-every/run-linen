import { now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import { check, normalizedSoftware, type SoftwareBinding, type SoftwareContext, type SoftwareInstallation } from './software-license-core';
import { softwareClient } from './software-license-connections';
import { currentSoftwareDeviceUser } from './software-license-device-users';
import type { ServiceRecord } from './store';

type Client = Awaited<ReturnType<typeof softwareClient>>;
export async function graphPages(client: Client, path: string) {
  let next = path; const rows: any[] = [], seen = new Set<string>();
  const start = new URL(path,client.origin);
  for (let page=0;page<100;page++) {
    const u = new URL(next,client.origin);
    check(u.origin===client.origin && u.pathname===start.pathname && !seen.has(u.href), 'software_cursor_denied', 502); seen.add(u.href);
    const data = await client.json(u.href); check(Array.isArray(data.value), 'software_graph_schema', 502);
    rows.push(...data.value); check(rows.length<=20000,'software_inventory_limit',502);
    if (!data['@odata.nextLink']) return rows;
    check(typeof data['@odata.nextLink']==='string','software_cursor_denied',502); next=data['@odata.nextLink'];
  }
  throw new Error('software_inventory_limit');
}
export async function graphAccount(client: Client, row: any) {
  const org = await graphPages(client,'/v1.0/organization?$select=id');
  check(org.length===1 && org[0].id.toLowerCase()===row.config.tenantId.toLowerCase(), 'software_graph_account_mismatch', 403);
}
export async function readEntra(ctx: SoftwareContext, row: any, binding: SoftwareBinding, from: string, to: string) {
  check(typeof binding.appId==='string' && /^[a-f0-9-]{36}$/i.test(binding.appId),'software_app_id_required',422);
  const client=await softwareClient(ctx,row); await graphAccount(client,row);
  const filter=`appId eq '${binding.appId}' and createdDateTime ge ${from} and createdDateTime lt ${to} and ${['status','errorCode'].join('/')} eq 0`;
  const rows=await graphPages(client,'/v1.0/auditLogs/signIns?$filter='+encodeURIComponent(filter)+'&$select=id,userPrincipalName,appId,createdDateTime,status');
  check(rows.every(u=>u.appId===binding.appId && u.status?.errorCode===0 && Date.parse(u.createdDateTime)>=Date.parse(from) && Date.parse(u.createdDateTime)<Date.parse(to) && typeof u.userPrincipalName==='string'),'software_signin_schema',502);
  return [...new Set(rows.map(u=>u.userPrincipalName.toLowerCase()))];
}
function matches(title: string, publisher: string, productId: string, binding: SoftwareBinding, canonical: {name:string;publisher:string}) {
  if (normalizedSoftware(title)===normalizedSoftware(canonical.name) && normalizedSoftware(publisher)===normalizedSoftware(canonical.publisher)) return true;
  return (binding.aliases||[]).some(a=>normalizedSoftware(a.title)===normalizedSoftware(title) && normalizedSoftware(a.publisher)===normalizedSoftware(canonical.publisher)
    && (publisher ? normalizedSoftware(publisher)===normalizedSoftware(a.publisher) : (a as any).productId===productId));
}
export async function readDesktop(ctx: SoftwareContext, row: any, binding: SoftwareBinding, record:ServiceRecord) {
  const canonical={name:record.data.name,publisher:record.data.publisher};
  const client=await softwareClient(ctx,row), devices: any[]=[], installations: SoftwareInstallation[]=[];
  if (binding.kind==='intune') {
    await graphAccount(client,row);
    const all=await graphPages(client,'/v1.0/deviceManagement/managedDevices?$select=id,serialNumber,userPrincipalName,lastSyncDateTime,deviceName');
    for (const d of all) {
      check(typeof d.id==='string'&&typeof d.serialNumber==='string'&&Number.isFinite(Date.parse(d.lastSyncDateTime)), 'software_inventory_schema',502);
      const apps=await graphPages(client,`/v1.0/deviceManagement/managedDevices/${encodeURIComponent(d.id)}/detectedApps`);
      const personId=(await currentSoftwareDeviceUser(ctx,record,row,d.id))?.userId||null;
      devices.push({connectionId:row.id,deviceId:d.id,serial:d.serialNumber,userId:personId,observedAt:d.lastSyncDateTime});
      for (const a of apps) {
        check(typeof a.displayName==='string'&&typeof a.id==='string','software_inventory_schema',502);
        if(matches(a.displayName,a.publisher||'',a.id,binding,canonical)) installations.push({id:`${row.id}:${d.id}:${a.id}`,connectionId:row.id,deviceId:d.id,serial:d.serialNumber,userId:personId,title:canonical.name,publisher:canonical.publisher,productId:a.id,version:a.version||'',observedAt:d.lastSyncDateTime});
      }
    }
  } else {
    let page=0,total=Infinity; const rows:any[]=[];
    while(rows.length<total) {
      check(page<100,'software_inventory_limit',502);
      const data=await client.json(`/api/v4/computers-inventory?section=GENERAL&section=HARDWARE&section=USER_AND_LOCATION&section=APPLICATIONS&page-size=100&page=${page++}&sort=id:asc`);
      check(Array.isArray(data.results)&&Number.isSafeInteger(data.totalCount)&&data.totalCount>=0,'software_inventory_schema',502);
      total=data.totalCount; rows.push(...data.results);check(rows.length<=20000&&(!total||data.results.length>0),'software_inventory_incomplete',502);
    }
    check(rows.length===total && new Set(rows.map(d=>String(d.id))).size===rows.length,'software_inventory_incomplete',502);
    for(const d of rows) {
      const deviceId=String(d.id),serial=d.hardware?.serialNumber,observedAt=d.general?.reportDate;
      check(typeof serial==='string'&&Number.isFinite(Date.parse(observedAt))&&Array.isArray(d.applications),'software_inventory_schema',502);
      const personId=(await currentSoftwareDeviceUser(ctx,record,row,deviceId))?.userId||null;
      devices.push({connectionId:row.id,deviceId,serial,userId:personId,observedAt});
      for(const a of d.applications) {
        check(typeof a.name==='string','software_inventory_schema',502);
        const productId=a.bundleId||a.macAppStoreAppStoreId||a.path||'';
        if(matches(a.name,a.publisher||'',String(productId),binding,canonical)) installations.push({id:`${row.id}:${deviceId}:${productId}`,connectionId:row.id,deviceId,serial,userId:personId,title:canonical.name,publisher:canonical.publisher,productId:String(productId),version:a.version||'',observedAt});
      }
    }
  }
  check(devices.every(d=>Date.parse(d.observedAt)<=Date.now()+1000),'software_inventory_future',502);
  return {devices,installations,readAt:now()};
}

/** Existing, owner-selected Jamf uninstall policy; never creates a script or policy. */
export async function jamfRemovalPolicy(client: Client, binding: SoftwareBinding) {
  for(const value of [binding.removalGroupId,binding.removalPolicyId,binding.removalPackageId])check(typeof value==='string'&&/^\d+$/.test(value),'software_removal_binding_required',422);
  const policy=(await client.json(`/JSSResource/policies/id/${binding.removalPolicyId}`)).policy;
  check(policy?.general?.enabled===true && policy.general.trigger_checkin===true && policy.scope?.all_computers===false
    && policy.scope.computer_groups?.some((g:any)=>String(g.id)===binding.removalGroupId)
    && policy.package_configuration?.packages?.length===1
    && policy.package_configuration.packages.every((p:any)=>String(p.id)===binding.removalPackageId && p.action==='Uninstall')
    && !(policy.scripts||[]).length && !(policy.printers||[]).length && !(policy.dock_items||[]).length,
    'software_removal_policy_mismatch',403);
  // A removal grant never covers extra file or process, encryption, account or
  // reboot actions hidden in an otherwise plausible uninstall policy.
  for(const key of ['files_processes','disk_encryption','account_maintenance','reboot'])if(policy[key]) {
    const harmless=(value:any):boolean=>value===null||value===false||value===0||value===''||value==='Do not restart'||value==='Do Not Restart'||value==='Do Nothing'||value==='Do not change'||value==='Do Not Change'||value==='None'||value==='none'||Array.isArray(value)&&value.length===0||typeof value==='object'&&Object.values(value).every(harmless);
    check(harmless(policy[key]),'software_removal_policy_extra_effect',403);
  }
  const group=(await client.json(`/JSSResource/computergroups/id/${binding.removalGroupId}`)).computer_group;
  check(group && group.is_smart===false && Array.isArray(group.computers),'software_removal_group_mismatch',403);
  return {...group,policyDigest:await hashToken(JSON.stringify(policy))};
}
export async function removeJamf(client: Client, binding: SoftwareBinding, deviceId: string, operationId: string) {
  check(/^\d+$/.test(deviceId),'software_device_id',422);
  const response=await client.call(`/JSSResource/computergroups/id/${binding.removalGroupId}`,{method:'PUT',headers:{'Content-Type':'application/xml','Idempotency-Key':operationId},body:`<computer_group><computer_additions><computer><id>${deviceId}</id></computer></computer_additions></computer_group>`});
  check(response.ok,'software_removal_unconfirmed',502);
}
