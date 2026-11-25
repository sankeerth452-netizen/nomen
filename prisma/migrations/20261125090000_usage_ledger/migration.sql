-- Spend by day, brand, range and step (UsageEvent), and test markers on ranges and named pieces. Additive: drop the table and the two columns to undo.
-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "brandId" TEXT,
    "userId" TEXT,
    "generationId" TEXT,
    "batchId" TEXT,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheRead" INTEGER NOT NULL DEFAULT 0,
    "cacheWrite" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "backfilled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_brandId_createdAt_idx" ON "UsageEvent"("brandId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_generationId_idx" ON "UsageEvent"("generationId");

-- CreateIndex
CREATE INDEX "UsageEvent_batchId_idx" ON "UsageEvent"("batchId");
