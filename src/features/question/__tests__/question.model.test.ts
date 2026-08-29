import { describe, expect, it } from "vitest";
import { diffTagIds } from "../question.model.ts";

describe("diffTagIds", () => {
  it("reports every id as added when there were none before", () => {
    expect(diffTagIds([], [1, 2, 3])).toEqual({ added: [1, 2, 3], removed: [] });
  });

  it("reports every id as removed when the next set is empty", () => {
    expect(diffTagIds([1, 2, 3], [])).toEqual({ added: [], removed: [1, 2, 3] });
  });

  it("reports nothing when the two sets match", () => {
    expect(diffTagIds([1, 2], [2, 1])).toEqual({ added: [], removed: [] });
  });

  it("splits a partial overlap into just the changes", () => {
    expect(diffTagIds([1, 2, 3], [2, 3, 4])).toEqual({ added: [4], removed: [1] });
  });
});
