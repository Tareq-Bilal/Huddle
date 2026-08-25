import { describe, expect, it } from "vitest";
import { toPageMeta, toSkip } from "../question.model.ts";

describe("toSkip", () => {
  it("skips nothing on the first page", () => {
    expect(toSkip(1, 20)).toBe(0);
  });

  it("skips a full page per page beyond the first", () => {
    expect(toSkip(2, 20)).toBe(20);
    expect(toSkip(5, 10)).toBe(40);
  });
});

describe("toPageMeta", () => {
  it("rounds partial pages up", () => {
    expect(toPageMeta(45, 1, 20).totalPages).toBe(3);
  });

  it("reports exact pages when the total divides evenly", () => {
    expect(toPageMeta(40, 1, 20).totalPages).toBe(2);
  });

  it("reports one page when there are no results, not zero", () => {
    expect(toPageMeta(0, 1, 20).totalPages).toBe(1);
  });

  it("echoes back the page and limit it was given", () => {
    expect(toPageMeta(45, 2, 20)).toEqual({ page: 2, limit: 20, total: 45, totalPages: 3 });
  });
});
