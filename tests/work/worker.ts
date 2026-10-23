import { processDueReporting, processDueBiExports } from '../../src/features/work';
import { registerMcpFieldClassificationRoutes } from '../../src/features/mcp/field-classification';
import { eraseServicePerson } from '../../src/features/services/privacy';
import { registerServiceRoutes } from "../../src/features/services";
import { registerConnectionRoutes } from "../../src/features/connections";
import { createGrant } from "../../src/features/execution/grants";
import { registerCustomRoleRoutes } from '../../src/platform/custom-roles';
import { Hono } from "hono";
import {
  registerWorkRoutes,
  restoreAdoptionRecord,
  businessDue,
  workIntakePort,
} from "../../src/features/work";
import type { AppEnv } from "../../src/platform/types";
import { ApiError } from "../../src/platform/http";
const app = new Hono<AppEnv>();
app.use("*", async (c, next) => {
  c.set("principal", {
    userId: c.req.header("x-user") || "owner",
    workspaceId: c.req.header("x-workspace") || "a",
    roles: JSON.parse(c.req.header("x-roles") || '["owner"]'),
  });
  await next();
});
registerCustomRoleRoutes(app);
registerMcpFieldClassificationRoutes(app);
// Test-only scheduling seam: change real D1 state after route evaluation, before its batch commits.
for(const seam of ['/work/:id/fulfilment','/catalog-bundles/:id/request'])app.use(seam,async(c,next)=>{
  const kind=c.req.header('x-catalog-race'), target=c.req.header('x-catalog-target');
  if(!kind || !target)return next();
  const db=c.env.DB,w=c.get('principal').workspaceId;
  let changed=false;
  c.env={...c.env,DB:new Proxy(db,{get(targetDb,key){
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      if(!changed){changed=true;
        if(kind==='person')await db.prepare("UPDATE work_people SET attributes_json='{}',revision=revision+1 WHERE workspace_id=? AND id=?").bind(w,target).run();
        else if(kind==='catalog')await db.prepare('UPDATE work_catalog SET revision=revision+1 WHERE workspace_id=? AND id=?').bind(w,target).run();
        else if(kind==='member')await db.prepare('UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?').bind(w,target).run();
        else if(kind==='quote')await db.prepare("UPDATE work_attachments SET sha256='drifted' WHERE workspace_id=? AND id=?").bind(w,target).run();
      }
      return db.batch(statements);
    };
    const value=Reflect.get(targetDb,key);return typeof value==='function'?value.bind(targetDb):value;
  }})};
  await next();
});
// Network fixtures are confined to this test Worker; product adapters always call the real provider.
app.use('/bi/exports/:id/run',async(c,next)=>{
  const race=c.req.header('x-bi-race');if(!race)return next();
  const db=c.env.DB,w=c.get('principal').workspaceId,user=c.get('principal').userId;let changed=false;
  c.env={...c.env,DB:new Proxy(db,{get(target,key){
    if(key==='batch')return async(statements:D1PreparedStatement[])=>{
      const result=await db.batch(statements);
      if(!changed){changed=true;
        if(race==='authority')await db.prepare('UPDATE memberships SET active=0 WHERE workspace_id=? AND user_id=?').bind(w,user).run();
        else if(race==='scope')await db.prepare("UPDATE work_records SET sensitivity='restricted' WHERE workspace_id=? AND id=?").bind(w,c.req.header('x-bi-target')??'').run();
        else if(race==='hold')await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES(?,'{\"executionHeld\":true}') ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json").bind(w).run();
      }
      return result;
    };
    const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }})};
  await next();
});
const reportingFetch=globalThis.fetch;
let s3Mode='accepted';
const s3Objects=new Map<string,{body:string;digest:string;checksum:string}>();
const s3Calls:{method:string;key:string;body?:string}[]=[];
const biModes:Record<string,string>={gcs:'accepted',azure:'accepted',snowflake:'accepted',bigquery:'accepted',google:'accepted'};
const biCalls:{provider:string;method:string;path:string;body?:string;conditional:boolean;auth:string}[]=[];
const biObjects=new Map<string,string>(),biWarehouseRows=new Map<string,Map<string,unknown>>();
const biJobs=new Map<string,Record<string,any>>(),biStatements=new Map<string,{statementHandle:string;code:string;sqlState:string}>();
let biGooglePublicKey:JsonWebKey|null=null;
function biApplyRows(provider:string,rows:Record<string,unknown>[]) {
  const table=biWarehouseRows.get(provider)??new Map<string,unknown>();
  for(const row of rows){if(typeof row.id!=='string')throw new Error('Fixture row id missing');table.set(row.id,row);}
  biWarehouseRows.set(provider,table);
}
async function biProviderFetch(url:URL,init?:RequestInit):Promise<Response|null> {
  const provider=url.hostname==='storage.googleapis.com'?'gcs':url.hostname.endsWith('.blob.core.windows.net')?'azure':url.hostname.endsWith('.snowflakecomputing.com')?'snowflake':url.hostname==='bigquery.googleapis.com'?'bigquery':url.hostname==='oauth2.googleapis.com'?'google':null;
  if(!provider)return null;
  const headers=new Headers(init?.headers),method=init?.method??'GET',mode=biModes[provider],body=init?.body===undefined?undefined:String(init.body);
  const auth=provider==='azure'&&url.searchParams.has('sig')?'sas':headers.get('authorization')==='Bearer synthetic-linen-31'?'bearer':provider==='google'?'jwt':'invalid';
  biCalls.push({provider,method,path:url.pathname,...(body&&provider!=='google'?{body}:{}),conditional:headers.get('if-none-match')==='*'||headers.get('x-goog-if-generation-match')==='0',auth});
  if(auth==='invalid')throw new Error('Fixture expected synthetic scoped provider credential');
  if(provider==='google') {
    const parameters=new URLSearchParams(body),assertion=parameters.get('assertion')??'';
    if(method!=='POST'||url.pathname!=='/token'||parameters.get('grant_type')!=='urn:ietf:params:oauth:grant-type:jwt-bearer'||assertion.split('.').length!==3)throw new Error('Fixture expected Google JWT grant');
    const decode=(s:string)=>JSON.parse(atob(s.replace(/-/g,'+').replace(/_/g,'/'))),claims=decode(assertion.split('.')[1]);
    if(claims.aud!=='https://oauth2.googleapis.com/token'||claims.exp-claims.iat!==3600||!['https://www.googleapis.com/auth/devstorage.read_write','https://www.googleapis.com/auth/bigquery'].includes(claims.scope))throw new Error('Fixture JWT audience, lifetime or scope incorrect');
    if(!biGooglePublicKey)throw new Error('Fixture Google verification key missing');
    const publicKey=await crypto.subtle.importKey('jwk',biGooglePublicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const parts=assertion.split('.'),signature=Uint8Array.from(atob(parts[2].replace(/-/g,'+').replace(/_/g,'/')),s=>s.charCodeAt(0));
    if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,signature,new TextEncoder().encode(parts.slice(0,2).join('.'))))throw new Error('Fixture Google JWT signature failed');
    if(mode==='rejected')return Response.json({error:'synthetic-linen-32'},{status:401});
    return Response.json({access_token:'synthetic-linen-31',token_type:'Bearer',expires_in:3600});
  }
  if(provider==='gcs'||provider==='azure') {
    const key=url.origin+url.pathname,receipt=provider==='gcs'?{'x-guploader-uploadid':'synthetic-linen-33'}:{'x-ms-request-id':'synthetic-linen-34'};
    if(method==='GET') {
      if(mode==='readback_error')return new Response(null,{status:403});
      const stored=biObjects.get(key);return new Response(mode==='mismatch'?'synthetic-linen-35':stored??null,{status:stored===undefined?404:200,headers:receipt});
    }
    if(method!=='PUT'||!biCalls.at(-1)?.conditional||headers.get('content-type')!=='text/csv; charset=utf-8')throw new Error('Fixture expected conditional CSV PUT');
    if(provider==='azure'&&(headers.get('x-ms-blob-type')!=='BlockBlob'||!headers.has('x-ms-version')))throw new Error('Fixture Azure required headers missing');
    if(mode==='rejected')return new Response(null,{status:403});
    if(biObjects.has(key))return new Response(null,{status:412});
    if(mode!=='absent')biObjects.set(key,body??'');
    if(mode==='unknown'||mode==='absent')throw new Error('Fixture upload response lost');
    return new Response(null,{status:provider==='gcs'?200:201,headers:receipt});
  }
  if(provider==='snowflake') {
    if(method==='GET') {
      const handle=url.pathname.split('/').at(-1)??'',receipt=biStatements.get(handle);
      if(!receipt)return Response.json({},{status:404});
      if(mode==='pending')return Response.json({statementHandle:handle},{status:202});
      if(mode==='readback_error')return Response.json({},{status:403});
      return Response.json(mode==='mismatch'?{...receipt,statementHandle:crypto.randomUUID()}:receipt);
    }
    const query=JSON.parse(body??'{}'),rows=JSON.parse(query.bindings?.['1']?.value??'null');
    if(method!=='POST'||url.searchParams.get('async')!=='true'||!url.searchParams.get('requestId')||!query.statement?.startsWith('MERGE INTO "LINEN"."PUBLIC"."TICKETS" T USING (SELECT ')||!query.statement.includes('FLATTEN(INPUT => PARSE_JSON(?))')||!query.statement.includes('WHEN MATCHED THEN UPDATE SET')||!query.statement.includes('WHEN NOT MATCHED THEN INSERT')||query.bindings?.['1']?.type!=='TEXT'||!Array.isArray(rows)||!['OAUTH','PROGRAMMATIC_ACCESS_TOKEN'].includes(headers.get('x-snowflake-authorization-token-type')??''))throw new Error('Fixture Snowflake SQL API contract mismatch');
    const handle=crypto.randomUUID();
    if(mode==='rejected')return Response.json({statementHandle:handle,code:'synthetic-linen-36'},{status:422});
    biApplyRows(provider,rows);
    const receipt={statementHandle:handle,code:'090001',sqlState:'00000'};biStatements.set(handle,receipt);
    if(mode==='unknown')throw new Error('Fixture Snowflake accepted, handle response lost');
    return Response.json(mode==='pending'?{statementHandle:handle}:receipt,{status:mode==='pending'?202:200});
  }
  if(method==='GET') {
    const jobId=url.pathname.split('/').at(-1)??'',job=biJobs.get(jobId);
    if(!job)return Response.json({},{status:404});
    if(mode==='readback_error')return Response.json({},{status:403});
    return Response.json({...job,...(mode==='mismatch'?{configuration:{query:{query:'synthetic-linen-37'}}}:{}),status:{state:mode==='pending'?'RUNNING':'DONE'}});
  }
  const job=JSON.parse(body??'{}'),q=job.configuration?.query,params=q?.queryParameters;
  if(method!=='POST'||!job.jobReference?.jobId?.startsWith('linen_')||q?.useLegacySql!==false||q?.parameterMode!=='NAMED'||!q?.query?.startsWith('MERGE `synthetic-linen-1.linen.tickets` T USING (SELECT ')||!q.query.includes('WHEN MATCHED THEN UPDATE SET')||!q.query.includes('PARSE_JSON(@rows)')||params?.length!==1||params[0].name!=='rows'||params[0].parameterType?.type!=='STRING')throw new Error('Fixture BigQuery job API contract mismatch');
  if(mode==='rejected')return Response.json({error:{message:'synthetic-linen-38'}},{status:403});
  biApplyRows(provider,JSON.parse(params[0].parameterValue.value));biJobs.set(job.jobReference.jobId,job);
  if(mode==='unknown')throw new Error('Fixture BigQuery accepted, response lost');
  return Response.json({...job,status:{state:mode==='pending'?'RUNNING':'DONE'}});
}
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input));
  const biResponse=await biProviderFetch(url,init);if(biResponse)return biResponse;
  if(!url.hostname.endsWith('.s3.us-east-1.amazonaws.com'))return reportingFetch(input,init);
  const headers=new Headers(init?.headers),method=init?.method??'GET';
  if(!headers.get('authorization')?.startsWith('AWS4-HMAC-SHA256 Credential=synthetic-linen-1/'))throw new Error('Unexpected synthetic S3 credential');
  const key=url.href;s3Calls.push({method,key,...(method==='PUT'?{body:String(init?.body)}:{})});
  if(method==='HEAD') {
    const object=s3Objects.get(key);
    return new Response(null,{status:object?200:404,headers:object?{'x-amz-meta-linen-sha256':object.digest,'x-amz-checksum-sha256':object.checksum,'x-amz-request-id':'synthetic-linen-3'}:{'x-amz-request-id':'synthetic-linen-4'}});
  }
  if(method!=='PUT'||headers.get('if-none-match')!=='*')throw new Error('Expected conditional S3 PUT');
  if(s3Mode==='rejected')return new Response(null,{status:403});
  if(s3Objects.has(key))return new Response(null,{status:412});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(init?.body)));
  const checksum=btoa(String.fromCharCode(...new Uint8Array(digest)));
  if(checksum!==headers.get('x-amz-checksum-sha256'))return new Response(null,{status:400});
  s3Objects.set(key,{body:String(init?.body),digest:headers.get('x-amz-meta-linen-sha256')??'',checksum});
  if(s3Mode==='unknown')throw new Error('synthetic-linen-5 response lost after S3 accepted object');
  return new Response(null,{status:200,headers:{'x-amz-request-id':'synthetic-linen-6','etag':'synthetic-linen-7'}});
}) as typeof fetch;
app.get('/test/reporting-provider',c=>c.json({calls:s3Calls}));
app.post('/test/reporting-provider',async c=>{s3Mode=(await c.req.json()).mode;return c.json({mode:s3Mode});});
app.get('/test/bi-providers',c=>c.json({calls:biCalls,rows:Object.fromEntries([...biWarehouseRows].map(([provider,rows])=>[provider,[...rows.values()]]))}));
app.post('/test/bi-providers',async c=>{const value=await c.req.json();if(!Object.hasOwn(biModes,value.provider))return c.json({error:'unknown provider'},422);biModes[value.provider]=value.mode;return c.json({changed:true});});
app.post('/test/bi-google-key',async c=>{biGooglePublicKey=await c.req.json();return c.json({configured:true});});
app.post('/test/reporting-tick',async c=>{await processDueReporting(c.env);await processDueBiExports(c.env);return c.json({processed:true});});

