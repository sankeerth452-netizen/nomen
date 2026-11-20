-- Review and approval: two new roles, a status per named product, its edits, history and comments.
-- Additive. To undo: drop the three tables and the ReviewStatus type. Postgres can't remove enum values, so
-- "editor" and "reviewer" stay in the Role type (unused) if this is rolled back.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'editor';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'reviewer';

CREATE TYPE "ReviewStatus" AS ENUM ('pending', 'ai_generated', 'needs_review', 'approved', 'rejected', 'ready_to_export', 'published');

CREATE TABLE "ProductReview" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'ai_generated',
    "edits" JSONB NOT NULL DEFAULT '{}',
    "fieldStatus" JSONB NOT NULL DEFAULT '{}',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductReview_generationId_key" ON "ProductReview"("generationId");
CREATE INDEX "ProductReview_brandId_status_updatedAt_idx" ON "ProductReview"("brandId", "status", "updatedAt");
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReviewRevision" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewRevision_reviewId_field_createdAt_idx" ON "ReviewRevision"("reviewId", "field", "createdAt");
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewRevision" ADD CONSTRAINT "ReviewRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReviewComment" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" TEXT,
    "body" TEXT NOT NULL,
    "flag" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewComment_reviewId_createdAt_idx" ON "ReviewComment"("reviewId", "createdAt");
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "ProductReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReviewComment" ADD CONSTRAINT "ReviewComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
