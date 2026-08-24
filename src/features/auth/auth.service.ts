import { createHash, randomUUID } from "node:crypto";
import { env } from "../../config/env.ts";
import type { Prisma } from "../../generated/prisma/client.ts";
import { UnauthorizedError } from "../../shared/errors/app-error.ts";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../shared/lib/jwt.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import type { AuthResult, AuthUser } from "./auth.model.ts";
import { isExpired, refreshTokenExpiresAt, toAuthUser } from "./auth.model.ts";
import { hashPassword, verifyPassword } from "./auth.password.ts";
import type { LoginDto, RegisterDto } from "./auth.schema.ts";

export async function register(dto: RegisterDto): Promise<AuthResult> {
  const user = await prisma.user.create({
    data: {
      name: dto.name,
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
    },
  });

  return issueTokenPair(prisma, toAuthUser(user));
}

export async function login(dto: LoginDto): Promise<AuthResult> {
  const user = await prisma.user.findUnique({ where: { email: dto.email } });

  // The same message for "no such user" and "wrong password" — a distinct
  // response for each would let anyone probe which emails are registered.
  if (!user || !(await verifyPassword(dto.password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return issueTokenPair(prisma, toAuthUser(user));
}

/**
 * Exchanges a refresh token for a new pair, single use.
 *
 * The signature only proves the token was issued by us; the stored row decides
 * whether it is still usable. A token that verifies but whose row is already
 * revoked means someone replayed a rotated token, so every session for that
 * user is killed rather than just this one.
 */
export async function refresh(token: string): Promise<AuthResult> {
  verifyRefreshToken(token);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!stored) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (stored.revokedAt) {
    await revokeAllForUser(stored.userId);
    throw new UnauthorizedError("Refresh token reuse detected, please log in again");
  }

  if (isExpired(stored.expiresAt, new Date())) {
    throw new UnauthorizedError("Refresh token expired");
  }

  // Issuing the replacement and retiring the old row must land together —
  // a crash between them would either strand the user or leave two live tokens.
  return prisma.$transaction(async (tx) => {
    const result = await issueTokenPair(tx, toAuthUser(stored.user));

    await tx.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedByTokenId: result.refreshTokenId },
    });

    return result;
  });
}

/** Idempotent: logging out with an unknown or already-revoked token is not an error. */
export async function logout(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

type IssuedTokens = AuthResult & { refreshTokenId: number };

async function issueTokenPair(
  client: Prisma.TransactionClient,
  user: AuthUser,
): Promise<IssuedTokens> {
  // A random jti keeps every signed token distinct. Without it, two tokens
  // minted for the same user in the same second would be byte-identical and
  // collide on the tokenHash unique constraint.
  const refreshToken = signRefreshToken(randomUUID());

  const stored = await client.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId: user.id,
      expiresAt: refreshTokenExpiresAt(new Date(), env.REFRESH_TOKEN_TTL_DAYS),
    },
  });

  return {
    user,
    accessToken: signAccessToken({ sub: user.id, email: user.email }),
    refreshToken,
    refreshTokenId: stored.id,
  };
}

async function revokeAllForUser(userId: number): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Refresh tokens are stored hashed for the same reason passwords are: a leaked
 *  database dump should not hand an attacker a set of working sessions. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
