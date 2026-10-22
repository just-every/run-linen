import { assetEvent } from './asset-history';
import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, now, requiredString, jsonBody } from '../../platform/http';
import { getService } from '../services/store';
import { currentWorkPrincipal } from './identity';
import { permit, getWork, type WorkContext } from './core';

type Contract = { id:string; asset_id:string; vendor_id:string; kind:string; name:string; reference:string;
  coverage:string; starts_at:string; expires_at:string|null; alert_days:number; manufacturer:string|null;
  recorded_by:string; recorded_at:string };
async function asset(ctx:WorkContext, assetId:string) {
  await currentWorkPrincipal(ctx);
  permit(ctx,['owner','operator']);
  const row=await ctx.env.DB.prepare('SELECT id,serial,state,person_id FROM work_assets WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId,assetId).first<{id:string;serial:string;state:string;person_id:string|null}>();
  if (!row) throw new ApiError(404,'not_found','Asset not found');
  return row;
}
function instant(value:unknown, field:string) {
  if (typeof value!=='string' || !/^\d{4}-\d\d-\d\d(?:T|$)/.test(value) || !Number.isFinite(Date.parse(value)))
    throw new ApiError(422,'contract_date',`${field} requires a valid date`);
  return new Date(value).toISOString();
}
function https(value:unknown) {
  const input=requiredString(value,'reference',2000);
  let url:URL;
  try { url=new URL(input); } catch { throw new ApiError(422,'contract_reference','HTTPS document reference required'); }
  if (url.protocol!=='https:' || url.username || url.password) throw new ApiError(422,'contract_reference','HTTPS document reference required');
  return url.href;
}
export async function saveAssetContract(ctx:WorkContext,assetId:string,b:Record<string,unknown>) {
  const device=await asset(ctx,assetId);
  if (!['purchase','lease','warranty','support'].includes(String(b.kind))) throw new ApiError(422,'contract_kind','Purchase, lease, warranty or support required');
  const vendor=await getService(ctx.env.DB,ctx.principal,requiredString(b.vendorId,'vendorId'),'supplier');
  const start=instant(b.startsAt,'startsAt'),end=b.expiresAt ? instant(b.expiresAt,'expiresAt') : null;
  if ((b.kind!=='purchase' && !end) || (end && end<=start)) throw new ApiError(422,'contract_period','Coverage expiry must follow its start');
  const alertDays=b.alertDays===undefined ? 30 : b.alertDays;
  if (!Number.isInteger(alertDays) || Number(alertDays)<0 || Number(alertDays)>365) throw new ApiError(422,'contract_alert','Alert lead must be 0–365 days');
  const manufacturer=b.manufacturer || null;
  if (manufacturer && !['apple','dell','lenovo','other'].includes(String(manufacturer))) throw new ApiError(422,'manufacturer','Choose a supported manufacturer or other');
  const key=id(),at=now(),name=requiredString(b.name,'name'),reference=https(b.reference),coverage=requiredString(b.coverage,'coverage',10000);
  await ctx.env.DB.batch([
    ctx.env.DB.prepare('INSERT INTO work_asset_contracts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(key,ctx.principal.workspaceId,assetId,vendor.id,b.kind,name,reference,coverage,start,end,alertDays,manufacturer,ctx.principal.userId,at),
    assetEvent(ctx,assetId,'work.asset_contract_recorded',{}, {contractId:key,vendorId:vendor.id,kind:b.kind,name,reference,coverage,startsAt:start,expiresAt:end,alertDays,manufacturer},at,device.person_id ? [device.person_id] : []),
  ]);
  return {id:key};
}
export async function assetContracts(ctx:WorkContext,assetId:string) {
  const device=await asset(ctx,assetId);
  const rows=await ctx.env.DB.prepare('SELECT * FROM work_asset_contracts WHERE workspace_id=? AND asset_id=? ORDER BY recorded_at,rowid')
    .bind(ctx.principal.workspaceId,assetId).all<Contract>();
  const items=[];
  for (const row of rows.results) {
    let vendor;
    try { vendor=await getService(ctx.env.DB,ctx.principal,row.vendor_id,'supplier'); }
    catch (error) { if (error instanceof ApiError && error.status===404) continue; throw error; }
    const at=Date.now(),expiry=row.expires_at ? Date.parse(row.expires_at) : null;
    const status=Date.parse(row.starts_at)>at ? 'upcoming' : expiry!==null && expiry<=at ? 'expired' : 'active';
    const alert=expiry===null ? null : expiry<=at ? 'expired' : expiry-at<=row.alert_days*86400000 ? 'expiring' : null;
    const lookup=row.manufacturer==='apple' ? 'https://checkcoverage.apple.com/'
      : row.manufacturer==='dell' ? 'https://www.dell.com/support/contractservices/en-us/'
      : row.manufacturer==='lenovo' ? 'https://pcsupport.lenovo.com/us/en/warranty-lookup' : null;
    items.push({...row,vendor:{id:vendor.id,name:vendor.data.name},status,alert,manufacturerLookup:lookup});
  }
  return {asset:device,items};
}
async function repairScope(ctx:WorkContext,workId:string) {
  await currentWorkPrincipal(ctx);
  permit(ctx,['owner','operator']);
  await getWork(ctx,workId);
}
export function registerAssetContractRoutes(app:Hono<AppEnv>) {
  app.get('/assets/:id/contracts',async c=>c.json(await assetContracts({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.post('/assets/:id/contracts',async c=>c.json(await saveAssetContract({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c)),201));
  app.post('/work/:id/repair-assets',async c=>{
    const ctx={env:c.env,principal:c.get('principal')},workId=c.req.param('id'),b=await jsonBody(c);
    await repairScope(ctx,workId);
    const device=await asset(ctx,requiredString(b.assetId,'assetId'));
    const at=now();
    await c.env.DB.batch([c.env.DB.prepare('INSERT INTO work_asset_repairs VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING')
      .bind(ctx.principal.workspaceId,workId,device.id,ctx.principal.userId,at),
      assetEvent(ctx,device.id,'work.asset_repair_linked',{}, {link:{kind:'ticket',id:workId}},at,device.person_id ? [device.person_id] : []),
    ]);
    return c.json({assetId:device.id});
  });
  app.get('/work/:id/repair-assets',async c=>{
    const ctx={env:c.env,principal:c.get('principal')},workId=c.req.param('id');
    await repairScope(ctx,workId);
    const rows=await c.env.DB.prepare('SELECT asset_id FROM work_asset_repairs WHERE workspace_id=? AND work_id=?')
      .bind(ctx.principal.workspaceId,workId).all<{asset_id:string}>();
    return c.json({items:await Promise.all(rows.results.map(row=>assetContracts(ctx,row.asset_id)))});
  });
}
