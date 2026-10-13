import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';

export async function importHarness(){
 const require=createRequire(await realpath('node_modules/wrangler/package.json'));
 const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
 const dir=await mkdtemp(join(tmpdir(),'linen-freshservice-'));
 await build({entryPoints:[resolve('tests/adoption/freshservice-import-worker.ts')],bundle:true,format:'esm',platform:'browser',target:'es2022',external:['node:*'],outfile:join(dir,'worker.mjs')});
 const script=await readFile(join(dir,'worker.mjs'),'utf8');
 const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort();
 const sources=await Promise.all(files.map(f=>readFile('migrations/'+f,'utf8')));
 const parsed=spawnSync('python3',['-c',`import sqlite3,json,sys
out=[]
for source in json.load(sys.stdin):
 pending=''
 for char in source:
  pending+=char
  if char==';' and sqlite3.complete_statement(pending):out.append(pending);pending=''
 if pending.strip() and not all(not l.strip() or l.strip().startswith('--') for l in pending.splitlines()):raise ValueError('Incomplete SQL')
print(json.dumps(out))`],{input:JSON.stringify(sources),encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
 let mf,initialized=false;
 async function start(){
  mf=new Miniflare({...convertV4MiniflareOptions({port:0,modules:true,script,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['ATTACHMENTS'],bindings:{SESSION_SECRET:'test-only-session-at-least-thirty-two-characters',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64'),AUTH_ORIGIN:'http://localhost',APP_ORIGIN:'http://localhost',AUTH_LOCAL:'true',MAIL_PROVIDER:'development',OWNER_EMAIL:'owner@example.test'}}),resourcePersistencePath:dir});
  await mf.ready;
  if(!initialized){const db=await mf.getD1Database('DB');for(const sql of JSON.parse(parsed.stdout))await db.prepare(sql).run();initialized=true;}
 }
 return {start,stop:()=>mf.dispose(),db:()=>mf.getD1Database('DB'),fetch:(...args)=>mf.dispatchFetch(...args),close:async()=>{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true});}};
}
