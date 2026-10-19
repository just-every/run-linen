-- CATALOG-004: bundles of existing catalog items pinned at their revisions, and the snapshot each bundle request used.
CREATE TABLE work_catalog_bundles(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,items_json TEXT NOT NULL,owner_id TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE work_bundle_requests(workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,bundle_id TEXT NOT NULL,bundle_revision INTEGER NOT NULL,items_json TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,work_id));
