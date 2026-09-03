# Architecture

## 1. Goal

Build a small but correct version of the creator clipping marketplace.

The main priorities are:

- campaign budget correctness
- payout calculation
- concurrent approvals
- authorization and ownership
- idempotent metrics ingestion
- database integrity
- clear API boundaries
- simple and accessible UI states

UI complexity and extra features are intentionally kept minimal.

---

## 2. Required Stack

- Next.js 15
- App Router
- React
- TypeScript (`strict: true`)
- tRPC v11
- PostgreSQL
- Drizzle ORM
- drizzle-kit migrations
- TailwindCSS
- shadcn/ui
- react-hook-form
- Zod
- Vitest

All application data must go through tRPC.

No REST route handlers should be used for application data.

---

## 3. High-Level Architecture

This is a single full-stack Next.js application.

```text
Next.js Application
│
├── React / App Router
│
├── tRPC
│
├── Server-side Business Logic
│
├── Drizzle ORM
│
└── PostgreSQL
```

Business-critical logic should remain server-side.

The UI must never be treated as a security or data-integrity boundary.

---

## 4. Roles

There are two user roles:

### Admin

Can:

- list campaigns
- search campaigns
- filter campaigns
- create campaigns
- edit campaigns
- view campaign details
- review pending submissions
- approve submissions
- reject submissions
- view campaign analytics

### Creator

Can:

- browse active campaigns
- view active campaign details
- submit clips
- view only their own submissions
- see submission status
- see current views
- see estimated earnings

---

## 5. Authentication

Real authentication is intentionally out of scope.

Use:

- signed cookie containing `userId`
- development-only user switcher

Authentication is intentionally simple.

Authorization is not.

Every relevant tRPC procedure must enforce:

- authenticated user
- correct role
- resource ownership where applicable

A creator must never be able to access another creator's submissions,
including by manually crafting tRPC input.

The authenticated creator ID is derived from the server-side auth context.

Never trust a client-provided `creatorId`.

---

# Database

## 6. Database Schema

### users

Purpose:

Stores development users.

Columns:

- `id`: uuid, primary key
- `email`: varchar(255), unique, not null
- `role`: enum(`admin`, `creator`), not null
- `created_at`: timestamp with time zone, not null, default now()

Constraints:

- UNIQUE(email)

---

### campaigns

Purpose:

Stores campaign configuration and budget rules.

Columns:

- `id`: uuid, primary key
- `title`: varchar(255), not null
- `platforms`: text[], not null
- `payout_per_1k_views`: integer, not null
- `total_budget`: integer, not null
- `status`: enum(`draft`, `active`, `paused`, `completed`), not null
- `starts_at`: timestamp with time zone, not null
- `ends_at`: timestamp with time zone, not null
- `created_at`: timestamp with time zone, not null, default now()
- `updated_at`: timestamp with time zone, not null, default now()

Money values are stored as integer cents.

Constraints:

- payout_per_1k_views >= 0
- total_budget >= 0
- ends_at > starts_at
- at least one supported platform is required

Indexes:

- status
- title
- optional composite index on `(status, starts_at)`

---

### submissions

Purpose:

Stores creator submissions to campaigns.

Columns:

- `id`: uuid, primary key
- `campaign_id`: uuid, not null, foreign key -> campaigns.id
- `creator_id`: uuid, not null, foreign key -> users.id
- `post_url`: text, not null
- `platform`: enum(`tiktok`, `instagram`, `youtube`), not null
- `status`: enum(`pending`, `approved`, `rejected`, `paid`), not null, default `pending`
- `rejection_reason`: text, nullable
- `created_at`: timestamp with time zone, not null, default now()
- `updated_at`: timestamp with time zone, not null, default now()

Constraints:

- UNIQUE(campaign_id, post_url)
- rejection_reason is required when status = rejected
- rejection_reason should be null for non-rejected states

Indexes:

