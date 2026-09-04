import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "@/server/api/root";
import type { AuthenticatedUser } from "@/server/api/trpc";
import { db } from "@/server/db";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";

const prefix = `analytics-test-${randomUUID()}`;
const campaignIds: string[] = [];
const admin: AuthenticatedUser = {
  id: randomUUID(),
  email: `${prefix}-admin@local.test`,
  role: "admin",
};
const creator: AuthenticatedUser = {
  id: randomUUID(),
  email: `${prefix}-creator@local.test`,
  role: "creator",
};
const adminCaller = appRouter.createCaller({ db, user: admin });
const creatorCaller = appRouter.createCaller({ db, user: creator });

beforeAll(async () => {
  await db.insert(users).values([admin, creator]);
});

async function createCampaign(options?: { totalBudget?: number; payoutPer1kViews?: number; startsAt?: Date; endsAt?: Date }) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: `${prefix}-${randomUUID()}`,
      platforms: ["tiktok"],
      payoutPer1kViews: options?.payoutPer1kViews ?? 100,
      totalBudget: options?.totalBudget ?? 1_000,
      status: "active",
      startsAt: options?.startsAt ?? new Date("2031-01-01T00:00:00.000Z"),
      endsAt: options?.endsAt ?? new Date("2031-01-05T23:59:59.000Z"),
    })
    .returning();

  campaignIds.push(campaign.id);
  return campaign;
}

async function createSubmission(campaignId: string, status: "pending" | "approved" | "rejected" | "paid") {
  const [submission] = await db
    .insert(submissions)
    .values({
      campaignId,
      creatorId: creator.id,
      postUrl: `https://www.tiktok.com/@analytics/video/${randomUUID().replaceAll("-", "")}`,
      platform: "tiktok",
      status,
      ...(status === "rejected" ? { rejectionReason: "Rejected test submission." } : {}),
    })
    .returning();

  return submission;
}

async function addMetric(submissionId: string, capturedAt: string, views: bigint) {
  await db.insert(submissionMetrics).values({
    submissionId,
    capturedAt,
    views,
    likes: 0n,
    comments: 0n,
  });
}

afterAll(async () => {
  const testSubmissions = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(inArray(submissions.campaignId, campaignIds));
  const submissionIds = testSubmissions.map((submission) => submission.id);

  if (submissionIds.length > 0) {
    await db.delete(submissionMetrics).where(inArray(submissionMetrics.submissionId, submissionIds));
  }

  if (campaignIds.length > 0) {
    await db.delete(submissions).where(inArray(submissions.campaignId, campaignIds));
    await db.delete(campaigns).where(inArray(campaigns.id, campaignIds));
  }

  await db.delete(users).where(inArray(users.id, [admin.id, creator.id]));
});

describe("campaign analytics", () => {
  it("uses only each approved or paid submission's latest metric and rounds payout per submission", async () => {
    const campaign = await createCampaign();
    const approved = await createSubmission(campaign.id, "approved");
    const paid = await createSubmission(campaign.id, "paid");
    const noMetric = await createSubmission(campaign.id, "approved");
    const pending = await createSubmission(campaign.id, "pending");
    const rejected = await createSubmission(campaign.id, "rejected");
    await addMetric(approved.id, "2031-01-01", 1_000n);
    await addMetric(approved.id, "2031-01-02", 1_500n);
    await addMetric(paid.id, "2031-01-02", 1_500n);
    await addMetric(pending.id, "2031-01-02", 9_000n);
    await addMetric(rejected.id, "2031-01-02", 9_000n);

    const summary = await adminCaller.analytics.campaignSummary({ campaignId: campaign.id });

    expect(noMetric.status).toBe("approved");
    expect(summary).toEqual({
      totalViews: "3000",
      budgetSpentCents: "200",
      budgetLeftCents: "800",
    });
  });

  it("preserves derived overspend while clamping budget left to zero", async () => {
    const campaign = await createCampaign({ totalBudget: 100, payoutPer1kViews: 100 });
    const submission = await createSubmission(campaign.id, "approved");
    await addMetric(submission.id, "2031-01-01", 2_000n);

    await expect(adminCaller.analytics.campaignSummary({ campaignId: campaign.id })).resolves.toEqual({
      totalViews: "2000",
      budgetSpentCents: "200",
      budgetLeftCents: "0",
    });
  });

  it("returns an inclusive, UTC, zero-filled approved-submission daily series", async () => {
    const campaign = await createCampaign({
      startsAt: new Date("2031-01-01T12:00:00.000Z"),
      endsAt: new Date("2031-01-05T12:00:00.000Z"),
    });
    const firstApproved = await createSubmission(campaign.id, "approved");
    const secondApproved = await createSubmission(campaign.id, "approved");
    const paid = await createSubmission(campaign.id, "paid");
    await addMetric(firstApproved.id, "2031-01-01", 1_000n);
    await addMetric(firstApproved.id, "2031-01-03", 1_500n);
    await addMetric(secondApproved.id, "2031-01-03", 500n);
    await addMetric(paid.id, "2031-01-03", 9_000n);

    await expect(adminCaller.analytics.dailyViews({ campaignId: campaign.id })).resolves.toEqual([
      { date: "2031-01-01", views: "1000" },
      { date: "2031-01-02", views: "0" },
      { date: "2031-01-03", views: "2000" },
      { date: "2031-01-04", views: "0" },
      { date: "2031-01-05", views: "0" },
    ]);
  });

  it("does not allow creators to access analytics", async () => {
    const campaign = await createCampaign();

    await expect(creatorCaller.analytics.campaignSummary({ campaignId: campaign.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(creatorCaller.analytics.dailyViews({ campaignId: campaign.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
