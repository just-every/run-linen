import {knowledgeDraftChecks} from './knowledge-draft-cases.mjs';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=new URL('../../',import.meta.url).pathname;
const packages=await readdir(join(root,'node_modules/.pnpm'));
const dependency=name=>require(join(root,'node_modules/.pnpm',packages.find(x=>x.startsWith(name+'@')),'node_modules',name));
const {build}=dependency('esbuild'),{Miniflare,convertV4MiniflareOptions}=dependency('miniflare');
const dir=await mkdtemp(join(tmpdir(),'linen-knowledge-draft-'));
const built=await build({entryPoints:[join(root,'tests/work/knowledge-draft-worker.ts')],bundle:true,format:'esm',platform:'browser',write:false});
const options={workers:[{name:'test',modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-09-01',d1Databases:{DB:'knowledge-draft-test'},
  r2Buckets:['ATTACHMENTS'],bindings:{ENCRYPTION_KEY:Buffer.alloc(32).toString('base64')}}],d1Persist:join(dir,'d1'),r2Persist:join(dir,'r2')};
const mf=new Miniflare({...convertV4MiniflareOptions({...options,port:Number(process.env.LINEN_TEST_WORKER_PORT||0)}),resourcePersistencePath:dir});
async function api(path,body,headers={}) {
  const response=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,value:await response.json()};
}
try {
  const db=await mf.getD1Database('DB');
  for(const file of (await readdir(join(root,'migrations'))).filter(x=>x.endsWith('.sql')).sort())
    await db.exec((await readFile(join(root,'migrations',file),'utf8')).replace(/^--.*$/gm,'').replace(/\n/g,' '));
  await db.exec(`INSERT INTO workspaces VALUES('a','A','2026-01-01'); INSERT INTO users VALUES('owner','owner@test','Owner','unused','2026-01-01'); INSERT INTO users VALUES('employee','employee@test','Employee','unused','2026-01-01'); INSERT INTO users VALUES('stranger','stranger@test','Stranger','unused','2026-01-01'); INSERT INTO memberships VALUES('a','owner','["owner"]',1); INSERT INTO memberships VALUES('a','employee','["employee"]',1); INSERT INTO memberships VALUES('a','stranger','["operator"]',1);`);
  await knowledgeDraftChecks(api,db);
}finally{await mf.dispose();await rm(dir,{recursive:true,force:true});}
