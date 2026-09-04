import { TRPCError } from "@trpc/server";
import { and, count, desc, eq } from "drizzle-orm";
import {
  submissionCreateSchema,
  submissionIdSchema,
  submissionMineInputSchema,
} from "@/lib/validation/submission";
import { creatorProcedure, createTRPCRouter } from "@/server/api/trpc";
import { campaigns, submissions } from "@/server/db/schema";

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
});
