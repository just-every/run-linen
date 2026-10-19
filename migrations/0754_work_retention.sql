-- RETENTION-001: owner-set retention for closed tickets and their attachments (no row = keep), with deletion receipts.
CREATE TABLE work_retention(workspace_id TEXT PRIMARY KEY,closed_ticket_days INTEGER,attachment_days INTEGER,revision INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE work_retention_receipts(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,kind TEXT NOT NULL,record_hash TEXT NOT NULL,ticket_hash TEXT NOT NULL,closed_at TEXT NOT NULL,deleted_at TEXT NOT NULL,policy_revision INTEGER NOT NULL,policy_days INTEGER NOT NULL,attachments INTEGER NOT NULL,bytes INTEGER NOT NULL);
CREATE INDEX work_retention_receipts_scope ON work_retention_receipts(workspace_id,deleted_at);
CREATE TABLE work_retention_skips(workspace_id TEXT NOT NULL,ticket_hash TEXT NOT NULL,reason TEXT NOT NULL,checked_at TEXT NOT NULL,PRIMARY KEY(workspace_id,ticket_hash));
