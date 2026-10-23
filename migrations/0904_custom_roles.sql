CREATE TABLE platform_custom_roles (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL,
 department_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,name), FOREIGN KEY(department_id) REFERENCES work_departments(id)
);
CREATE TABLE platform_custom_role_members (
 workspace_id TEXT NOT NULL, role_id TEXT NOT NULL REFERENCES platform_custom_roles(id),
 user_id TEXT NOT NULL REFERENCES users(id), active INTEGER NOT NULL CHECK(active IN (0,1)),
 PRIMARY KEY(workspace_id,role_id,user_id)
);
