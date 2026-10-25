-- Configuration only: ticket clocks and requester membership are never copied.
ALTER TABLE configuration_sandboxes ADD COLUMN sla_baseline_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(sla_baseline_json));
ALTER TABLE configuration_sandboxes ADD COLUMN sla_draft_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(sla_draft_json));
