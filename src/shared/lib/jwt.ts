import jwt from "jsonwebtoken";
import { env } from "../../config/env.ts";
import { UnauthorizedError } from "../errors/app-error.ts";

/** Claims carried by an access token. Kept small on purpose: an access token is
 *  sent on every request, and anything in here is readable by anyone holding it. */
export type AccessTokenPayload = {
  sub: number;
  email: string;
};

/** Claims carried by a refresh token. `jti` identifies the stored refreshToken
 *  row — the signature proves the token is ours, the row decides if it's still valid. */
export type RefreshTokenPayload = {
  jti: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
  });
}

export function signRefreshToken(jti: string): string {
  return jwt.sign({ jti }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = verify(token, env.JWT_ACCESS_SECRET);

  if (typeof decoded.sub !== "number" || typeof decoded.email !== "string") {
    throw new UnauthorizedError("Invalid access token");
  }

  return { sub: decoded.sub, email: decoded.email };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = verify(token, env.JWT_REFRESH_SECRET);

  if (typeof decoded.jti !== "string") {
    throw new UnauthorizedError("Invalid refresh token");
  }

  return { jti: decoded.jti };
}

/** jsonwebtoken throws several different error types for an unusable token
 *  (bad signature, expired, malformed). They all mean the same thing to a caller,
 *  so they collapse into one 401 here rather than at every call site. */
function verify(token: string, secret: string): jwt.JwtPayload {
  try {
    const decoded = jwt.verify(token, secret);

    if (typeof decoded === "string") {
      throw new UnauthorizedError("Invalid token");
    }

    return decoded;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
