CREATE TABLE servicenow_import_items (
 workspace_id TEXT NOT NULL,
 work_id TEXT NOT NULL,
 import_revision INTEGER NOT NULL,
 identities_json TEXT NOT NULL,
 privacy_json TEXT NOT NULL,
 PRIMARY KEY(workspace_id,work_id)
);
CREATE TABLE servicenow_import_privacy (
 workspace_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL
);
