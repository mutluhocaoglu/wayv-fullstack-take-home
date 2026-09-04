import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  campaignStatusEnum,
  platformEnum,
} from "@/server/db/schema/enums";

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  platforms: platformEnum("platforms").array().notNull(),
  payoutPer1kViews: integer("payout_per_1k_views").notNull(),
  totalBudget: integer("total_budget").notNull(),
  status: campaignStatusEnum("status").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  statusIdx: index("campaigns_status_idx").on(table.status),
  titleIdx: index("campaigns_title_idx").on(table.title),
  statusStartsAtIdx: index("campaigns_status_starts_at_idx").on(
    table.status,
    table.startsAt,
  ),
  payoutNonNegative: check(
    "campaigns_payout_non_negative_check",
    sql`${table.payoutPer1kViews} >= 0`,
  ),
  budgetNonNegative: check(
    "campaigns_total_budget_non_negative_check",
    sql`${table.totalBudget} >= 0`,
  ),
  validDateRange: check(
    "campaigns_valid_date_range_check",
    sql`${table.endsAt} > ${table.startsAt}`,
  ),
  atLeastOnePlatform: check(
    "campaigns_platforms_non_empty_check",
    sql`cardinality(${table.platforms}) > 0`,
  ),
}));
