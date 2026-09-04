import "./load-env";
import { and, eq } from "drizzle-orm";
import { db, sqlClient } from "../src/server/db";
import { campaigns, submissionMetrics, submissions, users } from "../src/server/db/schema";

type SeedUser = typeof users.$inferInsert;
type SeedCampaign = typeof campaigns.$inferInsert;
type SeedSubmission = typeof submissions.$inferInsert;
type SeedMetric = typeof submissionMetrics.$inferInsert;

const seedIds = {
  admin: "11111111-1111-1111-1111-111111111111",
  creator1: "22222222-2222-2222-2222-222222222222",
  creator2: "33333333-3333-3333-3333-333333333333",
  activeCampaign: "44444444-4444-4444-4444-444444444444",
  limitedCampaign: "55555555-5555-5555-5555-555555555555",
  pausedCampaign: "66666666-6666-6666-6666-666666666666",
  draftCampaign: "77777777-7777-7777-7777-777777777777",
  completedCampaign: "88888888-8888-8888-8888-888888888888",
  pendingSubmission1: "99999999-9999-9999-9999-999999999991",
  pendingSubmission2: "99999999-9999-9999-9999-999999999992",
  approvedSubmission: "99999999-9999-9999-9999-999999999993",
  rejectedSubmission: "99999999-9999-9999-9999-999999999994",
  paidSubmission: "99999999-9999-9999-9999-999999999995",
};

