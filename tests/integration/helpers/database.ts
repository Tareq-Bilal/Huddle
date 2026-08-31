import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "../../../src/generated/prisma/client.ts";

export type TestDatabase = {
  prisma: PrismaClient;
  /** Deletes every row, children before parents. Call in `beforeEach`. */
  reset: () => Promise<void>;
  /** Disconnects and stops the container. Call in `afterAll`. */
  stop: () => Promise<void>;
};

/**
 * Starts a throwaway Postgres in Docker, runs the real migrations against it,
 * and hands back a Prisma client pointed at it. Nothing here touches the dev
 * database or the shared `prisma` singleton.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();

  const url = container.getConnectionUri();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  return {
    prisma,
    reset: async () => {
      await prisma.vote.deleteMany();
      await prisma.comment.deleteMany();
      await prisma.answer.deleteMany();
      await prisma.question.deleteMany();
      await prisma.tag.deleteMany();
      await prisma.user.deleteMany();
    },
    stop: async () => {
      await prisma.$disconnect();
      await container.stop();
    },
  };
}
