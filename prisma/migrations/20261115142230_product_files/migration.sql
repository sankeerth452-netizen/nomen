-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "fileCheck" JSONB,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'photos';

-- AlterTable
ALTER TABLE "BatchItem" ADD COLUMN     "feed" JSONB,
ADD COLUMN     "imageUrl" TEXT,
ALTER COLUMN "photo" DROP NOT NULL,
ALTER COLUMN "photoType" DROP NOT NULL;
