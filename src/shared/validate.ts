import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

type ValidationTarget = "body" | "query" | "params";

export function validate(schema: ZodType, target: ValidationTarget): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(result.error);
      return;
    }

    req[target] = result.data;
    next();
  };
}
