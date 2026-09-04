import { TRPCError } from "@trpc/server";
import { campaignIdSchema } from "@/lib/validation/campaign";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import {
  getCampaignAnalyticsSummary,
  getCampaignDailyViews,
} from "@/server/services/analytics";

export const analyticsRouter = createTRPCRouter({
  campaignSummary: adminProcedure
    .input(campaignIdSchema)
    .query(async ({ ctx, input }) => {
      const summary = await getCampaignAnalyticsSummary(ctx.db, input.campaignId);

      if (!summary) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
      }

      return {
        totalViews: summary.totalViews.toString(),
        budgetSpentCents: summary.budgetSpent.toString(),
        budgetLeftCents: summary.budgetLeft.toString(),
      };
    }),

  dailyViews: adminProcedure.input(campaignIdSchema).query(async ({ ctx, input }) => {
    const dailyViews = await getCampaignDailyViews(ctx.db, input.campaignId);

    if (!dailyViews) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
    }

    return dailyViews.map((day) => ({
      date: day.date,
      views: day.views.toString(),
    }));
  }),
});
