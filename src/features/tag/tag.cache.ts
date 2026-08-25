import type { TagSuggestion } from "./tag.model.ts";

/**
 * PLACEHOLDER — the Redis-backed autocomplete cache is not wired up yet.
 *
 * Autocomplete is the hottest read path in the app: one query per keystroke,
 * over a table that changes rarely. That is the textbook case for a cache, so
 * the service already calls through this seam. Today `get` always misses and
 * `set` does nothing, which means the feature is correct but uncached — every
 * search hits Postgres.
 *
 * When you get to the Redis chapter, the only file that changes is this one:
 *
 *   1. import { redis } from "../../shared/lib/redis.ts"
 *   2. get:  const hit = await redis.get(cacheKey(prefix, limit));
 *            return hit ? (JSON.parse(hit) as TagSuggestion[]) : null;
 *   3. set:  await redis.set(cacheKey(prefix, limit), JSON.stringify(suggestions), "EX", TTL_SECONDS);
 *
 * Two things worth thinking about before you write it:
 *   - TTL vs invalidation. A short TTL (say 60s) is far simpler than invalidating
 *     on every tag write, and a slightly stale autocomplete list is harmless.
 *   - The key includes `limit`, because ?limit=5 and ?limit=10 are different
 *     result sets for the same prefix.
 */

const TTL_SECONDS = 60;

export function cacheKey(prefix: string, limit: number): string {
  return `tags:suggest:${prefix}:${limit}`;
}

/** Always a miss until Redis is wired up. */
export async function getCachedSuggestions(
  _prefix: string,
  _limit: number,
): Promise<TagSuggestion[] | null> {
  return null;
}

/** No-op until Redis is wired up. */
export async function setCachedSuggestions(
  _prefix: string,
  _limit: number,
  _suggestions: TagSuggestion[],
): Promise<void> {
  // Intentionally empty — see the note at the top of this file.
  void TTL_SECONDS;
}
