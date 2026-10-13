CREATE TABLE intelligence_investigations (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL,
 requester_id TEXT NOT NULL, service_id TEXT NOT NULL, service_revision INTEGER NOT NULL,
 owner_id TEXT NOT NULL, incident_id TEXT, commitment_id TEXT, commitment_revision INTEGER,
 research_id TEXT, state TEXT NOT NULL, error_code TEXT, reported_key TEXT,
 lease_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,work_id)
);
CREATE INDEX intelligence_investigations_due ON intelligence_investigations(workspace_id,state);

-- Earlier probe admission incorrectly promoted provenance exceptions to failures.
-- Preserve the diagnostic/attempt record but withdraw its claimed observation time.
UPDATE intelligence_observations SET state='uncertain',observed_at=''
WHERE state='failed' AND json_extract(evidence_json,'$.error') IS NOT NULL;
