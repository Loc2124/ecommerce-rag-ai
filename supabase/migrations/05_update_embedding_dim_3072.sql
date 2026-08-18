-- Migration: Update embedding vector dimension to 3072
-- WARNING: Run on development DB first and backup your data before applying to production.

BEGIN;

-- NOTE: This migration only changes the vector dimension.
-- Do NOT create IVFFlat/HNSW ANN indexes here (see migrations/02_triggers_indexes.sql).
-- If you must recreate an ANN index, do it separately after verifying dataset and experiments.

-- Alter column type to vector(3072).
-- CASTING: This may fail if existing vectors can't be converted; test on a copy first and backup data.
ALTER TABLE products ALTER COLUMN embedding TYPE vector(3072) USING embedding;

COMMIT;
