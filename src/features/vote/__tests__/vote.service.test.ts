import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  questionFindUnique: vi.fn(),
  answerFindUnique: vi.fn(),
  voteFindUnique: vi.fn(),
  transaction: vi.fn(),
  txVoteCreate: vi.fn(),
  txVoteUpdate: vi.fn(),
  txVoteDelete: vi.fn(),
  txQuestionUpdate: vi.fn(),
  txAnswerUpdate: vi.fn(),
  txUserUpdate: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    question: { findUnique: mocks.questionFindUnique },
    answer: { findUnique: mocks.answerFindUnique },
    vote: { findUnique: mocks.voteFindUnique },
    $transaction: mocks.transaction,
  },
}));

const { castVote, getTargetAuthorId, getUserVoteValue, persistVote, retractVote } = await import(
  "../vote.service.ts"
);

const QUESTION_ID = "0199d1c2-8f3a-7c41-9b2e-111111111111";
const ANSWER_ID = "0199d1c2-8f3a-7c41-9b2e-222222222222";
const question = { type: "question", id: QUESTION_ID } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.questionFindUnique.mockResolvedValue({ authorId: 3 }); // someone other than the voter
  mocks.answerFindUnique.mockResolvedValue({ authorId: 3 });
  mocks.voteFindUnique.mockResolvedValue(null); // no prior vote
  mocks.txQuestionUpdate.mockResolvedValue({ score: 1 });
  mocks.txAnswerUpdate.mockResolvedValue({ score: 1 });
  mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({
      vote: { create: mocks.txVoteCreate, update: mocks.txVoteUpdate, delete: mocks.txVoteDelete },
      question: { update: mocks.txQuestionUpdate },
      answer: { update: mocks.txAnswerUpdate },
      user: { update: mocks.txUserUpdate },
    }),
  );
});

describe("getTargetAuthorId", () => {
  it("reads the question's author for a question target", async () => {
    mocks.questionFindUnique.mockResolvedValue({ authorId: 7 });

    await expect(getTargetAuthorId({ type: "question", id: QUESTION_ID })).resolves.toBe(7);
    expect(mocks.questionFindUnique).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      select: { authorId: true },
    });
  });

  it("reads the answer's author for an answer target", async () => {
    mocks.answerFindUnique.mockResolvedValue({ authorId: 9 });

    await expect(getTargetAuthorId({ type: "answer", id: ANSWER_ID })).resolves.toBe(9);
  });

  it("returns null when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(getTargetAuthorId({ type: "question", id: QUESTION_ID })).resolves.toBeNull();
  });
});

describe("getUserVoteValue", () => {
  it("returns the direction of an existing vote by the compound key", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: -1 });

    await expect(getUserVoteValue(7, { type: "question", id: QUESTION_ID })).resolves.toBe(-1);
    expect(mocks.voteFindUnique).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
      select: { value: true },
    });
  });

  it("returns null when the user has not voted", async () => {
    mocks.voteFindUnique.mockResolvedValue(null);

    await expect(getUserVoteValue(7, { type: "answer", id: ANSWER_ID })).resolves.toBeNull();
  });
});

describe("persistVote", () => {
  const base = {
    userId: 7,
    targetAuthorId: 3,
    target: { type: "question", id: QUESTION_ID } as const,
  };

  it("inserts the vote row when there was no previous vote", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txVoteCreate).toHaveBeenCalledWith({
      data: { userId: 7, value: 1, questionId: QUESTION_ID },
    });
    expect(mocks.txVoteUpdate).not.toHaveBeenCalled();
    expect(mocks.txVoteDelete).not.toHaveBeenCalled();
  });

  it("updates the vote row when the direction changes", async () => {
    await persistVote({
      ...base,
      previous: 1,
      next: -1,
      effect: { scoreDelta: -2, authorReputationDelta: -7, voterReputationDelta: 0 },
    });

    expect(mocks.txVoteUpdate).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
      data: { value: -1 },
    });
  });

  it("deletes the vote row when the vote is retracted", async () => {
    await persistVote({
      ...base,
      previous: -1,
      next: null,
      effect: { scoreDelta: 1, authorReputationDelta: 2, voterReputationDelta: 0 },
    });

    expect(mocks.txVoteDelete).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
    });
  });

  it("moves the target's score by scoreDelta and returns the new score", async () => {
    mocks.txQuestionUpdate.mockResolvedValue({ score: 42 });

    const result = await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: 1 } },
      select: { score: true },
    });
    expect(result).toEqual({ score: 42 });
  });

  it("moves the target author's reputation", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { reputation: { increment: 5 } },
    });
  });

  it("moves the voter's own reputation when that delta is non-zero", async () => {
    await persistVote({
      ...base,
      target: { type: "answer", id: ANSWER_ID },
      previous: null,
      next: -1,
      effect: { scoreDelta: -1, authorReputationDelta: -2, voterReputationDelta: -1 },
    });

    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { reputation: { increment: -1 } },
    });
    expect(mocks.txUserUpdate).toHaveBeenCalledTimes(2);
  });

  it("leaves the voter's reputation alone when that delta is zero", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txUserUpdate).toHaveBeenCalledTimes(1);
  });

  it("does everything in one transaction", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("castVote", () => {
  it("throws NotFound when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(castVote(question, 1, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("throws Forbidden when the voter owns the target", async () => {
    mocks.questionFindUnique.mockResolvedValue({ authorId: 7 });

    await expect(castVote(question, 1, 7)).rejects.toThrow(ForbiddenError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("throws Conflict when the same direction is cast again", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: 1 });

    await expect(castVote(question, 1, 7)).rejects.toThrow(ConflictError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("inserts a first upvote on a question: +1 score, +5 author reputation", async () => {
    await castVote(question, 1, 7);

    expect(mocks.txVoteCreate).toHaveBeenCalledWith({
      data: { userId: 7, value: 1, questionId: QUESTION_ID },
    });
    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: 1 } },
      select: { score: true },
    });
    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { reputation: { increment: 5 } },
    });
  });

  it("switches an existing vote: updates the row, moves score by 2", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: 1 });

    await castVote(question, -1, 7);

    expect(mocks.txVoteUpdate).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
      data: { value: -1 },
    });
    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: -2 } },
      select: { score: true },
    });
  });

  it("returns the new score and the direction just cast", async () => {
    mocks.txQuestionUpdate.mockResolvedValue({ score: 5 });

    await expect(castVote(question, 1, 7)).resolves.toEqual({ score: 5, userVote: 1 });
  });
});

describe("retractVote", () => {
  it("throws NotFound when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(retractVote(question, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("throws NotFound when there is no vote to retract", async () => {
    mocks.voteFindUnique.mockResolvedValue(null);

    await expect(retractVote(question, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("deletes the vote row and reverses the score", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: -1 });

    await retractVote(question, 7);

    expect(mocks.txVoteDelete).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
    });
    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: 1 } }, // undoing a -1
      select: { score: true },
    });
  });

  it("returns the new score and a null vote", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: 1 });
    mocks.txQuestionUpdate.mockResolvedValue({ score: 0 });

    await expect(retractVote(question, 7)).resolves.toEqual({ score: 0, userVote: null });
  });
});
