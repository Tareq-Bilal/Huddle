import argon2 from "argon2";
import { logger } from "../../shared/lib/logger.ts";

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error(`Error verifying password: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}