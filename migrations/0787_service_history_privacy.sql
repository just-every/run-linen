-- Only an exact single-use canonical privacy rewrite may update service history.
CREATE TABLE history_service_rewrite_permits(
 workspace_id TEXT NOT NULL,event_id TEXT NOT NULL,
 before_actor TEXT NOT NULL,before_payload TEXT NOT NULL,
 after_actor TEXT NOT NULL,after_payload TEXT NOT NULL,
 PRIMARY KEY(workspace_id,event_id)
);
DROP TRIGGER svc_events_immutable;
CREATE TRIGGER svc_events_immutable BEFORE UPDATE ON svc_events
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id
 OR NEW.record_id IS NOT OLD.record_id OR NEW.kind IS NOT OLD.kind
 OR NEW.created_at IS NOT OLD.created_at
 OR NOT EXISTS(SELECT 1 FROM history_service_rewrite_permits p
   WHERE p.workspace_id=OLD.workspace_id AND p.event_id=OLD.id
   AND p.before_actor=OLD.actor_id AND p.before_payload=OLD.data_json
   AND p.after_actor=NEW.actor_id AND p.after_payload=NEW.data_json)
BEGIN SELECT RAISE(ABORT,'immutable service event'); END;
CREATE TRIGGER svc_events_privacy_permit_consumed AFTER UPDATE ON svc_events
BEGIN DELETE FROM history_service_rewrite_permits WHERE workspace_id=OLD.workspace_id AND event_id=OLD.id; END;
