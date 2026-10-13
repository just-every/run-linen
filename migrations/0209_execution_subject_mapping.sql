CREATE TABLE execution_subject_mappings(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,connection_id TEXT NOT NULL,connection_revision INTEGER NOT NULL,local_user_id TEXT NOT NULL,provider_subject TEXT NOT NULL,revision INTEGER NOT NULL,active INTEGER NOT NULL DEFAULT 1,observed_at TEXT NOT NULL,reviewed_by TEXT NOT NULL,UNIQUE(workspace_id,connection_id,local_user_id));
ALTER TABLE execution_grants ADD COLUMN local_beneficiary_id TEXT;
ALTER TABLE execution_grants ADD COLUMN mapping_id TEXT;
ALTER TABLE execution_grants ADD COLUMN mapping_revision INTEGER;
