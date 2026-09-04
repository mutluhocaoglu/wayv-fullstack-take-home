import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, ilike, lte } from "drizzle-orm";
import {
  campaignFormSchema,
  campaignIdSchema,
  campaignListInputSchema,
  campaignUpdateInputSchema,
  paginationSchema,
} from "@/lib/validation/campaign";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  creatorProcedure,
} from "@/server/api/trpc";
import { campaigns } from "@/server/db/schema";

const campaignFields = {
  id: campaigns.id,
  title: campaigns.title,
  platforms: campaigns.platforms,
  payoutPer1kViews: campaigns.payoutPer1kViews,
  totalBudget: campaigns.totalBudget,
  status: campaigns.status,
  startsAt: campaigns.startsAt,
  endsAt: campaigns.endsAt,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
};

export const campaignRouter = createTRPCRouter({
  list: adminProcedure.input(campaignListInputSchema).query(async ({ ctx, input }) => {
    const conditions = [
      input.status ? eq(campaigns.status, input.status) : undefined,
      input.search ? ilike(campaigns.title, `%${input.search}%`) : undefined,
    ];
    const where = and(...conditions);
    const offset = (input.page - 1) * input.pageSize;

    const [items, [{ total }]] = await Promise.all([
      ctx.db
        .select(campaignFields)
        .from(campaigns)
        .where(where)
        .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
        .limit(input.pageSize)
        .offset(offset),
      ctx.db.select({ total: count() }).from(campaigns).where(where),
    ]);

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }),

  active: creatorProcedure.input(paginationSchema).query(async ({ ctx, input }) => {
    const now = new Date();
    const where = and(
      eq(campaigns.status, "active"),
      lte(campaigns.startsAt, now),
      gte(campaigns.endsAt, now),
    );
    const offset = (input.page - 1) * input.pageSize;

    const [items, [{ total }]] = await Promise.all([
      ctx.db
        .select(campaignFields)
        .from(campaigns)
        .where(where)
        .orderBy(asc(campaigns.endsAt), asc(campaigns.id))
        .limit(input.pageSize)
        .offset(offset),
      ctx.db.select({ total: count() }).from(campaigns).where(where),
    ]);

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize),
    };
  }),

  byId: protectedProcedure.input(campaignIdSchema).query(async ({ ctx, input }) => {
    const now = new Date();
    const creatorAvailability =
      ctx.user.role === "creator"
        ? [
            eq(campaigns.status, "active"),
            lte(campaigns.startsAt, now),
            gte(campaigns.endsAt, now),
          ]
        : [];

    const [campaign] = await ctx.db
      .select(campaignFields)
      .from(campaigns)
      .where(and(eq(campaigns.id, input.campaignId), ...creatorAvailability))
      .limit(1);

    if (!campaign) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Campaign not found.",
      });
    }

    return campaign;
  }),

  create: adminProcedure.input(campaignFormSchema).mutation(async ({ ctx, input }) => {
    const now = new Date();
    const [campaign] = await ctx.db
      .insert(campaigns)
      .values({ ...input, createdAt: now, updatedAt: now })
      .returning(campaignFields);

    return campaign;
  }),

  update: adminProcedure
    .input(campaignUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const [existingCampaign] = await ctx.db
        .select({ status: campaigns.status })
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .limit(1);

      if (!existingCampaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found.",
        });
      }

      if (existingCampaign.status === "completed" && input.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Completed campaigns cannot be reopened.",
        });
      }

      const { campaignId, ...values } = input;
      const [campaign] = await ctx.db
        .update(campaigns)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(campaigns.id, campaignId))
        .returning(campaignFields);

      return campaign;
    }),
});
