-- REPORT-004: a model charge counts toward a request only when the call named that request.
ALTER TABLE intelligence_attempts ADD COLUMN work_id TEXT;
CREATE INDEX intelligence_attempts_work ON intelligence_attempts(workspace_id,work_id,created_at);
