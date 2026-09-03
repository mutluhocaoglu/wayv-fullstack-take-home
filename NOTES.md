# NOTES

## Setup

### Requirements

- Node.js
- pnpm
- Docker

### Local Setup

```bash
pnpm install
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Application:

```text
http://localhost:3000
```

### Run Tests

```bash
pnpm test
```

### Run Metrics Ingestion

```bash
pnpm ingest
```

> These commands will be verified on a clean setup before submission.

---

## Architecture

The application uses:

- Next.js 15 App Router
- React
- TypeScript in strict mode
- tRPC v11
- PostgreSQL
- Drizzle ORM
- TailwindCSS
- shadcn/ui
- react-hook-form
- Zod
- Vitest

Application data is accessed through tRPC.

Correctness-critical business logic is kept server-side and separated
from the UI and tRPC transport layer where practical.

---

## Authentication and Authorization

Authentication is intentionally lightweight as requested in the task.

A signed cookie stores the selected development user and a dev-only
user switcher allows switching between seeded users.

Authorization is enforced server-side.

tRPC procedures validate:

- authentication
- role
- resource ownership where applicable

Creator ownership is derived from the authenticated user and is never
trusted from client-provided input.

---

## Concurrent Approvals

Campaign budget correctness is enforced at the database transaction level.

The campaign row acts as the serialization point for budget-sensitive
approval operations.

The approval flow is:

1. start a PostgreSQL transaction
2. load and validate the pending submission
3. lock the associated campaign row
4. calculate the latest committed campaign spend
5. calculate the payout for the target submission
6. verify that sufficient budget remains
7. approve the submission
8. complete the campaign if remaining budget reaches zero
9. commit

This prevents two concurrent approval requests from independently
observing the same remaining budget and both succeeding.

A PostgreSQL integration test verifies that when the remaining budget
can cover only one of two simultaneous approvals, exactly one succeeds.

### Alternatives Considered

<!--
Fill after implementation.

Potential alternatives to discuss if actually considered:

- application-level check followed by update
- SERIALIZABLE isolation
- optimistic concurrency
- explicit campaign row locking

Explain the actual approach used and why.
-->

---

## Payout and Budget

Money is represented as integer cents.

Submission earnings are calculated as:

```text
floor(views / 1000) * payout_per_1k_views
```

The latest metric row determines the submission's current view count.

Campaign spend is calculated server-side.

Client-provided payout or budget values are never trusted.

### Assumption: Earnings Growth After Approval

The specification defines approval-time budget enforcement while metrics
for approved submissions may continue to increase.

This creates an ambiguity around how additional earnings should be
allocated if later view growth would exceed the campaign budget.

Final implementation behavior:

<!-- Fill after implementation. -->

In a production system I would clarify whether:

- payout is reserved or snapshotted at approval time
- earnings continue accruing and are capped by campaign budget
- payout allocation happens separately during ingestion/payment

---

## Metrics Ingestion

`pnpm ingest` simulates the daily third-party metrics sync.

For each approved submission:

- at most one metric is stored per day
- views never decrease
- an existing metric for the same day is left unchanged
- failure processing one submission does not stop the remaining submissions

Database uniqueness on:

```text
(submission_id, captured_at)
```

provides the final protection against duplicate daily metrics.

The existence check in application code is therefore not relied upon as
the only correctness mechanism.

---

## Analytics

Campaign analytics include:

- total approved views
- budget spent
- budget left
- daily campaign views

Days in the campaign period without metrics are returned with zero views.

### Daily Views Assumption

`submission_metric.views` is treated as the cumulative view count captured
on that date.

The specification does not explicitly state whether the chart should show
cumulative daily snapshots or daily view deltas.

Final implementation behavior:

<!-- Confirm after implementation. -->

---

## Deliberately Left Out

The following are intentionally outside the scope unless required by the
final implementation:

- real authentication provider
- external TikTok / Instagram / YouTube APIs
- external payment processing
- custom visual design
- unrelated marketplace features

The goal is to prioritize correctness of the requested workflow over
feature count.

<!-- Add any additional deliberate omissions discovered during implementation. -->

---

## Given Another Day

<!--
Fill after implementation.

Choose one concrete improvement based on the actual finished project.

Possible examples:

- stronger payout allocation semantics
- better integration-test isolation
- ingestion observability
- accessibility improvements
- richer error handling

Do not fabricate an improvement before seeing the final implementation.
-->

---

## AI Tooling

AI tooling was used during development.

The exact uses and corrections are recorded honestly below.

### Where AI Was Used

<!--
Fill during implementation.

Examples only if actually applicable:

- architecture discussion
- project boilerplate
- Drizzle query assistance
- test scaffolding
- code review
- edge-case review
-->

### Corrections Made to AI Output

<!--
Record real examples as they happen.

For each useful example:

1. What AI suggested
2. Why it was incorrect or incomplete
3. What was changed
4. Why the final implementation is safer or clearer

Do not fabricate examples.
-->

All AI-generated code included in the final repository was reviewed and
understood before submission.

---

## Known Trade-offs and Assumptions

<!--
Keep this short in the final version.

Record genuine specification ambiguities and intentional engineering
trade-offs discovered during implementation.
-->

---

## Verification Before Submission

- [ ] clean checkout setup works
- [ ] `docker compose up -d` works
- [ ] migrations run successfully
- [ ] seed runs successfully
- [ ] application starts
- [ ] admin campaign flow works
- [ ] creator campaign flow works
- [ ] creator ownership is enforced
- [ ] payout calculation is correct
- [ ] budget ceiling is enforced
- [ ] concurrent approval test passes
- [ ] authorization tests pass
- [ ] repeated ingestion test passes
- [ ] ingestion failure isolation works
- [ ] analytics include missing dates
- [ ] `pnpm test` passes
- [ ] typecheck passes
- [ ] lint passes
- [ ] production build passes
- [ ] live deployment works
- [ ] live URL added to final submission
- [ ] NOTES.md reflects the actual final implementation