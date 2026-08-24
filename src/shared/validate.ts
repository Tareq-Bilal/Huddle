import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";

type ValidationTarget = "body" | "query" | "params";

/** It's a generic, reusable validator — one function that works for any Zod schema
 *  against any part of the request (body, query, or params), instead of writing 
 * separate validation middleware per route or per feature. */
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
