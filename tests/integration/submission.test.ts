import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "@/server/api/root";
import type { AuthenticatedUser } from "@/server/api/trpc";
import { db } from "@/server/db";
import { campaigns, submissionMetrics, submissions, users } from "@/server/db/schema";

const prefix = `submission-test-${randomUUID()}`;
const now = new Date();
const oneDay = 24 * 60 * 60 * 1000;

const admin: AuthenticatedUser = {
  id: randomUUID(),
  email: `${prefix}-admin@local.test`,
  role: "admin",
};

const creatorOne: AuthenticatedUser = {
  id: randomUUID(),
  email: `${prefix}-creator-one@local.test`,
  role: "creator",
};

const creatorTwo: AuthenticatedUser = {
  id: randomUUID(),
  email: `${prefix}-creator-two@local.test`,
  role: "creator",
};

const adminCaller = appRouter.createCaller({ db, user: admin });
const creatorOneCaller = appRouter.createCaller({ db, user: creatorOne });
const creatorTwoCaller = appRouter.createCaller({ db, user: creatorTwo });

let videoCounter = 1000000000000000000n;

function nextTikTokUrl() {
  videoCounter += 1n;
  return `https://www.tiktok.com/@testuser/video/${videoCounter}`;
}

function campaignInput(
  title: string,
  status: "draft" | "active" | "paused" | "completed",
) {
  return {
    title,
    platforms: ["tiktok"] as (
      | "tiktok"
      | "instagram"
      | "youtube"
    )[],
    payoutPer1kViews: 250,
    totalBudget: 10_000,
    status,
    startsAt: new Date(now.getTime() - oneDay),
    endsAt: new Date(now.getTime() + oneDay),
  };
}

let activeCampaignId = "";
let draftCampaignId = "";
let pausedCampaignId = "";
let completedCampaignId = "";
let futureCampaignId = "";
let expiredCampaignId = "";
let otherCreatorSubmissionId = "";

const campaignIds: string[] = [];

beforeAll(async () => {
  await db.insert(users).values([admin, creatorOne, creatorTwo]);

  const activeCampaign = await adminCaller.campaign.create(
    campaignInput(`${prefix} active`, "active"),
  );

  activeCampaignId = activeCampaign.id;
  campaignIds.push(activeCampaign.id);

  for (const status of ["draft", "paused", "completed"] as const) {
    const campaign = await adminCaller.campaign.create(
      campaignInput(`${prefix} ${status}`, status),
    );

    campaignIds.push(campaign.id);

    if (status === "draft") {
      draftCampaignId = campaign.id;
    }

    if (status === "paused") {
      pausedCampaignId = campaign.id;
    }

    if (status === "completed") {
      completedCampaignId = campaign.id;
    }
  }

  const futureCampaign = await adminCaller.campaign.create({
    ...campaignInput(`${prefix} future`, "active"),
    startsAt: new Date(now.getTime() + oneDay),
    endsAt: new Date(now.getTime() + 2 * oneDay),
  });

  futureCampaignId = futureCampaign.id;
  campaignIds.push(futureCampaign.id);

  const expiredCampaign = await adminCaller.campaign.create({
    ...campaignInput(`${prefix} expired`, "active"),
    startsAt: new Date(now.getTime() - 2 * oneDay),
    endsAt: new Date(now.getTime() - oneDay),
  });

  expiredCampaignId = expiredCampaign.id;
  campaignIds.push(expiredCampaign.id);
});

afterAll(async () => {
  await db
    .delete(submissions)
    .where(inArray(submissions.campaignId, campaignIds));

  await db.delete(campaigns).where(inArray(campaigns.id, campaignIds));
  await db.delete(users).where(inArray(users.id, [admin.id, creatorOne.id, creatorTwo.id]));
});

