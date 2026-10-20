-- DESK-003: owner-ordered routing rules, each configuration item's or business service's support group, agent shifts and
-- skills, and each group's automatic assignment method, open-ticket cap and round-robin position.
CREATE TABLE work_routing_rules(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL,category TEXT,requester_id TEXT,requester_group_id TEXT,skill TEXT,group_id TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,position));
CREATE TABLE work_support_groups(workspace_id TEXT NOT NULL,item_id TEXT NOT NULL,group_id TEXT NOT NULL,set_by TEXT NOT NULL,set_at TEXT NOT NULL,PRIMARY KEY(workspace_id,item_id));
CREATE TABLE work_agent_routing(workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,calendar_id TEXT,skills_json TEXT NOT NULL DEFAULT '[]',set_by TEXT NOT NULL,set_at TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id));
ALTER TABLE work_groups ADD COLUMN assignment TEXT NOT NULL DEFAULT 'none';
ALTER TABLE work_groups ADD COLUMN max_open INTEGER;
ALTER TABLE work_groups ADD COLUMN last_assignee_id TEXT;
