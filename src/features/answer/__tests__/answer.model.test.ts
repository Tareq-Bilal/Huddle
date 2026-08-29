import { describe, expect, it } from "vitest";
import { canAcceptAnswer, toAnswerResponse } from "../answer.model.ts";

const row = {
  id: "0199d1c2-8f3a-7c41-9b2e-5a6d7e8f9a0b",
  body: "Use a read stream and pipe it to the response.",
  score: 3,
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
  questionId: "0199d1c2-8f3a-7c41-9b2e-111111111111",
  author: { id: 7, name: "Ada" },
};

describe("canAcceptAnswer", () => {
  it("is true only for the question's author", () => {
    expect(canAcceptAnswer(7, 7)).toBe(true);
  });

  it("is false for anyone else", () => {
    expect(canAcceptAnswer(7, 99)).toBe(false);
  });
});

describe("toAnswerResponse", () => {
  it("marks the row accepted when it is the question's accepted answer", () => {
    expect(toAnswerResponse(row, row.id).isAccepted).toBe(true);
  });

  it("is not accepted when the question has no accepted answer", () => {
    expect(toAnswerResponse(row, null).isAccepted).toBe(false);
  });

  it("is not accepted when a different answer is the accepted one", () => {
    expect(toAnswerResponse(row, "0199d1c2-8f3a-7c41-9b2e-222222222222").isAccepted).toBe(false);
  });

  it("keeps every stored field alongside the derived flag", () => {
    expect(toAnswerResponse(row, null)).toEqual({ ...row, isAccepted: false });
  });
});
