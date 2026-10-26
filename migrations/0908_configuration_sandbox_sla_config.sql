-- Version configuration independently of ticket clocks and persisted followups.
ALTER TABLE work_escalation_levels ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE configuration_sandboxes ADD COLUMN sla_config_baseline_json TEXT NOT NULL DEFAULT '{"role":[],"calendar":[],"escalation":[],"waiting":[]}' CHECK(json_valid(sla_config_baseline_json));
ALTER TABLE configuration_sandboxes ADD COLUMN sla_config_draft_json TEXT NOT NULL DEFAULT '{"role":[],"calendar":[],"escalation":[],"waiting":[]}' CHECK(json_valid(sla_config_draft_json));
-- Keep rule versions for work already in flight, including work without an SLA clock.
CREATE TABLE work_followup_versions (
 workspace_id TEXT NOT NULL, work_id TEXT NOT NULL REFERENCES work_records(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('snapshot','escalation','waiting')), target TEXT NOT NULL DEFAULT '', level INTEGER NOT NULL DEFAULT 0,
 offset_minutes INTEGER, notify TEXT, label TEXT, remind_business_days INTEGER, resolve_business_days INTEGER,
 PRIMARY KEY(workspace_id,work_id,kind,target,level)
);
-- Legacy commitments also keep the business calendar that their due dates used.
ALTER TABLE work_commitments ADD COLUMN calendar_snapshot_json TEXT;
UPDATE work_commitments SET calendar_snapshot_json=(SELECT json_object('timezone',c.timezone,'weekdays',json(c.weekdays_json),'startHour',c.start_hour,'endHour',c.end_hour,'holidays',json(c.holidays_json),'location',c.location,'holidayCatalog',c.holiday_catalog) FROM work_calendars c WHERE c.workspace_id=work_commitments.workspace_id AND c.id=work_commitments.calendar_id);
