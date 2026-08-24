import type { NextFunction, Request, Response } from "express";
import { UnauthorizedError } from "../errors/app-error.ts";
import { verifyAccessToken } from "../lib/jwt.ts";

/** Guards any route that needs a logged-in caller. Lives in `shared/` rather than
 *  in the auth feature because every feature needs it — putting it in `auth/`
 *  would make every other feature import from auth just to protect a route. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing access token"));
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (error) {
    next(error);
  }
}
