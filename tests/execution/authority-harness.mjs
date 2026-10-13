import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
export async function authorityHarness() {
  const {build}=wr('esbuild'),{Miniflare,convertV4MiniflareOptions}=wr('miniflare');
  const dir=await mkdtemp(join(tmpdir(),'linen-authority-'));
  const presence=new Set(),writes=[],requests=[];
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture'),parts=url.pathname.split('/');
    let raw='';for await(const chunk of req)raw+=chunk;
    requests.push({method:req.method,path:url.pathname});
    const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if(parts[1]==='login.microsoftonline.com')return json({access_token:'test-only'});
    if(parts[1]==='graph.microsoft.com') {
      if(parts[3]==='users')return json({id:parts[4]});
      if(parts[3]!=='groups'){res.statusCode=500;return res.end('Unexpected graph path');}
      const target=parts[4],subject=req.method==='POST'?JSON.parse(raw)['@odata.id'].split('/').at(-1):parts[6],key=target+':'+subject;
      if(['POST','DELETE'].includes(req.method)) {
        writes.push({method:req.method,target,subject});
        if(req.method==='POST')presence.add(key);else presence.delete(key);
        res.statusCode=204;return res.end();
      }
      if(presence.has(key))return json({id:subject});res.statusCode=404;return res.end();
    }
    if(parts[1]==='workflow.example.test')return json({nonce:url.searchParams.get('nonce'),target:url.searchParams.get('target'),
      beneficiaryId:url.searchParams.get('beneficiary'),expectedOutcome:url.searchParams.get('desired'),verifierVersion:1,actionVersion:1,
      observedAt:new Date().toISOString(),negativeControl:true,usableWorkflow:true,cohort:[url.searchParams.get('beneficiary')]});
    res.statusCode=500;res.end('Unexpected fixture host');
  });
  await new Promise(resolve=>server.listen(Number(process.env.LINEN_TEST_PROVIDER_PORT || 0),'127.0.0.1',resolve));
  const built=await build({entryPoints:['tests/execution/authority-worker.ts'],bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent'});
  const mf=new Miniflare({...convertV4MiniflareOptions({port:Number(process.env.LINEN_TEST_WORKER_PORT || 0),modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-09-01',d1Databases:['DB'],r2Buckets:['ATTACHMENTS'],
    bindings:{ENCRYPTION_KEY:Buffer.alloc(32,3).toString('base64'),TEST_PROVIDER_URL:`http://127.0.0.1:${server.address().port}`},
    d1Persist:join(dir,'d1')}),resourcePersistencePath:dir});
  const db=await mf.getD1Database('DB');
  for(const file of(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())
    await db.exec((await readFile('migrations/'+file,'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  const api=async(path,body,user='owner',workspace='w')=>{
    const r=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-user':user,'x-workspace':workspace},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,value:await r.json()};
  };
  const ok=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify({path:args[0],...r}));return r.value;};
  const stamp=new Date().toISOString();
  await db.batch(['w','other'].flatMap(w=>[
    db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(w,w,stamp),
    db.prepare("INSERT INTO workspace_settings VALUES(?,'{}',1)").bind(w),
  ]));
  for(const [user,roles] of [['owner',['owner']],['manager',['owner']],['new-manager',['owner']],['delegate',['approver']],['actor',['integration']],['employee',['employee']],['stranger',['employee']]]) {
    await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@test',user,'unused',stamp).run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('w',user,JSON.stringify(roles)).run();
  }
  for(const u of ['owner','actor'])await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('other',u,JSON.stringify([u==='owner'?'owner':'integration'])).run();
  const secret=(await ok('/test/secret',{clientId:'test-only',clientSecret:'test-only'})).secret;
  for(const [id,w,provider,config] of [['graph','w','microsoft-graph',{tenantId:'fixture'}],['graph-two','w','microsoft-graph',{tenantId:'fixture'}],['foreign','other','microsoft-graph',{tenantId:'fixture'}],['probe','w','workflow-probe',{url:'https://workflow.example.test/probe',allowedHosts:['workflow.example.test']}]])
    await db.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(id,w,provider,id,JSON.stringify(config),provider==='workflow-probe'?(await ok('/test/secret',{token:'fixture'})).secret:secret,'active',stamp,stamp).run();
  return {dir,db,api,ok,writes,requests,async close(){await mf.dispose();await new Promise(resolve=>server.close(resolve));}};
}
