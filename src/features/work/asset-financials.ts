import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, now, requiredString, jsonBody } from '../../platform/http';
import { currentWorkPrincipal } from './identity';
import { permit, type WorkContext } from './core';
import { calendarDate, financialReport, type Financial } from './depreciation';

async function asset(ctx:WorkContext, assetId:string) {
  await currentWorkPrincipal(ctx);
  permit(ctx,['owner','operator']);
  const row=await ctx.env.DB.prepare('SELECT id,serial FROM work_assets WHERE workspace_id=? AND id=?')
    .bind(ctx.principal.workspaceId,assetId).first<{id:string;serial:string}>();
  if (!row) throw new ApiError(404,'not_found','Asset not found');
  return row;
}
export async function saveAssetFinancials(ctx:WorkContext,assetId:string,b:Record<string,unknown>) {
  await asset(ctx,assetId);
  const cents=b.purchaseCents,months=b.usefulMonths,revision=b.revision;
  if (!Number.isSafeInteger(cents) || Number(cents)<=0 || Number(cents)>100000000000
    || !Number.isInteger(months) || Number(months)<2 || Number(months)>600
    || !Number.isInteger(revision) || Number(revision)<0
    || !['straight-line','declining-balance'].includes(String(b.method)))
    throw new ApiError(422,'financial_input','Purchase cost in USD cents, useful life 2–600 months, method and current revision required');
  const start=calendarDate(b.inServiceDate,'In-service date'),center=requiredString(b.costCenter,'costCenter',200),at=now();
  const w=ctx.principal.workspaceId,db=ctx.env.DB;
  const result=await db.batch([
    db.prepare(`INSERT INTO work_asset_financials SELECT ?,?,?,?,?,?,?,1,?,?
      WHERE ?=0 OR EXISTS(SELECT 1 FROM work_asset_financials WHERE workspace_id=? AND asset_id=? AND revision=?)
      ON CONFLICT(workspace_id,asset_id) DO UPDATE SET purchase_cents=excluded.purchase_cents,
      in_service_date=excluded.in_service_date,useful_months=excluded.useful_months,method=excluded.method,
      cost_center=excluded.cost_center,revision=work_asset_financials.revision+1,
      recorded_by=excluded.recorded_by,recorded_at=excluded.recorded_at
      WHERE work_asset_financials.revision=?`)
      .bind(w,assetId,cents,start,months,b.method,center,ctx.principal.userId,at,revision,w,assetId,revision,revision),
    db.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? WHERE changes()>0`)
      .bind(id(),w,ctx.principal.userId,'work.asset_financials_recorded',assetId,
        JSON.stringify({purchaseCents:cents,inServiceDate:start,usefulMonths:months,method:b.method,costCenter:center}),at),
  ]);
  if (!result[0].meta.changes) throw new ApiError(409,'revision_conflict','Asset financials changed; reload before saving');
  return {assetId,revision:Number(revision)+1};
}
export async function readAssetFinancials(ctx:WorkContext,assetId:string,query:{asOf?:string;fiscalStart?:string}) {
  const device=await asset(ctx,assetId),today=now().slice(0,10);
  const asOf=calendarDate(query.asOf ?? today,'As-of date');
  const fiscalStart=calendarDate(query.fiscalStart ?? `${asOf.slice(0,4)}-01-01`,'Fiscal start');
  if (!fiscalStart.endsWith('-01')) throw new ApiError(422,'fiscal_start','Fiscal year must start on the first of a month');
  const financial=await ctx.env.DB.prepare('SELECT * FROM work_asset_financials WHERE workspace_id=? AND asset_id=?')
    .bind(ctx.principal.workspaceId,assetId).first<Financial>();
  return {asset:device,...(financial ? financialReport(financial,asOf,fiscalStart) : {financial:null})};
}
function csvCell(value:unknown) {
  // Spreadsheet programs must treat user-controlled centers and serials as text.
  const text=String(value),safe=/^[=+\-@\t\r\n]/.test(text) ? "'"+text : text;
  return '"'+safe.replaceAll('"','""')+'"';
}
export function registerAssetFinancialRoutes(app:Hono<AppEnv>) {
  app.post('/assets/:id/financials',async c=>c.json(await saveAssetFinancials(
    {env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.get('/assets/:id/financials',async c=>c.json(await readAssetFinancials(
    {env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.query())));
  app.get('/assets/:id/financials.csv',async c=>{
    const report=await readAssetFinancials({env:c.env,principal:c.get('principal')},c.req.param('id'),c.req.query());
    if (!report.financial) throw new ApiError(404,'not_found','Record asset financials before exporting');
    const dollars=(cents:number)=>(cents/100).toFixed(2);
    const rows=[['Asset serial','Cost center','Currency','Method','Purchase cost','In service','Useful months','Fiscal start','Fiscal end exclusive','Month','Posting date','Opening book value','Depreciation','Closing book value'],
      ...report.schedule!.map(row=>[report.asset.serial,report.financial!.cost_center,'USD',report.financial!.method,
        dollars(report.financial!.purchase_cents),report.financial!.in_service_date,report.financial!.useful_months,
        report.fiscalStart!,report.fiscalEndExclusive!,row.month,row.date,dollars(row.openingCents),dollars(row.depreciationCents),dollars(row.bookCents)])];
    c.header('Content-Type','text/csv; charset=utf-8');
    c.header('Content-Disposition','attachment; filename="asset-depreciation.csv"');
    c.header('Cache-Control','private, no-store');
    return c.body(rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n');
  });
}