function offsetDate(days: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function main() {
  const currentDate = new Date();
  currentDate.setUTCHours(12, 0, 0, 0);

  const seedUsers: SeedUser[] = [
    { id: seedIds.admin, email: "admin@local.test", role: "admin" },
    { id: seedIds.creator1, email: "creator1@local.test", role: "creator" },
    { id: seedIds.creator2, email: "creator2@local.test", role: "creator" },
  ];

  for (const user of seedUsers) {
    await db
      .insert(users)
      .values(user)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.email,
          role: user.role,
        },
      });
  }

  const seedCampaigns: SeedCampaign[] = [
    {
      id: seedIds.activeCampaign,
      title: "Summer Launch Clips",
      platforms: ["tiktok", "instagram"],
      payoutPer1kViews: 250,
      totalBudget: 50000,
      status: "active",
      startsAt: offsetDate(-7),
      endsAt: offsetDate(14),
    },
    {
      id: seedIds.limitedCampaign,
      title: "Tight Budget Challenge",
      platforms: ["youtube"],
      payoutPer1kViews: 1000,
      totalBudget: 1500,
      status: "active",
      startsAt: offsetDate(-3),
      endsAt: offsetDate(10),
    },
    {
      id: seedIds.pausedCampaign,
      title: "Paused Referral Push",
      platforms: ["instagram"],
      payoutPer1kViews: 300,
      totalBudget: 20000,
      status: "paused",
      startsAt: offsetDate(-5),
      endsAt: offsetDate(21),
    },
    {
      id: seedIds.draftCampaign,
      title: "Draft Creator Experiment",
      platforms: ["tiktok", "youtube"],
      payoutPer1kViews: 450,
      totalBudget: 30000,
      status: "draft",
      startsAt: offsetDate(5),
      endsAt: offsetDate(35),
    },
    {
      id: seedIds.completedCampaign,
      title: "Completed Product Recap",
      platforms: ["tiktok"],
      payoutPer1kViews: 200,
      totalBudget: 10000,
      status: "completed",
      startsAt: offsetDate(-30),
      endsAt: offsetDate(-5),
    },
  ];

  for (const campaign of seedCampaigns) {
    await db
      .insert(campaigns)
      .values(campaign)
      .onConflictDoUpdate({
        target: campaigns.id,
        set: {
          title: campaign.title,
          platforms: campaign.platforms,
          payoutPer1kViews: campaign.payoutPer1kViews,
          totalBudget: campaign.totalBudget,
          status: campaign.status,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
          updatedAt: currentDate,
        },
      });
  }

  const seedSubmissions: SeedSubmission[] = [
    {
      id: seedIds.pendingSubmission1,
      campaignId: seedIds.activeCampaign,
      creatorId: seedIds.creator1,
      postUrl: "https://www.tiktok.com/@creator1/video/100000000000000001",
      platform: "tiktok",
      status: "pending",
    },
    {
      id: seedIds.pendingSubmission2,
      campaignId: seedIds.activeCampaign,
      creatorId: seedIds.creator2,
      postUrl: "https://www.instagram.com/reel/C10000002/",
      platform: "instagram",
      status: "pending",
    },
    {
      id: seedIds.approvedSubmission,
      campaignId: seedIds.limitedCampaign,
      creatorId: seedIds.creator1,
      postUrl: "https://www.youtube.com/watch?v=wayvapproved01",
      platform: "youtube",
      status: "approved",
    },
    {
      id: seedIds.rejectedSubmission,
      campaignId: seedIds.pausedCampaign,
      creatorId: seedIds.creator2,
      postUrl: "https://www.instagram.com/reel/C10000004/",
      platform: "instagram",
      status: "rejected",
      rejectionReason: "Does not meet campaign content guidelines.",
    },
    {
      id: seedIds.paidSubmission,
      campaignId: seedIds.completedCampaign,
      creatorId: seedIds.creator1,
      postUrl: "https://www.tiktok.com/@creator1/video/100000000000000005",
      platform: "tiktok",
      status: "paid",
    },
  ];

  for (const submission of seedSubmissions) {
    await db
      .insert(submissions)
      .values(submission)
      .onConflictDoUpdate({
        target: submissions.id,
        set: {
          campaignId: submission.campaignId,
          creatorId: submission.creatorId,
          postUrl: submission.postUrl,
          platform: submission.platform,
          status: submission.status,
          rejectionReason: submission.rejectionReason ?? null,
          updatedAt: currentDate,
        },
      });
  }

  const metricSeeds: SeedMetric[] = [
    {
      submissionId: seedIds.approvedSubmission,
      capturedAt: toDateOnly(offsetDate(-4)),
      views: 1200n,
      likes: 150n,
      comments: 18n,
    },
    {
      submissionId: seedIds.approvedSubmission,
      capturedAt: toDateOnly(offsetDate(-2)),
      views: 2100n,
      likes: 240n,
      comments: 30n,
    },
    {
      submissionId: seedIds.approvedSubmission,
      capturedAt: toDateOnly(offsetDate(-1)),
      views: 3500n,
      likes: 390n,
      comments: 42n,
    },
    {
      submissionId: seedIds.paidSubmission,
      capturedAt: toDateOnly(offsetDate(-12)),
      views: 1000n,
      likes: 120n,
      comments: 15n,
    },
    {
      submissionId: seedIds.paidSubmission,
      capturedAt: toDateOnly(offsetDate(-9)),
      views: 2200n,
      likes: 260n,
      comments: 27n,
    },
    {
      submissionId: seedIds.paidSubmission,
      capturedAt: toDateOnly(offsetDate(-6)),
      views: 4100n,
      likes: 430n,
      comments: 51n,
    },
  ];

  for (const metric of metricSeeds) {
    const existing = await db.query.submissionMetrics.findFirst({
      where: and(
        eq(submissionMetrics.submissionId, metric.submissionId),
        eq(submissionMetrics.capturedAt, metric.capturedAt),
      ),
    });

    if (existing) {
      await db
        .update(submissionMetrics)
        .set({
          views: metric.views,
          likes: metric.likes,
          comments: metric.comments,
        })
        .where(eq(submissionMetrics.id, existing.id));
      continue;
    }

    await db.insert(submissionMetrics).values(metric);
  }

  console.log("Seed complete");
}

main()
  .catch((error) => {
    console.error("Seed failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end();
  });
