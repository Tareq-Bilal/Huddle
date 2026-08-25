import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../../shared/lib/redis.ts", () => ({
  redis: { get: mocks.get, set: mocks.set },
}));

vi.mock("../../../shared/lib/logger.ts", () => ({
  logger: { warn: mocks.warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { cacheKey, getCachedSuggestions, setCachedSuggestions } = await import("../tag.cache.ts");

const suggestions = [{ name: "Node.js", slug: "node-js", questionCount: 12403 }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cacheKey", () => {
  it("includes both prefix and limit", () => {
    expect(cacheKey("nod", 10)).toBe("tags:suggest:nod:10");
  });

  it("gives different keys for different limits on the same prefix", () => {
    expect(cacheKey("nod", 5)).not.toBe(cacheKey("nod", 10));
  });
});

describe("getCachedSuggestions", () => {
  it("returns the parsed suggestions on a hit", async () => {
    mocks.get.mockResolvedValue(JSON.stringify(suggestions));

    await expect(getCachedSuggestions("nod", 10)).resolves.toEqual(suggestions);
    expect(mocks.get).toHaveBeenCalledWith("tags:suggest:nod:10");
  });

  it("returns null on a miss", async () => {
    mocks.get.mockResolvedValue(null);

    await expect(getCachedSuggestions("nod", 10)).resolves.toBeNull();
  });

  it("reports a miss instead of throwing when Redis is unreachable", async () => {
    mocks.get.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(getCachedSuggestions("nod", 10)).resolves.toBeNull();
    expect(mocks.warn).toHaveBeenCalled();
  });

  it("reports a miss instead of throwing when the cached value is corrupt", async () => {
    mocks.get.mockResolvedValue("{ not json");

    await expect(getCachedSuggestions("nod", 10)).resolves.toBeNull();
    expect(mocks.warn).toHaveBeenCalled();
  });
});

describe("setCachedSuggestions", () => {
  it("stores the suggestions under a TTL", async () => {
    mocks.set.mockResolvedValue("OK");

    await setCachedSuggestions("nod", 10, suggestions);

    expect(mocks.set).toHaveBeenCalledWith(
      "tags:suggest:nod:10",
      JSON.stringify(suggestions),
      "EX",
      60,
    );
  });

  it("swallows a write failure rather than failing the request", async () => {
    mocks.set.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(setCachedSuggestions("nod", 10, suggestions)).resolves.toBeUndefined();
    expect(mocks.warn).toHaveBeenCalled();
  });
});
