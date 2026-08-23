import type { NextFunction, Request, Response } from "express";
import { NotFoundError } from "../errors/app-error.ts";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
}
