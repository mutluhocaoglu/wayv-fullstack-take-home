import { randomUUID } from "node:crypto";
import { ilike, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "@/server/api/root";
import type { AuthenticatedUser } from "@/server/api/trpc";
import { db } from "@/server/db";
import { campaigns, users } from "@/server/db/schema";

const prefix = `campaign-test-${randomUUID()}`;
const now = new Date();

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

function campaignInput(title: string, status: "draft" | "active" | "paused" | "completed") {
  return {
    title,
    platforms: ["tiktok"] as ("tiktok" | "instagram" | "youtube")[],
    payoutPer1kViews: 250,
    totalBudget: 10_000,
    status,
    startsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  };
}

let completedCampaignId = "";
let validActiveCampaignId = "";
let futureActiveCampaignId = "";
let expiredActiveCampaignId = "";
let pausedCampaignId = "";

beforeAll(async () => {
  await db.insert(users).values([admin, creator]);

  const validActive = await adminCaller.campaign.create(campaignInput(`${prefix} searchable active`, "active"));
  validActiveCampaignId = validActive.id;

  const futureActive = await adminCaller.campaign.create({
    ...campaignInput(`${prefix} future active`, "active"),
    startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
  });
  futureActiveCampaignId = futureActive.id;

  const expiredActive = await adminCaller.campaign.create({
    ...campaignInput(`${prefix} expired active`, "active"),
    startsAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
    endsAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  });
  expiredActiveCampaignId = expiredActive.id;

  await adminCaller.campaign.create(campaignInput(`${prefix} draft`, "draft"));
  const paused = await adminCaller.campaign.create(campaignInput(`${prefix} paused`, "paused"));
  pausedCampaignId = paused.id;
  const completed = await adminCaller.campaign.create(campaignInput(`${prefix} completed`, "completed"));
  completedCampaignId = completed.id;
});

afterAll(async () => {
  await db.delete(campaigns).where(ilike(campaigns.title, `${prefix}%`));
  await db.delete(users).where(inArray(users.id, [admin.id, creator.id]));
});

describe("campaign router", () => {
  it("does not allow creators to use admin campaign procedures", async () => {
    await expect(creatorCaller.campaign.list({ page: 1, pageSize: 10 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(creatorCaller.campaign.create(campaignInput(`${prefix} forbidden create`, "draft"))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(creatorCaller.campaign.update({ campaignId: completedCampaignId, ...campaignInput(`${prefix} forbidden update`, "completed") })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists campaigns with database-backed status filtering, title search, and pagination", async () => {
    const all = await adminCaller.campaign.list({ page: 1, pageSize: 2, search: prefix });
    const active = await adminCaller.campaign.list({ page: 1, pageSize: 10, search: prefix, status: "active" });
    const secondPage = await adminCaller.campaign.list({ page: 2, pageSize: 2, search: prefix });

    expect(all.total).toBe(6);
    expect(all.items).toHaveLength(2);
    expect(all.totalPages).toBe(3);
    expect(active.items).toHaveLength(3);
    expect(active.items.every((campaign) => campaign.status === "active")).toBe(true);
    expect(secondPage.items).toHaveLength(2);
  });

  it("returns only active campaigns currently within their date range to creators", async () => {
    const result = await creatorCaller.campaign.active({ page: 1, pageSize: 50 });
    const returnedIds = result.items.map((campaign) => campaign.id);

    expect(returnedIds).toContain(validActiveCampaignId);
    expect(returnedIds).not.toContain(futureActiveCampaignId);
    expect(returnedIds).not.toContain(expiredActiveCampaignId);
    expect(result.items.some((campaign) => campaign.title === `${prefix} draft`)).toBe(false);
    expect(result.items.some((campaign) => campaign.title === `${prefix} paused`)).toBe(false);
    expect(result.items.some((campaign) => campaign.title === `${prefix} completed`)).toBe(false);
    await expect(creatorCaller.campaign.byId({ campaignId: pausedCampaignId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updates an eligible campaign and advances its update timestamp", async () => {
    const before = await adminCaller.campaign.byId({ campaignId: validActiveCampaignId });
    const updated = await adminCaller.campaign.update({
      campaignId: validActiveCampaignId,
      ...campaignInput(`${prefix} searchable active updated`, "active"),
    });

    expect(updated.title).toBe(`${prefix} searchable active updated`);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  });

  it("does not allow completed campaigns to move back to another status", async () => {
    await expect(
      adminCaller.campaign.update({
        campaignId: completedCampaignId,
        ...campaignInput(`${prefix} completed changed`, "draft"),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
