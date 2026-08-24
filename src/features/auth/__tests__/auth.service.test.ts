import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  userCreate: vi.fn(),
  userFindUnique: vi.fn(),
  refreshTokenFindUnique: vi.fn(),
  refreshTokenCreate: vi.fn(),
  refreshTokenUpdate: vi.fn(),
  refreshTokenUpdateMany: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  signAccessToken: vi.fn(),
  signRefreshToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    user: {
      create: mocks.userCreate,
      findUnique: mocks.userFindUnique,
    },
    refreshToken: {
      findUnique: mocks.refreshTokenFindUnique,
      create: mocks.refreshTokenCreate,
      update: mocks.refreshTokenUpdate,
      updateMany: mocks.refreshTokenUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../auth.password.ts", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("../../../shared/lib/jwt.ts", () => ({
  signAccessToken: mocks.signAccessToken,
  signRefreshToken: mocks.signRefreshToken,
  verifyRefreshToken: mocks.verifyRefreshToken,
}));

const { login, logout, refresh, register } = await import("../auth.service.ts");

const dbUser = {
  id: 1,
  name: "Ada Lovelace",
  email: "ada@example.com",
  reputation: 0,
  passwordHash: "stored-hash",
};

// Transaction client mirrors the prisma shape the service expects during rotation —
// separate mocks from the top-level prisma object so a test can assert which one ran.
const txRefreshTokenCreate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signAccessToken.mockReturnValue("access-token");
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback({ refreshToken: { create: txRefreshTokenCreate, update: mocks.refreshTokenUpdate } }),
  );
  txRefreshTokenCreate.mockResolvedValue({ id: 20 });
});

describe("register", () => {
  it("hashes the password before storing the user", async () => {
    mocks.hashPassword.mockResolvedValue("hashed-pw");
    mocks.userCreate.mockResolvedValue(dbUser);
    mocks.refreshTokenCreate.mockResolvedValue({ id: 10 });
    mocks.signRefreshToken.mockReturnValue("refresh-token");

    await register({ name: "Ada Lovelace", email: "ada@example.com", password: "Str0ng!Pass" });

    expect(mocks.hashPassword).toHaveBeenCalledWith("Str0ng!Pass");
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: { name: "Ada Lovelace", email: "ada@example.com", passwordHash: "hashed-pw" },
    });
  });

  it("returns the public user shape plus a fresh token pair", async () => {
    mocks.hashPassword.mockResolvedValue("hashed-pw");
    mocks.userCreate.mockResolvedValue(dbUser);
    mocks.refreshTokenCreate.mockResolvedValue({ id: 10 });
    mocks.signRefreshToken.mockReturnValue("refresh-token");

    const result = await register({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "Str0ng!Pass",
    });

    expect(result).toMatchObject({
      user: { id: 1, name: "Ada Lovelace", email: "ada@example.com", reputation: 0 },
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });
});

describe("login", () => {
  const dto = { email: "ada@example.com", password: "Str0ng!Pass" };

  it("rejects when no user matches the email", async () => {
    mocks.userFindUnique.mockResolvedValue(null);

    await expect(login(dto)).rejects.toThrow(UnauthorizedError);
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("rejects when the password does not match", async () => {
    mocks.userFindUnique.mockResolvedValue(dbUser);
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(login(dto)).rejects.toThrow(UnauthorizedError);
  });

  it("uses the same error for both failure modes (no user enumeration)", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    let noUserMessage = "";
    try {
      await login(dto);
    } catch (error) {
      noUserMessage = (error as Error).message;
    }

    mocks.userFindUnique.mockResolvedValue(dbUser);
    mocks.verifyPassword.mockResolvedValue(false);
    let wrongPasswordMessage = "";
    try {
      await login(dto);
    } catch (error) {
      wrongPasswordMessage = (error as Error).message;
    }

    expect(noUserMessage).toBe(wrongPasswordMessage);
  });

  it("returns a token pair on success", async () => {
    mocks.userFindUnique.mockResolvedValue(dbUser);
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.refreshTokenCreate.mockResolvedValue({ id: 10 });
    mocks.signRefreshToken.mockReturnValue("refresh-token");

    const result = await login(dto);

    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(result.user.email).toBe("ada@example.com");
  });
});

describe("refresh", () => {
  it("rejects when no row matches the token", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue(null);

    await expect(refresh("some-token")).rejects.toThrow(UnauthorizedError);
  });

  it("revokes every token for the user on reuse of an already-revoked token", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: 5,
      userId: 1,
      revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      user: dbUser,
    });

    await expect(refresh("reused-token")).rejects.toThrow(UnauthorizedError);
    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 1, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("rejects an expired token without touching other rows", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: 5,
      userId: 1,
      revokedAt: null,
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      user: dbUser,
    });

    await expect(refresh("expired-token")).rejects.toThrow(UnauthorizedError);
    expect(mocks.refreshTokenUpdateMany).not.toHaveBeenCalled();
  });

  it("rotates a valid token: revokes the old row and issues a new pair", async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: 5,
      userId: 1,
      revokedAt: null,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      user: dbUser,
    });
    mocks.signRefreshToken.mockReturnValue("new-refresh-token");

    const result = await refresh("valid-token");

    expect(result.refreshToken).toBe("new-refresh-token");
    expect(mocks.refreshTokenUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { revokedAt: expect.any(Date), replacedByTokenId: 20 },
    });
  });
});

describe("logout", () => {
  it("does nothing when no token is given", async () => {
    await logout(undefined);
    expect(mocks.refreshTokenUpdateMany).not.toHaveBeenCalled();
  });

  it("revokes only the matching, still-active row", async () => {
    await logout("some-token");

    expect(mocks.refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String), revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
