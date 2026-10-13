ALTER TABLE adoption_erasure_jobs ADD COLUMN identity_ciphertext TEXT;
ALTER TABLE adoption_erasure_jobs ADD COLUMN actor_id TEXT;
ALTER TABLE adoption_erasure_jobs ADD COLUMN error_code TEXT;
ALTER TABLE adoption_erasure_jobs ADD COLUMN updated_at TEXT;
