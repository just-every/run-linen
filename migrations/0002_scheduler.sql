CREATE TABLE platform_scheduler_leases (
  name TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE platform_scheduler_runs (
  id TEXT PRIMARY KEY,
  lane TEXT NOT NULL,
  workspace_id TEXT,
  state TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_code TEXT
);
CREATE INDEX platform_scheduler_history ON platform_scheduler_runs(workspace_id, started_at);
