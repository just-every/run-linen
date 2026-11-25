-- The rer signin issuer reads these projections of Linen's native accounts.
CREATE VIEW oa_operators AS
SELECT u.id, u.email, u.created_at, v.version, m.workspace_id, 'owner' AS role, 'active' AS status
FROM users u
JOIN platform_auth_versions v ON v.user_id=u.id
JOIN memberships m ON m.user_id=u.id
WHERE m.workspace_id=(
  SELECT owner.workspace_id FROM memberships owner JOIN workspaces w ON w.id=owner.workspace_id
  WHERE owner.user_id=u.id AND owner.active=1
    AND EXISTS (SELECT 1 FROM json_each(owner.roles_json) WHERE value='owner')
  ORDER BY w.created_at, w.id LIMIT 1
);
CREATE VIEW oa_bootstrap AS SELECT completed_by AS claim_id FROM platform_first_run WHERE singleton=1;

CREATE TABLE oa_owner_signins (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  operator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operator_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);
