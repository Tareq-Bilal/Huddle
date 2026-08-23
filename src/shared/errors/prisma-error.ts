import { Prisma } from "../../generated/prisma/client.ts";
import { AppError, ConflictError } from "./app-error.ts";

export function translatePrismaError(error: unknown): AppError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return null;
  }

  switch (error.code) {
    case "P2002": {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(", ") : "field";
      return new ConflictError(`A record with this ${fields} already exists`);
    }
    default:
      return null;
  }
}
