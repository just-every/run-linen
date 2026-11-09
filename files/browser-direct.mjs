import {spawn} from 'node:child_process';
import {mkdtemp,rm,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import assert from 'node:assert/strict';
import {applyMigrations} from './repo/tests/sql-migrations.mjs';
const root=join(import.meta.dirname,'repo');
const require=createRequire(join(root,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const out=join(import.meta.dirname,'browser-direct');await mkdir(out,{recursive:true});
const scratch=await mkdtemp(join(tmpdir(),'linen-direct-'));
const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
const port=socket.address().port;await new Promise(r=>socket.close(r));
const url=`http://127.0.0.1:${port}`;
const server=join(root,'dist/server');
const modules=[{type:'ESModule',path:join(server,'index.js')},...(await readdir(server,{recursive:true})).filter(name=>name.endsWith('.js')&&name!=='index.js').map(name=>({type:'ESModule',path:join(server,name)}))];
const mf=new Miniflare(convertV4MiniflareOptions({
 host:'127.0.0.1',port,modules,modulesRoot:server,
 compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],
 resourcePersistencePath:join(scratch,'v3'),d1Databases:{DB:'local-linen'},r2Buckets:['ATTACHMENTS'],
 assets:{directory:join(root,'dist/client'),binding:'ASSETS',run_worker_first:true,routerConfig:{has_user_worker:true}},
 bindings:{AUTH_ORIGIN:url,APP_ORIGIN:url,AUTH_LOCAL:'true',MAIL_PROVIDER:'development',SESSION_SECRET:randomBytes(32).toString('hex'),ENCRYPTION_KEY:randomBytes(32).toString('base64')}
}));
try {
 await mf.ready;await applyMigrations(await mf.getD1Database('DB'));
 const setup=await (await fetch(url+'/api/v1/setup')).json();assert.equal(setup.required,true);
 console.log('PASS direct built Worker: native assets and auth, isolated real D1 and all actual migrations');
 const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/ui/run.mjs',process.argv[2]||'tests/ui/browser.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,LINEN_TEST_URL:url,LINEN_TEST_OUTPUT:out,LINEN_CAPTURE:'1',LINEN_CHROMIUM_EXECUTABLE:'/usr/bin/chromium',NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --import='+join(import.meta.dirname,'dependency-capture.mjs')}});child.on('error',reject);child.on('exit',code=>resolve(code??1));});
 assert.equal(exit,0,'Complete public browser driver passes');
} finally {await mf.dispose();await rm(scratch,{recursive:true,force:true});}
