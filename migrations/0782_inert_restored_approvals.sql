-- Full-installation archive retains the decision and its exact revision as history only.
ALTER TABLE work_approval_decisions ADD COLUMN inert INTEGER NOT NULL DEFAULT 0 CHECK(inert IN (0,1));
DROP INDEX work_approval_decision_holder;
CREATE UNIQUE INDEX work_approval_decision_holder ON work_approval_decisions(workspace_id,fulfilment_id,stage_key,approver_id,work_revision,fulfilment_revision,catalog_revision) WHERE inert=0;
