import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "../auth.schema.ts";

describe("registerSchema", () => {
  const valid = { name: "Ada Lovelace", email: "ada@example.com", password: "Str0ng!Pass" };

  it("accepts a fully valid payload", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    const result = registerSchema.safeParse({ ...valid, name: "A" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it.each([
    ["shorter than 8 characters", "Sh0rt!"],
    ["missing an uppercase letter", "str0ng!pass"],
    ["missing a number", "Strong!Pass"],
    ["missing a special character", "Str0ngPass"],
  ])("rejects a password %s", (_label, password) => {
    const result = registerSchema.safeParse({ ...valid, password });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts email and password with no complexity check", () => {
    const result = loginSchema.safeParse({ email: "ada@example.com", password: "whatever1" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing password", () => {
    const result = loginSchema.safeParse({ email: "ada@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "whatever1" });
    expect(result.success).toBe(false);
  });
});
