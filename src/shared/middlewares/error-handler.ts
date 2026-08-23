import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.ts";
import { translatePrismaError } from "../errors/prisma-error.ts";
import { logger } from "../lib/logger.ts";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const knownError = translatePrismaError(err) ?? (err instanceof AppError ? err : null);

  if (knownError) {
    res.status(knownError.statusCode).json({ error: knownError.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid input", details: err.issues });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
}
