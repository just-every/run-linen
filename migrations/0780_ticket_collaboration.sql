CREATE TABLE work_watchers (
 workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, user_id TEXT NOT NULL,
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,work_id,user_id)
);
CREATE TABLE work_collaboration_notices (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL,
 message_id TEXT NOT NULL, recipient_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('mention','watch')),
 created_at TEXT NOT NULL, read_at TEXT,
 UNIQUE(workspace_id,message_id,recipient_id,kind)
);
CREATE INDEX work_collaboration_inbox ON work_collaboration_notices(workspace_id,recipient_id,created_at);
CREATE TRIGGER work_watcher_public_update AFTER INSERT ON work_messages WHEN NEW.visibility='public'
BEGIN
 INSERT OR IGNORE INTO work_collaboration_notices
 SELECT lower(hex(randomblob(16))),NEW.workspace_id,NEW.work_id,NEW.id,w.user_id,'watch',NEW.created_at,NULL
 FROM work_watchers w JOIN memberships m ON m.workspace_id=w.workspace_id AND m.user_id=w.user_id AND m.active=1
 WHERE w.workspace_id=NEW.workspace_id AND w.work_id=NEW.work_id AND w.user_id<>NEW.author_id;
END;
CREATE TABLE work_side_conversations (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL,
 connection_id TEXT NOT NULL, connection_revision INTEGER NOT NULL, vendor_email TEXT NOT NULL,
 actor_id TEXT NOT NULL, created_at TEXT NOT NULL, closed_at TEXT
);
CREATE TABLE work_side_deliveries (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 message_id TEXT NOT NULL, request_key TEXT NOT NULL, mail_message_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('prepared','sending','accepted','failed','unknown')),
 provider_ref TEXT, error TEXT, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,conversation_id,request_key)
);
CREATE TABLE work_side_receipts (
 workspace_id TEXT NOT NULL, work_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 connection_id TEXT NOT NULL, source_id TEXT NOT NULL, message_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,connection_id,source_id)
);
