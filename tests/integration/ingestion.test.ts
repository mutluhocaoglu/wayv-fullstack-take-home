import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";
import { ingestApprovedSubmissions } from "@/server/services/ingestion";

const prefix = `ingestion-test-${randomUUID()}`;
const ingestionDate = "2030-01-10";
const campaignIds: string[] = [];
const creatorId = randomUUID();

beforeAll(async () => {
  await db.insert(users).values({
    id: creatorId,
    email: `${prefix}@local.test`,
    role: "creator",
  });
});

async function createCampaign() {
  const [campaign] = await db
    .insert(campaigns)
    .values({
      title: `${prefix}-${randomUUID()}`,
      platforms: ["tiktok"],
      payoutPer1kViews: 250,
      totalBudget: 10_000,
      status: "active",
      startsAt: new Date("2030-01-01T00:00:00.000Z"),
      endsAt: new Date("2030-02-01T00:00:00.000Z"),
    })
    .returning();

  campaignIds.push(campaign.id);
  return campaign;
}

async function createSubmission(
  campaignId: string,
  status: "pending" | "approved" | "rejected" | "paid",
) {
  const [submission] = await db
    .insert(submissions)
    .values({
      campaignId,
      creatorId,
      postUrl: `https://www.tiktok.com/@testuser/video/${randomUUID().replaceAll("-", "")}`,
      platform: "tiktok",
      status,
      ...(status === "rejected" ? { rejectionReason: "Rejected for test setup." } : {}),
    })
    .returning();

  return submission;
}

async function addMetric(submissionId: string, capturedAt: string, values: { views: bigint; likes: bigint; comments: bigint }) {
  await db.insert(submissionMetrics).values({ submissionId, capturedAt, ...values });
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

  await db.delete(users).where(eq(users.id, creatorId));
});

describe("daily metrics ingestion", () => {
  it("creates a daily metric with monotonically increasing views", async () => {
    const campaign = await createCampaign();
    const submission = await createSubmission(campaign.id, "approved");
    await addMetric(submission.id, "2030-01-09", {
      views: 1_000n,
      likes: 100n,
      comments: 10n,
    });

    const summary = await ingestApprovedSubmissions(db, {
      date: ingestionDate,
      submissionIds: [submission.id],
      generateMetric: (previous) => ({
        views: (previous?.views ?? 0n) + 234n,
        likes: (previous?.likes ?? 0n) + 23n,
        comments: (previous?.comments ?? 0n) + 2n,
      }),
    });
    const [metric] = await db
      .select()
      .from(submissionMetrics)
      .where(
        and(
          eq(submissionMetrics.submissionId, submission.id),
          eq(submissionMetrics.capturedAt, ingestionDate),
        ),
      );

    expect(summary.created).toEqual([submission.id]);
    expect(metric.capturedAt).toBe(ingestionDate);
    expect(metric.views).toBe(1_234n);
    expect(metric.likes).toBe(123n);
    expect(metric.comments).toBe(12n);
  });

  it("leaves same-day metrics unchanged and reports them as skipped", async () => {
    const campaign = await createCampaign();
    const submission = await createSubmission(campaign.id, "approved");
    const generator = () => ({ views: 1_500n, likes: 150n, comments: 15n });

    const firstRun = await ingestApprovedSubmissions(db, {
      date: ingestionDate,
      submissionIds: [submission.id],
      generateMetric: generator,
    });
    const secondRun = await ingestApprovedSubmissions(db, {
      date: ingestionDate,
      submissionIds: [submission.id],
      generateMetric: () => ({ views: 9_999n, likes: 999n, comments: 99n }),
    });
    const metrics = await db
      .select()
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, submission.id));

    expect(firstRun.created).toEqual([submission.id]);
    expect(secondRun.skipped).toEqual([submission.id]);
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ views: 1_500n, likes: 150n, comments: 15n });
  });

  it("does not process pending, rejected, or paid submissions", async () => {
    const campaign = await createCampaign();
    const pending = await createSubmission(campaign.id, "pending");
    const rejected = await createSubmission(campaign.id, "rejected");
    const paid = await createSubmission(campaign.id, "paid");
    const submissionIds = [pending.id, rejected.id, paid.id];

    const summary = await ingestApprovedSubmissions(db, {
      date: ingestionDate,
      submissionIds,
      generateMetric: () => ({ views: 10n, likes: 1n, comments: 0n }),
    });
    const metrics = await db
      .select()
      .from(submissionMetrics)
      .where(inArray(submissionMetrics.submissionId, submissionIds));

    expect(summary).toEqual({ created: [], skipped: [], failed: [] });
    expect(metrics).toHaveLength(0);
  });

  it("isolates a generator failure and ingests remaining approved submissions", async () => {
    const campaign = await createCampaign();
    const failingSubmission = await createSubmission(campaign.id, "approved");
    const succeedingSubmission = await createSubmission(campaign.id, "approved");

    const summary = await ingestApprovedSubmissions(db, {
      date: ingestionDate,
      submissionIds: [failingSubmission.id, succeedingSubmission.id],
      generateMetric: (_previous, submission) => {
        if (submission.id === failingSubmission.id) {
          throw new Error("Intentional test failure");
        }

        return { views: 100n, likes: 10n, comments: 1n };
      },
    });
    const [createdMetric] = await db
      .select()
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, succeedingSubmission.id));

    expect(summary.created).toEqual([succeedingSubmission.id]);
    expect(summary.failed).toEqual([
      {
        submissionId: failingSubmission.id,
        reason: "Unable to ingest metrics for this submission.",
      },
    ]);
    expect(createdMetric.views).toBe(100n);
  });
});