- campaign_id
- creator_id
- status
- `(campaign_id, status)`
- `(creator_id, created_at)`

---

### submission_metrics

Purpose:

Stores one daily metrics snapshot per submission.

Columns:

- `id`: uuid, primary key
- `submission_id`: uuid, not null, foreign key -> submissions.id
- `captured_at`: date, not null
- `views`: bigint, not null
- `likes`: bigint, not null
- `comments`: bigint, not null
- `created_at`: timestamp with time zone, not null, default now()

Constraints:

- UNIQUE(submission_id, captured_at)
- views >= 0
- likes >= 0
- comments >= 0

Indexes:

- unique composite index on `(submission_id, captured_at)`
- index on `(submission_id, captured_at DESC)`

The unique constraint guarantees at most one metric row per submission
per calendar day.

The ingestion layer additionally guarantees that views never decrease.

---

# Business Rules

## 7. Campaign Status

Statuses:

- draft
- active
- paused
- completed

Suggested transitions:

```text
draft -> active
draft -> paused

active -> paused
active -> completed

paused -> active
paused -> completed

completed -> terminal
```

Rules:

- completed is terminal
- campaign may become completed automatically when remaining budget reaches zero
- creator submissions are accepted only for active campaigns
- creator campaign browsing returns active campaigns only
- campaign date range is validated independently from status

A campaign is available for creator submission when:

```text
status = active
AND starts_at <= now
AND ends_at >= now
```

---

## 8. Submission Status

Statuses:

- pending
- approved
- rejected
- paid

Transitions:

```text
pending -> approved
pending -> rejected

approved -> paid

rejected -> terminal
paid -> terminal
```

Rules:

- only pending submissions can be approved
- only pending submissions can be rejected
- rejection requires a reason
- approved submissions participate in metrics ingestion
- rejected submissions cannot be re-approved
- paid submissions are terminal

The specification defines the `paid` state but does not define a payment
execution workflow.

No external payment workflow will be introduced unless required.

---

## 9. Creator Submission Rules

A submission can be created only when:

- current user is a creator
- campaign exists
- campaign status is active
- current date is inside the campaign period
- submitted platform is enabled for the campaign
- URL resembles a real post URL for the selected platform
- the same URL does not already exist for the same campaign

Supported platforms:

- TikTok
- Instagram
- YouTube

URL validation should reject obviously invalid URLs without contacting
third-party APIs.

The database unique constraint on:

```text
(campaign_id, post_url)
```

is the final protection against duplicate campaign submissions.

---

# Money

## 10. Payout Calculation

All money is represented as integer cents.

Never use floating-point values for payout or budget calculations.

Submission earnings are calculated as:

```text
floor(views / 1000) * payout_per_1k_views
```

The most recent metric row determines the submission's current views.

The payout calculation should exist as a reusable pure function.

Example:

```ts
calculatePayout(1999, 250) === 250;
calculatePayout(2000, 250) === 500;
```

---

## 11. Campaign Spend

Campaign spend is derived server-side.

For every approved or paid submission:

```text
submission earnings =
floor(latest_views / 1000)
* campaign.payout_per_1k_views
```

Then:

```text
budgetSpent =
SUM(earnings of approved / paid submissions)

budgetLeft =
totalBudget - budgetSpent
```

Client-provided earnings or budget calculations are never trusted.

---

## 12. Budget Growth Assumption

The specification defines approval-time budget enforcement while approved
submissions may continue gaining views through later metric ingestion.

This creates an ambiguity:

An approved submission may be within budget when approved, but later view
growth may increase its calculated earnings.

For the take-home:

- approval always performs the budget check transactionally
- current earnings are derived from the latest metric
- no additional payout reservation system is introduced unless required
- the exact final behavior will be documented in `NOTES.md`

In a production system, the product requirement should clarify whether:

1. payout is reserved or snapshotted at approval time
2. earnings continue accruing but are capped by campaign budget
3. payout allocation occurs separately during ingestion/payment

