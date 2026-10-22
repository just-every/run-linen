-- CATALOG-002: per-item approval stages after the manager, decisions with their channel and comment, and
-- single-use email approval tokens. A decision binds the exact work, fulfilment and catalog revisions it covered.
ALTER TABLE work_catalog ADD COLUMN manager_approval_json TEXT CHECK(manager_approval_json IS NULL OR json_valid(manager_approval_json));
ALTER TABLE work_catalog ADD COLUMN approvals_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(approvals_json));
ALTER TABLE work_fulfilment_approvals ADD COLUMN comment TEXT;
ALTER TABLE work_fulfilment_approvals ADD COLUMN channel TEXT NOT NULL DEFAULT 'portal';
CREATE TABLE work_approval_stages (
 workspace_id TEXT NOT NULL, fulfilment_id TEXT NOT NULL, work_id TEXT NOT NULL, ordinal INTEGER NOT NULL, stage_key TEXT NOT NULL,
 definition_json TEXT NOT NULL CHECK(json_valid(definition_json)), applies INTEGER NOT NULL CHECK(applies IN (0,1)),
 active_at TEXT, remind_at TEXT, reminded_at TEXT, sla_at TEXT, breached_at TEXT,
 PRIMARY KEY(workspace_id,fulfilment_id,stage_key)
);
CREATE TABLE work_approval_decisions (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, fulfilment_id TEXT NOT NULL, stage_key TEXT NOT NULL,
 approver_id TEXT NOT NULL, decision TEXT NOT NULL CHECK(decision IN ('approved','rejected')), comment TEXT,
 channel TEXT NOT NULL CHECK(channel IN ('portal','email')), work_revision INTEGER NOT NULL, fulfilment_revision INTEGER NOT NULL,
 catalog_revision INTEGER NOT NULL, event_key TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id,work_id,event_key)
);
CREATE TABLE work_approval_tokens (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, fulfilment_id TEXT NOT NULL, stage_key TEXT NOT NULL,
 approver_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, work_revision INTEGER NOT NULL, fulfilment_revision INTEGER NOT NULL,
 catalog_revision INTEGER NOT NULL, sent_to TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','used','expired')),
 config_revision INTEGER NOT NULL, provider_ref TEXT, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT
);
CREATE INDEX work_approval_tokens_fulfilment ON work_approval_tokens(workspace_id,fulfilment_id,state);
CREATE TABLE work_approval_mail (
 workspace_id TEXT NOT NULL, connection_id TEXT NOT NULL, source_message_id TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,connection_id,source_message_id)
);

CREATE UNIQUE INDEX work_approval_decision_holder ON work_approval_decisions(workspace_id,fulfilment_id,stage_key,approver_id,work_revision,fulfilment_revision,catalog_revision);
-- An edit cannot reuse a timer or emailed authority from the prior request revision.
CREATE TRIGGER work_approval_edit_invalidates AFTER UPDATE OF revision ON work_records WHEN NEW.revision<>OLD.revision BEGIN
 UPDATE work_approval_stages SET active_at=NULL,remind_at=NULL,reminded_at=NULL,sla_at=NULL,breached_at=NULL WHERE workspace_id=NEW.workspace_id AND work_id=NEW.id;
 UPDATE work_approval_tokens SET state='expired' WHERE workspace_id=NEW.workspace_id AND work_id=NEW.id AND state='issued';
END;
CREATE TABLE work_approval_mail_config (
 workspace_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, actor_id TEXT NOT NULL, enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 sending_connection_id TEXT NOT NULL, recipient TEXT NOT NULL, topic_arn TEXT NOT NULL, signing_cert_url TEXT NOT NULL, public_key TEXT NOT NULL,
 consent_at TEXT NOT NULL
);

CREATE UNIQUE INDEX work_approval_token_issued ON work_approval_tokens(workspace_id,fulfilment_id,stage_key,approver_id,work_revision,fulfilment_revision,catalog_revision) WHERE state='issued';

CREATE TABLE work_approval_mail_subscriptions (workspace_id TEXT PRIMARY KEY,config_revision INTEGER NOT NULL,confirmation_url TEXT NOT NULL,expires_at TEXT NOT NULL);
