import { handleApprovalMail } from '../../src/features/work/approval-mail-provider';
import { encryptSecret } from '../../src/platform/crypto';
import { getFulfilmentReadiness } from "../../src/features/work/fulfilment-readiness";
import { assertWorkFulfilmentAuthority } from "../../src/features/work/fulfilment-authority";
import app from './fulfilment-link-worker';
import type { Env } from '../../src/platform/types';
// Test-only persistent provider boundary, independent of application execution rows.
let env: Env;
globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const u=new URL(String(input)),db=env.DB;
  if(u.hostname==='api.sendgrid.com'&&u.pathname==='/v3/mail/send'){await db.prepare('INSERT INTO test_approval_mail(payload_json) VALUES(?)').bind(String(init.body)).run();return new Response(null,{status:202,headers:{'x-message-id':crypto.randomUUID()}});}
  if(u.hostname==='login.microsoftonline.com')return Response.json({access_token:'fixture'});
  if(u.hostname==='graph.microsoft.com') {
    // Licences (CATALOG-004 software child): assignLicense writes and licenseDetails reads the same fixture rows as groups.
    if(u.pathname.endsWith('/assignLicense')){const b=JSON.parse(String(init.body));const sku=b.addLicenses[0]?.skuId??b.removeLicenses[0];
      await db.prepare('INSERT INTO test_provider VALUES(?,?,1,0) ON CONFLICT(target) DO UPDATE SET present=excluded.present,writes=test_provider.writes+1').bind(sku,Number(!!b.addLicenses.length)).run();return Response.json({id:u.pathname.split('/')[3]});}
    if(u.pathname.endsWith('/licenseDetails'))return Response.json({value:(await db.prepare('SELECT target FROM test_provider WHERE present=1').all<any>()).results.map(r=>({skuId:r.target}))});
    if(u.pathname.startsWith('/v1.0/users/'))return Response.json({id:u.pathname.split('/').at(-1)});
    const target=u.pathname.split('/')[3];
    const row=await db.prepare('SELECT * FROM test_provider WHERE target=?').bind(target).first<any>();
    if(init.method==='POST'||init.method==='DELETE') {
      await db.prepare(`INSERT INTO test_provider VALUES(?,?,1,0) ON CONFLICT(target)
        DO UPDATE SET present=excluded.present,writes=test_provider.writes+1,lost=0`)
        .bind(target,Number(init.method==='POST')).run();
      if(row?.lost)throw new Error('Test-only lost response after actual fixture effect');
      return new Response(null,{status:204});
    }
    return row?.present?Response.json({id:'provider-employee-distinct'}):new Response(null,{status:404});
  }
  if(u.hostname==='workflow.example.test') {
    const row=await db.prepare('SELECT present FROM test_provider WHERE target=?').bind(u.searchParams.get('target')).first<any>();
    const expected=u.searchParams.get('desired');
    return Response.json({nonce:u.searchParams.get('nonce'),target:u.searchParams.get('target'),
      beneficiaryId:u.searchParams.get('beneficiary'),expectedOutcome:expected,verifierVersion:1,actionVersion:1,
      observedAt:new Date().toISOString(),negativeControl:true,
      usableWorkflow:expected==='denied'?!row?.present:!!row?.present,cohort:[u.searchParams.get('beneficiary')]});
  }
  throw new Error(`Unexpected fixture request ${u.origin}`);
};
app.post('/approval-mail/webhooks/:workspaceId',async c=>c.json(await handleApprovalMail(c.env,c.req.param('workspaceId'),c.req.raw)));
app.post('/test/approval-mail-connection',async c=>{const t=new Date().toISOString();await c.env.DB.exec('CREATE TABLE IF NOT EXISTS test_approval_mail(payload_json TEXT)');await c.env.DB.prepare("INSERT INTO connections VALUES('synthetic-linen-718','w','sendgrid','synthetic-linen-718',?,?,'active',1,?,?)").bind(JSON.stringify({from:'synthetic-linen-729@example.test'}),await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify({apiKey:'synthetic-linen-730'})),t,t).run();return c.json({configured:true});});
app.get('/test/readiness/:work/:catalog',async c=>c.json(await getFulfilmentReadiness(
  {env:c.env,principal:c.get('principal')},c.req.param('work'),c.req.param('catalog'))));
app.post('/test/manager-policy',async c=>{
  const b=await c.req.json();
  await assertWorkFulfilmentAuthority({env:c.env,principal:c.get('principal')},b.step,b.planId);
  return c.json({allowed:true});
});
export default {
  async fetch(request: Request, bindings: Env, execution: ExecutionContext) {
    env=bindings;
    return app.fetch(request,bindings,execution);
  }
};
