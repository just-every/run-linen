-- Durable local erasure receipts retain opaque IDs, never names or emails.
CREATE TABLE platform_identity_erasures (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 identity_hash TEXT NOT NULL,
 user_id TEXT REFERENCES users(id),
 actor_id TEXT NOT NULL,
 erased_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,identity_hash)
);
-- Dependent guards are installed by 0570 after adoption_tombstones (0500).
-- SQLite validates trigger references during intervening ALTER TABLE migrations.
