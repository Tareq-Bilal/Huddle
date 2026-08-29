import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError, NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  commentFindUnique: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    comment: { findUnique: mocks.commentFindUnique },
  },
}));

const { requireCommentOwner } = await import("../comment.middleware.ts");

const COMMENT_ID = "0199d1c2-8f3a-7c41-9b2e-333333333333";

function run(userId: number) {
  const req = {
    params: { commentId: COMMENT_ID },
    user: { id: userId, email: "a@b.c" },
  } as unknown as Request;
  const next = vi.fn();
  return {
    promise: requireCommentOwner(req, {} as Response, next as unknown as NextFunction),
    next,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireCommentOwner", () => {
  it("calls next with no argument when the caller owns the comment", async () => {
    mocks.commentFindUnique.mockResolvedValue({ authorId: 7 });

    const { promise, next } = run(7);
    await promise;

    expect(next).toHaveBeenCalledWith();
  });

  it("passes a ForbiddenError when the comment belongs to someone else", async () => {
    mocks.commentFindUnique.mockResolvedValue({ authorId: 7 });

    const { promise, next } = run(99);
    await promise;

    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it("passes a NotFoundError when the comment does not exist", async () => {
    mocks.commentFindUnique.mockResolvedValue(null);

    const { promise, next } = run(7);
    await promise;

    expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
  });
});
