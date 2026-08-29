import { Prisma } from "../../generated/prisma/client.ts";
import { AppError, ConflictError } from "./app-error.ts";

/** True when Postgres rejected a write for breaking a unique constraint.
 *  A caller that *expects* the collision — find-or-create racing against itself —
 *  uses this to recover; everything else lets the error reach the error handler,
 *  which turns it into a 409 via `translatePrismaError` below. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** True when Postgres rejected a write because the row it points at is not
 *  there. Lets a caller insert first and translate the failure, instead of
 *  checking the parent exists and racing a concurrent delete. */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export function translatePrismaError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  switch (error.code) {
    case "P2002": {
      const target = error.meta?.target;
      // Depending on the driver, Prisma reports the violated unique constraint
      // either as an array of column names or as a single constraint name string
      // (e.g. "User_email_key") — handle both instead of assuming the array shape.
      const fields = Array.isArray(target)
        ? target.join(", ")
        : (typeof target === "string" ? target : "field");
      return new ConflictError(`A record with this ${fields} already exists`);
    }
    default:
      return null;
  }
}
