-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "questionCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "tag_synonyms" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "tagId" INTEGER NOT NULL,

    CONSTRAINT "tag_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tag_synonyms_slug_key" ON "tag_synonyms"("slug");

-- CreateIndex
CREATE INDEX "tag_synonyms_tagId_idx" ON "tag_synonyms"("tagId");

-- AddForeignKey
ALTER TABLE "tag_synonyms" ADD CONSTRAINT "tag_synonyms_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
