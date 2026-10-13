import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {DatabaseSync} from 'node:sqlite'
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'))
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare')
const files=(await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile('migrations/'+f,'utf8')])))
// SQLite's own parser preserves trigger bodies and original statement order.
const parsed=spawnSync('python3',['-c',`import sqlite3,json,sys
out={}
for name,source in json.load(sys.stdin).items():
 statements=[]; pending=''
 for char in source:
  pending+=char
  if char==';' and sqlite3.complete_statement(pending):
   statements.append(pending); pending=''
 if pending.strip() and not all(not line.strip() or line.strip().startswith('--') for line in pending.splitlines()): raise ValueError('Incomplete SQL: '+name)
 out[name]=statements
print(json.dumps(out))`],{input:JSON.stringify(sources),encoding:'utf8'})
assert.equal(parsed.status,0,parsed.stderr)
const statements=JSON.parse(parsed.stdout)
// Frozen pre-repair guard schema, representing an already-applied 0070.
const deployedGuards=["CREATE TRIGGER platform_erasure_authority BEFORE INSERT ON platform_identity_erasures BEGIN\n SELECT CASE WHEN NOT EXISTS (\n  SELECT 1 FROM memberships m,json_each(m.roles_json) r\n  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.actor_id AND m.active=1 AND r.value='owner'\n ) THEN RAISE(ABORT,'platform_owner_required') END;\n SELECT CASE WHEN NOT EXISTS (\n  SELECT 1 FROM adoption_tombstones WHERE workspace_id=NEW.workspace_id AND identity_hash=NEW.identity_hash\n ) THEN RAISE(ABORT,'platform_tombstone_required') END;\n SELECT CASE WHEN NEW.user_id IS NOT NULL AND EXISTS (\n  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.user_id AND m.active=1 AND r.value='owner'\n ) AND NOT EXISTS (\n  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id AND m.user_id<>NEW.user_id AND m.active=1 AND r.value='owner'\n ) THEN RAISE(ABORT,'platform_another_owner_required') END;\nEND;", "\nCREATE TRIGGER platform_erased_membership_insert BEFORE INSERT ON memberships\nWHEN EXISTS(SELECT 1 FROM platform_identity_erasures WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id)\nBEGIN SELECT RAISE(ABORT,'platform_identity_erased'); END;", "\nCREATE TRIGGER platform_erased_membership_update BEFORE UPDATE ON memberships\nWHEN EXISTS(SELECT 1 FROM platform_identity_erasures WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id)\nBEGIN SELECT RAISE(ABORT,'platform_identity_erased'); END;"]
async function check(db,mode,label){
 await db.run('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)')
 async function apply(file){for(const sql of statements[file])await db.run(sql);await db.run('INSERT INTO d1_migrations(name) VALUES(?)',file)}
 async function seed(){
  await db.run("INSERT INTO workspaces VALUES('w','Retained workspace','2026')")
  for(const u of ['owner','employee']){await db.run('INSERT INTO users VALUES(?,?,?,?,?)',u,u+'@fixture.test','Retained '+u,'retained-hash','2026');await db.run('INSERT INTO memberships VALUES(?,?,?,1)','w',u,JSON.stringify([u]))}
  await db.run("INSERT INTO sessions VALUES('s','employee','w','token','csrf','2099','2026')")
  await db.run("INSERT INTO audit_events VALUES('a','w','owner','retained','target','{}','2026')")
 }
 let history=[]
 if(mode==='fresh'){for(const f of files)await apply(f);await seed()}
 else {
  const prior=mode==='retained-platform'?files.filter(f=>f<='0001_platform.sql'):files.filter(f=>f<='0500_adoption.sql')
  for(const f of prior)await apply(f)
  await seed()
  if(mode==='deployed-privacy'){
   for(const sql of deployedGuards)await db.run(sql)
   await db.run("INSERT INTO adoption_tombstones VALUES('w','prior','2026')")
   await db.run("INSERT INTO platform_identity_erasures VALUES('w','prior',NULL,'owner','2026')")
  }
  history=await db.all('SELECT * FROM d1_migrations ORDER BY id')
  for(const f of files.filter(f=>!prior.includes(f)))await apply(f)
  assert.deepEqual((await db.all('SELECT * FROM d1_migrations ORDER BY id')).slice(0,history.length),history)
  if(mode==='deployed-privacy')assert.deepEqual(await db.all("SELECT * FROM platform_identity_erasures WHERE identity_hash='prior'"),[{workspace_id:'w',identity_hash:'prior',user_id:null,actor_id:'owner',erased_at:'2026'}])
 }
 assert.equal((await db.all('SELECT * FROM d1_migrations')).length,files.length)
 assert.equal((await db.all("SELECT * FROM users WHERE id='employee'"))[0].password_hash,'retained-hash')
 assert.deepEqual((await db.all('SELECT id FROM sessions')).map(row=>row.id),mode==='fresh'?['s']:[],'Upgrade retires sessions without an issued version proof')
 assert.equal((await db.all('SELECT * FROM audit_events'))[0].id,'a')
 await assert.rejects(db.run("INSERT INTO platform_identity_erasures VALUES('w','bad',NULL,'employee','2026')"),/platform_owner_required/)
 await assert.rejects(db.run("INSERT INTO platform_identity_erasures VALUES('w','missing',NULL,'owner','2026')"),/platform_tombstone_required/)
 await db.run("INSERT INTO adoption_tombstones VALUES('w','last','2026')")
 await assert.rejects(db.run("INSERT INTO platform_identity_erasures VALUES('w','last','owner','owner','2026')"),/platform_another_owner_required/)
 await db.run("INSERT INTO adoption_tombstones VALUES('w','erased','2026')")
 await db.run("INSERT INTO platform_identity_erasures VALUES('w','erased','employee','owner','2026')")
 await assert.rejects(db.run("UPDATE memberships SET active=0 WHERE user_id='employee'"),/platform_identity_erased/)
 await db.run("DELETE FROM memberships WHERE user_id='employee'")
 await assert.rejects(db.run("INSERT INTO memberships VALUES('w','employee','[\"employee\"]',1)"),/platform_identity_erased/)
 assert.deepEqual(await db.all('PRAGMA foreign_key_check'),[])
 // D1 forbids integrity_check; native SQLite additionally checks physical integrity.
 if(label==='SQLite')assert.equal((await db.all('PRAGMA integrity_check'))[0].integrity_check,'ok')
 console.log(`PASS ${label} ${mode}: ${files.length} sorted migrations, preserved data/history, privacy guards and foreign keys`)
}
for(const mode of ['fresh','retained-platform','deployed-privacy']){
 const sqlite=new DatabaseSync(':memory:')
 try{await check({run:async(sql,...args)=>sqlite.prepare(sql).run(...args),all:async(sql)=>sqlite.prepare(sql).all().map(r=>({...r}))},mode,'SQLite')}finally{sqlite.close()}
 const mf=new Miniflare(convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0), modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-09-08',d1Databases:['DB']}))
 try{const d1=await mf.getD1Database('DB');await check({run:async(sql,...args)=>d1.prepare(sql).bind(...args).run(),all:async(sql)=>(await d1.prepare(sql).all()).results},mode,'workerd/D1')}finally{await mf.dispose()}
}
assert.deepEqual((await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort(),files,'Migration inventory changed during gate; rerun')
