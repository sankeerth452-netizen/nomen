-- More photos of a piece (back, side, details). Additive: drop the table to undo.
-- CreateTable
CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "batchItemId" TEXT,
    "generationId" TEXT,
    "position" INTEGER NOT NULL,
    "url" TEXT,
    "photo" BYTEA,
    "photoType" TEXT,
    "readImage" BYTEA,
    "readType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImage_batchItemId_position_idx" ON "ProductImage"("batchItemId", "position");

-- CreateIndex
CREATE INDEX "ProductImage_generationId_position_idx" ON "ProductImage"("generationId", "position");

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_batchItemId_fkey" FOREIGN KEY ("batchItemId") REFERENCES "BatchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

