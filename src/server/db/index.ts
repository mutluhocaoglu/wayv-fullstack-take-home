import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

export const sqlClient = postgres(databaseUrl, {
  max: 1,
});

export const db = drizzle(sqlClient, { schema });
export type Database = typeof db;
