CREATE TABLE intelligence_pending_fulfilments (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, catalog_id TEXT NOT NULL,
 requester_id TEXT NOT NULL, work_revision INTEGER NOT NULL, input_json TEXT NOT NULL,
 state TEXT NOT NULL, error_code TEXT, lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,work_id,catalog_id)
);
