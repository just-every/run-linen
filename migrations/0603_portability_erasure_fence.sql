-- Adoption/importer erasure enters adoption_tombstones; the native HR erasure
-- door records work_erasure. Both fence archives atomically with redaction.
-- Fence any older archive in the same installation at that atomic boundary.
-- Restore itself is fenced by the shared portability applying transaction.
CREATE TRIGGER platform_portability_erasure_fence AFTER INSERT ON adoption_tombstones
WHEN EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND applying=0)
BEGIN
 UPDATE rer_portability_state SET epoch=epoch+1 WHERE id=1;
 INSERT INTO rer_portability_epochs(source,epoch)
 SELECT source_identity,epoch FROM rer_portability_state WHERE id=1
 ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch);
END;

CREATE TRIGGER platform_portability_work_erasure_fence AFTER INSERT ON work_erasure
WHEN EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND applying=0)
BEGIN
 UPDATE rer_portability_state SET epoch=epoch+1 WHERE id=1;
 INSERT INTO rer_portability_epochs(source,epoch)
 SELECT source_identity,epoch FROM rer_portability_state WHERE id=1
 ON CONFLICT(source) DO UPDATE SET epoch=MAX(epoch,excluded.epoch);
END;
