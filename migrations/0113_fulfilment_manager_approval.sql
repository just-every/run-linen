CREATE TABLE work_fulfilment_approvals (
 id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,fulfilment_id TEXT NOT NULL,
 work_revision INTEGER NOT NULL,fulfilment_revision INTEGER NOT NULL,catalog_revision INTEGER NOT NULL,
 person_revision INTEGER NOT NULL,manager_id TEXT NOT NULL,holder_id TEXT NOT NULL,
 beneficiary_id TEXT NOT NULL,purpose TEXT NOT NULL,expires_at TEXT,
 event_key TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(workspace_id,work_id,event_key)
);
