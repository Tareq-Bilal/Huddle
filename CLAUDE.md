# CLAUDE.md — Huddle

Guidance for Claude Code (and any contributor) working in this repository. This file governs *how* code gets written here — the *what* (features, stack, architecture, roadmap) lives in `README.md` and should be read first.

## Purpose of this project

Huddle is a learning project. Its primary goal is for a junior software engineer to build real proficiency in Node.js, Express, TypeScript, Prisma, PostgreSQL, Redis, and BullMQ by implementing a feature set that's harder than CRUD (concurrent voting, full-text search, background jobs, rate limiting) using Clean Architecture and CQRS-style thinking.

Every decision in this file is in service of that goal: code should be simple enough to read and learn from, but accurate and correct enough to teach the right habits. Do not sacrifice correctness for brevity, and do not sacrifice clarity for cleverness.

## Feature creation procedure

Every feature lives under `src/features/<feature-name>/` and is built in this order. Each step depends only on the ones before it — do not skip ahead (e.g. do not write a controller before its service exists).

1. **`*.schema.ts`** — Define Zod schemas and their inferred input types first. This is the contract for what the feature accepts, before any logic exists to accept it.
2. **`*.model.ts`** — Define types, response DTOs, and pure domain rule functions. No Prisma import, no I/O of any kind. If a function needs the database or the network, it does not belong here.
3. **`*.repository.ts`** — Only create this file if a feature's persistence logic is complex enough that isolating it genuinely helps — a dedicated multi-table transaction, a race-condition guard, several non-trivial queries that would crowd the service. No feature currently needs one; `vote` keeps its transaction in the service. Do not add this layer by default.
4. **`*.service.ts`** — Business logic, orchestration, and transactions live here. Services take plain arguments and return plain data — never `req` or `res` — so they can be called from HTTP controllers, background workers, or tests without an Express context.
5. **`*.controller.ts`** — Parses the request against the Zod schema, calls the service, and shapes the HTTP response. No business rules and no direct Prisma calls here — if you're tempted to add either, it belongs in the service or model instead.
6. **`*.routes.ts`** — Maps paths to controllers and mounts any feature-local middleware. No validation, no business logic, no database access.
7. **`*.middleware.ts`** — Only if the feature needs its own middleware. Most don't. In particular, **authorization is not middleware here**: "only the author may edit this" lives in the service, so a background worker or a test calling the service directly is held to the same rule as an HTTP request. A route guard would protect only the HTTP path.
8. **`index.ts`** — Re-exports the feature's public surface only (its router, and any types other features are allowed to depend on). Never re-export internals.
9. **Wire into `src/routes.ts`** — Mount the new feature router alongside the others.
10. **Tests** — Unit tests for pure logic go in the feature's own `__tests__/` folder and require no infrastructure. Integration tests that exercise real database behavior (constraints, transactions, race conditions) go in `tests/integration/` and run against Testcontainers, not mocks.

**Cross-feature imports go through `index.ts` only.** `vote` importing from `question` means importing `question/index.ts`, never `question/question.service.ts` directly. This is enforced with an ESLint `no-restricted-imports` rule — treat a violation as a build error, not a style suggestion.

## Code quality bar

- **No over-engineering.** Don't add a repository layer, an abstraction, a factory, or a generic helper until a concrete feature needs it. `vote` has a repository because its complexity earns it — that is the exception, not the template. Follow the README's own rule: introduce structure only where complexity actually justifies it.
- **Simple, clear, readable — without losing correctness.** Prefer the obvious implementation over the elegant one. A junior engineer reading this code six months from now should be able to follow it without decoding cleverness. This does not mean skipping the details that make the app correct — the unique constraint on votes, the transaction boundaries, the refresh token rotation — those stay exactly as rigorous as the README describes.
- **Match the layer rules and request lifecycle described in `README.md`.** The dependency direction (routes → controller → service → model/schema) is not optional. If a change doesn't fit cleanly into one layer, that's a signal to reconsider the change, not to blur the boundary.

## SOLID principles, applied to this architecture

- **Single Responsibility** — each file in the feature stack has exactly one job (see the layer table in `README.md`). A controller that validates business rules, or a service that reads `req`, has taken on a second responsibility and should be split back apart.
- **Open/Closed** — new features are added by creating a new `src/features/<name>/` folder, not by editing shared middleware or another feature's internals to special-case new behavior.
- **Liskov Substitution** — not heavily exercised in this codebase (little inheritance), but applies wherever an interface is used (e.g. queue producers/consumers) — an implementation must be fully substitutable for what it claims to satisfy.
- **Interface Segregation** — a feature's `index.ts` should export only what other features actually need, not its entire internal surface. Don't force a consumer to depend on types or functions it doesn't use.
- **Dependency Inversion** — services depend on abstractions they're handed (plain arguments, injected clients), not on Express or on another feature's internal modules. This is also why services take plain arguments instead of `req`/`res` — it's what makes them testable and reusable from workers.

## When implementing or reviewing a feature, check

- [ ] Files created in the order above, one responsibility per file
- [ ] No repository layer unless the feature's complexity genuinely requires it
- [ ] Service functions accept plain arguments, return plain data, no Express types
- [ ] Ownership and permission checks live in the service, not in route middleware
- [ ] Cross-feature access goes through `index.ts`, never a deep import
- [ ] Race conditions and invariants enforced at the database level where possible (constraints, transactions), not just in application code
- [ ] Unit tests for pure logic, integration tests (Testcontainers) for anything touching Postgres/Redis behavior
- [ ] The implementation teaches the underlying technology correctly — no shortcuts that would give a junior engineer a wrong mental model of Express, Prisma, Postgres, Redis, or BullMQ
