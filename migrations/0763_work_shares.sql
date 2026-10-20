-- CHANNEL-009: a requester or beneficiary shares a request's public thread with named colleagues; each share is revocable and kept.
CREATE TABLE work_shares(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,user_id TEXT NOT NULL,shared_by TEXT NOT NULL,shared_at TEXT NOT NULL,revoked_by TEXT,revoked_at TEXT);
CREATE UNIQUE INDEX work_shares_active ON work_shares(workspace_id,work_id,user_id) WHERE revoked_at IS NULL;
