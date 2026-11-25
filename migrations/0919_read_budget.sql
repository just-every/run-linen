-- Read budget: a scheduled run or routine poll costs the same rows however much history is kept.
-- Each index below matches one query that otherwise scanned a whole history table.

-- Ticket queue and the minute sweep over open tickets (state, newest, oldest, incident window).
CREATE INDEX work_records_state_created ON work_records(workspace_id,state,created_at);
CREATE INDEX work_records_updated ON work_records(workspace_id,updated_at DESC);
CREATE INDEX work_records_created ON work_records(workspace_id,created_at);
CREATE INDEX work_records_kind_created ON work_records(workspace_id,kind,created_at);

-- Privacy reconciliation reads only history rows still marked pendingErasure.
CREATE INDEX audit_pending_erasure ON audit_events(created_at,id)
  WHERE json_valid(detail_json) AND json_extract(detail_json,'$.pendingErasure')=1;
CREATE INDEX svc_events_pending_erasure ON svc_events(created_at,id)
  WHERE json_valid(data_json) AND json_extract(data_json,'$.pendingErasure')=1;

-- Service records the minute sweep can need: open incidents, notice cadence, software renewals, monitor incidents.
CREATE INDEX svc_incident_open ON svc_records(workspace_id,updated_at)
  WHERE kind='incident' AND COALESCE(json_extract(data_json,'$.status'),'')<>'closed';
CREATE INDEX svc_records_notices ON svc_records(workspace_id,kind,updated_at)
  WHERE json_extract(data_json,'$.employeeNotices') IS NOT NULL;
CREATE INDEX svc_records_software ON svc_records(workspace_id,kind,updated_at)
  WHERE json_extract(data_json,'$.softwareLicense') IS NOT NULL;
CREATE INDEX svc_records_created ON svc_records(workspace_id,kind,created_at);
CREATE INDEX svc_incident_monitor ON svc_records(workspace_id,json_extract(data_json,'$.monitorId'),created_at)
  WHERE kind='incident';

-- Cheap "is anything due" probes the scheduler runs before it takes a lane lease.
CREATE INDEX work_obligations_live ON work_obligations(workspace_id,state,due_at);
CREATE INDEX work_lifecycle_sponsored ON work_lifecycle(workspace_id)
  WHERE sponsor_id IS NOT NULL AND cancelled_at IS NULL;
CREATE INDEX work_followup_versions_kind ON work_followup_versions(workspace_id,kind);
CREATE INDEX work_approval_stages_applies ON work_approval_stages(workspace_id,applies);
CREATE INDEX execution_operations_workspace_state ON execution_operations(workspace_id,state);
CREATE INDEX execution_outbox_workspace_state ON execution_outbox(workspace_id,state,next_attempt_at);
CREATE INDEX svc_outbox_workspace_state ON svc_outbox(workspace_id,state,next_at);
CREATE INDEX connections_workspace_status ON connections(workspace_id,status,provider);
CREATE INDEX work_intake_events_state ON work_intake_events(workspace_id,connection_id,state,created_at);
CREATE INDEX work_intake_events_work ON work_intake_events(workspace_id,work_id,connection_id,created_at);
CREATE INDEX intelligence_fulfilment_runs_state ON intelligence_fulfilment_runs(workspace_id,state);
CREATE INDEX intelligence_pending_fulfilments_state ON intelligence_pending_fulfilments(workspace_id,state);
CREATE INDEX intelligence_engineering_jobs_state ON intelligence_engineering_jobs(workspace_id,state);

-- One counter changes whenever the service accepts a write; the ticket queue's validator is derived from it.
CREATE TABLE work_list_clock (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL);
INSERT INTO work_list_clock VALUES(1,0);

-- Problem detection re-reads every incident of the last 30 days; the scheduler runs it again only after a write or an hour.
CREATE TABLE svc_detection_state (workspace_id TEXT PRIMARY KEY, clock INTEGER NOT NULL, ran_at TEXT NOT NULL) WITHOUT ROWID;
