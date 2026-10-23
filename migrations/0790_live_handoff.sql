-- CHANNEL-006: a live agent joins the portal conversation during business hours; otherwise the conversation stays a ticket with an expected reply time.
CREATE TABLE work_handoff_config(
 workspace_id TEXT PRIMARY KEY, calendar_id TEXT NOT NULL, accept_seconds INTEGER NOT NULL, response_minutes INTEGER NOT NULL,
 actor_id TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE work_agent_presence(
 workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, available INTEGER NOT NULL, seen_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE work_handoffs(
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, requester_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('requested','live','ticketed','ended')), agent_id TEXT, expected_at TEXT,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL, accepted_at TEXT, ended_at TEXT
);
CREATE INDEX work_handoffs_open ON work_handoffs(workspace_id,state,expires_at);
