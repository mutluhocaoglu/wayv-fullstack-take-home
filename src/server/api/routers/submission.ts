import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  pendingSubmissionsInputSchema,
  submissionRejectSchema,
  submissionCreateSchema,
  submissionIdSchema,
  submissionMineInputSchema,
} from "@/lib/validation/submission";
import {
  adminProcedure,
  creatorProcedure,
  createTRPCRouter,
} from "@/server/api/trpc";
import { campaigns, submissions } from "@/server/db/schema";
import {
  InsufficientCampaignBudgetError,
  InvalidSubmissionStateError,
  SubmissionNotFoundError,
  approveSubmission,
} from "@/server/services/approval";
import { payoutFromLatestViews } from "@/server/services/campaign-spend";

const submissionFields = {
  id: submissions.id,
  campaignId: submissions.campaignId,
  postUrl: submissions.postUrl,
  platform: submissions.platform,
  status: submissions.status,
  rejectionReason: submissions.rejectionReason,
  createdAt: submissions.createdAt,
  updatedAt: submissions.updatedAt,
};

function isDuplicateCampaignPostUrlError(error: unknown) {
  const isTargetConstraint = (value: unknown) => {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const databaseError = value as { code?: string; constraint_name?: string };
    return (
      databaseError.code === "23505" &&
      databaseError.constraint_name === "submissions_campaign_id_post_url_unique"
    );
  };

  return isTargetConstraint(error) || isTargetConstraint((error as { cause?: unknown })?.cause);
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string") {
    return BigInt(value);
  }

  throw new Error("Expected an integer database value.");
}

export const submissionRouter = createTRPCRouter({
  create: creatorProcedure
    .input(submissionCreateSchema)
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const [campaign] = await ctx.db
        .select({
          id: campaigns.id,
          platforms: campaigns.platforms,
          status: campaigns.status,
          startsAt: campaigns.startsAt,
          endsAt: campaigns.endsAt,
        })
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
      }

      if (
        campaign.status !== "active" ||
        campaign.startsAt > now ||
        campaign.endsAt < now
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign is unavailable.",
        });
      }

      if (!campaign.platforms.includes(input.platform)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This platform is not enabled for the campaign.",
        });
      }

      try {
        const [submission] = await ctx.db
          .insert(submissions)
          .values({
            campaignId: campaign.id,
            creatorId: ctx.user.id,
            postUrl: input.postUrl,
            platform: input.platform,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          })
          .returning(submissionFields);

        return submission;
      } catch (error) {
        if (isDuplicateCampaignPostUrlError(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This post URL has already been submitted to the campaign.",
          });
        }

        throw error;
      }
    }),

  mine: creatorProcedure
    .input(submissionMineInputSchema)
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(submissions.creatorId, ctx.user.id),
        input.status ? eq(submissions.status, input.status) : undefined,
      );
      const offset = (input.page - 1) * input.pageSize;
      const fields = {
        ...submissionFields,
        campaignTitle: campaigns.title,
      };

      const [items, [{ total }]] = await Promise.all([
        ctx.db
          .select(fields)
          .from(submissions)
          .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
          .where(where)
          .orderBy(desc(submissions.createdAt), desc(submissions.id))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ total: count() }).from(submissions).where(where),
      ]);

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  byId: creatorProcedure.input(submissionIdSchema).query(async ({ ctx, input }) => {
    const [submission] = await ctx.db
      .select({ ...submissionFields, campaignTitle: campaigns.title })
      .from(submissions)
      .innerJoin(campaigns, eq(submissions.campaignId, campaigns.id))
      .where(and(eq(submissions.id, input.submissionId), eq(submissions.creatorId, ctx.user.id)))
      .limit(1);

    if (!submission) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found." });
    }

    return submission;
  }),

  pendingByCampaign: adminProcedure
    .input(pendingSubmissionsInputSchema)
    .query(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select({ id: campaigns.id, payoutPer1kViews: campaigns.payoutPer1kViews })
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!campaign) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
      }

      const offset = (input.page - 1) * input.pageSize;
      const rows = await ctx.db.execute(sql`
        SELECT
          submissions.id,
          submissions.post_url AS "postUrl",
          submissions.platform,
          submissions.created_at AS "createdAt",
          users.email AS "creatorEmail",
          COALESCE(latest_metric.views, 0)::bigint AS "latestViews"
        FROM submissions
        INNER JOIN users ON users.id = submissions.creator_id
        LEFT JOIN LATERAL (
          SELECT views
          FROM submission_metrics
          WHERE submission_id = submissions.id
          ORDER BY captured_at DESC
          LIMIT 1
        ) AS latest_metric ON true
        WHERE submissions.campaign_id = ${campaign.id}
          AND submissions.status = 'pending'
        ORDER BY submissions.created_at DESC, submissions.id DESC
        LIMIT ${input.pageSize}
        OFFSET ${offset}
      `);
      const [{ total }] = await ctx.db
        .select({ total: count() })
        .from(submissions)
        .where(
          and(
            eq(submissions.campaignId, campaign.id),
            eq(submissions.status, "pending"),
          ),
        );

      const items = (rows as Array<Record<string, unknown>>).map((row) => {
        const latestViews = toBigInt(row.latestViews);
        const estimatedPayout = payoutFromLatestViews(
          latestViews,
          campaign.payoutPer1kViews,
        );

        return {
          id: row.id as string,
          postUrl: row.postUrl as string,
          platform: row.platform as string,
          createdAt: row.createdAt as Date,
          creatorEmail: row.creatorEmail as string,
          latestViews: latestViews.toString(),
          estimatedPayoutCents: estimatedPayout.toString(),
        };
      });

      return {
        items,
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      };
    }),

  reject: adminProcedure
    .input(submissionRejectSchema)
    .mutation(async ({ ctx, input }) => {
      const [existingSubmission] = await ctx.db
        .select({ id: submissions.id, status: submissions.status })
        .from(submissions)
        .where(eq(submissions.id, input.submissionId))
        .limit(1);

      if (!existingSubmission) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found." });
      }

      if (existingSubmission.status !== "pending") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only pending submissions can be rejected.",
        });
      }

      const [rejectedSubmission] = await ctx.db
        .update(submissions)
        .set({
          status: "rejected",
          rejectionReason: input.rejectionReason,
          updatedAt: new Date(),
        })
        .where(and(eq(submissions.id, input.submissionId), eq(submissions.status, "pending")))
        .returning(submissionFields);

      if (!rejectedSubmission) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Only pending submissions can be rejected.",
        });
      }

      return rejectedSubmission;
    }),

  approve: adminProcedure.input(submissionIdSchema).mutation(async ({ ctx, input }) => {
    try {
      const result = await approveSubmission(ctx.db, input.submissionId);

      return {
        submission: result.submission,
        targetPayoutCents: result.targetPayout.toString(),
        remainingBudgetCents: result.remainingBudget.toString(),
        campaignCompleted: result.campaignCompleted,
      };
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) {
        throw new TRPCError({ code: "NOT_FOUND", message: error.message });
      }

      if (error instanceof InvalidSubmissionStateError) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
      }

      if (error instanceof InsufficientCampaignBudgetError) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "INSUFFICIENT_CAMPAIGN_BUDGET",
        });
      }

      throw error;
    }
  }),
});
