-- Remembers each brand's confirmed column choices for its product files. Additive: drop the table to undo.
CREATE TABLE "FeedColumn" (
    "brandId" TEXT NOT NULL,
    "header" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeedColumn_pkey" PRIMARY KEY ("brandId","header")
);
ALTER TABLE "FeedColumn" ADD CONSTRAINT "FeedColumn_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
