-- AlterTable
ALTER TABLE "GenerationPhoto" ADD COLUMN     "focus" JSONB;

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "photo" BYTEA NOT NULL,
    "photoType" TEXT NOT NULL,
    "readImage" BYTEA,
    "readType" TEXT,
    "details" JSONB,
    "focus" JSONB,
    "generationId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Batch_userId_createdAt_idx" ON "Batch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Batch_brandId_createdAt_idx" ON "Batch"("brandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BatchItem_generationId_key" ON "BatchItem"("generationId");

-- CreateIndex
CREATE INDEX "BatchItem_batchId_position_idx" ON "BatchItem"("batchId", "position");

-- CreateIndex
CREATE INDEX "BatchItem_status_updatedAt_idx" ON "BatchItem"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchItem" ADD CONSTRAINT "BatchItem_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
