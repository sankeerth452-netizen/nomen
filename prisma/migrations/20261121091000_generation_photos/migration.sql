-- What each photo of a named piece shows, its alt text and problems. Additive and optional: drop the column to undo.
-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "photos" JSONB;

