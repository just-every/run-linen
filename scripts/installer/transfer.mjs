import { getPlatformProxy,unstable_splitSqlQuery } from 'wrangler'
import { nativeMigrationPreflight,appliedMigrations,platformMigrationDeclaration } from '@runeditrun/rer/portability-migrations'
import { execFileSync } from 'node:child_process'
import { createPortability } from '@runeditrun/rer/modules/portability'
import { exportArchive,importArchive,fileRecords } from '@runeditrun/rer/modules/portability/files'
import { readArchive } from '@runeditrun/rer/modules/portability'
import { tombstone } from '@runeditrun/rer/modules/portability/journal'
import { migrationReplay } from '@runeditrun/rer/modules/portability/migration-history'
import { recordNativeRecovery } from './recovery.mjs'
import { createLinenPortabilityPolicy } from '../../src/platform/portability-policy.mjs'
const [direction,path,journal]=process.argv.slice(2)
let archive,later
if(direction==='import')for await(const record of fileRecords(path,readArchive)){if(record.kind==='manifest')archive={sourceIdentity:record.sourceIdentity,epoch:record.epoch};if(record.kind==='closing')archive.archiveHash=record.archiveHash}
if(direction==='import'&&journal)for await(const record of fileRecords(journal,readArchive))if(record.kind==='manifest')later=record
const open=()=>getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:'.wrangler/state/v3'},remoteBindings:false})
let proxy=await open()
try{
 // The shared preflight validates native d1_migrations and Platform rer_migrations.
 // It refuses changed bytes or partial history before Wrangler can create a ledger.
 const declaration=platformMigrationDeclaration()
 const {nativeApply}=await nativeMigrationPreflight({root:process.cwd(),db:proxy.env.DB,binding:'DB',platformMigrations:declaration})
 if(nativeApply){
  await proxy?.dispose();proxy=null
  execFileSync('pnpm',['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc'],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}})
  proxy=await open()
 }
 const plan=await appliedMigrations(process.cwd(),proxy.env.DB,'DB',declaration,unstable_splitSqlQuery)
 const portabilityPolicy=await createLinenPortabilityPolicy(proxy.env)
 const service=await createPortability({db:proxy.env.DB,buckets:{ATTACHMENTS:proxy.env.ATTACHMENTS},policy:portabilityPolicy,migrations:()=>migrationReplay(plan,portabilityPolicy)})
 // A later export carries the shared value-free redaction checkpoint too, so
 // --journal fences old archives on a different installation.
 if(direction==='export'){
  const state=await proxy.env.DB.prepare('SELECT source_identity,epoch FROM rer_portability_state WHERE id=1').first()
  if(state?.epoch>0)await proxy.env.DB.prepare('INSERT OR IGNORE INTO rer_portability_journal VALUES(?,?)').bind(state.source_identity,await tombstone(state.source_identity,'rer_portability_state',{id:1})).run()
 }
 let resumed=false
 if(direction==='import'){
  const prior=await proxy.env.DB.prepare('SELECT * FROM platform_archive_recovery WHERE archive_hash=?').bind(archive.archiveHash).first()
  if(prior){
   // A supplied newer journal also fences a retry that would only finish native
   // bookkeeping. It must never revive recovery for an obsolete checkpoint.
   if(later){if(later.sourceIdentity!==archive.sourceIdentity||later.epoch<archive.epoch)throw Error('later_journal');if(later.epoch>archive.epoch)throw Error('erasure_epoch')}
   // Shared restore's epoch remains authoritative even for an idempotent retry.
   const epoch=await proxy.env.DB.prepare('SELECT epoch FROM rer_portability_epochs WHERE source=?').bind(archive.sourceIdentity).first()
   if(epoch&&epoch.epoch>archive.epoch)throw Error('erasure_epoch')
   const status=await service.status(prior.job_id).catch(error=>{if(error.code==='job_not_found')return null;throw error})
   if(status?.phase==='complete'){if(prior.state!=='complete')await recordNativeRecovery(proxy.env.DB,archive);resumed=true}
   else {if(status)await service.imports.abort(prior.job_id);await proxy.env.DB.prepare('DELETE FROM platform_archive_recovery WHERE archive_hash=?').bind(archive.archiveHash).run()}
  }
  const finalize=service.imports.finalize
  service.imports.finalize=async(id,options)=>{
   // This checkpoint is durable before the shared atomic restore can commit.
   await proxy.env.DB.prepare("INSERT INTO platform_archive_recovery VALUES(?,?,'pending',NULL) ON CONFLICT(archive_hash) DO UPDATE SET job_id=excluded.job_id,state='pending',completed_at=NULL").bind(archive.archiveHash,id).run()
   return finalize(id,options)
  }
 }
 const result=resumed?{restored:true,resumed:true}:await(direction==='export'?exportArchive(service,path,['Sessions, bearer credentials, passwords and local outbox are excluded; provider execution must be reauthorized after restore.']):importArchive(service,path,[],journal))
 if(direction==='import'&&!resumed)await recordNativeRecovery(proxy.env.DB,archive)
 console.log(JSON.stringify(result))
}finally{await proxy?.dispose()}