---

# Concurrent Approval

## 13. Approval Transaction Strategy

Approval is a correctness-critical operation.

The campaign row acts as the serialization point for budget-sensitive
operations.

Transaction flow:

1. begin PostgreSQL transaction
2. load submission
3. verify submission exists
4. verify submission status is `pending`
5. lock the associated campaign row using `SELECT ... FOR UPDATE`
6. reload current campaign state inside the transaction
7. load the target submission's latest metrics
8. calculate target submission payout
9. calculate current campaign spend
10. calculate remaining budget
11. compare target payout with remaining budget
12. if insufficient:
    - rollback
    - throw typed application error
13. otherwise:
    - mark submission as approved
14. recalculate remaining budget
15. if remaining budget reaches zero:
    - mark campaign as completed
16. commit

All budget-sensitive reads and writes happen inside the same transaction.

Never:

```text
read budget
↓
leave transaction
↓
approve later
```

That would introduce a check-then-write race condition.

---

## 14. Why Lock the Campaign?

The shared resource being protected is the campaign budget.

Therefore the campaign row, rather than only the submission row, is
locked.

Example:

```text
Admin A                     Admin B

BEGIN                       BEGIN
  │                           │
lock campaign                 waits
  │                           │
read current spend            │
check budget                  │
approve A                     │
COMMIT                        │
                              lock acquired
                              │
                              read NEW spend
                              check budget
                              │
                              insufficient
                              │
                              ROLLBACK
```

Only one budget-sensitive approval for the same campaign can perform the
critical section at a time.

Approvals belonging to unrelated campaigns do not need to serialize on
the same campaign row.

---

## 15. Typed Budget Error

Insufficient campaign budget must produce an error the UI can distinguish
from an unexpected server failure.

Example domain error:

```text
INSUFFICIENT_CAMPAIGN_BUDGET
```

The tRPC layer can expose this through an appropriate typed error such as
`PRECONDITION_FAILED`.

The frontend should display an actionable message instead of a generic
server error.

---

# Metrics Ingestion

## 16. Metrics Ingestion Strategy

Command:

```bash
pnpm ingest
```

Purpose:

Simulate the production third-party metrics synchronization.

Only approved submissions are processed.

For every approved submission:

1. determine today's date
2. check whether a metric already exists for:
   - submission_id
   - captured_at = today
3. if it exists:
   - skip the submission
   - leave existing data unchanged
4. otherwise:
   - load the latest previous metric
   - generate new fake metrics
   - guarantee views never decrease
   - insert today's metric
5. continue processing remaining submissions

The final command reports:

- created metrics
- skipped submissions
- failures

---

## 17. Ingestion Idempotency

Running ingestion twice for the same submission/date must leave the
existing data unchanged.

Database uniqueness:

```text
UNIQUE(submission_id, captured_at)
```

provides the final correctness boundary.

The application may perform an existence check for clarity, but
correctness does not rely only on that check.

If two ingestion processes race, the database constraint prevents
duplicate daily metric rows.

---

## 18. Ingestion Failure Isolation

The entire ingestion run must not use one global transaction.

Each submission is processed independently.

If one submission fails:

- its failure is recorded
- the remaining submissions continue
- the failure is included in the final report

One broken submission must not prevent successful ingestion of the others.

---

# Analytics

## 19. Campaign Analytics

The admin campaign detail page exposes:

- total approved views
- budget spent
- budget left
- daily views across the campaign period

Analytics are calculated server-side.

The frontend receives display-ready data and does not reproduce business
or payout calculations.

---

### Total Approved Views

For every approved or paid submission:

1. find its latest metric
2. read the latest views
3. sum the values

Submissions without metrics contribute zero.

```text
totalApprovedViews =
SUM(latest views of approved / paid submissions)
```

---

### Budget Spent

For every approved or paid submission:

```text
earnings =
floor(latest_views / 1000)
* campaign.payout_per_1k_views
```

