#!/usr/bin/env node
// Module-local wrappers use existing authenticated session, never a privileged bypass.
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
const [command,directory]=process.argv.slice(2)
if(!['export','restore'].includes(command)||!directory)throw Error('Usage: node src/features/adoption/cli.mjs export|restore DIRECTORY; LINEN_URL and LINEN_COOKIE required')
const base=new URL(process.env.LINEN_URL||'http://127.0.0.1:3000'),cookie=process.env.LINEN_COOKIE;if(!cookie)throw Error('LINEN_COOKIE required')
if(base.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(base.hostname))throw Error('HTTPS required outside localhost')
const sessionResponse=await fetch(new URL('/api/v1/session',base),{headers:{Cookie:cookie}});if(!sessionResponse.ok)throw Error('Current authenticated session required');const session=await sessionResponse.json()
async function request(path,method='GET',body,raw=false){const response=await fetch(new URL('/api/v1'+path,base),{method,headers:{Cookie:cookie,Origin:base.origin,'X-Linen-CSRF':session.csrfToken,'Content-Type':raw?'application/octet-stream':'application/json'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});if(!response.ok){let code='request_failed';try{code=(await response.json()).error.code}catch{}throw Error(`${response.status} ${code}`)}return response}
const dir=resolve(directory);await mkdir(dir,{recursive:true,mode:0o700});const stateFile=join(dir,`.${command}-checkpoint.json`);let state;try{state=JSON.parse(await readFile(stateFile,'utf8'))}catch{state={idempotencyKey:crypto.randomUUID()};await writeFile(stateFile,JSON.stringify(state),{mode:0o600})}
const digest=b=>createHash('sha256').update(b).digest('hex')
if(command==='export'){
 const run=await (await request('/exports','POST',{idempotencyKey:state.idempotencyKey})).json();state.id=run.id;await writeFile(stateFile,JSON.stringify(state),{mode:0o600});let manifest;for(;;){const result=await (await request(`/exports/${run.id}/advance`,'POST',{})).json();if(result.state==='ready'){manifest=result;break}}
 for(const chunk of manifest.chunks){const file=join(dir,`${chunk.ordinal}.chunk`);let bytes;try{bytes=await readFile(file)}catch{}if(!bytes||digest(bytes)!==chunk.sha256){bytes=Buffer.from(await (await request(`/exports/${run.id}/chunks/${chunk.ordinal}`)).arrayBuffer());if(digest(bytes)!==chunk.sha256)throw Error('Archive chunk hash mismatch');await writeFile(file,bytes,{mode:0o600})}}
 await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});console.log(`Export verified: ${manifest.chunks.length} chunks`)
}else{
 const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));const run=await (await request('/imports','POST',{manifest,idempotencyKey:state.idempotencyKey})).json();state.id=run.id;await writeFile(stateFile,JSON.stringify(state),{mode:0o600});if(run.state==='uploading'){for(const chunk of manifest.chunks){const bytes=await readFile(join(dir,`${chunk.ordinal}.chunk`));if(digest(bytes)!==chunk.sha256)throw Error('Archive chunk hash mismatch');await request(`/imports/${run.id}/chunks/${chunk.ordinal}`,'PUT',bytes,true)}const report=await (await request(`/imports/${run.id}/dry-run`,'POST',{})).json();await writeFile(join(dir,'dry-run.json'),JSON.stringify(report,null,2),{mode:0o600})}
 if(process.env.LINEN_ACCEPT_SEMANTIC_LOSS!=='yes'){console.log('Dry run saved; inspect dry-run.json. Set LINEN_ACCEPT_SEMANTIC_LOSS=yes to apply the reviewed report. Execution will remain held.');process.exit(0)}
 for(;;){const result=await (await request(`/imports/${run.id}/resume`,'POST',{acceptSemanticLoss:true})).json();if(result.state!=='applying'){console.log(`Import state: ${result.state}; external execution remains held`);break}}
}
