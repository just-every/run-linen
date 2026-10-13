ALTER TABLE work_assets ADD COLUMN latest_event_id TEXT;
CREATE TABLE work_catalog_reservations(workspace_id TEXT NOT NULL,catalog_id TEXT NOT NULL,work_id TEXT NOT NULL,beneficiary_id TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT,PRIMARY KEY(workspace_id,catalog_id,work_id));
