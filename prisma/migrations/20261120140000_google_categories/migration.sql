-- Google's full product category list, for checking categories. Additive: drop the table to undo.
CREATE TABLE "GoogleCategory" (
    "id" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleCategory_pkey" PRIMARY KEY ("id")
);
