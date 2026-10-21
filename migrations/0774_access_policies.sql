-- LIFE-003: owner-managed birthright access policies over reviewed person values.
-- Title joins the reviewed value dimensions (catalog audience keeps its three).
CREATE TABLE work_catalog_values_v2 (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 dimension TEXT NOT NULL CHECK(dimension IN ('department','title','location','employmentType')),
 label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1
);
INSERT INTO work_catalog_values_v2 SELECT id,workspace_id,dimension,label,active,revision FROM work_catalog_values;
DROP TABLE work_catalog_values;
ALTER TABLE work_catalog_values_v2 RENAME TO work_catalog_values;

CREATE TABLE work_access_policies (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, match_json TEXT NOT NULL CHECK(json_valid(match_json)),
 grants_json TEXT NOT NULL CHECK(json_valid(grants_json) AND json_type(grants_json)='array'),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX work_access_policies_workspace ON work_access_policies(workspace_id,active);
