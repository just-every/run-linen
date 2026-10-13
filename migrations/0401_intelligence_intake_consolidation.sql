-- Consolidate early local queue into Work atomic event outbox; retain applied history.
INSERT OR IGNORE INTO work_intake_events(id,workspace_id,work_id,connection_id,source_message_id,sender,state,created_at)
SELECT id,workspace_id,work_id,'','restored-intelligence:'||fingerprint,actor_id,'pending',created_at FROM intelligence_intake WHERE state NOT IN ('proposed','interpreted');
DROP TABLE intelligence_intake;
