-- DESK-004: location calendars with a holiday catalog, requester groups, ordered SLA policies, each ticket's bound policy snapshot and its waiting-on pauses.
ALTER TABLE work_calendars ADD COLUMN location TEXT;
ALTER TABLE work_calendars ADD COLUMN holiday_catalog TEXT;
CREATE TABLE work_requester_groups(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,members_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(workspace_id,name));
CREATE TABLE work_sla_policies(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL,priority TEXT,category TEXT,requester_group_id TEXT,calendar_id TEXT,first_response_minutes INTEGER NOT NULL,next_response_minutes INTEGER NOT NULL,resolution_minutes INTEGER NOT NULL,pause_on_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,position));
CREATE TABLE work_sla_clocks(workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,policy_id TEXT NOT NULL,policy_revision INTEGER NOT NULL,policy_json TEXT NOT NULL,calendar_json TEXT,bound_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(workspace_id,work_id));
CREATE TABLE work_sla_pauses(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,waiting_on TEXT,paused_at TEXT NOT NULL,resumed_at TEXT);
CREATE INDEX work_sla_pauses_work ON work_sla_pauses(workspace_id,work_id,paused_at);
