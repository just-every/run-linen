CREATE TABLE work_erasure_guards(id TEXT PRIMARY KEY,acquired INTEGER NOT NULL CHECK(acquired=1));
CREATE TABLE work_blob_erasure(workspace_id TEXT NOT NULL,blob_key TEXT NOT NULL,requested_at TEXT NOT NULL,deleted_at TEXT,last_error TEXT,PRIMARY KEY(workspace_id,blob_key));
