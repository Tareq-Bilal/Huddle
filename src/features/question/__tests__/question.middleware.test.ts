import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  questionFindUnique: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    question: { findUnique: mocks.questionFindUnique },
  },
}));

const { requireQuestionOwner } = await import("../question.middleware.ts");

const QUESTION_ID = "0199d1c2-8f3a-7c41-9b2e-5a6d7e8f9a0b";

function run(userId: number) {
  const req = {
    params: { id: QUESTION_ID },
    user: { id: userId, email: "a@b.c" },
  } as unknown as Request;
  const next = vi.fn();
  return { promise: requireQuestionOwner(req, {} as Response, next as unknown as NextFunction), next };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireQuestionOwner", () => {
  it("calls next with no argument when the caller owns the question", async () => {
    mocks.questionFindUnique.mockResolvedValue({ authorId: 7 });

    const { promise, next } = run(7);
    await promise;

    expect(next).toHaveBeenCalledWith();
  });

  it("passes a ForbiddenError when the question belongs to someone else", async () => {
    mocks.questionFindUnique.mockResolvedValue({ authorId: 7 });

    const { promise, next } = run(99);
    await promise;

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("passes a NotFoundError when the question does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    const { promise, next } = run(7);
    await promise;

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });
});
