import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const sqlClient = postgres(databaseUrl, {
  // Multiple connections are required for PostgreSQL to enforce row locks between requests.
  max: 10,
});

export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
