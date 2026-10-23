-- CHANNEL-003: mailbox intake. Threading reads RFC 822 ids from inbound events and from Linen's own deliveries.
ALTER TABLE work_intake_events ADD COLUMN subject TEXT;
ALTER TABLE work_intake_events ADD COLUMN rfc_message_id TEXT;
CREATE INDEX work_intake_events_rfc ON work_intake_events(workspace_id,rfc_message_id) WHERE rfc_message_id IS NOT NULL;
CREATE TABLE work_mailbox_polls(
 workspace_id TEXT NOT NULL, connection_id TEXT NOT NULL, connection_revision INTEGER NOT NULL,
 polled_at TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('ok','failed')), error TEXT, seen INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(workspace_id,connection_id)
);
CREATE TABLE work_mail_deliveries(
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, message_id TEXT NOT NULL,
 connection_id TEXT NOT NULL, connection_revision INTEGER NOT NULL, mail_message_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('prepared','sending','accepted','failed','unknown')),
 provider_ref TEXT, error TEXT, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,message_id)
);
CREATE INDEX work_mail_deliveries_rfc ON work_mail_deliveries(workspace_id,mail_message_id);
