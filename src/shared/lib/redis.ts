import { Redis } from "ioredis";
import { env } from "../../config/env.ts";

export const redis = new Redis(env.REDIS_URL);
