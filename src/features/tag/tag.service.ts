import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { isUniqueViolation } from "../../shared/errors/prisma-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import { getCachedSuggestions, setCachedSuggestions } from "./tag.cache.ts";
import type { Tag, TagSuggestion } from "./tag.model.ts";
import {
  MIN_REPUTATION_TO_CREATE_TAG,
  canCreateTag,
  dedupeById,
  rankByPopularity,
  slugify,
  toTagSuggestion,
} from "./tag.model.ts";

/** Every query returns the same shape, so `Tag` is the only row type in play. */
const TAG_FIELDS = { id: true, name: true, slug: true, questionCount: true } as const;

/** A synonym row is only ever interesting for the tag it points at. */
const CANONICAL_TAG = { tag: { select: TAG_FIELDS } } as const;

/**
 * Autocomplete. Matches the typed prefix against real tags and against synonyms,
 * then returns canonical tags only — someone typing "nodejs" is shown "Node.js"
 * and never learns a redirect happened.
 *
 * The query is slugified before matching, so "Node.J", "node j" and "NODE-J"
 * all search for the same thing. One normalisation rule, used everywhere.
 *
 * An empty query is not an error: it means "show me the popular tags", which is
 * what an autocomplete dropdown should display before the user types anything.
 */
export async function searchTags(
  query: string | undefined,
  limit: number,
): Promise<TagSuggestion[]> {
  const prefix = query ? slugify(query) : "";

  const cached = await getCachedSuggestions(prefix, limit);
  if (cached) {
    return cached;
  }

  const [direct, viaSynonym] = await Promise.all([
    findTagsByPrefix(prefix, limit),
    findTagsBySynonymPrefix(prefix, limit),
  ]);

  const suggestions = rankByPopularity(dedupeById([...direct, ...viaSynonym]), limit)
    .map(toTagSuggestion);

  await setCachedSuggestions(prefix, limit, suggestions);

  return suggestions;
}

/** Resolves a slug to its canonical tag, following a synonym if that is what
 *  the slug turned out to be. */
export async function getTagBySlug(slug: string): Promise<Tag> {
  const tag = await resolveSlug(slug);

  if (!tag) {
    throw new NotFoundError(`No tag found for "${slug}"`);
  }

  return tag;
}

/**
 * Turns a list of user-supplied names into tag rows, reusing whatever already
 * exists. Called by the question feature when a question is posted.
 *
 * Names that differ only in case or punctuation ("Node.js", "node js") slugify
 * to the same key and therefore land on the same row — no duplicates created.
 *
 * Reusing an existing tag is free for any caller. Creating one is not: it needs
 * `MIN_REPUTATION_TO_CREATE_TAG`, because this is the path most tags are really
 * born through, and leaving it open would make the gate on `POST /tags`
 * decorative.
 */
export async function findOrCreateByNames(names: string[], userId: number): Promise<Tag[]> {
  const unique = dedupeSlugs(names);

  // The author's reputation and what their tags resolve to are independent
  // questions, so both go out at once.
  const [reputation, resolved] = await Promise.all([getReputation(userId), resolveAll(unique)]);

  requireCanCreateMissingTags(resolved, reputation);

  return Promise.all(resolved.map((entry) => entry.tag ?? createOne(entry.name, entry.slug)));
}

/** Explicit tag creation, for the `POST /tags` endpoint. Unlike
 *  `findOrCreateByNames` this reports a conflict instead of silently reusing,
 *  because the caller asked to create something specific. */
export async function createTag(name: string, userId: number): Promise<Tag> {
  const slug = slugify(name);

  requireCanCreateTag(await getReputation(userId), name);

  // A slug must not be a tag and a synonym at the same time, or lookup order
  // silently decides which one wins. No single constraint spans both tables,
  // so this check lives in application code.
  if (await prisma.tagSynonym.findUnique({ where: { slug } })) {
    throw new ConflictError(`"${slug}" is already a synonym and cannot be a tag`);
  }

  try {
    return await insertTag(name, slug);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`A tag with the slug "${slug}" already exists`);
    }
    throw error;
  }
}

/** A submitted name paired with whatever it resolved to — `null` means no tag
 *  and no synonym matched, so this one would have to be created. */
