-- Immutable hash of the complete accepted create payload; live work edits do not redefine retries.
-- Legacy rows remain NULL: their original mutable context cannot be reconstructed safely.
ALTER TABLE work_records ADD COLUMN request_hash TEXT;
