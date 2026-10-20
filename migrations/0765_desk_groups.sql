-- DESK-001: agent groups named by the owner (acting for admin), their members and leads, and each ticket's one accountable group.
CREATE TABLE work_groups(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,name));
CREATE TABLE work_group_members(workspace_id TEXT NOT NULL,group_id TEXT NOT NULL,user_id TEXT NOT NULL,lead INTEGER NOT NULL DEFAULT 0 CHECK(lead IN (0,1)),added_by TEXT NOT NULL,added_at TEXT NOT NULL,PRIMARY KEY(workspace_id,group_id,user_id));
ALTER TABLE work_records ADD COLUMN group_id TEXT;
