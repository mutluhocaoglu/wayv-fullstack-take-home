import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { campaigns } from "@/server/db/schema/campaigns";
import { platformEnum, submissionStatusEnum } from "@/server/db/schema/enums";
import { users } from "@/server/db/schema/users";

export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id, { onDelete: "cascade" }),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  postUrl: text("post_url").notNull(),
  platform: platformEnum("platform").notNull(),
  status: submissionStatusEnum("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  campaignPostUrlUnique: unique("submissions_campaign_id_post_url_unique").on(
    table.campaignId,
    table.postUrl,
  ),
  campaignIdx: index("submissions_campaign_id_idx").on(table.campaignId),
  creatorIdx: index("submissions_creator_id_idx").on(table.creatorId),
  statusIdx: index("submissions_status_idx").on(table.status),
  campaignStatusIdx: index("submissions_campaign_id_status_idx").on(
    table.campaignId,
    table.status,
  ),
  creatorCreatedAtIdx: index("submissions_creator_id_created_at_idx").on(
    table.creatorId,
    table.createdAt,
  ),
  rejectedRequiresReason: check(
    "submissions_rejected_requires_reason_check",
    sql`(${table.status} <> 'rejected') OR (${table.rejectionReason} IS NOT NULL AND length(trim(${table.rejectionReason})) > 0)`,
  ),
  nonRejectedReasonMustBeNull: check(
    "submissions_non_rejected_reason_null_check",
    sql`(${table.status} = 'rejected') OR ${table.rejectionReason} IS NULL`,
  ),
}));
