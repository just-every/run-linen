import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile,readdir,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(await realpath('node_modules/wrangler/package.json'));
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare');
export async function adoptionHarness(){
 const dir=await mkdtemp(join(tmpdir(),'linen-adoption-'));
 if(!process.env.LINEN_ADOPTION_BUNDLE)await build({entryPoints:[resolve('tests/adoption/worker.ts')],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:join(dir,'worker.mjs')});
 const script=await readFile(process.env.LINEN_ADOPTION_BUNDLE || join(dir,'worker.mjs'),'utf8');
 console.log('Frozen adoption Worker SHA256 '+createHash('sha256').update(script).digest('hex'));
 const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort();
 const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile('migrations/'+f,'utf8')])));
 // SQLite parses trigger bodies without rearranging migration order.
 const parsed=spawnSync('python3',['-c',`import sqlite3,json,sys
out=[]
for source in json.load(sys.stdin).values():
 pending=''
 for char in source:
  pending+=char
  if char==';' and sqlite3.complete_statement(pending):
   out.append(pending);pending=''
 if pending.strip() and not all(not l.strip() or l.strip().startswith('--') for l in pending.splitlines()):raise ValueError('Incomplete SQL')
print(json.dumps(out))`],{input:JSON.stringify(sources),encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
 let mf,initialized=false;
 async function start(){
  mf=new Miniflare({...convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['ATTACHMENTS'],bindings:{SESSION_SECRET:'fixture-only-session',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}}),resourcePersistencePath:dir,isolatedResourcePersistencePath:join(dir,'isolated')});
  await mf.ready;
  if(!initialized){const db=await mf.getD1Database('DB');for(const sql of JSON.parse(parsed.stdout))await db.prepare(sql).run();initialized=true}
 }
 return {start,stop:()=>mf.dispose(),fetch:(...args)=>mf.dispatchFetch(...args),close:async()=>{if(mf)await mf.dispose();await rm(dir,{recursive:true,force:true})}};
}
