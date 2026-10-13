// Connect a full-installation restore to Linen's existing reconciliation UI.
// These are native recovery records, not new grants or fabricated provider evidence.
import { createHash } from 'node:crypto'
const identity=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex')
export async function recordNativeRecovery(db,archive){
 const workspaces=(await db.prepare('SELECT id FROM workspaces ORDER BY id').all()).results
 for(const {id:workspace} of workspaces){
  const run=identity('rer-import',archive.archiveHash,workspace),hold=identity('rer-hold',run)
  const source='rer:'+archive.sourceIdentity,time=new Date().toISOString()
  // A retry resumes the same run; an incomplete history never permits release.
  await db.batch([
   db.prepare("INSERT OR IGNORE INTO adoption_imports(id,workspace_id,actor_id,idempotency_key,source_id,state,manifest_json,report_json,created_at) VALUES(?,?,'local-restore',?,?,'reconciling',?,?,?)").bind(run,workspace,'rer:'+archive.archiveHash,source,JSON.stringify({format:'rer-installation',archiveHash:archive.archiveHash,sourceIdentity:archive.sourceIdentity}),JSON.stringify({mode:'installation-restore',credentialsRevoked:true,executionHeld:true}),time),
   db.prepare("INSERT OR IGNORE INTO adoption_holds(id,workspace_id,import_id,state,reason,created_at) VALUES(?,?,?,'held','Full installation restore requires current authority and remote-effect reconciliation',?)").bind(hold,workspace,run,time),
  ])
  // Pagination bounds native D1 memory without changing the archived operations.
  let last=''
  for(;;){
   const rows=(await db.prepare('SELECT * FROM execution_operations WHERE workspace_id=? AND id>? ORDER BY id LIMIT 50').bind(workspace,last).all()).results
   if(!rows.length)break
   const statements=[]
   for(const row of rows){
    const history=identity('rer-history',run,row.id),revision=String(row.revision??1)
    statements.push(db.prepare("INSERT OR IGNORE INTO adoption_history VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(history,workspace,run,source,'execution_operations',row.id,archive.archiveHash+':'+revision,JSON.stringify(row),'history_only','Restored operation requires reconciliation before effects resume',time),db.prepare('INSERT OR IGNORE INTO adoption_import_records VALUES(?,?,?)').bind(workspace,run,history))
   }
   await db.batch(statements);last=rows.at(-1).id
  }
  await db.prepare("UPDATE adoption_imports SET state='restored' WHERE id=? AND workspace_id=? AND state='reconciling'").bind(run,workspace).run()
 }
 await db.prepare("UPDATE platform_archive_recovery SET state='complete',completed_at=? WHERE archive_hash=?").bind(new Date().toISOString(),archive.archiveHash).run()
}
