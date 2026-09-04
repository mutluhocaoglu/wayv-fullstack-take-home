import { desc, sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { submissions } from "@/server/db/schema/submissions";

export const submissionMetrics = pgTable("submission_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => submissions.id, { onDelete: "cascade" }),
  capturedAt: date("captured_at").notNull(),
  views: bigint("views", { mode: "bigint" }).notNull(),
  likes: bigint("likes", { mode: "bigint" }).notNull(),
  comments: bigint("comments", { mode: "bigint" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => ({
  submissionCapturedAtUnique: unique(
    "submission_metrics_submission_id_captured_at_unique",
  ).on(table.submissionId, table.capturedAt),
  submissionCapturedAtDescIdx: index(
    "submission_metrics_submission_id_captured_at_desc_idx",
  ).on(table.submissionId, desc(table.capturedAt)),
  viewsNonNegative: check(
    "submission_metrics_views_non_negative_check",
    sql`${table.views} >= 0`,
  ),
  likesNonNegative: check(
    "submission_metrics_likes_non_negative_check",
    sql`${table.likes} >= 0`,
  ),
  commentsNonNegative: check(
    "submission_metrics_comments_non_negative_check",
    sql`${table.comments} >= 0`,
  ),
}));
