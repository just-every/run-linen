-- Preserve the import-to-erasure obligation even after a profile is redacted.
CREATE TABLE adoption_import_erasures (
 workspace_id TEXT NOT NULL, import_id TEXT NOT NULL, job_id TEXT NOT NULL,
 PRIMARY KEY(workspace_id,import_id,job_id)
);
