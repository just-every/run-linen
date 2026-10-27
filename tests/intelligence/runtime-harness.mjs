import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'))
const {build}=wr('esbuild'),{Miniflare,convertV4MiniflareOptions,Log,LogLevel}=wr('miniflare')
export async function runtimeHarness(entry){
 const directory=await mkdtemp(join(tmpdir(),'linen-intelligence-harness-'))
 // Preserve built-ins for workerd's nodejs_compat runtime, as in production.
 await build({entryPoints:[entry],outfile:join(directory,'worker.mjs'),bundle:true,format:'esm',platform:'neutral',external:['node:*'],logLevel:'silent'})
 const script=await readFile(join(directory,'worker.mjs'),'utf8');let mf,origin
 async function start(){mf=new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script,compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['ATTACHMENTS'],resourcePersistencePath:join(directory,'state'),bindings:{ENCRYPTION_KEY:btoa('x'.repeat(32)),SESSION_SECRET:'fixture-session'},log:new Log(LogLevel.ERROR)}));origin=String(await mf.ready).replace(/\/$/,'')}
 async function stop(){if(mf){const old=mf;mf=null;await old.dispose()}}
 try{await start();const db=await mf.getD1Database('DB');for(const f of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){const sql=(await readFile('migrations/'+f,'utf8')).replace(/^--.*$/gm,'');const statements=JSON.parse(execFileSync('python3',['-c',`import sqlite3,sys,json
text=sys.stdin.read(); parts=[]; pending=''
for ch in text:
 pending+=ch
 if ch==';' and sqlite3.complete_statement(pending):
  parts.append(pending);pending=''
if pending.strip(): parts.append(pending)
print(json.dumps(parts))`],{input:sql,encoding:'utf8'}));for(const statement of statements)await db.prepare(statement).run()}}catch(e){await stop();await rm(directory,{recursive:true,force:true});throw e}
 return {get origin(){return origin},get db(){return mf.getD1Database('DB')},async restart(){await stop();await start()},async close(){await stop();await rm(directory,{recursive:true,force:true})}}
}
