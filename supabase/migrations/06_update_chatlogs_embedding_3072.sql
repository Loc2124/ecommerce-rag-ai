-- Migration: Update chat_logs.question_embedding dimension to 3072
-- WARNING: Run on development DB first and backup your data before applying to production.

BEGIN;

-- Only change the column type. Do NOT create ANN indexes here.
-- This may fail if existing vectors cannot be cast; test on a copy first.
ALTER TABLE chat_logs ALTER COLUMN question_embedding TYPE vector(3072) USING question_embedding;

COMMIT;
