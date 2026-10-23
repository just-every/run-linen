-- NOTIFY-002: no seeded rules and no implicit authority to send.
CREATE TABLE notification_templates(workspace_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,name TEXT NOT NULL,language TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,id,revision));
CREATE TABLE notification_rules(workspace_id TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,name TEXT NOT NULL,event TEXT NOT NULL,conditions_json TEXT NOT NULL,recipients_json TEXT NOT NULL,template_id TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN('portal','email')),connection_id TEXT,connection_revision INTEGER,mandatory INTEGER NOT NULL CHECK(mandatory IN(0,1)),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),consented_by TEXT,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,id,revision));
CREATE TABLE notification_preferences(workspace_id TEXT NOT NULL,user_id TEXT NOT NULL,event TEXT NOT NULL,channel TEXT NOT NULL CHECK(channel IN('portal','email')),enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),language TEXT NOT NULL DEFAULT 'en-US',updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,user_id,event,channel));
CREATE TABLE notification_branding(workspace_id TEXT NOT NULL,revision INTEGER NOT NULL,logo_url TEXT,primary_color TEXT NOT NULL,text_color TEXT NOT NULL,sender_connection_id TEXT,sender_connection_revision INTEGER,sender_domain TEXT,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,revision));
CREATE TABLE notification_deliveries(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,work_revision INTEGER NOT NULL,rule_id TEXT NOT NULL,rule_revision INTEGER NOT NULL,template_id TEXT NOT NULL,template_revision INTEGER NOT NULL,recipient_id TEXT NOT NULL,event TEXT NOT NULL,channel TEXT NOT NULL,source_id TEXT NOT NULL,is_test INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,work_id,rule_id,source_id,recipient_id,is_test));
CREATE INDEX notification_deliveries_recipient ON notification_deliveries(workspace_id,recipient_id,created_at);
CREATE TRIGGER notification_template_immutable BEFORE UPDATE ON notification_templates BEGIN SELECT RAISE(ABORT,'notification_template_immutable'); END;
CREATE TRIGGER notification_rule_immutable BEFORE UPDATE ON notification_rules BEGIN SELECT RAISE(ABORT,'notification_rule_immutable'); END;
CREATE TRIGGER notification_branding_immutable BEFORE UPDATE ON notification_branding BEGIN SELECT RAISE(ABORT,'notification_branding_immutable'); END;
-- Text is rendered under current record rights; no ticket/quote payload is stored here.
CREATE TRIGGER notification_work_deleted AFTER DELETE ON work_records BEGIN
 DELETE FROM execution_outbox WHERE workspace_id=OLD.workspace_id AND id IN(SELECT id FROM notification_deliveries WHERE workspace_id=OLD.workspace_id AND work_id=OLD.id);
 DELETE FROM notification_deliveries WHERE workspace_id=OLD.workspace_id AND work_id=OLD.id;
END;
CREATE TRIGGER notification_identity_erased AFTER INSERT ON work_erasure BEGIN
 DELETE FROM notification_preferences WHERE workspace_id=NEW.workspace_id AND user_id=NEW.person_id;
 DELETE FROM execution_outbox WHERE workspace_id=NEW.workspace_id AND id IN(SELECT d.id FROM notification_deliveries d JOIN work_records w ON w.workspace_id=d.workspace_id AND w.id=d.work_id WHERE d.workspace_id=NEW.workspace_id AND (d.recipient_id=NEW.person_id OR w.requester_id=NEW.person_id OR w.beneficiary_id=NEW.person_id));
 DELETE FROM notification_deliveries WHERE workspace_id=NEW.workspace_id AND (recipient_id=NEW.person_id OR work_id IN(SELECT id FROM work_records WHERE workspace_id=NEW.workspace_id AND (requester_id=NEW.person_id OR beneficiary_id=NEW.person_id)));
END;
CREATE TRIGGER notification_config_identity_erased AFTER INSERT ON work_erasure BEGIN
 DELETE FROM notification_rules WHERE workspace_id=NEW.workspace_id AND (actor_id=NEW.person_id OR consented_by=NEW.person_id OR template_id IN(SELECT id FROM notification_templates WHERE workspace_id=NEW.workspace_id AND actor_id=NEW.person_id));
 DELETE FROM notification_templates WHERE workspace_id=NEW.workspace_id AND actor_id=NEW.person_id;
 DELETE FROM notification_branding WHERE workspace_id=NEW.workspace_id AND actor_id=NEW.person_id;
END;
