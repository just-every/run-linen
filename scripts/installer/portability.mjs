// The edition policy is executable (credential scrubbing and execution holds),
// so load it in a dedicated resource worker rather than serialize functions.
import { fileURLToPath } from 'node:url'
import { refuse } from '@runeditrun/rer/errors'
import { fileRecords } from '@runeditrun/rer/modules/portability/files'
import { readArchive } from '@runeditrun/rer/modules/portability'
import { lstat } from 'node:fs/promises'
const run=direction=>async({root,path,journal,store,signal,operationToken,platform,legacyRecovery})=>{
 if(platform&&platform!=='workers'||legacyRecovery)throw refuse('Linen supports current v2 local Worker archives only.')
 if(direction==='import'){for await(const record of fileRecords(path,readArchive)){}if(journal)for await(const record of fileRecords(journal,readArchive)){}}
 if(direction==='export'&&await lstat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e}))throw refuse('Export requires a new archive path.')
 await store.run('Applying local Linen migrations','pnpm',['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc'],{cwd:root,signal,env:{...process.env,RER_LOCAL_OPERATION:operationToken,WRANGLER_SEND_METRICS:'false'}})
 await store.run(direction==='export'?'Exporting Linen data':'Restoring Linen data',process.execPath,[fileURLToPath(new URL('./transfer.mjs',import.meta.url)),direction,path,...(journal?[journal]:[])],{cwd:root,signal})
 return {target:'local',[direction==='export'?'output':'input']:path}
}
export const portability={export:run('export'),import:run('import')}
