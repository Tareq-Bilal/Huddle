import { app } from "./app.ts";
import { env } from "./config/env.ts";
import { logger } from "./shared/lib/logger.ts";
import { prisma } from "./shared/lib/prisma.ts";
import { redis } from "./shared/lib/redis.ts";

const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

async function shutdown() {
  logger.info("Shutting down gracefully...");

  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", shutdown);
