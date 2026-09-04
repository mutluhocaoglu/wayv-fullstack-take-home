import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "@/server/api/root";
import type { AuthenticatedUser } from "@/server/api/trpc";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";
import { getCampaignSpend } from "@/server/services/campaign-spend";

const prefix = `approval-test-${randomUUID()}`;
const now = new Date();
const oneDay = 24 * 60 * 60 * 1000;

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
const campaignIds: string[] = [];

beforeAll(async () => {
  await db.insert(users).values([admin, creator]);
});

async function createCampaign(totalBudget = 10_000, payoutPer1kViews = 250) {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: `${prefix}-${randomUUID()}`,
      platforms: ["tiktok"],
      payoutPer1kViews,
      totalBudget,
      status: "active",
      startsAt: new Date(now.getTime() - oneDay),
      endsAt: new Date(now.getTime() + oneDay),
    })
    .returning();

  campaignIds.push(campaign.id);
  return campaign;
}

async function createSubmission(campaignId: string, status: "pending" | "approved" | "rejected" = "pending") {
  const [submission] = await db
    .insert(submissions)
    .values({
      campaignId,
      creatorId: creator.id,
      postUrl: `https://www.tiktok.com/@testuser/video/${randomUUID().replaceAll("-", "")}`,
      platform: "tiktok",
      status,
      ...(status === "rejected" ? { rejectionReason: "Existing rejection." } : {}),
      updatedAt: new Date(now.getTime() - 5_000),
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
  if (campaignIds.length > 0) {
    const testSubmissions = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(inArray(submissions.campaignId, campaignIds));
    const submissionIds = testSubmissions.map((submission) => submission.id);

    if (submissionIds.length > 0) {
      await db
        .delete(submissionMetrics)
        .where(inArray(submissionMetrics.submissionId, submissionIds));
    }

    await db.delete(submissions).where(inArray(submissions.campaignId, campaignIds));
    await db.delete(campaigns).where(inArray(campaigns.id, campaignIds));
  }
  await db.delete(users).where(inArray(users.id, [admin.id, creator.id]));
});

describe("approval and rejection", () => {
  it("approves a pending submission, updates its timestamp, and uses the latest metric", async () => {
    const campaign = await createCampaign();
    const submission = await createSubmission(campaign.id);
    await addMetric(submission.id, "2026-01-01", 1_000n);
    await addMetric(submission.id, "2026-01-02", 2_000n);

    const result = await adminCaller.submission.approve({ submissionId: submission.id });
    const [stored] = await db.select().from(submissions).where(eq(submissions.id, submission.id));

    expect(result.targetPayoutCents).toBe("500");
    expect(stored.status).toBe("approved");
    expect(stored.updatedAt.getTime()).toBeGreaterThan(submission.updatedAt.getTime());
  });

  it("uses zero payout when a pending submission has no metrics", async () => {
    const campaign = await createCampaign();
    const submission = await createSubmission(campaign.id);

    const result = await adminCaller.submission.approve({ submissionId: submission.id });

    expect(result.targetPayoutCents).toBe("0");
  });

  it("rejects repeated, rejected, and missing approvals", async () => {
    const campaign = await createCampaign();
    const approvedSubmission = await createSubmission(campaign.id);
    const rejectedSubmission = await createSubmission(campaign.id, "rejected");
    await adminCaller.submission.approve({ submissionId: approvedSubmission.id });

    await expect(adminCaller.submission.approve({ submissionId: approvedSubmission.id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(adminCaller.submission.approve({ submissionId: rejectedSubmission.id })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(adminCaller.submission.approve({ submissionId: randomUUID() })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("approves when payout exactly equals remaining budget and completes the campaign", async () => {
    const campaign = await createCampaign(1_000, 1_000);
    const submission = await createSubmission(campaign.id);
    await addMetric(submission.id, "2026-01-01", 1_000n);

    const result = await adminCaller.submission.approve({ submissionId: submission.id });
    const [storedCampaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));

    expect(result.remainingBudgetCents).toBe("0");
    expect(result.campaignCompleted).toBe(true);
    expect(storedCampaign.status).toBe("completed");
  });

  it("keeps a submission pending when its payout exceeds remaining budget", async () => {
    const campaign = await createCampaign(999, 1_000);
    const submission = await createSubmission(campaign.id);
    await addMetric(submission.id, "2026-01-01", 1_000n);

    await expect(adminCaller.submission.approve({ submissionId: submission.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "INSUFFICIENT_CAMPAIGN_BUDGET",
    });
    const [storedSubmission] = await db.select().from(submissions).where(eq(submissions.id, submission.id));
    expect(storedSubmission.status).toBe("pending");
  });

  it("does not allow creators to approve or reject", async () => {
    const campaign = await createCampaign();
    const submission = await createSubmission(campaign.id);

    await expect(creatorCaller.submission.approve({ submissionId: submission.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(creatorCaller.submission.reject({ submissionId: submission.id, rejectionReason: "Not suitable." })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects only pending submissions and stores a trimmed reason", async () => {
    const campaign = await createCampaign();
    const pendingSubmission = await createSubmission(campaign.id);
    const approvedSubmission = await createSubmission(campaign.id, "approved");

    const rejected = await adminCaller.submission.reject({ submissionId: pendingSubmission.id, rejectionReason: "  Needs a clearer product mention.  " });
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("Needs a clearer product mention.");
    await expect(adminCaller.submission.reject({ submissionId: pendingSubmission.id, rejectionReason: "Again" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(adminCaller.submission.reject({ submissionId: approvedSubmission.id, rejectionReason: "No" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(adminCaller.submission.reject({ submissionId: randomUUID(), rejectionReason: "No" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(adminCaller.submission.reject({ submissionId: approvedSubmission.id, rejectionReason: "   " })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns a paginated pending review queue with latest views and payout", async () => {
    const campaign = await createCampaign(10_000, 250);
    const first = await createSubmission(campaign.id);
    const second = await createSubmission(campaign.id);
    await createSubmission(campaign.id, "approved");
    await addMetric(first.id, "2026-01-01", 1_000n);
    await addMetric(first.id, "2026-01-02", 2_000n);
    await addMetric(second.id, "2026-01-02", 999n);

    const queue = await adminCaller.submission.pendingByCampaign({ campaignId: campaign.id, page: 1, pageSize: 10 });
    const firstPage = await adminCaller.submission.pendingByCampaign({ campaignId: campaign.id, page: 1, pageSize: 1 });
    const secondPage = await adminCaller.submission.pendingByCampaign({ campaignId: campaign.id, page: 2, pageSize: 1 });

    expect(queue.total).toBe(2);
    expect(queue.items).toHaveLength(2);
    expect(queue.items.map((item) => item.creatorEmail)).toEqual([creator.email, creator.email]);
    expect(queue.items.map((item) => item.latestViews).sort()).toEqual(["2000", "999"]);
    expect(queue.items.map((item) => item.estimatedPayoutCents).sort()).toEqual(["0", "500"]);
    expect(firstPage.total).toBe(2);
    expect(firstPage.items).toHaveLength(1);
    expect(secondPage.items).toHaveLength(1);
    expect(firstPage.items[0].id).not.toBe(secondPage.items[0].id);
  });
});

describe("concurrent approval", () => {
  it("allows exactly one of two concurrent approvals for the same locked campaign", async () => {
    const campaign = await createCampaign(1_000, 1_000);
    const firstSubmission = await createSubmission(campaign.id);
    const secondSubmission = await createSubmission(campaign.id);
    await addMetric(firstSubmission.id, "2026-01-01", 1_000n);
    await addMetric(secondSubmission.id, "2026-01-01", 1_000n);

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required for concurrency testing.");
    const clientA = postgres(databaseUrl, { max: 1 });
    const clientB = postgres(databaseUrl, { max: 1 });
    const callerA = appRouter.createCaller({ db: drizzle(clientA, { schema }), user: admin });
    const callerB = appRouter.createCaller({ db: drizzle(clientB, { schema }), user: admin });

    try {
      const results = await Promise.allSettled([
        callerA.submission.approve({ submissionId: firstSubmission.id }),
        callerB.submission.approve({ submissionId: secondSubmission.id }),
      ]);
      const successful = results.filter((result) => result.status === "fulfilled");
      const failed = results.filter((result) => result.status === "rejected");
      const storedSubmissions = await db.select().from(submissions).where(inArray(submissions.id, [firstSubmission.id, secondSubmission.id]));
      const [storedCampaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaign.id));
      const campaignSpend = await getCampaignSpend(db, campaign.id, 1_000);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(failed[0]?.reason).toMatchObject({ code: "PRECONDITION_FAILED", message: "INSUFFICIENT_CAMPAIGN_BUDGET" });
      expect(storedSubmissions.filter((submission) => submission.status === "approved")).toHaveLength(1);
      expect(storedSubmissions.filter((submission) => submission.status === "pending")).toHaveLength(1);
      expect(campaignSpend).toBe(1_000n);
      expect(campaignSpend).toBeLessThanOrEqual(BigInt(campaign.totalBudget));
      expect(storedCampaign.status).toBe("completed");
    } finally {
      await Promise.all([clientA.end(), clientB.end()]);
    }
  });
});
