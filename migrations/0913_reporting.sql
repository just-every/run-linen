CREATE TABLE work_reports(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,definition_json TEXT NOT NULL,shared_json TEXT NOT NULL DEFAULT '[]',revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
CREATE TABLE work_report_schedules(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,report_id TEXT NOT NULL,owner_id TEXT NOT NULL,recipient_id TEXT NOT NULL,frequency TEXT NOT NULL,next_at TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1,consented_at TEXT NOT NULL);
CREATE TABLE work_report_deliveries(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,schedule_id TEXT NOT NULL,state TEXT NOT NULL,provider_ref TEXT,row_count INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL,finished_at TEXT);
CREATE UNIQUE INDEX work_report_delivery_active ON work_report_deliveries(schedule_id) WHERE state IN ('dispatching','unknown');
CREATE TABLE work_bi_exports(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,destination_json TEXT NOT NULL,credential_cipher TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,revision INTEGER NOT NULL DEFAULT 1,next_at TEXT NOT NULL,consented_at TEXT NOT NULL);
CREATE TABLE work_bi_runs(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,export_id TEXT NOT NULL,state TEXT NOT NULL,object_key TEXT NOT NULL,payload_sha256 TEXT NOT NULL,row_count INTEGER NOT NULL,snapshot_json TEXT NOT NULL,provider_ref TEXT,error TEXT,created_at TEXT NOT NULL,finished_at TEXT);
CREATE UNIQUE INDEX work_bi_run_active ON work_bi_runs(export_id) WHERE state IN ('dispatching','unknown');
CREATE TABLE work_bi_checkpoints(workspace_id TEXT NOT NULL,export_id TEXT NOT NULL,row_id TEXT NOT NULL,row_sha256 TEXT NOT NULL,PRIMARY KEY(workspace_id,export_id,row_id));
-- Removing an identity withdraws its configuration and derivative row fingerprints.
CREATE TRIGGER report_identity_erased AFTER INSERT ON work_erasure BEGIN
 DELETE FROM work_report_deliveries WHERE schedule_id IN(SELECT id FROM work_report_schedules WHERE workspace_id=NEW.workspace_id AND (owner_id=NEW.person_id OR recipient_id=NEW.person_id OR report_id IN(SELECT id FROM work_reports WHERE workspace_id=NEW.workspace_id AND owner_id=NEW.person_id)));
 DELETE FROM work_report_schedules WHERE workspace_id=NEW.workspace_id AND (owner_id=NEW.person_id OR recipient_id=NEW.person_id OR report_id IN(SELECT id FROM work_reports WHERE workspace_id=NEW.workspace_id AND owner_id=NEW.person_id));
 DELETE FROM work_reports WHERE workspace_id=NEW.workspace_id AND owner_id=NEW.person_id;
 UPDATE work_reports SET shared_json=COALESCE((SELECT json_group_array(value) FROM json_each(shared_json) WHERE value<>NEW.person_id),'[]') WHERE workspace_id=NEW.workspace_id;
 DELETE FROM work_bi_checkpoints WHERE workspace_id=NEW.workspace_id AND (export_id IN(SELECT id FROM work_bi_exports WHERE workspace_id=NEW.workspace_id AND owner_id=NEW.person_id) OR row_id IN(SELECT id FROM work_records WHERE workspace_id=NEW.workspace_id AND (requester_id=NEW.person_id OR beneficiary_id=NEW.person_id)));
 DELETE FROM work_bi_runs WHERE workspace_id=NEW.workspace_id AND export_id IN(SELECT id FROM work_bi_exports WHERE workspace_id=NEW.workspace_id AND owner_id=NEW.person_id);
 DELETE FROM work_bi_exports WHERE workspace_id=NEW.workspace_id AND owner_id=NEW.person_id;
END;