describe("creator submission router", () => {
  it("rejects admin use and client attempts to provide creator or status", async () => {
    const input = {
      campaignId: activeCampaignId,
      postUrl: nextTikTokUrl(),
      platform: "tiktok" as const,
    };

    await expect(
      adminCaller.submission.create(input),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await expect(
      creatorOneCaller.submission.create({
        ...input,
        creatorId: creatorTwo.id,
      } as never),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await expect(
      creatorOneCaller.submission.create({
        ...input,
        status: "approved",
      } as never),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("creates a pending submission for the authenticated creator", async () => {
    const postUrl = nextTikTokUrl();

    const submission = await creatorOneCaller.submission.create({
      campaignId: activeCampaignId,
      postUrl: `  ${postUrl}  `,
      platform: "tiktok",
    });

    const [storedSubmission] = await db
      .select({
        creatorId: submissions.creatorId,
      })
      .from(submissions)
      .where(eq(submissions.id, submission.id));

    expect(storedSubmission.creatorId).toBe(creatorOne.id);
    expect(submission.status).toBe("pending");
    expect(submission.postUrl).toBe(postUrl);
  });

  it("rejects inactive and out-of-window campaigns", async () => {
    for (const campaignId of [
      draftCampaignId,
      pausedCampaignId,
      completedCampaignId,
      futureCampaignId,
      expiredCampaignId,
    ]) {
      await expect(
        creatorOneCaller.submission.create({
          campaignId,
          postUrl: nextTikTokUrl(),
          platform: "tiktok",
        }),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    }
  });

  it("rejects platforms that the campaign does not allow", async () => {
    await expect(
      creatorOneCaller.submission.create({
        campaignId: activeCampaignId,
        postUrl: "https://www.instagram.com/reel/test-post/",
        platform: "instagram",
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });

  it("rejects URLs that do not match the selected platform", async () => {
    await expect(
      creatorOneCaller.submission.create({
        campaignId: activeCampaignId,
        postUrl: "https://www.instagram.com/reel/test-post/",
        platform: "tiktok",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("returns a targeted conflict for duplicate campaign post URLs", async () => {
    const postUrl = nextTikTokUrl();

    await creatorOneCaller.submission.create({
      campaignId: activeCampaignId,
      postUrl,
      platform: "tiktok",
    });

    await expect(
      creatorTwoCaller.submission.create({
        campaignId: activeCampaignId,
        postUrl,
        platform: "tiktok",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("scopes mine and byId to the authenticated creator with deterministic pagination", async () => {
    for (let index = 0; index < 3; index += 1) {
      await creatorOneCaller.submission.create({
        campaignId: activeCampaignId,
        postUrl: nextTikTokUrl(),
        platform: "tiktok",
      });
    }

    const otherCreatorSubmission =
      await creatorTwoCaller.submission.create({
        campaignId: activeCampaignId,
        postUrl: nextTikTokUrl(),
        platform: "tiktok",
      });

    otherCreatorSubmissionId = otherCreatorSubmission.id;

    const firstPage = await creatorOneCaller.submission.mine({
      page: 1,
      pageSize: 2,
    });

    const secondPage = await creatorOneCaller.submission.mine({
      page: 2,
      pageSize: 2,
    });

    expect(firstPage.total).toBeGreaterThanOrEqual(5);
    expect(firstPage.items).toHaveLength(2);
    expect(secondPage.items).toHaveLength(2);

    expect(
      firstPage.items.some(
        (submission) => submission.id === otherCreatorSubmissionId,
      ),
    ).toBe(false);

    expect(
      secondPage.items.some(
        (submission) => submission.id === otherCreatorSubmissionId,
      ),
    ).toBe(false);

    expect(
      new Set(
        [...firstPage.items, ...secondPage.items].map(
          (submission) => submission.id,
        ),
      ).size,
    ).toBe(4);

    expect(
      firstPage.items.every((submission, index, items) => {
        const next = items[index + 1];

        return (
          !next ||
          submission.createdAt > next.createdAt ||
          (submission.createdAt.getTime() === next.createdAt.getTime() &&
            submission.id > next.id)
        );
      }),
    ).toBe(true);

    await expect(
      creatorOneCaller.submission.byId({
        submissionId: otherCreatorSubmissionId,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("returns the latest views and per-submission estimated earnings for the owner", async () => {
    const created = await creatorOneCaller.submission.create({
      campaignId: activeCampaignId,
      postUrl: nextTikTokUrl(),
      platform: "tiktok",
    });
    await db.insert(submissionMetrics).values([
      {
        submissionId: created.id,
        capturedAt: "2030-01-01",
        views: 1_500n,
        likes: 0n,
        comments: 0n,
      },
      {
        submissionId: created.id,
        capturedAt: "2030-01-02",
        views: 2_000n,
        likes: 0n,
        comments: 0n,
      },
    ]);

    const detail = await creatorOneCaller.submission.byId({ submissionId: created.id });
    const mine = await creatorOneCaller.submission.mine({ page: 1, pageSize: 50 });
    const listed = mine.items.find((submission) => submission.id === created.id);

    expect(detail).toMatchObject({ latestViews: "2000", estimatedPayoutCents: "500" });
    expect(listed).toMatchObject({ latestViews: "2000", estimatedPayoutCents: "500" });
  });
});
