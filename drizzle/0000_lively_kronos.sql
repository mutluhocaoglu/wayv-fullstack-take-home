CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('tiktok', 'instagram', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected', 'paid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'creator');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"platforms" "platform"[] NOT NULL,
	"payout_per_1k_views" integer NOT NULL,
	"total_budget" integer NOT NULL,
	"status" "campaign_status" NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_payout_non_negative_check" CHECK ("campaigns"."payout_per_1k_views" >= 0),
	CONSTRAINT "campaigns_total_budget_non_negative_check" CHECK ("campaigns"."total_budget" >= 0),
	CONSTRAINT "campaigns_valid_date_range_check" CHECK ("campaigns"."ends_at" > "campaigns"."starts_at"),
	CONSTRAINT "campaigns_platforms_non_empty_check" CHECK (cardinality("campaigns"."platforms") > 0)
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"post_url" text NOT NULL,
	"platform" "platform" NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_campaign_id_post_url_unique" UNIQUE("campaign_id","post_url"),
	CONSTRAINT "submissions_rejected_requires_reason_check" CHECK (("submissions"."status" <> 'rejected') OR ("submissions"."rejection_reason" IS NOT NULL AND length(trim("submissions"."rejection_reason")) > 0)),
	CONSTRAINT "submissions_non_rejected_reason_null_check" CHECK (("submissions"."status" = 'rejected') OR "submissions"."rejection_reason" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "submission_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"captured_at" date NOT NULL,
	"views" bigint NOT NULL,
	"likes" bigint NOT NULL,
	"comments" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_metrics_submission_id_captured_at_unique" UNIQUE("submission_id","captured_at"),
	CONSTRAINT "submission_metrics_views_non_negative_check" CHECK ("submission_metrics"."views" >= 0),
	CONSTRAINT "submission_metrics_likes_non_negative_check" CHECK ("submission_metrics"."likes" >= 0),
	CONSTRAINT "submission_metrics_comments_non_negative_check" CHECK ("submission_metrics"."comments" >= 0)
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_metrics" ADD CONSTRAINT "submission_metrics_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_title_idx" ON "campaigns" USING btree ("title");--> statement-breakpoint
CREATE INDEX "campaigns_status_starts_at_idx" ON "campaigns" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "submissions_campaign_id_idx" ON "submissions" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "submissions_creator_id_idx" ON "submissions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "submissions_status_idx" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "submissions_campaign_id_status_idx" ON "submissions" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "submissions_creator_id_created_at_idx" ON "submissions" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "submission_metrics_submission_id_captured_at_desc_idx" ON "submission_metrics" USING btree ("submission_id","captured_at" desc);