import type { CookieOptions, Request, Response } from "express";
import { env } from "../../config/env.ts";
import { UnauthorizedError } from "../../shared/errors/app-error.ts";
import { catchAsync } from "../../shared/catch-async.ts";
import type { AuthResult } from "./auth.model.ts";
import type { LoginDto, RegisterDto } from "./auth.schema.ts";
import * as authService from "./auth.service.ts";

const REFRESH_COOKIE = "refreshToken";

/** `httpOnly` keeps the token out of reach of any script on the page, so an XSS
 *  bug cannot read it. `path` limits it to the auth routes, so it is not attached
 *  to every unrelated API call. */
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: env.NODE_ENV === "production",
  path: "/api/v1/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};

export const register = catchAsync(async (req: Request, res: Response) => {
  // Validated by the `validate(registerSchema, "body")` middleware in auth.routes.ts —
  // req.body is already parsed and safe to trust here.
  const result = await authService.register(req.body as RegisterDto);

  res.status(201).json(respond(res, result));
});

export const login = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.login(req.body as LoginDto);

  res.status(200).json(respond(res, result));
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const token = readRefreshCookie(req);

  if (!token) {
    throw new UnauthorizedError("Missing refresh token");
  }

  const result = await authService.refresh(token);

  res.status(200).json(respond(res, result));
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  await authService.logout(readRefreshCookie(req));

  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.status(204).send();
});

function readRefreshCookie(req: Request): string | undefined {
  const token: unknown = req.cookies?.[REFRESH_COOKIE];
  return typeof token === "string" ? token : undefined;
}

/** Sets the refresh cookie and returns only the half of the result that is safe
 *  to serialise — the refresh token itself never appears in a response body. */
function respond(res: Response, result: AuthResult) {
  res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
  return { user: result.user, accessToken: result.accessToken };
}
