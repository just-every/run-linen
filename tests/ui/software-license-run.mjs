import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
const require=createRequire(await import.meta.resolve('wrangler/package.json')),{build}=require('esbuild'),scratch=await mkdtemp(join(tmpdir(),'linen-software-boundary-'));
try {
 const outfile=join(scratch,'boundary.mjs');
 await build({entryPoints:[resolve('tests/ui/software-license-boundary.ts')],outfile,bundle:true,format:'esm',platform:'browser',target:'es2022'});
 await new Promise((yes,no)=>{const child=spawn(process.execPath,['tests/ui/connected-run.mjs','tests/ui/software-license-connected.mjs'],{stdio:'inherit',env:{...process.env,LINEN_TEST_PROVIDER_BOUNDARY:outfile}});child.on('error',no);child.on('exit',code=>code===0?yes():no(Error(`Software provider browser exited ${code}`)));});
} finally {await rm(scratch,{recursive:true,force:true});}
