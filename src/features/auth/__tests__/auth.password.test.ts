import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../auth.password.ts";

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that is not the plain password", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    expect(hash).not.toBe("Str0ng!Pass");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("produces a different hash each time (random salt)", async () => {
    const [first, second] = await Promise.all([
      hashPassword("Str0ng!Pass"),
      hashPassword("Str0ng!Pass"),
    ]);

    expect(first).not.toBe(second);
  });

  it("verifies the correct password against its hash", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    await expect(verifyPassword("Str0ng!Pass", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("Str0ng!Pass");
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });

  it("returns false instead of throwing on a malformed hash", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });
});
