-- DESK-016: preserve a recorded asset tag beside the manufacturer serial.
ALTER TABLE work_assets ADD COLUMN asset_tag TEXT;
