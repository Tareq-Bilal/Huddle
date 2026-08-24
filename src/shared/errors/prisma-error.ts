import { Prisma } from "../../generated/prisma/client.ts";
import { AppError, ConflictError } from "./app-error.ts";

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
