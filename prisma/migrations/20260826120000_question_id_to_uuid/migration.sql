/*
  Warning: destructive.

  The questions primary key changes from SERIAL to UUID. Postgres cannot cast an
  integer id to a UUID, so existing questions and their tag links cannot be
  carried across and are removed first — otherwise the ADD COLUMN ... NOT NULL
  below fails against non-empty tables.

  Tags and users are untouched; only the questions and their join rows go.
*/

-- Clear rows that cannot survive the type change
DELETE FROM "_QuestionToTag";
DELETE FROM "questions";

-- DropForeignKey
ALTER TABLE "_QuestionToTag" DROP CONSTRAINT "_QuestionToTag_A_fkey";

-- AlterTable
ALTER TABLE "_QuestionToTag" DROP CONSTRAINT "_QuestionToTag_AB_pkey",
DROP COLUMN "A",
ADD COLUMN     "A" UUID NOT NULL,
ADD CONSTRAINT "_QuestionToTag_AB_pkey" PRIMARY KEY ("A", "B");

-- AlterTable
ALTER TABLE "questions" DROP CONSTRAINT "questions_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "_QuestionToTag" ADD CONSTRAINT "_QuestionToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