type ResolvedName = { name: string; slug: string; tag: Tag | null };

function resolveAll(unique: { name: string; slug: string }[]): Promise<ResolvedName[]> {
  return Promise.all(
    unique.map(async (entry) => ({ ...entry, tag: await resolveSlug(entry.slug) })),
  );
}

/**
 * Rejects the whole batch when the author cannot mint the tags they asked for,
 * naming every unknown one at once. Failing on the first offender instead would
 * make them resubmit the entire question once per bad tag.
 */
function requireCanCreateMissingTags(resolved: ResolvedName[], reputation: number): void {
  if (canCreateTag(reputation)) {
    return;
  }

  const missing = resolved.filter((entry) => !entry.tag).map((entry) => entry.name);

  if (missing.length > 0) {
    throw new ForbiddenError(
      `Creating a tag requires ${MIN_REPUTATION_TO_CREATE_TAG} reputation, and these do not exist yet: ${missing.join(", ")}`,
    );
  }
}

/** The reputation gate has already passed, so all that is left is the insert
 *  and its race recovery. */
async function createOne(name: string, slug: string): Promise<Tag> {
  try {
    return await insertTag(name, slug);
  } catch (error) {
    // Two questions submitted at the same moment with the same new tag both
    // saw "does not exist" and both tried to insert. The unique constraint
    // settles it; the loser just reads the row the winner wrote. Same pattern
    // as the vote constraint — the database arbitrates the race, not a lock.
    const winner = isUniqueViolation(error) ? await resolveSlug(slug) : null;

    if (!winner) {
      throw error;
    }

    return winner;
  }
}

function insertTag(name: string, slug: string): Promise<Tag> {
  return prisma.tag.create({ data: { name, slug }, select: TAG_FIELDS });
}

/** Names the offending tag rather than failing generically — the caller needs
 *  to know which of their five tags is the problem so they can fix it. */
function requireCanCreateTag(reputation: number, name: string): void {
  if (!canCreateTag(reputation)) {
    throw new ForbiddenError(
      `The tag "${name}" does not exist yet, and creating a tag requires ${MIN_REPUTATION_TO_CREATE_TAG} reputation`,
    );
  }
}

async function getReputation(userId: number): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { reputation: true },
  });

  if (!user) {
    throw new NotFoundError("User not found");
  }

  return user.reputation;
}

/** Looks a slug up as a tag first, then as a synonym. Returns null if neither.
 *  Sequential rather than parallel because a direct hit is the common case and
 *  costs one query; only a miss pays for the second. */
async function resolveSlug(slug: string): Promise<Tag | null> {
  const tag = await prisma.tag.findUnique({ where: { slug }, select: TAG_FIELDS });
  if (tag) {
    return tag;
  }

  const synonym = await prisma.tagSynonym.findUnique({
    where: { slug },
    select: CANONICAL_TAG,
  });

  return synonym?.tag ?? null;
}

/** With no prefix this lists the most-used tags rather than nothing. */
function findTagsByPrefix(prefix: string, limit: number): Promise<Tag[]> {
  return prisma.tag.findMany({
    where: prefix ? { slug: { startsWith: prefix } } : undefined,
    select: TAG_FIELDS,
    orderBy: { questionCount: "desc" },
    take: limit,
  });
}

/** Synonyms are a redirect table, so this returns what they point at, not the
 *  synonyms themselves. With no prefix there is nothing to redirect. */
async function findTagsBySynonymPrefix(prefix: string, limit: number): Promise<Tag[]> {
  if (!prefix) {
    return [];
  }

  const synonyms = await prisma.tagSynonym.findMany({
    where: { slug: { startsWith: prefix } },
    select: CANONICAL_TAG,
    take: limit,
  });

  return synonyms.map((synonym) => synonym.tag);
}

/** Collapses names that slugify to the same key, keeping the first spelling
 *  as the display name. Prevents sending the same insert twice in one call. */
function dedupeSlugs(names: string[]): { name: string; slug: string }[] {
  const seen = new Map<string, string>();

  for (const name of names) {
    const slug = slugify(name);
    if (slug && !seen.has(slug)) {
      seen.set(slug, name);
    }
  }

  return [...seen].map(([slug, name]) => ({ name, slug }));
}
