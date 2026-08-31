import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { computeVoteEffect } from "../../src/features/vote/vote.model.ts";
import { persistVote } from "../../src/features/vote/vote.service.ts";
import { isUniqueViolation } from "../../src/shared/errors/prisma-error.ts";
import { startTestDatabase, type TestDatabase } from "./helpers/database.ts";

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
});

async function seedQuestion() {
  const asker = await db.prisma.user.create({
    data: { name: "Asker", email: "asker@example.com", passwordHash: "x" },
  });
  const voter = await db.prisma.user.create({
    data: { name: "Voter", email: "voter@example.com", passwordHash: "x" },
  });
  const question = await db.prisma.question.create({
    data: { title: "How do I do the thing?", body: "b".repeat(40), authorId: asker.id },
  });
  return { asker, voter, question };
}

describe("vote concurrency", () => {
  it("lets exactly one of five simultaneous first-votes through", async () => {
    const { asker, voter, question } = await seedQuestion();
    const target = { type: "question", id: question.id } as const;
    const effect = computeVoteEffect("question", null, 1);

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        persistVote(
          { userId: voter.id, target, targetAuthorId: asker.id, previous: null, next: 1, effect },
          db.prisma,
        )
          .then(() => "won" as const)
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) return "rejected" as const;
            throw error;
          }),
      ),
    );

    expect(outcomes.filter((o) => o === "won")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "rejected")).toHaveLength(4);
    expect(await db.prisma.vote.count()).toBe(1);

    const scored = await db.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(scored.score).toBe(1); // one increment, not five
  });

  it("keeps a separate vote per target for the same user", async () => {
    const { asker, voter, question } = await seedQuestion();
    const answer = await db.prisma.answer.create({
      data: { body: "a".repeat(40), authorId: asker.id, questionId: question.id },
    });

    await persistVote(
      {
        userId: voter.id,
        target: { type: "question", id: question.id },
        targetAuthorId: asker.id,
        previous: null,
        next: 1,
        effect: computeVoteEffect("question", null, 1),
      },
      db.prisma,
    );
    await persistVote(
      {
        userId: voter.id,
        target: { type: "answer", id: answer.id },
        targetAuthorId: asker.id,
        previous: null,
        next: 1,
        effect: computeVoteEffect("answer", null, 1),
      },
      db.prisma,
    );

    expect(await db.prisma.vote.count()).toBe(2);
  });
});

describe("vote transaction atomicity", () => {
  it("writes nothing when a later statement in the transaction fails", async () => {
    const { voter, question } = await seedQuestion();
    const target = { type: "question", id: question.id } as const;

    // Point the reputation update at a user id that does not exist, so it throws
    // after the vote row and the score have already been written inside the same
    // transaction.
    await expect(
      persistVote(
        {
          userId: voter.id,
          target,
          targetAuthorId: 999_999,
          previous: null,
          next: 1,
          effect: computeVoteEffect("question", null, 1),
        },
        db.prisma,
      ),
    ).rejects.toThrow();

    expect(await db.prisma.vote.count()).toBe(0);
    const scored = await db.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(scored.score).toBe(0);
  });
});
