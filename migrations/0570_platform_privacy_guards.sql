-- Install only after 0500 creates adoption_tombstones. Keep the 0070 receipt
-- table and its data intact on both fresh installs and retained-history upgrades.
-- Previously applied 0070 versions already installed these guards; replace them
-- atomically within the migration transaction without rewriting migration history.
DROP TRIGGER IF EXISTS platform_erasure_authority;
DROP TRIGGER IF EXISTS platform_erased_membership_insert;
DROP TRIGGER IF EXISTS platform_erased_membership_update;
CREATE TRIGGER platform_erasure_authority BEFORE INSERT ON platform_identity_erasures BEGIN
 SELECT RAISE(ABORT,'platform_owner_required') WHERE NOT EXISTS (
  SELECT 1 FROM memberships m,json_each(m.roles_json) r
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.actor_id AND m.active=1 AND r.value='owner'
 );
 SELECT RAISE(ABORT,'platform_tombstone_required') WHERE NOT EXISTS (
  SELECT 1 FROM adoption_tombstones WHERE workspace_id=NEW.workspace_id AND identity_hash=NEW.identity_hash
 );
 SELECT RAISE(ABORT,'platform_another_owner_required') WHERE NEW.user_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.user_id AND m.active=1 AND r.value='owner'
 ) AND NOT EXISTS (
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id AND m.user_id<>NEW.user_id AND m.active=1 AND r.value='owner'
 );
END;
CREATE TRIGGER platform_erased_membership_insert BEFORE INSERT ON memberships
WHEN EXISTS(SELECT 1 FROM platform_identity_erasures WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'platform_identity_erased'); END;
CREATE TRIGGER platform_erased_membership_update BEFORE UPDATE ON memberships
WHEN EXISTS(SELECT 1 FROM platform_identity_erasures WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id)
BEGIN SELECT RAISE(ABORT,'platform_identity_erased'); END;
