-- ASSET-006: a nonpersonal effect fence; identity-bearing facts remain in
-- svc_records and inherit its existing erasure and history boundary.
CREATE TABLE svc_software_effects (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, record_id TEXT NOT NULL,
 grant_version INTEGER NOT NULL, target_hash TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('reclaim','remove-app')),
 connection_id TEXT NOT NULL, connection_revision INTEGER NOT NULL,
 source_revision INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('sending','submitted','unknown','verified','failed')),
 attempted_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX svc_software_effects_record ON svc_software_effects(workspace_id,record_id);
CREATE UNIQUE INDEX svc_software_effect_target ON svc_software_effects(workspace_id,record_id,action,target_hash) WHERE state IN ('sending','submitted','unknown');
CREATE TABLE svc_software_guards(id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1));
