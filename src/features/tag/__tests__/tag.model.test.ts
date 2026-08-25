import { describe, expect, it } from "vitest";
import type { Tag } from "../tag.model.ts";
import { dedupeById, rankByPopularity, slugify, toTagSuggestion } from "../tag.model.ts";

const tag = (id: number, name: string, questionCount: number): Tag => ({
  id,
  name,
  slug: slugify(name),
  questionCount,
});

describe("slugify", () => {
  it.each([
    ["REST API", "rest-api"],
    ["Node.js", "node-js"],
    ["TypeScript", "typescript"],
    ["  spaced   out  ", "spaced-out"],
    ["Machine Learning 101", "machine-learning-101"],
  ])("turns %j into %j", (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  it.each([
    ["C++", "c-plus-plus"],
    ["C#", "c-sharp"],
    ["F#", "f-sharp"],
    ["C", "c"],
  ])("spells out symbols so %j does not collide", (name, expected) => {
    expect(slugify(name)).toBe(expected);
  });

  it("gives C, C++ and C# three distinct slugs", () => {
    const slugs = new Set([slugify("C"), slugify("C++"), slugify("C#")]);
    expect(slugs.size).toBe(3);
  });

  it("strips leading and trailing separators", () => {
    expect(slugify(".NET")).toBe("net");
    expect(slugify("---weird---")).toBe("weird");
  });

  it("is idempotent — slugifying a slug returns the same value", () => {
    const once = slugify("REST API");
    expect(slugify(once)).toBe(once);
  });

  it("collapses casing and punctuation differences onto one slug", () => {
    expect(slugify("REST API")).toBe(slugify("rest api"));
    expect(slugify("REST API")).toBe(slugify("Rest-Api"));
  });
});

describe("dedupeById", () => {
  it("keeps a tag once when it arrives both directly and via a synonym", () => {
    const nodeJs = tag(1, "Node.js", 12403);

    expect(dedupeById([nodeJs, nodeJs])).toEqual([nodeJs]);
  });

  it("keeps the first occurrence and preserves order", () => {
    const a = tag(1, "Node.js", 10);
    const b = tag(2, "React", 20);

    expect(dedupeById([a, b, a])).toEqual([a, b]);
  });

  it("returns an empty array for no input", () => {
    expect(dedupeById([])).toEqual([]);
  });
});

describe("rankByPopularity", () => {
  const nodemon = tag(1, "Nodemon", 847);
  const nodeJs = tag(2, "Node.js", 12403);
  const node = tag(3, "Node", 12);

  it("orders by question count, most used first", () => {
    expect(rankByPopularity([nodemon, nodeJs, node], 10)).toEqual([nodeJs, nodemon, node]);
  });

  it("truncates to the limit", () => {
    expect(rankByPopularity([nodemon, nodeJs, node], 2)).toEqual([nodeJs, nodemon]);
  });

  it("does not mutate the input array", () => {
    const input = [nodemon, nodeJs];
    rankByPopularity(input, 2);

    expect(input).toEqual([nodemon, nodeJs]);
  });
});

describe("toTagSuggestion", () => {
  it("exposes name, slug and count but not the internal id", () => {
    expect(toTagSuggestion(tag(7, "Node.js", 12403))).toEqual({
      name: "Node.js",
      slug: "node-js",
      questionCount: 12403,
    });
  });
});