Then:

```text
budgetSpent =
SUM(submission earnings)
```

The same payout logic used by approval should be reused.

---

### Budget Left

```text
budgetLeft =
MAX(total_budget - budgetSpent, 0)
```

---

## 20. Daily Views

The chart must contain every calendar day in the campaign period,
including days without metrics.

Example:

```json
[
  {
    "date": "2026-09-01",
    "views": 12000
  },
  {
    "date": "2026-09-02",
    "views": 0
  },
  {
    "date": "2026-09-03",
    "views": 18500
  }
]
```

`submission_metric.views` is treated as the cumulative view count captured
on that date.

For the chart, each date represents the sum of captured view counts for
the campaign's approved submissions on that date.

The specification does not explicitly request daily view deltas, so
cumulative daily snapshots are used.

This assumption will also be documented in `NOTES.md`.

PostgreSQL `generate_series()` may be used to produce missing calendar
days cleanly.

---

# API

## 21. tRPC Structure

Suggested routers:

```text
appRouter
├── auth
├── campaign
├── submission
└── analytics
```

Business logic should not be unnecessarily embedded inside routers.

Routers should primarily handle:

```text
input validation
↓
authorization
↓
service/domain call
↓
response/error mapping
```

Correctness-critical logic belongs in reusable server-side services where
practical.

---

## 22. Auth Router

### auth.currentUser

Access:

Authenticated user.

Returns:

- id
- email
- role

---

### auth.switchUser

Purpose:

Development-only user switcher.

Input:

- userId

Behavior:

- verify user exists
- set signed development auth cookie
- return selected user

---

## 23. Campaign Router

### campaign.list

Access:

Admin only.

Input:

- page
- pageSize
- search?
- status?

Behavior:

- title search
- optional status filter
- server-side pagination

Output:

- items
- page
- pageSize
- total
- totalPages

---

### campaign.active

Access:

Creator only.

Behavior:

Return campaigns where:

```text
status = active
AND starts_at <= now
AND ends_at >= now
```

Pagination may be included.

---

### campaign.byId

Admin:

Can access any campaign.

Creator:

Can access campaigns available to creators.

Input:

- campaignId

---

### campaign.create

Access:

Admin only.

Input:

- title
- platforms
- payoutPer1kViews
- totalBudget
- status
- startsAt
- endsAt

Validation:

- title required
- at least one supported platform
- money >= 0
- endsAt > startsAt

---

### campaign.update

Access:

Admin only.

Input:

- campaignId
- editable campaign fields

Rules:

- campaign must exist
- validation is performed server-side
- completed campaigns cannot be moved back to another state

---

## 24. Submission Router

### submission.create

Access:

Creator only.

Input:

- campaignId
- postUrl
- platform

Creator ID is derived from auth context.

Behavior:

- validate campaign
- validate active status
- validate campaign dates
- validate platform
- validate platform URL
- reject duplicate campaign URL
- create pending submission

---

### submission.mine

Access:

Creator only.

Returns only:

```text
submission.creator_id = currentUser.id
```

Output includes:

- submission id
- campaign title
- post URL
- platform
- status
- current views
- estimated earnings
- createdAt

---

### submission.pendingByCampaign

Access:

Admin only.

Input:

- campaignId
- page?
- pageSize?

Returns pending submissions for the campaign.

---

### submission.approve

Access:

Admin only.

Input:

- submissionId

Uses the transactional approval strategy described above.

---

### submission.reject

Access:

Admin only.

Input:

- submissionId
- rejectionReason

Rules:

- submission must exist
- submission must be pending
- rejection reason is required

---

## 25. Analytics Router

### analytics.campaignOverview

Access:

Admin only.

Input:

- campaignId

Output:

```text
totalApprovedViews
budgetSpent
budgetLeft
dailyViews[]
```

---

# Validation

## 26. Shared Zod Schemas

Schemas reused between client and server include:

