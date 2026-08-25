import { Prisma } from "../../generated/prisma/client.ts";
import { ConflictError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import { getCachedSuggestions, setCachedSuggestions } from "./tag.cache.ts";
import type { Tag, TagSuggestion } from "./tag.model.ts";
import { dedupeById, rankByPopularity, slugify, toTagSuggestion } from "./tag.model.ts";

const TAG_FIELDS = { id: true, name: true, slug: true, questionCount: true } as const;

/**
 * Autocomplete. Matches the typed prefix against real tags and against synonyms,
 * then returns canonical tags only — someone typing "nodejs" is shown "Node.js"
 * and never learns a redirect happened.
 *
 * The query is slugified before matching, so "Node.J", "node j" and "NODE-J"
 * all search for the same thing. One normalisation rule, used everywhere.
 */
export async function searchTags(query: string | undefined, limit: number): Promise<TagSuggestion[]> {
  const prefix = query ? slugify(query) : "";

  const cached = await getCachedSuggestions(prefix, limit);
  if (cached) {
    return cached;
  }

  // No query means "show me the popular tags" rather than "show me nothing".
  const [direct, viaSynonym] = await Promise.all([
    prisma.tag.findMany({
      where: prefix ? { slug: { startsWith: prefix } } : undefined,
      select: TAG_FIELDS,
      orderBy: { questionCount: "desc" },
      take: limit,
    }),
    prefix
      ? prisma.tagSynonym.findMany({
          where: { slug: { startsWith: prefix } },
          select: { tag: { select: TAG_FIELDS } },
          take: limit,
        })
      : Promise.resolve([]),
  ]);

  const suggestions = rankByPopularity(
    dedupeById([...direct, ...viaSynonym.map((synonym) => synonym.tag)]),
    limit,
  ).map(toTagSuggestion);

  await setCachedSuggestions(prefix, limit, suggestions);

  return suggestions;
}

/** Resolves a slug to its canonical tag, following a synonym if that is what
 *  the slug turned out to be. */
export async function getTagBySlug(slug: string): Promise<Tag> {
  const tag = await prisma.tag.findUnique({ where: { slug }, select: TAG_FIELDS });
  if (tag) {
    return tag;
  }

  const synonym = await prisma.tagSynonym.findUnique({
    where: { slug },
    select: { tag: { select: TAG_FIELDS } },
  });

  if (!synonym) {
    throw new NotFoundError(`No tag found for "${slug}"`);
  }

  return synonym.tag;
}

/**
 * Turns a list of user-supplied names into tag rows, reusing whatever already
 * exists. This is what the question feature will call when a question is posted.
 *
 * Names that differ only in case or punctuation ("Node.js", "node js") slugify
 * to the same key and therefore land on the same row — no duplicates created.
 */
export async function findOrCreateByNames(names: string[]): Promise<Tag[]> {
  const unique = dedupeSlugs(names);

  return Promise.all(unique.map(({ name, slug }) => findOrCreateOne(name, slug)));
}

/** Explicit tag creation, for the `POST /tags` endpoint. Unlike
 *  `findOrCreateByNames` this reports a conflict instead of silently reusing,
 *  because the caller asked to create something specific. */
export async function createTag(name: string): Promise<Tag> {
  const slug = slugify(name);

  await assertSlugIsFree(slug);

  try {
    return await prisma.tag.create({ data: { name, slug }, select: TAG_FIELDS });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(`A tag with the slug "${slug}" already exists`);
    }
    throw error;
  }
}

async function findOrCreateOne(name: string, slug: string): Promise<Tag> {
  const existing = await resolveSlug(slug);
  if (existing) {
    return existing;
  }

  try {
    return await prisma.tag.create({ data: { name, slug }, select: TAG_FIELDS });
  } catch (error) {
    // Two questions submitted at the same moment with the same new tag both
    // saw "does not exist" and both tried to insert. The unique constraint
    // settles it; the loser just reads the row the winner wrote. Same pattern
    // as the vote constraint — the database arbitrates the race, not a lock.
    if (isUniqueViolation(error)) {
      const winner = await resolveSlug(slug);
      if (winner) {
        return winner;
      }
    }
    throw error;
  }
}

/** Looks a slug up as a tag first, then as a synonym. Returns null if neither. */
async function resolveSlug(slug: string): Promise<Tag | null> {
  const tag = await prisma.tag.findUnique({ where: { slug }, select: TAG_FIELDS });
  if (tag) {
    return tag;
  }

  const synonym = await prisma.tagSynonym.findUnique({
    where: { slug },
    select: { tag: { select: TAG_FIELDS } },
  });

  return synonym?.tag ?? null;
}

/** A slug must not be a tag and a synonym at the same time, or lookup order
 *  silently decides which one wins. No single constraint spans both tables,
 *  so the check lives here. */
async function assertSlugIsFree(slug: string): Promise<void> {
  const synonym = await prisma.tagSynonym.findUnique({ where: { slug } });

  if (synonym) {
    throw new ConflictError(`"${slug}" is already a synonym and cannot be a tag`);
  }
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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
