/** The shape of a user as the API exposes it. `passwordHash` is absent by
 *  construction, so it cannot leak into a response by forgetting to strip it. */
export type AuthUser = {
  id: number;
  name: string;
  email: string;
  reputation: number;
};

export type AuthResult = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

/** Narrows a full user record down to the public shape. Takes a structural type
 *  rather than Prisma's `User` so this file stays free of any Prisma import. */
export function toAuthUser(user: AuthUser): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    reputation: user.reputation,
  };
}

export function refreshTokenExpiresAt(now: Date, ttlDays: number): Date {
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + ttlDays * millisecondsPerDay);
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
