import {spawn} from 'node:child_process';
import {mkdtemp,cp,writeFile,mkdir,open,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {applyMigrations} from './repo/tests/sql-migrations.mjs';
const root=join(import.meta.dirname,'repo');
const require=createRequire(join(root,'package.json'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare');
const scratch=await mkdtemp(join(tmpdir(),'linen-proof-'));
const out=join(import.meta.dirname,'browser-selected');
await mkdir(out,{recursive:true});
const log=await open(join(out,'worker.log'),'w');
let worker;
try {
  const state=join(scratch,'state');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'',resourcePersistencePath:join(state,'v3'),d1Databases:{DB:'local-linen'}}));
  try {await applyMigrations(await mf.getD1Database('DB'));} finally {await mf.dispose();}
  console.log('PASS fixture: all actual migrations applied through one real D1 runtime');
  await cp(join(root,'dist'),join(scratch,'dist'),{recursive:true});
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));
  const port=socket.address().port;await new Promise(r=>socket.close(r));
  const url=`http://127.0.0.1:${port}`;
  await writeFile(join(scratch,'dist/server/.dev.vars'),`AUTH_ORIGIN=${url}\nAPP_ORIGIN=${url}\nAUTH_LOCAL=true\nMAIL_PROVIDER=development\nSESSION_SECRET=${randomBytes(32).toString('hex')}\nENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`,{mode:0o600});
  worker=spawn(process.execPath,['node_modules/wrangler/bin/wrangler.js','dev','--config',join(scratch,'dist/server/wrangler.json'),'--local','--port',String(port),'--inspector-port','0','--persist-to',state],{cwd:root,stdio:['ignore',log.fd,log.fd],detached:true});
  await writeFile(join(import.meta.dirname,'browser-server-pid.txt'),String(worker.pid)+'\n');
  let ready=false;
  for(let i=0;i<120;i++) {
    if(worker.exitCode!==null)throw Error('Owned browser worker exited before ready');
    try {const response=await fetch(url+'/api/v1/setup');if(response.ok&&(await response.json()).required){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,250));
  }
  if(!ready)throw Error('Owned browser worker did not become ready');
  const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/ui/run.mjs','tests/ui/browser.mjs'],{cwd:root,stdio:'inherit',env:{...process.env,LINEN_TEST_URL:url,LINEN_TEST_OUTPUT:out,LINEN_CAPTURE:'1',LINEN_CHROMIUM_EXECUTABLE:'/usr/bin/chromium',NODE_OPTIONS:(process.env.NODE_OPTIONS||'')+' --import='+join(import.meta.dirname,'dependency-capture.mjs')}});child.on('error',reject);child.on('exit',code=>resolve(code??1));});
  if(exit)throw Error('Public browser driver exited '+exit);
} finally {
  if(worker&&worker.exitCode===null){process.kill(-worker.pid,'SIGTERM');await new Promise(r=>{worker.once('exit',r);setTimeout(r,3000);});}
  await log.close();await rm(scratch,{recursive:true,force:true});
}
