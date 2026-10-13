-- Native identity remains users/memberships/sessions. Side tables preserve every
-- previously applied schema and the retained password/session contract.
CREATE TABLE platform_auth_versions(user_id TEXT PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL DEFAULT 1);
INSERT INTO platform_auth_versions(user_id) SELECT id FROM users;
CREATE TRIGGER platform_auth_user_insert AFTER INSERT ON users BEGIN INSERT INTO platform_auth_versions(user_id) VALUES(NEW.id); END;
CREATE TRIGGER platform_auth_user_update AFTER UPDATE OF email,name,password_hash ON users BEGIN UPDATE platform_auth_versions SET version=version+1 WHERE user_id=NEW.id; END;
CREATE TRIGGER platform_auth_member_insert AFTER INSERT ON memberships BEGIN UPDATE platform_auth_versions SET version=version+1 WHERE user_id=NEW.user_id; END;
CREATE TRIGGER platform_auth_member_update AFTER UPDATE ON memberships BEGIN UPDATE platform_auth_versions SET version=version+1 WHERE user_id=NEW.user_id; END;
CREATE TRIGGER platform_auth_member_delete AFTER DELETE ON memberships BEGIN UPDATE platform_auth_versions SET version=version+1 WHERE user_id=OLD.user_id; END;
CREATE TABLE platform_auth_session_proofs(session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,kind TEXT NOT NULL,version INTEGER NOT NULL,proof_at INTEGER,proof_version INTEGER);
CREATE TABLE platform_auth_links(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL,workspace_id TEXT NOT NULL,email TEXT NOT NULL,version INTEGER NOT NULL,return_to TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,revoked_at INTEGER);
CREATE TABLE platform_auth_steps(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,session_id TEXT NOT NULL,user_id TEXT NOT NULL,version INTEGER NOT NULL,action TEXT NOT NULL,return_to TEXT NOT NULL,expires_at INTEGER NOT NULL,used_at INTEGER,revoked_at INTEGER);
CREATE TABLE platform_auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,window_start INTEGER NOT NULL);
CREATE TABLE platform_auth_guard(ok INTEGER NOT NULL CHECK(ok=1));
CREATE TABLE platform_first_run(singleton INTEGER PRIMARY KEY CHECK(singleton=1),completed_by TEXT NOT NULL,completed_at INTEGER NOT NULL);
-- Existing stores are already claimed, even if their owner has since departed.
INSERT INTO platform_first_run SELECT 1,COALESCE((SELECT user_id FROM memberships ORDER BY rowid LIMIT 1),'retained-installation'),unixepoch()*1000 WHERE EXISTS(SELECT 1 FROM bootstrap_lock) OR EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM workspaces);
-- Claim fencing survives missing legacy ledger rows as well as concurrent claims.
CREATE TRIGGER platform_bootstrap_empty BEFORE INSERT ON bootstrap_lock WHEN EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM workspaces) OR EXISTS(SELECT 1 FROM platform_first_run) BEGIN SELECT RAISE(ABORT,'installation_already_claimed'); END;
CREATE TABLE platform_auth_policy(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL);
INSERT INTO platform_auth_policy VALUES(1,1);
