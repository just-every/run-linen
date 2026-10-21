-- A credential's queue grant is separate from agent membership and never restored live.
ALTER TABLE mcp_credentials ADD COLUMN queue_groups_json TEXT NOT NULL DEFAULT '[]'
 CHECK(json_valid(queue_groups_json) AND json_type(queue_groups_json)='array');
ALTER TABLE mcp_credentials ADD COLUMN grant_version INTEGER NOT NULL DEFAULT 1 CHECK(grant_version>=1);
ALTER TABLE mcp_credentials ADD COLUMN grant_updated_by TEXT;

-- Existing credentials have no owner-selected queue grant; a new credential is required.
INSERT INTO audit_events
 SELECT lower(hex(randomblob(16))),workspace_id,created_by,'mcp.credential_revoked',id,
 json_object('principalId',principal_id,'reason','queue_grant_required'),strftime('%Y-%m-%dT%H:%M:%fZ','now')
 FROM mcp_credentials WHERE state='active';
UPDATE mcp_credentials SET state='revoked',secret_hash=NULL,invalidated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE state='active';

CREATE TRIGGER mcp_queue_mint_guard BEFORE INSERT ON mcp_credentials WHEN NEW.secret_hash IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.grant_version<>1 OR NEW.grant_updated_by IS NOT NEW.created_by
 THEN RAISE(ABORT,'mcp_grant_invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.queue_groups_json) g WHERE g.type<>'text'
  OR NOT EXISTS(SELECT 1 FROM work_groups q WHERE q.workspace_id=NEW.workspace_id AND q.id=g.value))
  OR (SELECT count(*) FROM json_each(NEW.queue_groups_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.queue_groups_json))
 THEN RAISE(ABORT,'mcp_group_invalid') END;
 SELECT CASE WHEN json_array_length(NEW.queue_groups_json)=0 AND EXISTS(
  SELECT 1 FROM json_each(NEW.scopes_json) WHERE value IN ('work.read','work.comment'))
 THEN RAISE(ABORT,'mcp_queue_grant_required') END;
END;
DROP TRIGGER mcp_mint_audit;
CREATE TRIGGER mcp_mint_audit AFTER INSERT ON mcp_credentials WHEN NEW.secret_hash IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.created_by AND m.active=1 AND r.value='owner')
 THEN RAISE(ABORT,'mcp_owner_required') END;
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.created_by,'mcp.credential_minted',NEW.id,
 json_object('principalId',NEW.principal_id,'scopes',json(NEW.scopes_json),'tools',json(NEW.tools_json),
  'expiresAt',NEW.expires_at,'groupIds',json(NEW.queue_groups_json),'grantVersion',NEW.grant_version),NEW.created_at);
END;
CREATE TRIGGER mcp_queue_narrow_guard BEFORE UPDATE OF queue_groups_json,grant_version,grant_updated_by ON mcp_credentials
 WHEN NEW.queue_groups_json IS NOT OLD.queue_groups_json OR NEW.grant_version<>OLD.grant_version OR NEW.grant_updated_by IS NOT OLD.grant_updated_by BEGIN
 SELECT CASE WHEN OLD.state<>'active' OR NEW.state<>'active' OR unixepoch(OLD.expires_at)<=unixepoch('now')
  THEN RAISE(ABORT,'mcp_credential_inactive') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.grant_updated_by AND m.active=1 AND r.value='owner')
 THEN RAISE(ABORT,'mcp_owner_required') END;
 SELECT CASE WHEN NEW.grant_version<>OLD.grant_version+1
 THEN RAISE(ABORT,'mcp_grant_revision_conflict') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.queue_groups_json) g WHERE g.type<>'text'
  OR NOT EXISTS(SELECT 1 FROM work_groups q WHERE q.workspace_id=NEW.workspace_id AND q.id=g.value))
  OR (SELECT count(*) FROM json_each(NEW.queue_groups_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.queue_groups_json))
 THEN RAISE(ABORT,'mcp_group_invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.queue_groups_json) g
  WHERE NOT EXISTS(SELECT 1 FROM json_each(OLD.queue_groups_json) old WHERE old.value=g.value))
 THEN RAISE(ABORT,'mcp_grant_widening_requires_remint') END;
END;
CREATE TRIGGER mcp_queue_narrow_audit AFTER UPDATE OF grant_version ON mcp_credentials WHEN NEW.grant_version<>OLD.grant_version BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.grant_updated_by AND m.active=1 AND r.value='owner')
 THEN RAISE(ABORT,'mcp_owner_required') END;
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.grant_updated_by,'mcp.queue_grant_narrowed',NEW.id,
  json_object('principalId',NEW.principal_id,'groupIds',json(NEW.queue_groups_json),'grantVersion',NEW.grant_version),
  strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