- campaignFormSchema
- campaignListInputSchema
- submissionCreateSchema
- rejectionSchema
- paginationSchema
- platformSchema

Client validation improves user experience.

Server validation remains authoritative.

---

# Frontend

## 27. Frontend Route Map

### /

Purpose:

Development user selection.

Behavior:

- display seeded users
- allow switching user
- redirect according to role

Admin:

```text
/admin/campaigns
```

Creator:

```text
/creator/campaigns
```

---

## 28. Admin Routes

### /admin/campaigns

Features:

- campaign table
- server-side pagination
- title search
- status filter
- create campaign
- edit campaign
- campaign detail link

States:

- loading
- empty
- no results
- error

---

### /admin/campaigns/new

Campaign creation form.

Fields:

- title
- platforms
- payout per 1k views
- total budget
- status
- starts at
- ends at

Uses:

- react-hook-form
- shared Zod schema
- shadcn/ui controls

---

### /admin/campaigns/[id]/edit

Reuses the campaign form.

Loads existing values and updates the campaign.

---

### /admin/campaigns/[id]

Campaign operational dashboard.

Sections:

#### Campaign Summary

- title
- status
- platforms
- dates
- payout per 1k views
- total budget

#### Budget Overview

- total approved views
- budget spent
- budget left

#### Daily Views

Simple chart of daily campaign views.

#### Review Queue

Pending submissions show:

- creator
- platform
- post URL
- latest views
- estimated earnings
- approve
- reject

Approval:

- disable while pending
- show typed budget error
- refresh review queue and analytics after success

Rejection:

- dialog
- required rejection reason
- refresh review queue after success

---

## 29. Creator Routes

### /creator/campaigns

Displays campaigns available for creator submission.

Show:

- title
- platforms
- payout per 1k views
- campaign dates
- submit/view action

---

### /creator/campaigns/[id]

Displays campaign details and clip submission form.

Fields:

- platform
- post URL

Uses shared validation.

---

### /creator/submissions

Displays only the authenticated creator's submissions.

Columns:

- campaign
- platform
- post URL
- status
- current views
- estimated earnings
- created at

The frontend never sends a creator ID to scope this query.

---

## 30. Frontend State Rules

Every data-driven screen handles:

- loading
- error
- empty
- success

Mutation controls:

- disable while pending
- prevent accidental duplicate clicks
- display actionable errors

Forms:

- visible labels
- validation messages
- keyboard accessible controls
- reasonable focus behavior

Example typed error mapping:

```text
INSUFFICIENT_CAMPAIGN_BUDGET

->

"This submission cannot be approved because the campaign budget is insufficient."
```

Custom visual design is intentionally not a priority.

---

# Seed Data

## 31. Seed Data

Seed data should make the application immediately testable after setup.

### Users

Create:

- 1 admin
- 2 creators

Example:

```text
admin@local.test
creator1@local.test
creator2@local.test
```

### Campaigns

Create campaigns covering:

- active with sufficient budget
- active with limited budget
- paused
- draft
- completed

At least one campaign supports multiple platforms.

### Submissions

Create examples covering:

- pending
- approved
- rejected
- paid

Use both creators so ownership behavior can be demonstrated.

Include multiple pending submissions for the same campaign.

### Metrics

Create historical metrics with:

- multiple dates
- monotonically increasing views
- missing dates
- multiple approved submissions

This makes analytics immediately visible.

---

# Testing

## 32. Testing Strategy

Tests focus on correctness-critical behavior rather than coverage
percentage.

---

## 33. Payout Tests

Test:

- 0 views
- 999 views
- 1000 views
- 1999 views
- 2000 views
- larger values

Example:

```text
999 views @ 250 cents
=> 0 cents

1000 views
=> 250 cents

1999 views
=> 250 cents

2000 views
=> 500 cents
```

---

## 34. Approval Tests

Test:

