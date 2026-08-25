import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  tagFindMany: vi.fn(),
  tagFindUnique: vi.fn(),
  tagCreate: vi.fn(),
  synonymFindMany: vi.fn(),
  synonymFindUnique: vi.fn(),
  getCached: vi.fn(),
  setCached: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    tag: {
      findMany: mocks.tagFindMany,
      findUnique: mocks.tagFindUnique,
      create: mocks.tagCreate,
    },
    tagSynonym: {
      findMany: mocks.synonymFindMany,
      findUnique: mocks.synonymFindUnique,
    },
  },
}));

vi.mock("../tag.cache.ts", () => ({
  getCachedSuggestions: mocks.getCached,
  setCachedSuggestions: mocks.setCached,
}));

const { createTag, findOrCreateByNames, getTagBySlug, searchTags } = await import(
  "../tag.service.ts"
);

const nodeJs = { id: 1, name: "Node.js", slug: "node-js", questionCount: 12403 };
const nodemon = { id: 2, name: "Nodemon", slug: "nodemon", questionCount: 847 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCached.mockResolvedValue(null);
  mocks.setCached.mockResolvedValue(undefined);
  mocks.tagFindMany.mockResolvedValue([]);
  mocks.synonymFindMany.mockResolvedValue([]);
  mocks.tagFindUnique.mockResolvedValue(null);
  mocks.synonymFindUnique.mockResolvedValue(null);
});

describe("searchTags", () => {
  it.each(["Node.J", "node j", "NODE-J"])(
    "slugifies the raw query so %j searches the same prefix",
    async (query) => {
      await searchTags(query, 10);

      expect(mocks.tagFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: { startsWith: "node-j" } } }),
      );
    },
  );

  it("returns the canonical tag when only a synonym matched", async () => {
    mocks.synonymFindMany.mockResolvedValue([{ tag: nodeJs }]);

    const result = await searchTags("nodejs", 10);

    expect(result).toEqual([{ name: "Node.js", slug: "node-js", questionCount: 12403 }]);
  });

  it("shows a tag once when it matches directly and through a synonym", async () => {
    mocks.tagFindMany.mockResolvedValue([nodeJs]);
    mocks.synonymFindMany.mockResolvedValue([{ tag: nodeJs }]);

    const result = await searchTags("node", 10);

    expect(result).toHaveLength(1);
  });

  it("orders results by question count", async () => {
    mocks.tagFindMany.mockResolvedValue([nodemon, nodeJs]);

    const result = await searchTags("nod", 10);

    expect(result.map((tag) => tag.slug)).toEqual(["node-js", "nodemon"]);
  });

  it("never exposes the internal id to the client", async () => {
    mocks.tagFindMany.mockResolvedValue([nodeJs]);

    const [suggestion] = await searchTags("nod", 10);

    expect(suggestion).not.toHaveProperty("id");
  });

  it("lists popular tags rather than searching when no query is given", async () => {
    mocks.tagFindMany.mockResolvedValue([nodeJs]);

    await searchTags(undefined, 10);

    expect(mocks.tagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined, orderBy: { questionCount: "desc" } }),
    );
    expect(mocks.synonymFindMany).not.toHaveBeenCalled();
  });

  it("returns the cached result without querying the database", async () => {
    mocks.getCached.mockResolvedValue([
      { name: "Node.js", slug: "node-js", questionCount: 12403 },
    ]);

    const result = await searchTags("nod", 10);

    expect(result).toHaveLength(1);
    expect(mocks.tagFindMany).not.toHaveBeenCalled();
  });

  it("writes fresh results back to the cache", async () => {
    mocks.tagFindMany.mockResolvedValue([nodeJs]);

    await searchTags("nod", 10);

    expect(mocks.setCached).toHaveBeenCalledWith("nod", 10, [
      { name: "Node.js", slug: "node-js", questionCount: 12403 },
    ]);
  });
});

describe("getTagBySlug", () => {
  it("returns a tag matched directly, without consulting synonyms", async () => {
    mocks.tagFindUnique.mockResolvedValue(nodeJs);

    await expect(getTagBySlug("node-js")).resolves.toEqual(nodeJs);
    expect(mocks.synonymFindUnique).not.toHaveBeenCalled();
  });

  it("follows a synonym to its canonical tag", async () => {
    mocks.synonymFindUnique.mockResolvedValue({ tag: nodeJs });

    await expect(getTagBySlug("nodejs")).resolves.toEqual(nodeJs);
  });

  it("throws NotFound when neither a tag nor a synonym matches", async () => {
    await expect(getTagBySlug("nope")).rejects.toThrow(NotFoundError);
  });
});

describe("findOrCreateByNames", () => {
  it("reuses an existing tag instead of creating a duplicate", async () => {
    mocks.tagFindUnique.mockResolvedValue(nodeJs);

    await expect(findOrCreateByNames(["Node.js"])).resolves.toEqual([nodeJs]);
    expect(mocks.tagCreate).not.toHaveBeenCalled();
  });

  it("resolves a synonym to the canonical tag rather than creating one", async () => {
    mocks.synonymFindUnique.mockResolvedValue({ tag: nodeJs });

    await expect(findOrCreateByNames(["nodejs"])).resolves.toEqual([nodeJs]);
    expect(mocks.tagCreate).not.toHaveBeenCalled();
  });

  it("creates a tag that does not exist yet", async () => {
    mocks.tagCreate.mockResolvedValue({ id: 9, name: "GraphQL", slug: "graphql", questionCount: 0 });

    const result = await findOrCreateByNames(["GraphQL"]);

    expect(mocks.tagCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "GraphQL", slug: "graphql" } }),
    );
    expect(result[0]?.slug).toBe("graphql");
  });

  it("collapses names that slugify identically into a single insert", async () => {
    mocks.tagCreate.mockResolvedValue({ id: 1, name: "Node.js", slug: "node-js", questionCount: 0 });

    const result = await findOrCreateByNames(["Node.js", "node js", "NODE-JS"]);

    expect(result).toHaveLength(1);
    expect(mocks.tagCreate).toHaveBeenCalledTimes(1);
  });

  it("drops names that slugify to nothing", async () => {
    await expect(findOrCreateByNames(["   ", "!!!"])).resolves.toEqual([]);
    expect(mocks.tagCreate).not.toHaveBeenCalled();
  });
});

describe("createTag", () => {
  it("refuses a name whose slug is already a synonym", async () => {
    mocks.synonymFindUnique.mockResolvedValue({ id: 3, slug: "nodejs", tagId: 1 });

    await expect(createTag("nodejs")).rejects.toThrow(ConflictError);
    expect(mocks.tagCreate).not.toHaveBeenCalled();
  });

  it("stores the slugified form alongside the display name", async () => {
    mocks.tagCreate.mockResolvedValue(nodeJs);

    await createTag("Node.js");

    expect(mocks.tagCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Node.js", slug: "node-js" } }),
    );
  });
});
