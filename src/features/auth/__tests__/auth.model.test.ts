import { describe, expect, it } from "vitest";
import { isExpired, refreshTokenExpiresAt, toAuthUser } from "../auth.model.ts";

describe("toAuthUser", () => {
  it("keeps only the public fields", () => {
    const record = {
      id: 1,
      name: "Ada",
      email: "ada@example.com",
      reputation: 42,
      passwordHash: "should-not-appear",
    };

    expect(toAuthUser(record)).toEqual({
      id: 1,
      name: "Ada",
      email: "ada@example.com",
      reputation: 42,
    });
  });
});

describe("refreshTokenExpiresAt", () => {
  it("adds the given number of days to now", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(refreshTokenExpiresAt(now, 30)).toEqual(new Date("2026-01-31T00:00:00.000Z"));
  });

  it("returns the same instant for a zero-day ttl", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");

    expect(refreshTokenExpiresAt(now, 0)).toEqual(now);
  });
});

describe("isExpired", () => {
  const now = new Date("2026-01-15T12:00:00.000Z");

  it("is false when expiry is in the future", () => {
    expect(isExpired(new Date("2026-01-16T00:00:00.000Z"), now)).toBe(false);
  });

  it("is true when expiry is in the past", () => {
    expect(isExpired(new Date("2026-01-14T00:00:00.000Z"), now)).toBe(true);
  });

  it("is true when expiry equals now (boundary, not exclusive)", () => {
    expect(isExpired(now, now)).toBe(true);
  });
});
