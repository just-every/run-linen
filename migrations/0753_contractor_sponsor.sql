-- LIFE-006: a contractor or temp end date carries a sponsor who re-attests or lets access expire.
ALTER TABLE work_lifecycle ADD COLUMN sponsor_id TEXT;
ALTER TABLE work_lifecycle ADD COLUMN sponsor_reminded_at TEXT;
ALTER TABLE work_lifecycle ADD COLUMN sponsor_work_id TEXT;
