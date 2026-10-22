-- LIFE-002: owner-managed dated task templates over the reviewed values of a join, move or leave.
-- A matching template becomes team tasks (task.manual obligations of the lifecycle record) with due and
-- reminder instants fixed at admission and re-dated only by an effective-date amendment.
CREATE TABLE work_lifecycle_templates (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('join','move','leave')),
 match_json TEXT NOT NULL CHECK(json_valid(match_json)),
 tasks_json TEXT NOT NULL CHECK(json_valid(tasks_json) AND json_type(tasks_json)='array'),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX work_lifecycle_templates_workspace ON work_lifecycle_templates(workspace_id,active);
ALTER TABLE work_obligations ADD COLUMN remind_at TEXT;
ALTER TABLE work_obligations ADD COLUMN reminded_at TEXT;
ALTER TABLE work_obligations ADD COLUMN template_json TEXT CHECK(template_json IS NULL OR json_valid(template_json));
