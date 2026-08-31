# Voting & Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add up/down voting on questions and answers, where each vote's row, the target's score, and the reputation of everyone affected all move inside one database transaction, and concurrent duplicate votes are settled by a unique constraint rather than an application check.

**Architecture:** New `src/features/vote/` module following the established layer stack. All score and reputation arithmetic lives in a pure `vote.model.ts` function so it is exhaustively unit-testable. The service owns the persistence: the target and existing-vote reads, and the one interactive `$transaction` that writes the vote row, the score, and the reputations. This is also the first feature with real integration tests — a Testcontainers-backed Postgres proves the race and the atomicity, which a mocked client cannot.

**Tech Stack:** Express 5, TypeScript, Prisma 7 (driver-adapter, `$transaction`), PostgreSQL, Zod, Vitest, `@testcontainers/postgresql`.

> **Deviation from project docs — read before starting.** CLAUDE.md step 3 and the README layer table both say the `vote` feature gets its own `vote.repository.ts`. This plan deliberately keeps the persistence in `vote.service.ts` instead — the same functions and the same transaction, one fewer file, following the shape of `question`/`answer`/`comment`. Task 10 updates those two doc lines so the codebase and its docs agree. If you would rather have the repository file, that is a one-file refactor: move `getTargetAuthorId`, `getUserVoteValue`, `persistVote` into `vote.repository.ts`, import them into the service, and skip the Task 10 doc edits.

---

## File Structure

**New files:**

| Path | Responsibility |
|---|---|
| `prisma/models/vote.prisma` | `Vote` model — polymorphic target, `value` column |
| `prisma/migrations/20260830130000_add_votes/migration.sql` | table + FKs + two hand-written CHECKs |
| `src/features/vote/vote.schema.ts` | Zod: `castVoteSchema` (`value: 1 | -1`), `voteTargetParamSchema` (`id`) |
| `src/features/vote/vote.model.ts` | `VoteValue`, `VoteTarget`, `VoteEffect`, `VoteResult` types; `REPUTATION` constants; pure `computeVoteEffect`, `canVote`, `toTargetColumn` |
| `src/features/vote/vote.service.ts` | `castVote`, `retractVote` (public), plus `getTargetAuthorId`, `getUserVoteValue`, `persistVote` — the reads and the interactive `$transaction` live here |
| `src/features/vote/vote.controller.ts` | four `catchAsync` handlers, `req` -> service -> JSON |
| `src/features/vote/vote.routes.ts` | four routes, `authenticate` + `validate` |
| `src/features/vote/index.ts` | re-exports `voteRoutes` only |
| `src/features/vote/__tests__/vote.model.test.ts` | the full transition matrix |
| `src/features/vote/__tests__/vote.service.test.ts` | mock Prisma — persistence shape + orchestration |
| `tests/integration/helpers/database.ts` | starts an ephemeral Postgres, runs migrations, hands back a client |
| `tests/integration/vote.integration.test.ts` | concurrency + atomicity against real Postgres |

**Modified files:**

| Path | Change |
|---|---|
| `prisma/models/user.prisma` | add `votes Vote[]` |
| `prisma/models/question.prisma` | add `votes Vote[]` |
| `prisma/models/answer.prisma` | add `votes Vote[]` |
| `src/routes.ts` | mount `voteRoutes` at `/votes` |
| `vitest.config.ts` | split into `unit` and `integration` projects |
| `package.json` | add `test:integration`, `test:all` scripts; add `@testcontainers/postgresql` dev dependency |
| `CLAUDE.md` | step 3: `vote` no longer cited as the repository example |
| `README.md` | layer table: drop "only present in `vote`" repository row; lifecycle prose left as-is (the service does open the transaction) |
| `postman/Huddle.postman_collection.json` | new "Vote" folder |

---

## Task 1: Vote Prisma model and back-relations

**Files:**
- Create: `prisma/models/vote.prisma`
- Modify: `prisma/models/user.prisma`, `prisma/models/question.prisma`, `prisma/models/answer.prisma`

- [ ] **Step 1: Create `prisma/models/vote.prisma`**

```prisma
/// One user's up (+1) or down (-1) vote on a question or an answer. Both the
/// value and the "exactly one target" rule are held by CHECK constraints in the
/// migration — Prisma's schema language cannot express either.
model Vote {
    id         String    @id @default(uuid(7)) @db.Uuid
    value      Int

    userId     Int
    user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

    questionId String?   @db.Uuid
    question   Question? @relation(fields: [questionId], references: [id], onDelete: Cascade)

    answerId   String?   @db.Uuid
    answer     Answer?   @relation(fields: [answerId], references: [id], onDelete: Cascade)

    createdAt  DateTime  @default(now())
    updatedAt  DateTime  @updatedAt

    /// "One vote per user per target." A null target column is distinct from
    /// every other null in Postgres, so answer votes (questionId null) never
    /// collide on the first index, and question votes never collide on the
    /// second.
    @@unique([userId, questionId])
    @@unique([userId, answerId])
    @@index([questionId])
    @@index([answerId])
    @@map("votes")
}
```

- [ ] **Step 2: Add the back-relation to `prisma/models/user.prisma`**

Change the relations block so it reads:

```prisma
    refreshTokens refreshToken[]
    questions Question[]
    answers   Answer[]
    comments  Comment[]
    votes     Vote[]
```

- [ ] **Step 3: Add the back-relation to `prisma/models/question.prisma`**

Immediately after the `comments  Comment[]` line, add:

```prisma
    votes     Vote[]
```

- [ ] **Step 4: Add the back-relation to `prisma/models/answer.prisma`**

Immediately after the `comments   Comment[]` line, add:

```prisma
    votes      Vote[]
```

- [ ] **Step 5: Validate the schema parses**

Run: `npx prisma validate`
Expected: `The schema at prisma\models is valid 🚀`

- [ ] **Step 6: Commit**

```bash
git add prisma/models/
git commit -m "Add Vote model with a polymorphic question/answer target"
```

---

## Task 2: Migration

**Files:**
- Create: `prisma/migrations/20260830130000_add_votes/migration.sql`

- [ ] **Step 1: Generate the base migration SQL from the live database**

Run:
```bash
npx prisma migrate diff --from-config-datasource prisma.config.ts --to-schema prisma/models --script
```

