-- Native entity fence metadata. Never grants an imported identity a membership.
CREATE TABLE freshservice_import_items (
 workspace_id TEXT NOT NULL,
 work_id TEXT NOT NULL,
 import_revision TEXT NOT NULL,
 identities_json TEXT NOT NULL,
 PRIMARY KEY(workspace_id,work_id)
);
CREATE TABLE freshservice_import_privacy (
 workspace_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL DEFAULT 0
);
