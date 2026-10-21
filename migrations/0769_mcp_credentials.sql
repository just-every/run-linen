-- API-003: MCP credentials never authorize REST or provider effects.
CREATE TABLE mcp_credentials (
 id TEXT PRIMARY KEY,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 principal_id TEXT NOT NULL REFERENCES users(id),
 name TEXT NOT NULL,
 scopes_json TEXT NOT NULL CHECK(json_valid(scopes_json)),
 tools_json TEXT NOT NULL CHECK(json_valid(tools_json)),
 expires_at TEXT NOT NULL,
 secret_hash TEXT UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('active','revoked','expired')),
 created_by TEXT NOT NULL,
 created_at TEXT NOT NULL,
 last_used_at TEXT,
 invalidated_at TEXT,
 CHECK(state='active' OR secret_hash IS NULL)
);
CREATE INDEX mcp_credentials_expiry ON mcp_credentials(state,expires_at);
CREATE INDEX mcp_credentials_workspace ON mcp_credentials(workspace_id,created_at);
CREATE TRIGGER mcp_mint_guard BEFORE INSERT ON mcp_credentials WHEN NEW.secret_hash IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.state<>'active' OR NOT EXISTS(
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id
  AND m.user_id=NEW.created_by AND m.active=1 AND r.value='owner'
 ) THEN RAISE(ABORT,'mcp_owner_required') END;
 SELECT CASE WHEN NOT EXISTS(
  SELECT 1 FROM memberships m JOIN execution_automation_principals a
  ON a.workspace_id=m.workspace_id AND a.user_id=m.user_id
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.principal_id AND m.active=1
  AND a.revoked_at IS NULL AND json_array_length(m.roles_json)=1
  AND json_extract(m.roles_json,'$[0]')='integration'
 ) OR EXISTS(SELECT 1 FROM platform_identity_erasures p WHERE p.workspace_id=NEW.workspace_id AND p.user_id=NEW.principal_id)
 OR EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=NEW.workspace_id AND e.person_id=NEW.principal_id)
 THEN RAISE(ABORT,'mcp_principal_required') END;
 SELECT CASE WHEN unixepoch(NEW.expires_at) IS NULL OR unixepoch(NEW.expires_at)<=unixepoch('now')
 OR unixepoch(NEW.expires_at)>unixepoch('now')+31536000 THEN RAISE(ABORT,'mcp_expiry_invalid') END;
END;
CREATE TRIGGER mcp_mint_audit AFTER INSERT ON mcp_credentials WHEN NEW.secret_hash IS NOT NULL BEGIN
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.created_by,'mcp.credential_minted',NEW.id,
 json_object('principalId',NEW.principal_id,'scopes',json(NEW.scopes_json),'tools',json(NEW.tools_json),'expiresAt',NEW.expires_at),NEW.created_at);
END;
CREATE TRIGGER mcp_expiry_audit AFTER UPDATE OF state ON mcp_credentials WHEN OLD.state='active' AND NEW.state='expired' BEGIN
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.created_by,'mcp.credential_expired',NEW.id,
 json_object('principalId',NEW.principal_id),NEW.invalidated_at);
END;
-- Erasure is atomic with the platform identity tombstone, including replay.
CREATE TRIGGER mcp_erasure AFTER INSERT ON platform_identity_erasures WHEN NEW.user_id IS NOT NULL BEGIN
 UPDATE mcp_credentials SET secret_hash=NULL,state='revoked',invalidated_at=NEW.erased_at
 WHERE workspace_id=NEW.workspace_id AND principal_id=NEW.user_id;
END;
CREATE TRIGGER mcp_erasure_replay AFTER UPDATE OF user_id ON platform_identity_erasures WHEN NEW.user_id IS NOT NULL BEGIN
 UPDATE mcp_credentials SET secret_hash=NULL,state='revoked',invalidated_at=NEW.erased_at
 WHERE workspace_id=NEW.workspace_id AND principal_id=NEW.user_id;
END;
-- The native person-erasure door writes its tombstone before platform cleanup.
CREATE TRIGGER mcp_work_erasure AFTER INSERT ON work_erasure BEGIN
 UPDATE mcp_credentials SET secret_hash=NULL,state='revoked',invalidated_at=NEW.created_at
 WHERE workspace_id=NEW.workspace_id AND principal_id=NEW.person_id;
END;
