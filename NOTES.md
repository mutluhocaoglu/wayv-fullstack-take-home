# Notes

## Setup

Requirements: Node.js, npm, and Docker. pnpm is optional; package scripts are compatible with it.

```bash
npm install
# Copy .env.example to .env, then set AUTH_COOKIE_SECRET to a random value of at least 32 characters.
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

The app runs at `http://localhost:3000`. The root page lists seeded development users; selecting the admin opens `/admin/campaigns`, while selecting a creator opens `/creator/campaigns`.

Useful commands:

```bash
npm run test
npm run ingest
```

`DATABASE_URL` and `AUTH_COOKIE_SECRET` are required. `.env` is ignored and `.env.example` contains only local development placeholders.

## Authentication and Authorization

Development authentication uses an HTTP-only, signed cookie containing only `userId`. The user and role are loaded from PostgreSQL for every tRPC context; browser-provided roles, creator IDs, and submission statuses are never trusted. Development user selection and development-cookie authentication are disabled when `NODE_ENV=production`.

## Concurrent Approvals

Approval runs in one PostgreSQL transaction. It locks the related campaign with `SELECT ... FOR UPDATE`, making that row the serialization point for its budget. All budget-sensitive reads, including the current approved/paid spend and the target submission's latest metric, happen after that lock.

The integration test uses two independent PostgreSQL clients to approve two different submissions concurrently. When a campaign can afford only one, exactly one approval succeeds; the other fails with `INSUFFICIENT_CAMPAIGN_BUDGET`.

### Alternatives Considered

An application-level check-then-write was rejected because it races under concurrent requests. `SERIALIZABLE` isolation and optimistic concurrency were considered, but require retry/conflict handling beyond this take-home. Explicit campaign-row locking directly protects the shared budget while allowing approvals for unrelated campaigns to proceed independently.

## Payout and Budget Assumption

Money is integer cents. Earnings are `floor(views / 1000) * payout_per_1k_views`, using the latest metric for each submission.

Approved submissions can gain views during later ingestion, so derived spend can exceed the remaining budget that existed at approval time. The implementation preserves that real derived spend and clamps analytics `budgetLeft` to zero. No reservation or payout-snapshot model was added because the specification does not define one; production behavior needs a product decision.

## Ingestion

`npm run ingest` (or `pnpm ingest`) uses a UTC `YYYY-MM-DD` date. It processes approved submissions only, creates at most one metric row per submission/day, and never mutates an existing same-day row. The `(submission_id, captured_at)` unique constraint is the final duplicate-race boundary; only that targeted unique violation is treated as a skip. Each submission is processed independently so failures are reported without rolling back successful metrics.

## Analytics Assumptions

Summary totals and spend include approved and paid submissions, each using only its latest metric. Daily views use approved submission metric snapshots, sum snapshots by UTC date, and zero-fill every missing campaign day. Daily values are cumulative snapshots, not view deltas.

## Deliberately Left Out

- Real authentication provider
- Third-party social APIs
- Payment execution and mark-as-paid flow
- Scheduler, queues, or workers
- Custom product design and unrelated marketplace features

## Given Another Day

Coordinate campaign configuration edits to the same approval row-lock semantics, or make budget, payout, and status immutable while a campaign is financially active.

## AI Tooling

AI tooling assisted with architecture planning, project bootstrap and boilerplate, Drizzle/tRPC implementation, test scaffolding, and final code review. The resulting code was reviewed and corrected: platform URL checks were tightened from generic HTTP(S) validation to platform-specific heuristics; campaign forms default to no selected platforms; shared enum values are reused instead of duplicating platform/status lists; and explicit PostgreSQL campaign-row locking was retained after concurrency review. All final code was understood and verified before submission.
