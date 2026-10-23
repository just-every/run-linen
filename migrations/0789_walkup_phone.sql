-- CHANNEL-007: owner-mapped badge and phone identities, the walk-up queue and phone calls turned into tickets.
CREATE TABLE work_contact_points(
 workspace_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('badge','phone')), value TEXT NOT NULL,
 user_id TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,kind,value)
);
CREATE TABLE work_walkups(
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, person_id TEXT NOT NULL, site TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('waiting','serving','resolved','left')), actor_id TEXT NOT NULL, taken_by TEXT, outcome TEXT,
 created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
);
CREATE INDEX work_walkups_queue ON work_walkups(workspace_id,state,created_at);
CREATE TABLE work_calls(
 workspace_id TEXT NOT NULL, connection_id TEXT NOT NULL, call_id TEXT NOT NULL, caller TEXT, user_id TEXT, work_id TEXT,
 state TEXT NOT NULL CHECK(state IN ('ticketed','unmatched','dismissed')), recording_url TEXT, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,connection_id,call_id)
);
