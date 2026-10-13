import sqlite3,pathlib
root=pathlib.Path(__file__).resolve().parents[2]
c=sqlite3.connect(':memory:')
for file in sorted((root/'migrations').glob('*.sql')): c.executescript(file.read_text())
c.execute("INSERT INTO execution_grants VALUES('g','w',1,'issuer','actor',NULL,NULL,'group.add',1,'target','beneficiary','connection','2026-01-01','2027-01-01',1,'{}','2026-01-01',1,NULL,NULL,NULL)")
try: c.execute("UPDATE execution_grants SET target='evil'"); raise AssertionError('mutable grant')
except sqlite3.IntegrityError: pass
c.execute("INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,parent_id,created_at) VALUES('o','w','p','{}','running','r','a','initial','2026-01-01')")
c.execute("INSERT INTO execution_fences VALUES('w','r','o',1)")
c.execute("INSERT INTO execution_fences VALUES('w','r','other',1) ON CONFLICT(workspace_id,resource) DO UPDATE SET operation_id=excluded.operation_id,fence=execution_fences.fence+1 WHERE NOT EXISTS(SELECT 1 FROM execution_operations WHERE id=execution_fences.operation_id AND state IN ('running','unknown','cancel_requested'))")
assert c.execute('SELECT operation_id,fence FROM execution_fences').fetchone()==('o',1)
c.execute("UPDATE execution_operations SET state='unknown'")
c.execute("INSERT INTO execution_fences VALUES('w','r','other',1) ON CONFLICT(workspace_id,resource) DO UPDATE SET operation_id=excluded.operation_id,fence=execution_fences.fence+1 WHERE NOT EXISTS(SELECT 1 FROM execution_operations WHERE id=execution_fences.operation_id AND state IN ('running','unknown','cancel_requested'))")
assert c.execute('SELECT operation_id,fence FROM execution_fences').fetchone()==('o',1)
assert c.execute("UPDATE execution_operations SET state='cancelled' WHERE id='o' AND revision=99").rowcount==0
c.execute("INSERT INTO execution_decisions VALUES('d','w','p','o','a','g',1,1,'allowed','2026')")
try: c.execute("UPDATE execution_decisions SET allowed=0");raise AssertionError('mutable decision')
except sqlite3.IntegrityError: pass
print('Execution schema: all migrations, immutable grants/decisions, running and unknown fencing, stale revision rejection passed')
# Retained-data transition: an earlier applied 0201 did not yet contain no-delete triggers.
r=sqlite3.connect(':memory:')
for file in sorted((root/'migrations').glob('*.sql')):
 if file.name>='0205': break
 sql=file.read_text()
 if file.name=='0201_execution_context.sql':
  import re
  sql=re.sub(r'CREATE TRIGGER execution_\w+_no_delete.*?END;', '', sql, flags=re.S)
 r.executescript(sql)
r.execute("INSERT INTO execution_grants VALUES('retained','w',1,'issuer','actor',NULL,NULL,'group.add',1,'target','beneficiary','connection','2026-01-01','2027-01-01',1,'{}','2026-01-01')")
r.executescript((root/'migrations/0205_execution_erasure.sql').read_text())
r.executescript((root/'migrations/0206_execution_connection_revision.sql').read_text())
assert r.execute("SELECT target,connection_revision FROM execution_grants WHERE id='retained'").fetchone()==('target',0)
try:r.execute("DELETE FROM execution_grants WHERE id='retained'");raise AssertionError('missing repaired immutable trigger')
except sqlite3.IntegrityError:pass
print('Execution retained-data upgrade passed: missing old triggers repaired, prior grant bytes preserved, current connection reissue required')
