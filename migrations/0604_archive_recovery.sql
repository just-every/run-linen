-- Local orchestration checkpoint; never exported as authority or remote data.
CREATE TABLE platform_archive_recovery (
 archive_hash TEXT PRIMARY KEY,
 job_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','complete')),
 completed_at TEXT
);
