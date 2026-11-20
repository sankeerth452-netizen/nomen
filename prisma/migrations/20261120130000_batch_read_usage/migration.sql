-- What reading each range photo cost. Additive and optional: drop the column to undo.
ALTER TABLE "BatchItem" ADD COLUMN "readUsage" JSONB;
