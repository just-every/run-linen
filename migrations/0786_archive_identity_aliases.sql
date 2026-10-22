-- A6: this origin and the encryption key stay local; portable rows contain no raw identity.
CREATE TABLE history_archive_origin(id INTEGER PRIMARY KEY CHECK(id=1),origin TEXT NOT NULL UNIQUE);
INSERT INTO history_archive_origin VALUES(1,lower(hex(randomblob(16))));
CREATE TABLE history_archive_aliases(workspace_id TEXT NOT NULL,origin TEXT NOT NULL,alias TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('person','unattributed')),created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,origin,alias));
CREATE TABLE history_archive_identity_digests(workspace_id TEXT NOT NULL,origin TEXT NOT NULL,digest TEXT NOT NULL,alias TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,origin,digest),FOREIGN KEY(workspace_id,origin,alias) REFERENCES history_archive_aliases(workspace_id,origin,alias));
CREATE TABLE history_archive_slots(workspace_id TEXT NOT NULL,store TEXT NOT NULL CHECK(store IN ('audit','service')),event_id TEXT NOT NULL,path TEXT NOT NULL,origin TEXT NOT NULL,alias TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,store,event_id,path),FOREIGN KEY(workspace_id,origin,alias) REFERENCES history_archive_aliases(workspace_id,origin,alias));