Expected output: a `CREATE TABLE "votes"`, three `CREATE INDEX`, two `CREATE UNIQUE INDEX`, three `ADD CONSTRAINT ... FOREIGN KEY`. Copy that output verbatim into the new file in the next step, then append the two CHECK statements shown.

- [ ] **Step 2: Write `prisma/migrations/20260830130000_add_votes/migration.sql`**

Paste the generated SQL, then append the two `ALTER TABLE ... ADD CONSTRAINT ... CHECK` blocks. The full file should look like this (the generated portion may differ slightly in column order or index names — keep whatever `migrate diff` produced, only append the CHECKs):

```sql
-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "questionId" UUID,
    "answerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "votes_questionId_idx" ON "votes"("questionId");

-- CreateIndex
CREATE INDEX "votes_answerId_idx" ON "votes"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_questionId_key" ON "votes"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_answerId_key" ON "votes"("userId", "answerId");

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- value is a direction, not a magnitude. Prisma cannot express this, so it is
-- written here by hand.
ALTER TABLE "votes" ADD CONSTRAINT "votes_value_check" CHECK ("value" IN (-1, 1));

-- A vote lands on a question or an answer, never both and never neither.
-- num_nonnulls counts how many of its arguments are not NULL.
ALTER TABLE "votes" ADD CONSTRAINT "votes_exactly_one_target"
    CHECK (num_nonnulls("questionId", "answerId") = 1);
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run:
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: `Applying migration `20260830130000_add_votes`` … `All migrations have been successfully applied.` then `✔ Generated Prisma Client`.

- [ ] **Step 4: Verify both CHECKs actually reject bad rows**

Create a throwaway script `check-votes.mjs` in the project root:

```js
import "dotenv/config";
import { prisma } from "./src/shared/lib/prisma.ts";

const constraints = await prisma.$queryRawUnsafe(
  `SELECT conname FROM pg_constraint WHERE conname IN ('votes_value_check','votes_exactly_one_target')`,
);
console.log("constraints present:", constraints.map((c) => c.conname).sort());

const id = "00000000-0000-7000-8000-0000000000ff";
async function tryInsert(label, value, q, a) {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO votes (id, value, "userId", "questionId", "answerId", "updatedAt") VALUES ($1,$2,1,$3,$4,now())',
      id, value, q, a,
    );
    console.log(label, "-> INSERTED (constraint NOT enforcing)");
    await prisma.$executeRawUnsafe('DELETE FROM votes WHERE id = $1', id);
  } catch (e) {
    const m = String(e.message);
    const hit = m.includes("votes_value_check") || m.includes("votes_exactly_one_target");
    console.log(label, hit ? "-> REJECTED" : "-> other error: " + m.slice(0, 80));
  }
}
await tryInsert("value 2       ", 2, "00000000-0000-7000-8000-000000000001", null);
await tryInsert("both targets  ", 1, "00000000-0000-7000-8000-000000000001", "00000000-0000-7000-8000-000000000002");
await tryInsert("neither target", 1, null, null);
await prisma.$disconnect();
```

Run: `node check-votes.mjs`
Expected:
```
constraints present: [ 'votes_exactly_one_target', 'votes_value_check' ]
value 2        -> REJECTED
both targets   -> REJECTED
neither target -> REJECTED
```
Then delete the script: `rm check-votes.mjs`

- [ ] **Step 5: Commit**

```bash
git add prisma/migrations/
git commit -m "Add votes table migration with value and single-target CHECKs"
```

---

## Task 3: Pure vote logic (`vote.model.ts`)

**Files:**
- Create: `src/features/vote/vote.model.ts`
- Test: `src/features/vote/__tests__/vote.model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/vote/__tests__/vote.model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canVote, computeVoteEffect, toTargetColumn } from "../vote.model.ts";

describe("computeVoteEffect", () => {
  const cases: Array<{
    name: string;
    targetType: "question" | "answer";
    previous: 1 | -1 | null;
    next: 1 | -1 | null;
    score: number;
    author: number;
    voter: number;
  }> = [
    { name: "first upvote on an answer", targetType: "answer", previous: null, next: 1, score: 1, author: 10, voter: 0 },
    { name: "first downvote on an answer", targetType: "answer", previous: null, next: -1, score: -1, author: -2, voter: -1 },
    { name: "answer upvote switched to downvote", targetType: "answer", previous: 1, next: -1, score: -2, author: -12, voter: -1 },
    { name: "answer downvote switched to upvote", targetType: "answer", previous: -1, next: 1, score: 2, author: 12, voter: 1 },
    { name: "answer upvote retracted", targetType: "answer", previous: 1, next: null, score: -1, author: -10, voter: 0 },
    { name: "answer downvote retracted", targetType: "answer", previous: -1, next: null, score: 1, author: 2, voter: 1 },
    { name: "first upvote on a question", targetType: "question", previous: null, next: 1, score: 1, author: 5, voter: 0 },
    { name: "first downvote on a question", targetType: "question", previous: null, next: -1, score: -1, author: -2, voter: 0 },
    { name: "question upvote switched to downvote", targetType: "question", previous: 1, next: -1, score: -2, author: -7, voter: 0 },
    { name: "question downvote switched to upvote", targetType: "question", previous: -1, next: 1, score: 2, author: 7, voter: 0 },
    { name: "question upvote retracted", targetType: "question", previous: 1, next: null, score: -1, author: -5, voter: 0 },
    { name: "question downvote retracted", targetType: "question", previous: -1, next: null, score: 1, author: 2, voter: 0 },
  ];

  it.each(cases)("$name", ({ targetType, previous, next, score, author, voter }) => {
    expect(computeVoteEffect(targetType, previous, next)).toEqual({
      scoreDelta: score,
      authorReputationDelta: author,
      voterReputationDelta: voter,
    });
  });

  it("charges the voter only for downvoting an answer, never a question", () => {
    expect(computeVoteEffect("question", null, -1).voterReputationDelta).toBe(0);
    expect(computeVoteEffect("answer", null, -1).voterReputationDelta).toBe(-1);
  });
});

describe("canVote", () => {
  it("lets a user vote on someone else's post", () => {
    expect(canVote(1, 2)).toBe(true);
  });

  it("stops a user voting on their own post", () => {
    expect(canVote(1, 1)).toBe(false);
  });
});

