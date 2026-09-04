# Wayv Take-Home

A small full-stack creator clipping marketplace focused on authorization, payout correctness, PostgreSQL-safe approvals, idempotent metrics ingestion, and campaign analytics.

## Stack

Next.js 15 App Router, React, TypeScript, tRPC v11, Drizzle ORM, PostgreSQL, Tailwind CSS, shadcn/ui setup, React Hook Form, Zod, and Vitest.

## Local Setup

Requirements: Node.js, npm, and Docker.

```bash
npm install
# Copy .env.example to .env and set AUTH_COOKIE_SECRET to a random value of at least 32 characters.
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` and select a seeded development user. The admin is routed to campaign management; creators are routed to available campaigns.

`.env.example` documents `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URL`, and `AUTH_COOKIE_SECRET`. Never commit a real `.env` file.

## Useful Commands

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm run ingest
```

The package scripts also work with pnpm when it is installed, for example `pnpm test` and `pnpm ingest`.
