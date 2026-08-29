import { describe, expect, it } from "vitest";
import { toTargetColumn } from "../comment.model.ts";

const QUESTION_ID = "0199d1c2-8f3a-7c41-9b2e-111111111111";
const ANSWER_ID = "0199d1c2-8f3a-7c41-9b2e-5a6d7e8f9a0b";

describe("toTargetColumn", () => {
  it("puts a question target in the questionId column", () => {
    expect(toTargetColumn({ type: "question", id: QUESTION_ID })).toEqual({
      questionId: QUESTION_ID,
    });
  });

  it("puts an answer target in the answerId column", () => {
    expect(toTargetColumn({ type: "answer", id: ANSWER_ID })).toEqual({ answerId: ANSWER_ID });
  });

  it("never sets both columns — the database CHECK expects exactly one", () => {
    expect(Object.keys(toTargetColumn({ type: "question", id: QUESTION_ID }))).toEqual([
      "questionId",
    ]);
    expect(Object.keys(toTargetColumn({ type: "answer", id: ANSWER_ID }))).toEqual(["answerId"]);
  });
});
