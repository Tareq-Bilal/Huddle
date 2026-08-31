-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "questionId" UUID,
    "answerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "votes_questionId_idx" ON "votes"("questionId");

-- CreateIndex
CREATE INDEX "votes_answerId_idx" ON "votes"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_questionId_key" ON "votes"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_answerId_key" ON "votes"("userId", "answerId");

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- value is a direction, not a magnitude. Prisma cannot express this, so it is
-- written here by hand.
ALTER TABLE "votes" ADD CONSTRAINT "votes_value_check" CHECK ("value" IN (-1, 1));

-- A vote lands on a question or an answer, never both and never neither.
-- num_nonnulls counts how many of its arguments are not NULL.
ALTER TABLE "votes" ADD CONSTRAINT "votes_exactly_one_target"
    CHECK (num_nonnulls("questionId", "answerId") = 1);
