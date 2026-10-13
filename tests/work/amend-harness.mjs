import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=new URL('../../',import.meta.url).pathname;
export async function harness() {
  const packages=await readdir(join(root,'node_modules/.pnpm'));
  const dep=name=>require(join(root,'node_modules/.pnpm',packages.find(x=>x.startsWith(name+'@')),'node_modules',name));
  const {build}=dep('esbuild'),{Miniflare,convertV4MiniflareOptions}=dep('miniflare');
  const dir=await mkdtemp(join(tmpdir(),'linen-amend-'));
  const built=await build({entryPoints:[join(root,'tests/work/amend-worker.ts')],bundle:true,format:'esm',platform:'browser',write:false});
  const options={...convertV4MiniflareOptions({port:Number(process.env.LINEN_TEST_WORKER_PORT || 0),workers:[{name:'test',modules:true,script:built.outputFiles[0].text,
    compatibilityDate:'2026-09-01',d1Databases:{DB:'amend'},r2Buckets:['ATTACHMENTS'],
    bindings:{ENCRYPTION_KEY:Buffer.alloc(32,2).toString('base64')}}],d1Persist:join(dir,'d1'),r2Persist:join(dir,'r2')}),resourcePersistencePath:dir};
  let mf=new Miniflare(options);
  const api=async(path,body,user='owner',workspace='w')=>{
    const r=await mf.dispatchFetch(`http://localhost${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-user':user,'x-workspace':workspace},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,value:await r.json()};
  };
  const ok=async(...args)=>{const r=await api(...args);assert.ok(r.status<300,JSON.stringify({path:args[0],...r}));return r.value;};
  const db=await mf.getD1Database('DB');
  for(const file of(await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())await db.exec((await readFile(join(root,'migrations',file),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  await db.exec(`CREATE TABLE test_provider(target TEXT PRIMARY KEY,present INTEGER,writes INTEGER,lost INTEGER);
    INSERT INTO workspaces VALUES('w','Fixture','2026-01-01'); INSERT INTO workspaces VALUES('other','Other','2026-01-01');
    INSERT INTO users VALUES('owner','owner@test','Owner','unused','2026-01-01');
    INSERT INTO users VALUES('employee','employee@test','Employee','unused','2026-01-01');
    INSERT INTO users VALUES('stranger','stranger@test','Stranger','unused','2026-01-01');
    INSERT INTO memberships VALUES('w','owner','["owner"]',1); INSERT INTO memberships VALUES('w','employee','["employee"]',1);
    INSERT INTO memberships VALUES('w','stranger','["employee"]',1); INSERT INTO memberships VALUES('other','owner','["owner"]',1);`);
  return {db,api,ok,get mf(){return mf;},async restart(){await mf.dispose();mf=new Miniflare(options);return mf.getD1Database('DB');},async close(){await mf.dispose();await rm(dir,{recursive:true,force:true});}};
}
