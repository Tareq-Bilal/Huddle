import { describe, expect, it, vi } from "vitest";
import { requireAuthor, requireOwner } from "../authorization.ts";
import { ForbiddenError, NotFoundError } from "../errors/app-error.ts";

const RECORD_ID = "0199d1c2-8f3a-7c41-9b2e-5a6d7e8f9a0b";

/** Stands in for any Prisma delegate whose rows carry an author. */
function delegateReturning(row: { authorId: number } | null) {
  return { findUnique: vi.fn().mockResolvedValue(row) };
}

describe("requireAuthor", () => {
  it("passes when the caller wrote the record", () => {
    expect(() => requireAuthor(7, 7, "question")).not.toThrow();
  });

  it("throws Forbidden when someone else wrote it", () => {
    expect(() => requireAuthor(7, 99, "question")).toThrow(ForbiddenError);
  });

  it("names the resource in the plural, so the message reads naturally", () => {
    expect(() => requireAuthor(7, 99, "answer")).toThrow(/your own answers/);
  });
});

describe("requireOwner", () => {
  it("passes when the caller wrote the record", async () => {
    await expect(
      requireOwner(delegateReturning({ authorId: 7 }), RECORD_ID, 7, "comment"),
    ).resolves.toBeUndefined();
  });

  it("throws Forbidden when someone else wrote it", async () => {
    await expect(
      requireOwner(delegateReturning({ authorId: 7 }), RECORD_ID, 99, "comment"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFound when the record does not exist", async () => {
    await expect(requireOwner(delegateReturning(null), RECORD_ID, 7, "comment")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("reads only the column the decision needs", async () => {
    const delegate = delegateReturning({ authorId: 7 });

    await requireOwner(delegate, RECORD_ID, 7, "comment");

    expect(delegate.findUnique).toHaveBeenCalledWith({
      where: { id: RECORD_ID },
      select: { authorId: true },
    });
  });
});