app.onError((e, c) =>
  c.json({ error: e.message }, e instanceof ApiError ? (e.status as 400) : 500),
);
registerWorkRoutes(app);
registerServiceRoutes(app);
registerConnectionRoutes(app);
app.post('/test/erase-service-person',async c=>c.json(await eraseServicePerson({env:c.env,principal:c.get('principal')},await c.req.json())));
app.post("/test/grant", async (c) =>
  c.json(
    await createGrant(
      { env: c.env, principal: c.get("principal") },
      await c.req.json(),
    ),
  ),
);
app.post("/test/restore", async (c) =>
  c.json(
    await restoreAdoptionRecord(
      { env: c.env, principal: c.get("principal") },
      await c.req.json(),
    ),
  ),
);
app.post("/test/calendar", async (c) => {
  const b = await c.req.json();
  return c.json({ due: businessDue(b.start, b.minutes, b.calendar) });
});
app.post("/test/intake-port", async (c) => {
  const b = await c.req.json();
  const ctx = { env: c.env, principal: c.get("principal") };
  const events = await workIntakePort.list(ctx, b.workId);
  const event = events[0];
  if (!event) return c.json({ count: 0 });
  const claimed = await workIntakePort.claim(ctx, event.id);
  const concurrent = await workIntakePort.claim(ctx, event.id);
  await workIntakePort.finish(ctx, event.id, {
    state: "interpreted",
    result: { fixture: true },
  });
  return c.json({
    count: events.length,
    claimed: !!claimed,
    concurrent: !!concurrent,
  });
});
export default app;
