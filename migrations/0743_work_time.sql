-- Human effort is recorded separately from machine elapsed time and SLA age.
CREATE TABLE work_time_entries (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL,
 obligation_id TEXT, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL,
 effort_role TEXT NOT NULL CHECK(effort_role IN ('employee','agent','approver','owner','vendor','technician')),
 request_type TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('manual','measured')),
 active_ms INTEGER NOT NULL DEFAULT 0 CHECK(active_ms>=0), touches INTEGER NOT NULL DEFAULT 1 CHECK(touches>=0),
 note TEXT NOT NULL DEFAULT '', state TEXT NOT NULL CHECK(state IN ('active','paused','completed')),
 sequence INTEGER NOT NULL DEFAULT 0, last_seen_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, dedup_key TEXT NOT NULL,
 UNIQUE(workspace_id,actor_id,dedup_key)
);
CREATE UNIQUE INDEX work_time_one_active ON work_time_entries(workspace_id,actor_id) WHERE state='active';
CREATE INDEX work_time_work ON work_time_entries(workspace_id,work_id,created_at);
