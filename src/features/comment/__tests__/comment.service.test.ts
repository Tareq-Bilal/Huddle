import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client.ts";
import { NotFoundError } from "../../../shared/errors/app-error.ts";

/** What Prisma throws when the question or answer a comment points at is gone. */
function foreignKeyViolation() {
  return new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
    code: "P2003",
    clientVersion: "7.9.1",
  });
}

const mocks = vi.hoisted(() => ({
  questionFindUnique: vi.fn(),
  answerFindUnique: vi.fn(),
  commentCreate: vi.fn(),
  commentFindMany: vi.fn(),
  commentCount: vi.fn(),
  commentUpdate: vi.fn(),
  commentDelete: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    question: { findUnique: mocks.questionFindUnique },
    answer: { findUnique: mocks.answerFindUnique },
    comment: {
      create: mocks.commentCreate,
      findMany: mocks.commentFindMany,
      count: mocks.commentCount,
      update: mocks.commentUpdate,
      delete: mocks.commentDelete,
    },
  },
}));

const { createComment, deleteComment, listComments, updateComment } = await import(
  "../comment.service.ts"
);

const QUESTION_ID = "0199d1c2-8f3a-7c41-9b2e-111111111111";
const ANSWER_ID = "0199d1c2-8f3a-7c41-9b2e-5a6d7e8f9a0b";
const COMMENT_ID = "0199d1c2-8f3a-7c41-9b2e-333333333333";
const MISSING_ID = "0199d1c2-8f3a-7c41-9b2e-000000000000";

const onQuestion = { type: "question", id: QUESTION_ID } as const;
const onAnswer = { type: "answer", id: ANSWER_ID } as const;

const commentRow = {
  id: COMMENT_ID,
  body: "Did you try setting highWaterMark on the stream?",
  createdAt: new Date("2026-08-30T00:00:00.000Z"),
  questionId: QUESTION_ID,
  answerId: null,
  author: { id: 7, name: "Ada" },
};

const input = { body: "Did you try setting highWaterMark on the stream?" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.questionFindUnique.mockResolvedValue({ id: QUESTION_ID });
  mocks.answerFindUnique.mockResolvedValue({ id: ANSWER_ID });
  mocks.commentCreate.mockResolvedValue(commentRow);
  mocks.commentFindMany.mockResolvedValue([commentRow]);
  mocks.commentCount.mockResolvedValue(1);
  mocks.commentUpdate.mockResolvedValue(commentRow);
});

describe("createComment", () => {
  it("turns the foreign key's refusal into NotFound when the question is gone", async () => {
    mocks.commentCreate.mockRejectedValue(foreignKeyViolation());

    await expect(createComment({ type: "question", id: MISSING_ID }, input, 7)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("turns the foreign key's refusal into NotFound when the answer is gone", async () => {
    mocks.commentCreate.mockRejectedValue(foreignKeyViolation());

    await expect(createComment({ type: "answer", id: MISSING_ID }, input, 7)).rejects.toThrow(
      NotFoundError,
    );
  });

  it("lets any other database error through untouched", async () => {
    mocks.commentCreate.mockRejectedValue(new Error("connection reset"));

    await expect(createComment(onQuestion, input, 7)).rejects.toThrow("connection reset");
  });

  it("does not look the target up before inserting", async () => {
    // The foreign key already guarantees it, and checking first would leave a
    // window in which the target is deleted between the check and the insert.
    await createComment(onQuestion, input, 7);

    expect(mocks.questionFindUnique).not.toHaveBeenCalled();
    expect(mocks.answerFindUnique).not.toHaveBeenCalled();
  });

  it("stores a question comment against questionId only", async () => {
    await createComment(onQuestion, input, 7);

    expect(mocks.commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { body: input.body, authorId: 7, questionId: QUESTION_ID },
      }),
    );
  });

  it("stores an answer comment against answerId only", async () => {
    await createComment(onAnswer, input, 7);

    expect(mocks.commentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { body: input.body, authorId: 7, answerId: ANSWER_ID },
      }),
    );
  });

  it("lets anyone logged in comment — there is no reputation gate", async () => {
    // A brand-new user with zero reputation is never looked up at all.
    await createComment(onQuestion, input, 999);

    expect(mocks.commentCreate).toHaveBeenCalled();
  });
});

describe("listComments", () => {
  it("throws NotFound when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(
      listComments({ type: "question", id: MISSING_ID }, { page: 1, limit: 20 }),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns the page alongside its metadata", async () => {
    mocks.commentCount.mockResolvedValue(45);

    const result = await listComments(onQuestion, { page: 2, limit: 20 });

    expect(result.comments).toHaveLength(1);
    expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });

  it("filters by the target's own column, oldest first", async () => {
    await listComments(onAnswer, { page: 3, limit: 10 });

    expect(mocks.commentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { answerId: ANSWER_ID },
        skip: 20,
        take: 10,
        orderBy: { createdAt: "asc" },
      }),
    );
  });

  it("counts only the target's own comments", async () => {
    await listComments(onQuestion, { page: 1, limit: 20 });

    expect(mocks.commentCount).toHaveBeenCalledWith({ where: { questionId: QUESTION_ID } });
  });
});

describe("updateComment", () => {
  it("writes the new body", async () => {
    await updateComment(COMMENT_ID, input);

    expect(mocks.commentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: COMMENT_ID }, data: { body: input.body } }),
    );
  });
});

describe("deleteComment", () => {
  it("deletes the row by id", async () => {
    await deleteComment(COMMENT_ID);

    expect(mocks.commentDelete).toHaveBeenCalledWith({ where: { id: COMMENT_ID } });
  });
});
