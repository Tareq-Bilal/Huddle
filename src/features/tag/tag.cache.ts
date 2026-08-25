import { logger } from "../../shared/lib/logger.ts";
import { redis } from "../../shared/lib/redis.ts";
import type { TagSuggestion } from "./tag.model.ts";

/**
 * Redis cache for tag autocomplete.
 *
 * Autocomplete is the hottest read path in the app — one query per keystroke,
 * over a table that changes rarely. That ratio is what makes it worth caching.
 *
 * Expiry is a short TTL rather than explicit invalidation on every tag write.
 * Invalidation would mean tracking which cached prefixes a new tag affects
 * ("graphql" invalidates "g", "gr", "gra", ...), which is a lot of bookkeeping
 * to avoid at most 60 seconds of a tag not appearing in a dropdown.
 */

const TTL_SECONDS = 60;

/** `limit` is part of the key because ?limit=5 and ?limit=10 are different
 *  result sets for the same prefix. */
export function cacheKey(prefix: string, limit: number): string {
  return `tags:suggest:${prefix}:${limit}`;
}

/**
 * A cache is an optimisation, never a dependency. If Redis is unreachable or
 * returns something unparseable, this reports a miss and the caller falls
 * through to Postgres — degraded speed, correct behaviour.
 */
export async function getCachedSuggestions(
  prefix: string,
  limit: number,
): Promise<TagSuggestion[] | null> {
  try {
    const hit = await redis.get(cacheKey(prefix, limit));
    return hit ? (JSON.parse(hit) as TagSuggestion[]) : null;
  } catch (error) {
    logger.warn(
      `Tag suggestion cache read failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/** Same rule as the read: a failed write is logged and swallowed, never thrown.
 *  The user already has their results — failing the response now would turn a
 *  cache problem into a user-facing error. */
export async function setCachedSuggestions(
  prefix: string,
  limit: number,
  suggestions: TagSuggestion[],
): Promise<void> {
  try {
    await redis.set(cacheKey(prefix, limit), JSON.stringify(suggestions), "EX", TTL_SECONDS);
  } catch (error) {
    logger.warn(
      `Tag suggestion cache write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
