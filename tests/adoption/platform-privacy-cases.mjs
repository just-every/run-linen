import assert from 'node:assert/strict';

/** The public erasure door owns domain cleanup and the platform tombstone. */
export async function platformPrivacyChecks({ok,request,auth,owner,database,restart}) {
  const db=await database(),rows=async(sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
  const password='synthetic-privacy-proof-2026',email='privacy-shared@example.test';
  const person=await ok('/members','POST',{email,name:'Private shared',password,roles:['operator']},owner,201);
  const current=(await ok('/session','GET',undefined,owner)).principal;
  const foreign='privacy-foreign',department='privacy-department';
  await db.batch([
    db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(foreign,'Foreign privacy fixture','2026'),
    db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(foreign,person.id,'["employee"]'),
    db.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind(foreign),
    db.prepare('INSERT INTO work_departments(id,workspace_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(department,current.workspaceId,'Private team','it','2026','2026'),
    db.prepare('INSERT INTO work_department_members(workspace_id,department_id,user_id,active,updated_by,updated_at) VALUES(?,?,?,?,?,?)').bind(current.workspaceId,department,person.id,1,current.userId,'2026'),
    db.prepare('INSERT INTO work_departments(id,workspace_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('privacy-foreign-team',foreign,'Foreign team','it','2026','2026'),
    db.prepare('INSERT INTO work_department_members(workspace_id,department_id,user_id,active,updated_by,updated_at) VALUES(?,?,?,?,?,?)').bind(foreign,'privacy-foreign-team',person.id,1,person.id,'2026'),
    ...[current.workspaceId,foreign].map((workspace,i)=>db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind('privacy-event-'+i,workspace,person.id,'effect.completed','operation-opaque',JSON.stringify({nested:{email}}),'2026')),
  ]);
  const member=await auth(await request('/login','POST',{email,password}));
  assert.equal((await request('/adoption/erase','POST',{identity:person.id},member)).status,403,'Current owner is required');
  assert.equal((await request('/adoption/erase','POST',{identity:current.userId},owner)).status,409,'Self-erasure refuses lockout');
  const erased=await ok('/adoption/erase','POST',{identity:person.id},owner);
  assert.equal(erased.state,'completed');
  assert.deepEqual(await rows('SELECT * FROM memberships WHERE workspace_id=? AND user_id=?',current.workspaceId,person.id),[]);
  assert.deepEqual(await rows('SELECT * FROM work_department_members WHERE workspace_id=? AND user_id=?',current.workspaceId,person.id),[]);
  assert.equal((await rows('SELECT active FROM work_department_members WHERE workspace_id=? AND user_id=?',foreign,person.id))[0].active,1,'Foreign departmental membership survives');
  assert.deepEqual(await rows('SELECT workspace_id FROM memberships WHERE user_id=?',person.id),[{workspace_id:foreign}]);
  assert.equal((await rows('SELECT name,email FROM users WHERE id=?',person.id))[0].name,'Private shared','Another workspace retains the legitimate shared profile');
  assert.equal((await request('/session','GET',undefined,member)).status,401,'Erasure revokes the existing native session');
  const retained=(await rows("SELECT * FROM audit_events WHERE id='privacy-event-0'"))[0];
  assert.deepEqual([retained.id,retained.actor_id,retained.target],['privacy-event-0','[erased]','operation-opaque'],'Opaque event identity and target survive');
  const detail=JSON.parse(retained.detail_json);
  assert.equal(detail.redacted,'erasure');assert.ok(Number.isFinite(Date.parse(detail.redactedAt)));assert.ok(!retained.detail_json.includes(email));
  assert.ok((await rows("SELECT detail_json FROM audit_events WHERE id='privacy-event-1'"))[0].detail_json.includes(email),'Foreign audit values are untouched');
  await restart();
  await ok('/adoption/erase','POST',{identity:person.id},owner);
  assert.ok((await request('/members','POST',{email,name:'Replay',password,roles:['employee']},owner)).status>=400,'Removal receipt blocks resurrection after restart');
  const localEmail='privacy-local@example.test',local=await ok('/members','POST',{email:localEmail,name:'Local only',password,roles:['employee']},owner,201);
  const localSession=await auth(await request('/login','POST',{email:localEmail,password}));
  await ok('/adoption/erase','POST',{identity:localEmail.toUpperCase()},owner);
  const after=await database();
  assert.equal((await after.prepare('SELECT password_hash FROM users WHERE id=?').bind(local.id).first()).password_hash,'!erased','Case-insensitive email erasure retires a local profile');
  assert.equal((await request('/session','GET',undefined,localSession)).status,401);
  assert.deepEqual((await after.prepare('PRAGMA foreign_key_check').all()).results,[]);
  console.log('PASS AUDIT-001/A1/ERASURE-001 public erasure: current-owner/self guards, scoped membership and sessions, shared profile and foreign audit isolation, anonymous durable audit, restart replay and canonical email removal');
}
