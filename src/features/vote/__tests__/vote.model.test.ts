import { describe, expect, it } from "vitest";
import { canVote, computeVoteEffect, toTargetColumn } from "../vote.model.ts";

describe("computeVoteEffect", () => {
  const cases: Array<{
    name: string;
    targetType: "question" | "answer";
    previous: 1 | -1 | null;
    next: 1 | -1 | null;
    score: number;
    author: number;
    voter: number;
  }> = [
    { name: "first upvote on an answer", targetType: "answer", previous: null, next: 1, score: 1, author: 10, voter: 0 },
    { name: "first downvote on an answer", targetType: "answer", previous: null, next: -1, score: -1, author: -2, voter: -1 },
    { name: "answer upvote switched to downvote", targetType: "answer", previous: 1, next: -1, score: -2, author: -12, voter: -1 },
    { name: "answer downvote switched to upvote", targetType: "answer", previous: -1, next: 1, score: 2, author: 12, voter: 1 },
    { name: "answer upvote retracted", targetType: "answer", previous: 1, next: null, score: -1, author: -10, voter: 0 },
    { name: "answer downvote retracted", targetType: "answer", previous: -1, next: null, score: 1, author: 2, voter: 1 },
    { name: "first upvote on a question", targetType: "question", previous: null, next: 1, score: 1, author: 5, voter: 0 },
    { name: "first downvote on a question", targetType: "question", previous: null, next: -1, score: -1, author: -2, voter: 0 },
    { name: "question upvote switched to downvote", targetType: "question", previous: 1, next: -1, score: -2, author: -7, voter: 0 },
    { name: "question downvote switched to upvote", targetType: "question", previous: -1, next: 1, score: 2, author: 7, voter: 0 },
    { name: "question upvote retracted", targetType: "question", previous: 1, next: null, score: -1, author: -5, voter: 0 },
    { name: "question downvote retracted", targetType: "question", previous: -1, next: null, score: 1, author: 2, voter: 0 },
  ];

  it.each(cases)("$name", ({ targetType, previous, next, score, author, voter }) => {
    expect(computeVoteEffect(targetType, previous, next)).toEqual({
      scoreDelta: score,
      authorReputationDelta: author,
      voterReputationDelta: voter,
    });
  });

  it("charges the voter only for downvoting an answer, never a question", () => {
    expect(computeVoteEffect("question", null, -1).voterReputationDelta).toBe(0);
    expect(computeVoteEffect("answer", null, -1).voterReputationDelta).toBe(-1);
  });
});

describe("canVote", () => {
  it("lets a user vote on someone else's post", () => {
    expect(canVote(1, 2)).toBe(true);
  });

  it("stops a user voting on their own post", () => {
    expect(canVote(1, 1)).toBe(false);
  });
});

describe("toTargetColumn", () => {
  it("routes a question target to the questionId column", () => {
    expect(toTargetColumn({ type: "question", id: "q1" })).toEqual({ questionId: "q1" });
  });

  it("routes an answer target to the answerId column", () => {
    expect(toTargetColumn({ type: "answer", id: "a1" })).toEqual({ answerId: "a1" });
  });
});
