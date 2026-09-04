import { analyticsRouter } from "@/server/api/routers/analytics";
import { authRouter } from "@/server/api/routers/auth";
import { campaignRouter } from "@/server/api/routers/campaign";
import { submissionRouter } from "@/server/api/routers/submission";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({
    ok: true,
    timestamp: new Date().toISOString(),
  })),
  auth: authRouter,
  campaign: campaignRouter,
  submission: submissionRouter,
  analytics: analyticsRouter,
});

export type AppRouter = typeof appRouter;
