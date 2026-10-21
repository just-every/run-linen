-- CATALOG-001: a catalog quote is a private PDF kept with the request's other files (visibility
-- 'catalog_quote') so export, erasure and retention reach it. It names its catalog item until a submission
-- binds it, once, to that request's fulfilment; a bound quote never changes.
ALTER TABLE work_attachments ADD COLUMN catalog_id TEXT;
ALTER TABLE work_attachments ADD COLUMN fulfilment_id TEXT;
