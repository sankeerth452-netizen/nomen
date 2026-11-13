-- CreateTable
CREATE TABLE "GenerationPhoto" (
    "generationId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationPhoto_pkey" PRIMARY KEY ("generationId")
);

-- AddForeignKey
ALTER TABLE "GenerationPhoto" ADD CONSTRAINT "GenerationPhoto_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
