-- Value-free workspace generation fences selection against concurrent source changes.
ALTER TABLE configuration_masked_records ADD COLUMN kind TEXT NOT NULL DEFAULT 'ticket' CHECK(kind IN ('ticket','message','attachment','person'));
CREATE TABLE configuration_masked_epochs(workspace_id TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER masked_epoch_work_records_insert AFTER INSERT ON work_records BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_records_update AFTER UPDATE ON work_records BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_records_delete AFTER DELETE ON work_records BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_messages_insert AFTER INSERT ON work_messages BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_messages_update AFTER UPDATE ON work_messages BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_messages_delete AFTER DELETE ON work_messages BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_attachments_insert AFTER INSERT ON work_attachments BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_attachments_update AFTER UPDATE ON work_attachments BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_attachments_delete AFTER DELETE ON work_attachments BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_people_insert AFTER INSERT ON work_people BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_people_update AFTER UPDATE ON work_people BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_people_delete AFTER DELETE ON work_people BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_memberships_insert AFTER INSERT ON memberships BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_memberships_update AFTER UPDATE ON memberships BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_memberships_delete AFTER DELETE ON memberships BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_retention_insert AFTER INSERT ON work_retention BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_retention_update AFTER UPDATE ON work_retention BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_retention_delete AFTER DELETE ON work_retention BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_erasure_insert AFTER INSERT ON work_erasure BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_erasure_update AFTER UPDATE ON work_erasure BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_erasure_delete AFTER DELETE ON work_erasure BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_adoption_tombstones_insert AFTER INSERT ON adoption_tombstones BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_adoption_tombstones_update AFTER UPDATE ON adoption_tombstones BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_adoption_tombstones_delete AFTER DELETE ON adoption_tombstones BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_history_identity_tombstones_insert AFTER INSERT ON history_identity_tombstones BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_history_identity_tombstones_update AFTER UPDATE ON history_identity_tombstones BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_history_identity_tombstones_delete AFTER DELETE ON history_identity_tombstones BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_department_members_insert AFTER INSERT ON work_department_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_department_members_update AFTER UPDATE ON work_department_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_department_members_delete AFTER DELETE ON work_department_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_group_members_insert AFTER INSERT ON work_group_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_group_members_update AFTER UPDATE ON work_group_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_group_members_delete AFTER DELETE ON work_group_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_department_role_members_insert AFTER INSERT ON work_department_role_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_department_role_members_update AFTER UPDATE ON work_department_role_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_department_role_members_delete AFTER DELETE ON work_department_role_members BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_departments_insert AFTER INSERT ON work_departments BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_departments_update AFTER UPDATE ON work_departments BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_work_departments_delete AFTER DELETE ON work_departments BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_adoption_imports_insert AFTER INSERT ON adoption_imports BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(NEW.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_epoch_adoption_imports_update AFTER UPDATE ON adoption_imports BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_epoch_adoption_imports_delete AFTER DELETE ON adoption_imports BEGIN
 INSERT INTO configuration_masked_epochs(workspace_id,generation) VALUES(OLD.workspace_id,1) ON CONFLICT(workspace_id) DO UPDATE SET generation=generation+1;
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
