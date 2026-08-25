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

    // Express 5 exposes req.query as a getter with no setter, so a plain
    // assignment throws "Cannot set property query" in strict mode (this
    // project is ESM, so every module runs strict). req.body and req.params
    // are still plain writable properties — defineProperty works for all
    // three targets, so it is used uniformly rather than special-cased.
    Object.defineProperty(req, target, {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}
