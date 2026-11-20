-- Restores the trigram index on keywords that migration 20261005123050_dataset_rejections dropped by accident.
-- Without it, the spelling and word-order searches read the whole keyword table on every name.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "Keyword_trgm_idx" ON "Keyword" USING GIN ("normalizedKeyword" gin_trgm_ops);
