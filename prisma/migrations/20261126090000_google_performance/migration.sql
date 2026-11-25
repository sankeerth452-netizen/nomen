-- Google connections (read-only, encrypted), daily search and shop figures per live product page, the searches a page shows for, Shopping status, and each piece's live page, live date and previous name. Additive: drop the four tables and three columns to undo.
-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "liveSince" TIMESTAMP(3),
ADD COLUMN     "liveUrl" TEXT,
ADD COLUMN     "previousTitle" TEXT;

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "brandId" TEXT NOT NULL,
    "email" TEXT,
    "scopes" TEXT[],
    "refreshToken" TEXT NOT NULL,
    "searchConsoleSite" TEXT,
    "analyticsProperty" TEXT,
    "merchantAccount" TEXT,
    "connectedById" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("brandId")
);

-- CreateTable
CREATE TABLE "PageMetric" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION,
    "views" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "addToCarts" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageQuery" (
    "generationId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "position" DOUBLE PRECISION,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageQuery_pkey" PRIMARY KEY ("generationId","query")
);

-- CreateTable
CREATE TABLE "MerchantStatus" (
    "generationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantStatus_pkey" PRIMARY KEY ("generationId")
);

-- CreateIndex
CREATE INDEX "PageMetric_brandId_date_idx" ON "PageMetric"("brandId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PageMetric_generationId_date_source_key" ON "PageMetric"("generationId", "date", "source");

-- AddForeignKey
ALTER TABLE "PageMetric" ADD CONSTRAINT "PageMetric_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageQuery" ADD CONSTRAINT "PageQuery_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantStatus" ADD CONSTRAINT "MerchantStatus_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

