CREATE TABLE svc_records (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL,
 owner_id TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'operators',
 participants_json TEXT NOT NULL DEFAULT '[]', data_json TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX svc_records_scope ON svc_records(workspace_id,kind,updated_at);
CREATE TABLE svc_events (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, record_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, kind TEXT NOT NULL, data_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX svc_events_record ON svc_events(workspace_id,record_id,created_at);
CREATE TABLE svc_receipts (
 workspace_id TEXT NOT NULL, source_id TEXT NOT NULL, external_id TEXT NOT NULL,
 digest TEXT NOT NULL, received_at TEXT NOT NULL, PRIMARY KEY(workspace_id,source_id,external_id)
);
CREATE TABLE svc_outbox (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, record_id TEXT NOT NULL,
 recipient_id TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 next_at TEXT NOT NULL, error TEXT, provider_ref TEXT,
 UNIQUE(workspace_id,record_id,recipient_id,kind,next_at)
);
CREATE TABLE svc_commands (
 workspace_id TEXT NOT NULL, record_id TEXT NOT NULL, command_key TEXT NOT NULL,
 result_json TEXT NOT NULL, PRIMARY KEY(workspace_id,record_id,command_key)
);
CREATE TABLE svc_change_locks(workspace_id TEXT NOT NULL,service_id TEXT NOT NULL,change_id TEXT NOT NULL,PRIMARY KEY(workspace_id,service_id));
CREATE TRIGGER svc_events_immutable BEFORE UPDATE ON svc_events BEGIN SELECT RAISE(ABORT,'immutable service event'); END;
CREATE UNIQUE INDEX svc_monitor_incident ON svc_records(workspace_id,json_extract(data_json,'$.monitorEventKey')) WHERE kind='incident' AND json_extract(data_json,'$.monitorEventKey') IS NOT NULL;
ALTER TABLE svc_outbox ADD COLUMN connection_id TEXT;
