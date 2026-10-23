CREATE TABLE work_department_roles (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, department_id TEXT NOT NULL,
  name TEXT NOT NULL, permissions_json TEXT NOT NULL CHECK(json_valid(permissions_json)),
  revision INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(workspace_id,department_id,name)
);
CREATE TABLE work_department_role_members (
  workspace_id TEXT NOT NULL, role_id TEXT NOT NULL, user_id TEXT NOT NULL,
  role_revision INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), granted_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,role_id,user_id)
);
CREATE INDEX work_department_role_member_lookup ON work_department_role_members(workspace_id,user_id,active);
