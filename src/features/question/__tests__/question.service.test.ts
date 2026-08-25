import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  questionCreate: vi.fn(),
  questionFindMany: vi.fn(),
  questionFindUnique: vi.fn(),
  questionCount: vi.fn(),
  tagUpdateMany: vi.fn(),
  transaction: vi.fn(),
  findOrCreateByNames: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    question: {
      findMany: mocks.questionFindMany,
      findUnique: mocks.questionFindUnique,
      count: mocks.questionCount,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../../tag/index.ts", () => ({
  findOrCreateByNames: mocks.findOrCreateByNames,
}));

const { createQuestion, getQuestionById, listQuestions } = await import("../question.service.ts");

const nodeJs = { id: 1, name: "Node.js", slug: "node-js", questionCount: 12403 };
const express = { id: 2, name: "Express", slug: "express", questionCount: 900 };

const question = {
  id: 100,
  title: "How do I stream a large file in Node.js?",
  body: "I need to send a multi-gigabyte file without loading it into memory.",
  score: 0,
  viewCount: 0,
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  author: { id: 7, name: "Ada" },
  tags: [{ name: "Node.js", slug: "node-js" }],
};

const input = {
  title: "How do I stream a large file in Node.js?",
  body: "I need to send a multi-gigabyte file without loading it into memory.",
  tags: ["Node.js", "Express"],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findOrCreateByNames.mockResolvedValue([nodeJs, express]);
  mocks.questionCreate.mockResolvedValue(question);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({
      question: { create: mocks.questionCreate },
      tag: { updateMany: mocks.tagUpdateMany },
    }),
  );
});

describe("createQuestion", () => {
  it("resolves tags through the tag feature, passing the author for the reputation gate", async () => {
    await createQuestion(input, 7);

    expect(mocks.findOrCreateByNames).toHaveBeenCalledWith(["Node.js", "Express"], 7);
  });

  it("connects the resolved tags to the new question", async () => {
    await createQuestion(input, 7);

    expect(mocks.questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: input.title,
          body: input.body,
          authorId: 7,
          tags: { connect: [{ id: 1 }, { id: 2 }] },
        }),
      }),
    );
  });

  it("increments questionCount for every attached tag", async () => {
    await createQuestion(input, 7);

    expect(mocks.tagUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { questionCount: { increment: 1 } },
    });
  });

  it("does both writes inside one transaction", async () => {
    await createQuestion(input, 7);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("resolves tags before opening the transaction", async () => {
    // Tag creation recovers from a unique violation by re-reading, which is
    // impossible inside an aborted Postgres transaction.
    const order: string[] = [];
    mocks.findOrCreateByNames.mockImplementation(async () => {
      order.push("tags");
      return [nodeJs];
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => {
      order.push("transaction");
      return callback({
        question: { create: mocks.questionCreate },
        tag: { updateMany: mocks.tagUpdateMany },
      });
    });

    await createQuestion(input, 7);

    expect(order).toEqual(["tags", "transaction"]);
  });

  it("does not create the question when the tag gate rejects", async () => {
    mocks.findOrCreateByNames.mockRejectedValue(new Error("Forbidden"));

    await expect(createQuestion(input, 7)).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("listQuestions", () => {
  it("returns the page alongside its metadata", async () => {
    mocks.questionFindMany.mockResolvedValue([question]);
    mocks.questionCount.mockResolvedValue(45);

    const result = await listQuestions({ page: 2, limit: 20 });

    expect(result.questions).toHaveLength(1);
    expect(result.meta).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });

  it("translates page and limit into skip and take", async () => {
    mocks.questionFindMany.mockResolvedValue([]);
    mocks.questionCount.mockResolvedValue(0);

    await listQuestions({ page: 3, limit: 10 });

    expect(mocks.questionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("returns newest questions first", async () => {
    mocks.questionFindMany.mockResolvedValue([]);
    mocks.questionCount.mockResolvedValue(0);

    await listQuestions({ page: 1, limit: 20 });

    expect(mocks.questionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } }),
    );
  });

  it("omits the body from list results", async () => {
    mocks.questionFindMany.mockResolvedValue([]);
    mocks.questionCount.mockResolvedValue(0);

    await listQuestions({ page: 1, limit: 20 });

    const call = mocks.questionFindMany.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(call.select).not.toHaveProperty("body");
  });
});

describe("getQuestionById", () => {
  it("returns the question when it exists", async () => {
    mocks.questionFindUnique.mockResolvedValue(question);

    await expect(getQuestionById(100)).resolves.toEqual(question);
  });

  it("throws NotFound when it does not", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(getQuestionById(999)).rejects.toThrow(NotFoundError);
  });

  it("includes the body, unlike the list view", async () => {
    mocks.questionFindUnique.mockResolvedValue(question);

    await getQuestionById(100);

    const call = mocks.questionFindUnique.mock.calls[0]?.[0] as { select: Record<string, unknown> };
    expect(call.select).toHaveProperty("body", true);
  });
});