describe("toTargetColumn", () => {
  it("routes a question target to the questionId column", () => {
    expect(toTargetColumn({ type: "question", id: "q1" })).toEqual({ questionId: "q1" });
  });

  it("routes an answer target to the answerId column", () => {
    expect(toTargetColumn({ type: "answer", id: "a1" })).toEqual({ answerId: "a1" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/vote/__tests__/vote.model.test.ts`
Expected: FAIL — `Failed to resolve import "../vote.model.ts"`

- [ ] **Step 3: Write `src/features/vote/vote.model.ts`**

```ts
export type VoteValue = 1 | -1;

export type VoteTarget =
  | { type: "question"; id: string }
  | { type: "answer"; id: string };

/** What the API returns after any vote or retraction: where the target's score
 *  landed, and what this user's vote now is (null once retracted). */
export type VoteResult = {
  score: number;
  userVote: VoteValue | null;
};

/** The three numbers a single vote transition moves. Every one is a difference
 *  between what the new state is worth and what the old state was worth, so a
 *  switch and a retract need no special cases. */
export type VoteEffect = {
  scoreDelta: number;
  authorReputationDelta: number;
  voterReputationDelta: number;
};

/** Reputation moves, following the Stack Overflow model. */
export const REPUTATION = {
  /** An upvote on an answer is worth more than one on a question. */
  UPVOTED_ANSWER: 10,
  UPVOTED_QUESTION: 5,
  /** A downvote costs the author, whichever kind of post it is. */
  DOWNVOTED: -2,
  /** Casting a downvote on an answer costs the voter a little too — pushing
   *  someone else's work down is not free. Question downvotes are free. */
  DOWNVOTE_ON_ANSWER_CASTS: -1,
} as const;

/** A user may not vote on their own question or answer. */
export function canVote(targetAuthorId: number, voterId: number): boolean {
  return targetAuthorId !== voterId;
}

/** The one place that knows which of the two foreign-key columns a target kind
 *  lives in — every query and insert goes through here. */
export function toTargetColumn(
  target: VoteTarget,
): { questionId: string } | { answerId: string } {
  return target.type === "question" ? { questionId: target.id } : { answerId: target.id };
}

/**
 * The arithmetic of a vote changing from `previous` to `next` — either may be
 * null, meaning "no vote". The score bump and both reputation bumps are each a
 * subtraction: value of the new state minus value of the old state.
 */
export function computeVoteEffect(
  targetType: VoteTarget["type"],
  previous: VoteValue | null,
  next: VoteValue | null,
): VoteEffect {
  return {
    scoreDelta: scoreContribution(next) - scoreContribution(previous),
    authorReputationDelta:
      authorReward(targetType, next) - authorReward(targetType, previous),
    voterReputationDelta:
      voterCost(targetType, next) - voterCost(targetType, previous),
  };
}

function scoreContribution(value: VoteValue | null): number {
  return value ?? 0;
}

function authorReward(targetType: VoteTarget["type"], value: VoteValue | null): number {
  if (value === 1) {
    return targetType === "answer" ? REPUTATION.UPVOTED_ANSWER : REPUTATION.UPVOTED_QUESTION;
  }
  if (value === -1) {
    return REPUTATION.DOWNVOTED;
  }
  return 0;
}

function voterCost(targetType: VoteTarget["type"], value: VoteValue | null): number {
  return value === -1 && targetType === "answer" ? REPUTATION.DOWNVOTE_ON_ANSWER_CASTS : 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/vote/__tests__/vote.model.test.ts`
Expected: PASS — `17 passed` (12 matrix rows + 1 voter-cost + 2 canVote + 2 toTargetColumn)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean)

- [ ] **Step 6: Commit**

```bash
git add src/features/vote/vote.model.ts src/features/vote/__tests__/vote.model.test.ts
git commit -m "Add pure vote-transition arithmetic with Stack Overflow reputation rules"
```

---

## Task 4: Zod schemas (`vote.schema.ts`)

**Files:**
- Create: `src/features/vote/vote.schema.ts`

- [ ] **Step 1: Write `src/features/vote/vote.schema.ts`**

```ts
import { z } from "zod";

/** A vote is a direction: up (+1) or down (-1). Anything else is a client bug. */
export const castVoteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

/** Both POST /votes/questions/:id and POST /votes/answers/:id take the same
 *  shape of id — the path is what says which kind of thing it is. */
export const voteTargetParamSchema = z.object({
  id: z.uuid("Target id must be a valid UUID"),
});

export type CastVoteDto = z.infer<typeof castVoteSchema>;
export type VoteTargetParam = z.infer<typeof voteTargetParamSchema>;
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean)

- [ ] **Step 3: Commit**

```bash
git add src/features/vote/vote.schema.ts
git commit -m "Add vote request schemas"
```

---

## Task 5: Service — persistence + `castVote` (`vote.service.ts`)

**Files:**
- Create: `src/features/vote/vote.service.ts`
- Test: `src/features/vote/__tests__/vote.service.test.ts`

Note: `castVote` calls the same-module `persistVote`, so its test cannot mock `persistVote` — it mocks the Prisma singleton and asserts on the writes, exactly as `question.service.test.ts` and `comment.service.test.ts` already do. `persistVote` is also exported directly so its transaction shape can be tested in isolation and so the Task 9 integration test can drive it against a real database.

- [ ] **Step 1: Write the failing test**

Create `src/features/vote/__tests__/vote.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors/app-error.ts";

const mocks = vi.hoisted(() => ({
  questionFindUnique: vi.fn(),
  answerFindUnique: vi.fn(),
  voteFindUnique: vi.fn(),
  transaction: vi.fn(),
  txVoteCreate: vi.fn(),
  txVoteUpdate: vi.fn(),
  txVoteDelete: vi.fn(),
  txQuestionUpdate: vi.fn(),
  txAnswerUpdate: vi.fn(),
  txUserUpdate: vi.fn(),
}));

vi.mock("../../../shared/lib/prisma.ts", () => ({
  prisma: {
    question: { findUnique: mocks.questionFindUnique },
    answer: { findUnique: mocks.answerFindUnique },
    vote: { findUnique: mocks.voteFindUnique },
    $transaction: mocks.transaction,
  },
}));

const { castVote, getTargetAuthorId, getUserVoteValue, persistVote } = await import(
  "../vote.service.ts"
);

const QUESTION_ID = "0199d1c2-8f3a-7c41-9b2e-111111111111";
const ANSWER_ID = "0199d1c2-8f3a-7c41-9b2e-222222222222";
const question = { type: "question", id: QUESTION_ID } as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.questionFindUnique.mockResolvedValue({ authorId: 3 }); // someone other than the voter
  mocks.answerFindUnique.mockResolvedValue({ authorId: 3 });
  mocks.voteFindUnique.mockResolvedValue(null); // no prior vote
  mocks.txQuestionUpdate.mockResolvedValue({ score: 1 });
  mocks.txAnswerUpdate.mockResolvedValue({ score: 1 });
  mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
    callback({
      vote: { create: mocks.txVoteCreate, update: mocks.txVoteUpdate, delete: mocks.txVoteDelete },
      question: { update: mocks.txQuestionUpdate },
      answer: { update: mocks.txAnswerUpdate },
      user: { update: mocks.txUserUpdate },
    }),
  );
});

describe("getTargetAuthorId", () => {
  it("reads the question's author for a question target", async () => {
    mocks.questionFindUnique.mockResolvedValue({ authorId: 7 });

    await expect(getTargetAuthorId({ type: "question", id: QUESTION_ID })).resolves.toBe(7);
    expect(mocks.questionFindUnique).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      select: { authorId: true },
    });
  });

  it("reads the answer's author for an answer target", async () => {
    mocks.answerFindUnique.mockResolvedValue({ authorId: 9 });

    await expect(getTargetAuthorId({ type: "answer", id: ANSWER_ID })).resolves.toBe(9);
  });

  it("returns null when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(getTargetAuthorId({ type: "question", id: QUESTION_ID })).resolves.toBeNull();
  });
});

describe("getUserVoteValue", () => {
  it("returns the direction of an existing vote by the compound key", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: -1 });

    await expect(getUserVoteValue(7, { type: "question", id: QUESTION_ID })).resolves.toBe(-1);
    expect(mocks.voteFindUnique).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
      select: { value: true },
    });
  });

  it("returns null when the user has not voted", async () => {
    mocks.voteFindUnique.mockResolvedValue(null);

    await expect(getUserVoteValue(7, { type: "answer", id: ANSWER_ID })).resolves.toBeNull();
  });
});

describe("persistVote", () => {
  const base = {
    userId: 7,
    targetAuthorId: 3,
    target: { type: "question", id: QUESTION_ID } as const,
  };

  it("inserts the vote row when there was no previous vote", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txVoteCreate).toHaveBeenCalledWith({
      data: { userId: 7, value: 1, questionId: QUESTION_ID },
    });
    expect(mocks.txVoteUpdate).not.toHaveBeenCalled();
    expect(mocks.txVoteDelete).not.toHaveBeenCalled();
  });

  it("updates the vote row when the direction changes", async () => {
    await persistVote({
      ...base,
      previous: 1,
      next: -1,
      effect: { scoreDelta: -2, authorReputationDelta: -7, voterReputationDelta: 0 },
    });

    expect(mocks.txVoteUpdate).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
      data: { value: -1 },
    });
  });

  it("deletes the vote row when the vote is retracted", async () => {
    await persistVote({
      ...base,
      previous: -1,
      next: null,
      effect: { scoreDelta: 1, authorReputationDelta: 2, voterReputationDelta: 0 },
    });

    expect(mocks.txVoteDelete).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
    });
  });

  it("moves the target's score by scoreDelta and returns the new score", async () => {
    mocks.txQuestionUpdate.mockResolvedValue({ score: 42 });

    const result = await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: 1 } },
      select: { score: true },
    });
    expect(result).toEqual({ score: 42 });
  });

  it("moves the target author's reputation", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { reputation: { increment: 5 } },
    });
  });

  it("moves the voter's own reputation when that delta is non-zero", async () => {
    await persistVote({
      ...base,
      target: { type: "answer", id: ANSWER_ID },
      previous: null,
      next: -1,
      effect: { scoreDelta: -1, authorReputationDelta: -2, voterReputationDelta: -1 },
    });

    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { reputation: { increment: -1 } },
    });
    expect(mocks.txUserUpdate).toHaveBeenCalledTimes(2);
  });

  it("leaves the voter's reputation alone when that delta is zero", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.txUserUpdate).toHaveBeenCalledTimes(1);
  });

  it("does everything in one transaction", async () => {
    await persistVote({
      ...base,
      previous: null,
      next: 1,
      effect: { scoreDelta: 1, authorReputationDelta: 5, voterReputationDelta: 0 },
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});

describe("castVote", () => {
  it("throws NotFound when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(castVote(question, 1, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("throws Forbidden when the voter owns the target", async () => {
    mocks.questionFindUnique.mockResolvedValue({ authorId: 7 });

    await expect(castVote(question, 1, 7)).rejects.toThrow(ForbiddenError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("throws Conflict when the same direction is cast again", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: 1 });

    await expect(castVote(question, 1, 7)).rejects.toThrow(ConflictError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("inserts a first upvote on a question: +1 score, +5 author reputation", async () => {
    await castVote(question, 1, 7);

    expect(mocks.txVoteCreate).toHaveBeenCalledWith({
      data: { userId: 7, value: 1, questionId: QUESTION_ID },
    });
    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: 1 } },
      select: { score: true },
    });
    expect(mocks.txUserUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { reputation: { increment: 5 } },
    });
  });

  it("switches an existing vote: updates the row, moves score by 2", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: 1 });

    await castVote(question, -1, 7);

    expect(mocks.txVoteUpdate).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
      data: { value: -1 },
    });
    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: -2 } },
      select: { score: true },
    });
  });

  it("returns the new score and the direction just cast", async () => {
    mocks.txQuestionUpdate.mockResolvedValue({ score: 5 });

    await expect(castVote(question, 1, 7)).resolves.toEqual({ score: 5, userVote: 1 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/features/vote/__tests__/vote.service.test.ts`
Expected: FAIL — `Failed to resolve import "../vote.service.ts"`

- [ ] **Step 3: Write `src/features/vote/vote.service.ts`**

```ts
import { ConflictError, ForbiddenError, NotFoundError } from "../../shared/errors/app-error.ts";
import { prisma } from "../../shared/lib/prisma.ts";
import type { VoteEffect, VoteResult, VoteTarget, VoteValue } from "./vote.model.ts";
import { canVote, computeVoteEffect, toTargetColumn } from "./vote.model.ts";

/** The shared client, or a throwaway one an integration test points at a scratch
 *  database. The public functions always use the default. */
type Db = typeof prisma;

type VotePersist = {
  userId: number;
  target: VoteTarget;
  targetAuthorId: number;
  previous: VoteValue | null;
  next: VoteValue | null;
  effect: VoteEffect;
};

/**
 * Casts or changes a vote. A first vote inserts, changing direction updates, and
 * re-casting the same direction is a conflict — nothing to do, and the client's
 * state already matches what it asked for.
 *
 * You cannot vote on your own post, and the target must exist. Everything past
 * those checks — the vote row, the score, both reputations — moves inside one
 * transaction.
 */
export async function castVote(
  target: VoteTarget,
  value: VoteValue,
  userId: number,
): Promise<VoteResult> {
  const targetAuthorId = await getTargetAuthorId(target);

  if (targetAuthorId === null) {
    throw new NotFoundError(`No ${target.type} found with id ${target.id}`);
  }

  if (!canVote(targetAuthorId, userId)) {
    throw new ForbiddenError(`You cannot vote on your own ${target.type}`);
  }

  const previous = await getUserVoteValue(userId, target);

  if (previous === value) {
    throw new ConflictError("You have already cast this vote");
  }

  const effect = computeVoteEffect(target.type, previous, value);
  const { score } = await persistVote({
    userId,
    target,
    targetAuthorId,
    previous,
    next: value,
    effect,
  });

  return { score, userVote: value };
}

/** Removes this user's vote from the target, undoing its score and reputation
 *  effects. Having no vote to remove is a 404, not a silent success. */
export async function retractVote(target: VoteTarget, userId: number): Promise<VoteResult> {
  const targetAuthorId = await getTargetAuthorId(target);

  if (targetAuthorId === null) {
    throw new NotFoundError(`No ${target.type} found with id ${target.id}`);
  }

  const previous = await getUserVoteValue(userId, target);

  if (previous === null) {
    throw new NotFoundError(`You have not voted on this ${target.type}`);
  }

  const effect = computeVoteEffect(target.type, previous, null);
  const { score } = await persistVote({
    userId,
    target,
    targetAuthorId,
    previous,
    next: null,
    effect,
  });

  return { score, userVote: null };
}

/** The author of the thing being voted on, or null if there is no such thing.
 *  Exported for the tests and the integration harness. */
export async function getTargetAuthorId(target: VoteTarget, db: Db = prisma): Promise<number | null> {
  const row =
    target.type === "question"
      ? await db.question.findUnique({ where: { id: target.id }, select: { authorId: true } })
      : await db.answer.findUnique({ where: { id: target.id }, select: { authorId: true } });

  return row?.authorId ?? null;
}

/** The direction of this user's existing vote on the target, or null if they
 *  have not voted on it. Exported for the tests and the integration harness. */
export async function getUserVoteValue(
  userId: number,
  target: VoteTarget,
  db: Db = prisma,
): Promise<VoteValue | null> {
  const vote = await db.vote.findUnique({
    where: voteWhere(userId, target),
    select: { value: true },
  });

  return vote ? (vote.value as VoteValue) : null;
}

/**
 * Applies the whole vote as one transaction: the vote row itself, the target's
 * score, the target author's reputation, and — for answer downvotes — the
 * voter's own reputation. Either every write lands or none does.
 *
 * When `previous` is null this INSERTs the vote row. Two first-votes racing here
 * both try to insert the same (userId, questionId) or (userId, answerId);
 * Postgres rejects the loser with P2002, which `translatePrismaError` turns into
 * a 409. The database settles the race, not a check-then-insert. Returns the
 * target's score after the change. Exported for the tests and the integration
 * harness.
 */
export function persistVote(persist: VotePersist, db: Db = prisma): Promise<{ score: number }> {
  const { userId, target, targetAuthorId, previous, next, effect } = persist;

  return db.$transaction(async (tx) => {
    if (previous === null) {
      await tx.vote.create({
        data: { userId, value: next as VoteValue, ...toTargetColumn(target) },
      });
    } else if (next === null) {
      await tx.vote.delete({ where: voteWhere(userId, target) });
    } else {
      await tx.vote.update({ where: voteWhere(userId, target), data: { value: next } });
    }

    const scored =
      target.type === "question"
        ? await tx.question.update({
            where: { id: target.id },
            data: { score: { increment: effect.scoreDelta } },
            select: { score: true },
          })
        : await tx.answer.update({
            where: { id: target.id },
            data: { score: { increment: effect.scoreDelta } },
            select: { score: true },
          });

    if (effect.authorReputationDelta !== 0) {
      await tx.user.update({
        where: { id: targetAuthorId },
        data: { reputation: { increment: effect.authorReputationDelta } },
      });
    }

    if (effect.voterReputationDelta !== 0) {
      await tx.user.update({
        where: { id: userId },
        data: { reputation: { increment: effect.voterReputationDelta } },
      });
    }

    return { score: scored.score };
  });
}

/** Prisma addresses a compound unique by a generated key name. Each target kind
 *  uses its own (userId, <column>) index; the other column is null and, because
 *  Postgres treats nulls as distinct, never collides. */
function voteWhere(userId: number, target: VoteTarget) {
  return target.type === "question"
    ? { userId_questionId: { userId, questionId: target.id } }
    : { userId_answerId: { userId, answerId: target.id } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/features/vote/__tests__/vote.service.test.ts`
Expected: PASS — `19 passed` (3 getTargetAuthorId + 2 getUserVoteValue + 8 persistVote + 6 castVote)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean)

- [ ] **Step 6: Commit**

```bash
git add src/features/vote/vote.service.ts src/features/vote/__tests__/vote.service.test.ts
git commit -m "Add vote service: reads, self-vote guard, and the score/reputation transaction"
```

---

## Task 6: Service — `retractVote` coverage

`retractVote` is already written in Task 5's service file. This task only adds its test coverage (the Task 5 test file did not exercise it).

**Files:**
- Modify: `src/features/vote/__tests__/vote.service.test.ts`

- [ ] **Step 1: Add the failing test**

In `src/features/vote/__tests__/vote.service.test.ts`, change the import line:

```ts
const { castVote, getTargetAuthorId, getUserVoteValue, persistVote } = await import(
  "../vote.service.ts"
);
```

to:

```ts
const { castVote, getTargetAuthorId, getUserVoteValue, persistVote, retractVote } = await import(
  "../vote.service.ts"
);
```

Then append this `describe` block at the end of the file:

```ts
describe("retractVote", () => {
  it("throws NotFound when the target does not exist", async () => {
    mocks.questionFindUnique.mockResolvedValue(null);

    await expect(retractVote(question, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("throws NotFound when there is no vote to retract", async () => {
    mocks.voteFindUnique.mockResolvedValue(null);

    await expect(retractVote(question, 7)).rejects.toThrow(NotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("deletes the vote row and reverses the score", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: -1 });

    await retractVote(question, 7);

    expect(mocks.txVoteDelete).toHaveBeenCalledWith({
      where: { userId_questionId: { userId: 7, questionId: QUESTION_ID } },
    });
    expect(mocks.txQuestionUpdate).toHaveBeenCalledWith({
      where: { id: QUESTION_ID },
      data: { score: { increment: 1 } }, // undoing a -1
      select: { score: true },
    });
  });

  it("returns the new score and a null vote", async () => {
    mocks.voteFindUnique.mockResolvedValue({ value: 1 });
    mocks.txQuestionUpdate.mockResolvedValue({ score: 0 });

    await expect(retractVote(question, 7)).resolves.toEqual({ score: 0, userVote: null });
  });
});
```

- [ ] **Step 2: Run the test to verify the new cases pass**

Run: `npx vitest run src/features/vote/__tests__/vote.service.test.ts`
Expected: PASS — `23 passed` (19 from Task 5 + 4 new)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean)

- [ ] **Step 4: Commit**

```bash
git add src/features/vote/__tests__/vote.service.test.ts
git commit -m "Cover retractVote"
```

---

## Task 7: Controller, routes, index, wiring

**Files:**
- Create: `src/features/vote/vote.controller.ts`
- Create: `src/features/vote/vote.routes.ts`
- Create: `src/features/vote/index.ts`
- Modify: `src/routes.ts`

- [ ] **Step 1: Write `src/features/vote/vote.controller.ts`**

```ts
import type { Request, Response } from "express";
import { catchAsync } from "../../shared/catch-async.ts";
import type { CastVoteDto, VoteTargetParam } from "./vote.schema.ts";
import * as voteService from "./vote.service.ts";

export const voteOnQuestion = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.castVote(
    { type: "question", id },
    (req.body as CastVoteDto).value,
    req.user!.id,
  );

  res.status(200).json(result);
});

export const voteOnAnswer = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.castVote(
    { type: "answer", id },
    (req.body as CastVoteDto).value,
    req.user!.id,
  );

  res.status(200).json(result);
});

export const retractQuestionVote = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.retractVote({ type: "question", id }, req.user!.id);

  res.status(200).json(result);
});

export const retractAnswerVote = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as VoteTargetParam;
  const result = await voteService.retractVote({ type: "answer", id }, req.user!.id);

  res.status(200).json(result);
});
```

- [ ] **Step 2: Write `src/features/vote/vote.routes.ts`**

```ts
import { Router } from "express";
import { authenticate } from "../../shared/middlewares/authenticate.ts";
import { validate } from "../../shared/validate.ts";
import * as voteController from "./vote.controller.ts";
import { castVoteSchema, voteTargetParamSchema } from "./vote.schema.ts";

// Mounted at /votes in routes.ts; the paths here say which kind of thing the
// vote lands on. Every route needs a logged-in caller.
export const voteRoutes = Router();

voteRoutes.post(
  "/questions/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  validate(castVoteSchema, "body"),
  voteController.voteOnQuestion,
);

voteRoutes.delete(
  "/questions/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  voteController.retractQuestionVote,
);

voteRoutes.post(
  "/answers/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  validate(castVoteSchema, "body"),
  voteController.voteOnAnswer,
);

voteRoutes.delete(
  "/answers/:id",
  authenticate,
  validate(voteTargetParamSchema, "params"),
  voteController.retractAnswerVote,
);
```

- [ ] **Step 3: Write `src/features/vote/index.ts`**

```ts
// The feature's public contract — just the router. Nothing else in the app
// needs vote's internals yet.
export { voteRoutes } from "./vote.routes.ts";
```

- [ ] **Step 4: Mount the router in `src/routes.ts`**

Add the import alongside the others (after the `tag` line):

```ts
import { voteRoutes } from "./features/vote/index.ts";
```

Add the mount after the `apiRoutes.use("/", commentRoutes);` line:

```ts
apiRoutes.use("/votes", voteRoutes);
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean)

- [ ] **Step 6: Verify the whole unit suite still passes**

Run: `npm test`
Expected: all files pass, including the two new `vote` unit specs

- [ ] **Step 7: Boot-check the route wiring**

Run:
```bash
node -e "import('./src/routes.ts').then(() => { console.log('routes load OK'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); })"
```
Expected: `routes load OK`

- [ ] **Step 8: Commit**

```bash
git add src/features/vote/vote.controller.ts src/features/vote/vote.routes.ts src/features/vote/index.ts src/routes.ts
git commit -m "Wire vote routes at /votes"
```

---

## Task 8: Testcontainers integration harness

**Files:**
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Create: `tests/integration/helpers/database.ts`

- [ ] **Step 1: Install the Testcontainers Postgres module**

Run: `npm install --save-dev @testcontainers/postgresql`
Expected: it appears under `devDependencies` in `package.json`.

(Docker must be running for the integration tests themselves; installing the package does not need Docker.)

- [ ] **Step 2: Split `vitest.config.ts` into two projects**

Replace the entire file with:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/__tests__/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Each spec file boots its own Postgres container and they share a
          // database, so run the files one at a time.
          fileParallelism: false,
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In the `"scripts"` block, change `"test"` and add three lines so it reads:

```json
    "start": "node src/server.ts",
    "dev": "node --watch src/server.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --project unit",
    "test:integration": "vitest run --project integration",
    "test:all": "vitest run",
    "test:watch": "vitest --project unit",
    "test:coverage": "vitest run --project unit --coverage"
```

- [ ] **Step 4: Create `tests/integration/helpers/database.ts`**

```ts
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
```

- [ ] **Step 5: Verify the integration project is wired (no specs yet)**

Run: `npm run test:integration`
Expected: Vitest reports `No test files found` for the `integration` project (exit code 0). This confirms the config split works.

- [ ] **Step 6: Verify the unit project is unchanged**

Run: `npm test`
Expected: same pass count as before, now labelled under the `unit` project.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/integration/helpers/database.ts
git commit -m "Add Testcontainers-backed integration test harness"
```

---

## Task 9: Integration tests — concurrency and atomicity

**Files:**
- Create: `tests/integration/vote.integration.test.ts`

**Prerequisite:** Docker must be running.

- [ ] **Step 1: Write the test**

Create `tests/integration/vote.integration.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { computeVoteEffect } from "../../src/features/vote/vote.model.ts";
import { persistVote } from "../../src/features/vote/vote.service.ts";
import { isUniqueViolation } from "../../src/shared/errors/prisma-error.ts";
import { startTestDatabase, type TestDatabase } from "./helpers/database.ts";

let db: TestDatabase;

beforeAll(async () => {
  db = await startTestDatabase();
}, 120_000);

afterAll(async () => {
  await db.stop();
});

beforeEach(async () => {
  await db.reset();
});

async function seedQuestion() {
  const asker = await db.prisma.user.create({
    data: { name: "Asker", email: "asker@example.com", passwordHash: "x" },
  });
  const voter = await db.prisma.user.create({
    data: { name: "Voter", email: "voter@example.com", passwordHash: "x" },
  });
  const question = await db.prisma.question.create({
    data: { title: "How do I do the thing?", body: "b".repeat(40), authorId: asker.id },
  });
  return { asker, voter, question };
}

describe("vote concurrency", () => {
  it("lets exactly one of five simultaneous first-votes through", async () => {
    const { asker, voter, question } = await seedQuestion();
    const target = { type: "question", id: question.id } as const;
    const effect = computeVoteEffect("question", null, 1);

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        persistVote(
          { userId: voter.id, target, targetAuthorId: asker.id, previous: null, next: 1, effect },
          db.prisma,
        )
          .then(() => "won" as const)
          .catch((error: unknown) => {
            if (isUniqueViolation(error)) return "rejected" as const;
            throw error;
          }),
      ),
    );

    expect(outcomes.filter((o) => o === "won")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "rejected")).toHaveLength(4);
    expect(await db.prisma.vote.count()).toBe(1);

    const scored = await db.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(scored.score).toBe(1); // one increment, not five
  });

  it("keeps a separate vote per target for the same user", async () => {
    const { asker, voter, question } = await seedQuestion();
    const answer = await db.prisma.answer.create({
      data: { body: "a".repeat(40), authorId: asker.id, questionId: question.id },
    });

    await persistVote(
      {
        userId: voter.id,
        target: { type: "question", id: question.id },
        targetAuthorId: asker.id,
        previous: null,
        next: 1,
        effect: computeVoteEffect("question", null, 1),
      },
      db.prisma,
    );
    await persistVote(
      {
        userId: voter.id,
        target: { type: "answer", id: answer.id },
        targetAuthorId: asker.id,
        previous: null,
        next: 1,
        effect: computeVoteEffect("answer", null, 1),
      },
      db.prisma,
    );

    expect(await db.prisma.vote.count()).toBe(2);
  });
});

describe("vote transaction atomicity", () => {
  it("writes nothing when a later statement in the transaction fails", async () => {
    const { voter, question } = await seedQuestion();
    const target = { type: "question", id: question.id } as const;

    // Point the reputation update at a user id that does not exist, so it throws
    // after the vote row and the score have already been written inside the same
    // transaction.
    await expect(
      persistVote(
        {
          userId: voter.id,
          target,
          targetAuthorId: 999_999,
          previous: null,
          next: 1,
          effect: computeVoteEffect("question", null, 1),
        },
        db.prisma,
      ),
    ).rejects.toThrow();

    expect(await db.prisma.vote.count()).toBe(0);
    const scored = await db.prisma.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(scored.score).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm run test:integration`
Expected: PASS — `4 passed`. `persistVote` was implemented correctly in Task 5, so this should be green on the first run. If it fails with `Cannot find module '@testcontainers/postgresql'` or a Docker socket error, Docker is not running — start Docker Desktop and re-run.

- [ ] **Step 3: Confirm the concurrency assertion is real by temporarily breaking the code**

Temporarily edit `src/features/vote/vote.service.ts` — wrap the first `tx.vote.create` so a duplicate is swallowed:

```ts
try {
  await tx.vote.create({ data: { userId, value: next as VoteValue, ...toTargetColumn(target) } });
} catch {
  /* swallow — WRONG, demonstration only */
}
```

Run: `npm run test:integration`
Expected: the concurrency test FAILS — `expected 5 to be 1` on the won count, or the vote count / score is wrong. This proves the test exercises the real constraint.

- [ ] **Step 4: Revert the deliberate break**

Restore `src/features/vote/vote.service.ts` to the Task 5 version (plain `await tx.vote.create(...)`, no try/catch).

Run: `npm run test:integration`
Expected: PASS — `4 passed`

- [ ] **Step 5: Run the full suite**

Run: `npm run test:all`
Expected: unit and integration projects both green.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/vote.integration.test.ts
git commit -m "Add integration tests for the concurrent-vote race and transaction atomicity"
```

---

## Task 10: Docs and Postman

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `postman/Huddle.postman_collection.json`

- [ ] **Step 1: Update `CLAUDE.md` step 3**

Find:

```
3. **`*.repository.ts`** — Only create this file if the feature's complexity justifies isolating its persistence logic (as `vote` does, because it needs a dedicated transaction and a unique-constraint-backed race condition guard). Most features query Prisma directly from the service and do not need this layer — do not add it by default.
```

Replace with:

```
3. **`*.repository.ts`** — Only create this file if a feature's persistence logic is complex enough that isolating it genuinely helps — a dedicated multi-table transaction, a race-condition guard, several non-trivial queries that would crowd the service. No feature currently needs one; `vote` keeps its transaction in the service. Do not add this layer by default.
```

- [ ] **Step 2: Update the `README.md` layer table**

Find the row:

```
| `*.repository.ts` | Prisma queries (only present in `vote`)                                    | Business rules                              |
```

Replace with:

```
| `*.repository.ts` | Prisma queries, when a feature's persistence is complex enough to isolate  | Business rules                              |
```

- [ ] **Step 3: Check the README request-lifecycle wording**

In the `### Request lifecycle: POST /api/v1/votes/questions/:id` section, step 5 reads:

```
5. `vote.service.ts` opens a Prisma interactive transaction: insert the vote row, update the question's score, update the author's reputation. All three commit together or not at all.
```

This is now accurate (the service does open the transaction). Extend it slightly so it covers the fourth write:

```
5. `vote.service.ts` computes the deltas from `vote.model.ts`, then opens a Prisma interactive transaction: write the vote row, update the target's score, update the target author's reputation, and — for answer downvotes — the voter's own. Every write commits together or none does.
```

- [ ] **Step 4: Add a "Vote" folder to the Postman collection**

Open `postman/Huddle.postman_collection.json`. Find the `"Comment"` folder object inside the top-level `"item"` array (it starts with `{ "name": "Comment",`). After that folder object's closing `},` and before the `{ "name": "health"` object, insert this folder object:

```json
{
  "name": "Vote",
  "description": "Needs questionId and answerId from the Question/Answer folders. The happy-path votes run as the second user (otherAccessToken) because you cannot vote on your own post; the 403 request runs as the collection bearer, who owns the question.",
  "item": [
    {
      "name": "Upvote Question (other user)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": 1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "200 with { score, userVote: 1 }. Register/log in a second user and put their access token in otherAccessToken first."
      },
      "response": []
    },
    {
      "name": "Switch to Downvote (other user)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": -1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "200. score moves by 2 (from +1 to -1)."
      },
      "response": []
    },
    {
      "name": "Re-cast Same Vote (409)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": -1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "Casting the direction you already have is a conflict."
      },
      "response": []
    },
    {
      "name": "Retract Question Vote (other user)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "DELETE",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "200 with { score, userVote: null }. score returns to 0."
      },
      "response": []
    },
    {
      "name": "Retract With No Vote (404)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "DELETE",
        "header": [],
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "Run this straight after the retraction above — there is nothing left to remove."
      },
      "response": []
    },
    {
      "name": "Vote On Own Question (403)",
      "request": {
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": 1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "Uses the collection bearer, who created the question."
      },
      "response": []
    },
    {
      "name": "Vote Missing Question (404)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": 1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/00000000-0000-7000-8000-000000000000",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "00000000-0000-7000-8000-000000000000"]
        }
      },
      "response": []
    },
    {
      "name": "Vote No Auth (401)",
      "request": {
        "auth": { "type": "noauth" },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": 1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        }
      },
      "response": []
    },
    {
      "name": "Vote Bad Value (400)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": 5\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/questions/{{questionId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "questions", "{{questionId}}"]
        },
        "description": "value must be exactly 1 or -1."
      },
      "response": []
    },
    {
      "name": "Upvote Answer (other user)",
      "request": {
        "auth": { "type": "bearer", "bearer": [{ "key": "token", "value": "{{otherAccessToken}}", "type": "string" }] },
        "method": "POST",
        "header": [{ "key": "Content-Type", "value": "application/json", "type": "text" }],
        "body": { "mode": "raw", "raw": "{\r\n    \"value\": 1\r\n}", "options": { "raw": { "language": "json" } } },
        "url": {
          "raw": "{{baseUrl}}{{version}}/votes/answers/{{answerId}}",
          "host": ["{{baseUrl}}{{version}}"],
          "path": ["votes", "answers", "{{answerId}}"]
        },
        "description": "200. The answer author gains 10 reputation."
      },
      "response": []
    }
  ]
}
```

- [ ] **Step 5: Verify the collection is still valid JSON**

Run:
```bash
node -e "const c=require('./postman/Huddle.postman_collection.json');const f=c.item.find(i=>i.name==='Vote');console.log('valid, id:',c.info._postman_id);f.item.forEach(r=>console.log(' ',r.request.method.padEnd(6),r.name));"
```
Expected: `valid, id: afd4e089-...` followed by the ten request lines.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md postman/Huddle.postman_collection.json
git commit -m "Document the vote transaction and add a Postman Vote folder"
```

---

## Self-Review

**Spec coverage:**

| Requirement (from README + CLAUDE.md) | Task |
|---|---|
| `POST`/`DELETE` votes on questions and answers | 7 |
| One vote per user per target, DB-enforced | 1 (unique indexes), 9 (proven) |
| Vote row + score + reputation in one transaction | 5 |
| Concurrent duplicate -> `P2002` -> `409` | 5 (insert path), 9 (proven); `translatePrismaError` already maps `P2002`->409 |
| Persistence logic (transaction, compound-key queries) isolated behind clear functions | 5 (`persistVote`, `getTargetAuthorId`, `getUserVoteValue` in the service) |
| `vote.model.ts` — pure transition rules | 3 |
| Pure logic unit-tested, DB behaviour integration-tested with Testcontainers | 3/5/6 (unit), 8/9 (integration) |
| Cross-feature isolation (no deep imports) | vote reads `prisma.question`/`prisma.answer` directly, imports no other feature |
| Self-vote forbidden | 3 (`canVote`), 5 |
| Reputation: SO rules (+10 answer / +5 question up, -2 down, -1 voter on answer downvote) | 3 |
| Docs match the code (no repository file) | 10 |

**Placeholder scan:** none — every code step contains full file contents or an exact find/replace.

**Type consistency:**
- `VoteValue = 1 | -1`, `VoteTarget`, `VoteEffect { scoreDelta, authorReputationDelta, voterReputationDelta }`, `VoteResult { score, userVote }` — defined in Task 3, used unchanged in Tasks 5, 7, 9.
- `computeVoteEffect(targetType, previous, next)` — signature identical in Task 3, its tests, Task 5, Task 9.
- `persistVote(persist, db?)` returning `{ score: number }` — defined and exported in Task 5's `vote.service.ts`; consumed the same way in the Task 5/6 tests and imported from `vote.service.ts` (not `vote.repository.ts`) in Task 9.
- `getTargetAuthorId` / `getUserVoteValue` — Task 5; called by `castVote`/`retractVote` in the same file and asserted by the Task 5/6 tests.
- `Db = typeof prisma` optional trailing param on `getTargetAuthorId`, `getUserVoteValue`, `persistVote` — Task 5; Task 9 passes `db.prisma` positionally as that arg.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-voting-and-transactions.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
