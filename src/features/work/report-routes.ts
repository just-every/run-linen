import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, jsonBody } from '../../platform/http';
import { buildReport, reportReader, reportRows, reportSources } from './report-data';
import { reportCsv, reportXlsx } from './report-files';
import { listReports, runSavedReport, saveReport, reportAudit } from './report-store';
import { reportRecipients, listReportSchedules, createReportSchedule, setReportSchedule, runReportSchedule } from './report-schedules';
import { createBiExport, listBiExports, biReceipts, runBiExport, reconcileBiExport, setBiActive } from './bi-exports';
export function registerReportRoutes(app:Hono<AppEnv>) {
  app.get('/reports/schema',async c=>{await reportReader({env:c.env,principal:c.get('principal')});return c.json({sources:reportSources,gaps:['Slack delivery requires CHANNEL-001.','BI supports CSV to S3, Google Cloud Storage and Azure Blob, and direct row upserts to pre-existing Snowflake and BigQuery tables. The Parquet alternative is not built.','Owner-only destination consent is conservative proposed policy pending ct.'],semantics:{location:'Ticket-declared context.location; missing values remain null.',filters:'Exact typed field equality; groupBy counts matching rows by one field.',schedule:'Weekly or nightly at 00:00 UTC, next occurrence after authorization.',sourceScopes:'Tickets: normal non-HR report scope. Assets: owner/operator. Lifecycle: owner. Changes: current service visibility.'}});});
  app.get('/reports/recipients',async c=>c.json({items:await reportRecipients({env:c.env,principal:c.get('principal')})}));
  app.post('/reports/preview',async c=>c.json(await buildReport({env:c.env,principal:c.get('principal')},await jsonBody(c))));
  app.get('/reports/custom',async c=>c.json({items:await listReports({env:c.env,principal:c.get('principal')})}));
  app.post('/reports/custom',async c=>c.json(await saveReport({env:c.env,principal:c.get('principal')},await jsonBody(c)),201));
  app.get('/reports/custom/:id',async c=>c.json(await runSavedReport({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.get('/reports/custom/:id/export',async c=>{
    const ctx={env:c.env,principal:c.get('principal')},report=await runSavedReport(ctx,c.req.param('id')),format=c.req.query('format')??'csv';
    if(!['csv','xlsx'].includes(format))throw new ApiError(422,'report_format','Choose csv or xlsx');
    await reportAudit(ctx,'report.exported',report.id,{format,rowCount:report.rows.length}).run();
    c.header('Cache-Control','private, no-store');c.header('Content-Disposition',`attachment; filename="linen-report.${format}"`);
    c.header('Content-Type',format==='csv'?'text/csv; charset=utf-8':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return c.body(format==='csv'?reportCsv(report.columns,report.rows):reportXlsx(report.columns,report.rows));
  });
  app.get('/reports/custom/:id/schedules',async c=>c.json(await listReportSchedules({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.post('/reports/custom/:id/schedules',async c=>c.json(await createReportSchedule({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c)),201));
  app.post('/reports/schedules/:id',async c=>c.json(await setReportSchedule({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/reports/schedules/:id/run',async c=>c.json(await runReportSchedule({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.get('/bi/tickets',async c=>{const ctx={env:c.env,principal:c.get('principal')},rows=await reportRows(ctx,'tickets');c.header('Cache-Control','private, no-store');return c.json({columns:reportSources.tickets,rows,total:rows.length,scope:'Current normal ticket report scope; restricted and HR excluded',truncated:false});});
  app.get('/bi/exports',async c=>c.json({items:await listBiExports({env:c.env,principal:c.get('principal')})}));
  app.post('/bi/exports',async c=>c.json(await createBiExport({env:c.env,principal:c.get('principal')},await jsonBody(c)),201));
  app.get('/bi/exports/:id',async c=>c.json(await biReceipts({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.post('/bi/exports/:id',async c=>c.json(await setBiActive({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c))));
  app.post('/bi/exports/:id/run',async c=>c.json(await runBiExport({env:c.env,principal:c.get('principal')},c.req.param('id'))));
  app.post('/bi/exports/:id/reconcile',async c=>c.json(await reconcileBiExport({env:c.env,principal:c.get('principal')},c.req.param('id'))));
}
