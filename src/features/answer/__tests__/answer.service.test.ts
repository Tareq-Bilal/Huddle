import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  questionFindUnique: vi.fn(),
  questionUpdate: vi.fn(),
  answerCreate: vi.fn(),
  answerFindMany: vi.fn(),
  answerFindUnique: vi.fn(),
  answerCount: vi.fn(),
  answerUpdate: vi.fn(),
  answerDelete: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    question: { findUnique: mocks.questionFindUnique, update: mocks.questionUpdate },
    answer: {
      create: mocks.answerCreate,
      findMany: mocks.answerFindMany,
      findUnique: mocks.answerFindUnique,
      count: mocks.answerCount,
      update: mocks.answerUpdate,
      delete: mocks.answerDelete,
    },
  },
}));

const { acceptAnswer, createAnswer, deleteAnswer, listAnswersByQuestion, updateAnswer } =
  await import("../answer.service.ts");

const QUESTION_ID = "0199d1c2-8f3a-7c41-9b2e-111111111111";
const ANSWER_ID = "0199d1c2-8f3a-7c41-9b2e-5a6d7e8f9a0b";
const OTHER_ANSWER_ID = "0199d1c2-8f3a-7c41-9b2e-222222222222";
const MISSING_ID = "0199d1c2-8f3a-7c41-9b2e-000000000000";

const answerRow = {
  id: ANSWER_ID,
  body: "Use a read stream and pipe it straight to the response object.",
  score: 0,
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
  questionId: QUESTION_ID,
  author: { id: 7, name: "Ada" },
};

const input = { body: "Use a read stream and pipe it straight to the response object." };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.questionFindUnique.mockResolvedValue({ id: QUESTION_ID, acceptedAnswerId: null });
  mocks.answerCreate.mockResolvedValue(answerRow);
  mocks.answerFindMany.mockResolvedValue([answerRow]);
  mocks.answerCount.mockResolvedValue(1);
  mocks.answerUpdate.mockResolvedValue({ ...answerRow, question: { acceptedAnswerId: null } });
  mocks.answerFindUnique.mockResolvedValue({ ...answerRow, question: { authorId: 7 } });
});

describe("createAnswer", () => {
  it("throws NotFound when the question does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(createAnswer(MISSING_ID, input, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.answerCreate).not.toHaveBeenCalled();
  });

  it("inserts the answer against the question and author", async () => {
    await createAnswer(QUESTION_ID, input, 7);

    expect(mocks.answerCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { body: input.body, authorId: 7, questionId: QUESTION_ID },
      }),
    );
  });

  it("returns a fresh answer as not accepted", async () => {
    const result = await createAnswer(QUESTION_ID, input, 7);

    expect(result.isAccepted).toBe(false);
  });
});

describe("listAnswersByQuestion", () => {
  it("throws NotFound when the question does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(listAnswersByQuestion(MISSING_ID, { page: 1, limit: 20 })).rejects.toThrow(
      NotFoundError,
    );
  });

  it("returns the page alongside its metadata", async () => {
    mocks.answerCount.mockResolvedValue(45);

    const result = await listAnswersByQuestion(QUESTION_ID, { page: 2, limit: 20 });

    expect(result.answers).toHaveLength(1);
    expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });

  it("translates page and limit into skip and take, oldest first", async () => {
    await listAnswersByQuestion(QUESTION_ID, { page: 3, limit: 10 });

    expect(mocks.answerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10, orderBy: { createdAt: "asc" } }),
    );
  });

  it("marks the question's accepted answer", async () => {
    mocks.questionFindUnique.mockResolvedValue({ id: QUESTION_ID, acceptedAnswerId: ANSWER_ID });

    const result = await listAnswersByQuestion(QUESTION_ID, { page: 1, limit: 20 });

    expect(result.answers[0]?.isAccepted).toBe(true);
  });
});

describe("acceptAnswer", () => {
  it("throws NotFound when the answer does not exist", async () => {
    mocks.answerFindUnique.mockResolvedValue(null);

    await expect(acceptAnswer(MISSING_ID, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.questionUpdate).not.toHaveBeenCalled();
  });

  it("rejects a caller who is not the question's author", async () => {
    mocks.answerFindUnique.mockResolvedValue({ ...answerRow, question: { authorId: 7 } });

    await expect(acceptAnswer(ANSWER_ID, 99)).rejects.toThrow(ForbiddenError);
    expect(mocks.questionUpdate).not.toHaveBeenCalled();
  });

  it("points the question at the accepted answer", async () => {
    await acceptAnswer(ANSWER_ID, 7);

    expect(mocks.questionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { acceptedAnswerId: ANSWER_ID },
    });
  });

  it("overwrites a previously accepted answer", async () => {
    mocks.answerFindUnique.mockResolvedValue({
      ...answerRow,
      id: OTHER_ANSWER_ID,
      question: { authorId: 7 },
    });

    await acceptAnswer(OTHER_ANSWER_ID, 7);

    expect(mocks.questionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { acceptedAnswerId: OTHER_ANSWER_ID },
    });
  });

  it("returns the answer marked accepted", async () => {
    const result = await acceptAnswer(ANSWER_ID, 7);

    expect(result.isAccepted).toBe(true);
  });
});

describe("updateAnswer", () => {
  it("writes the new body", async () => {
    await updateAnswer(ANSWER_ID, input);

    expect(mocks.answerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ANSWER_ID }, data: { body: input.body } }),
    );
  });

  it("reflects the question's acceptance state in the response", async () => {
    mocks.answerUpdate.mockResolvedValue({
      ...answerRow,
      question: { acceptedAnswerId: ANSWER_ID },
    });

    const result = await updateAnswer(ANSWER_ID, input);

    expect(result.isAccepted).toBe(true);
  });
});

describe("deleteAnswer", () => {
  it("deletes the row by id", async () => {
    await deleteAnswer(ANSWER_ID);

    expect(mocks.answerDelete).toHaveBeenCalledWith({ where: { id: ANSWER_ID } });
  });
});