- pending submission can be approved
- non-pending submission cannot be approved
- approval fails when budget is insufficient
- successful approval updates status
- campaign completes when budget reaches zero

---

## 35. Concurrent Approval Test

Use a real PostgreSQL database.

Setup:

```text
campaign budget = 1000 cents

submission A payout = 1000 cents
submission B payout = 1000 cents

A = pending
B = pending
```

Execute both approvals concurrently.

Conceptually:

```ts
await Promise.allSettled([
  approveSubmission(submissionA),
  approveSubmission(submissionB),
]);
```

Expected:

- exactly one succeeds
- exactly one fails
- only one submission becomes approved
- campaign spend never exceeds 1000 cents
- campaign becomes completed

A mocked database is insufficient to prove row-lock behavior.

---

## 36. Authorization Tests

Test:

- creator cannot call admin mutations
- creator cannot approve
- creator cannot reject
- creator cannot access another creator's submissions
- creator identity is derived server-side
- admin can access admin procedures

---

## 37. Ingestion Tests

Test:

- approved submission receives today's metric
- views never decrease
- repeated same-day ingest leaves existing row unchanged
- only one row exists per submission/date
- failure processing one submission does not stop others

---

## 38. Submission Tests

Test:

- valid creator submission succeeds
- duplicate URL on same campaign fails
- same URL on different campaign is allowed
- unsupported platform fails
- invalid platform URL fails
- inactive campaign fails
- campaign outside date range fails

---

## 39. Analytics Tests

Test:

- latest metric drives current views
- pending/rejected submissions are excluded
- payout calculation drives budget spent
- missing dates appear with zero views

---

# Suggested Project Structure

## 40. Project Structure

```text
src/
├── app/
│   ├── admin/
│   │   └── campaigns/
│   └── creator/
│       ├── campaigns/
│       └── submissions/
│
├── components/
│   ├── auth/
│   ├── campaign/
│   ├── submission/
│   └── analytics/
│
├── lib/
│   └── validation/
│
└── server/
    ├── api/
    │   ├── root.ts
    │   ├── trpc.ts
    │   └── routers/
    │       ├── auth.ts
    │       ├── campaign.ts
    │       ├── submission.ts
    │       └── analytics.ts
    │
    ├── auth/
    │
    ├── db/
    │   ├── index.ts
    │   └── schema/
    │       ├── enums.ts
    │       ├── users.ts
    │       ├── campaigns.ts
    │       ├── submissions.ts
    │       └── submission-metrics.ts
    │
    └── services/
        ├── payout.ts
        ├── approval.ts
        ├── ingestion.ts
        └── analytics.ts

scripts/
├── seed.ts
└── ingest.ts

tests/
├── unit/
│   └── payout.test.ts
└── integration/
    ├── approval.test.ts
    ├── concurrent-approval.test.ts
    ├── authorization.test.ts
    ├── ingestion.test.ts
    ├── submission.test.ts
    └── analytics.test.ts

drizzle/

ARCHITECTURE.md
NOTES.md
docker-compose.yml
package.json
```

The exact structure may evolve during implementation if a simpler
organization becomes more appropriate.

Any meaningful deviation from the architecture should be intentional and
documented.

---

# Implementation Order

## 41. Suggested Implementation Order

1. Bootstrap Next.js project
2. Configure TypeScript strict mode
3. Configure PostgreSQL Docker Compose
4. Configure Drizzle
5. Implement database schema
6. Generate initial migration
7. Implement seed data
8. Configure tRPC
9. Implement development authentication
10. Implement authorization middleware
11. Implement campaign CRUD/listing
12. Implement creator submission flow
13. Implement payout helper
14. Implement transactional approval
15. Implement concurrent approval test
16. Implement rejection
17. Implement metrics ingestion
18. Implement analytics
19. Complete integration tests
20. Implement minimal admin UI
21. Implement minimal creator UI
22. Verify accessibility and UI states
23. Complete NOTES.md
24. Run full verification
25. Deploy