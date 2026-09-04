import { eq, sql } from "drizzle-orm";
import { campaigns } from "@/server/db/schema";
import type { Database } from "@/server/db";
import { getCampaignSpend } from "@/server/services/campaign-spend";

type SqlRow = Record<string, unknown>;

function toBigInt(value: unknown) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string") {
    return BigInt(value);
  }

  throw new Error("Expected an integer database value.");
}

function toUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function eachUtcDate(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  const dates: string[] = [];

  for (let current = start; current <= end; current = new Date(current.getTime() + 86_400_000)) {
    dates.push(toUtcDate(current));
  }

  return dates;
}

export async function getCampaignAnalyticsSummary(database: Database, campaignId: string) {
  const [campaign] = await database
    .select({
      id: campaigns.id,
      payoutPer1kViews: campaigns.payoutPer1kViews,
      totalBudget: campaigns.totalBudget,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return null;
  }

  const [rows, budgetSpent] = await Promise.all([
    database.execute(sql`
      SELECT COALESCE(SUM(COALESCE(latest_metric.views, 0)), 0)::bigint AS "totalViews"
      FROM submissions
      LEFT JOIN LATERAL (
        SELECT views
        FROM submission_metrics
        WHERE submission_id = submissions.id
        ORDER BY captured_at DESC
        LIMIT 1
      ) AS latest_metric ON true
      WHERE campaign_id = ${campaign.id}
        AND status IN ('approved', 'paid')
    `),
    getCampaignSpend(database, campaign.id, campaign.payoutPer1kViews),
  ]);
  const totalViews = toBigInt((rows as SqlRow[])[0]?.totalViews ?? 0);
  const budgetLeft = BigInt(campaign.totalBudget) - budgetSpent;

  return {
    totalViews,
    budgetSpent,
    budgetLeft: budgetLeft > 0n ? budgetLeft : 0n,
  };
}

export async function getCampaignDailyViews(database: Database, campaignId: string) {
  const [campaign] = await database
    .select({
      id: campaigns.id,
      startsAt: campaigns.startsAt,
      endsAt: campaigns.endsAt,
    })
    .from(campaigns)
    .where(eq(campaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return null;
  }

  const startDate = toUtcDate(campaign.startsAt);
  const endDate = toUtcDate(campaign.endsAt);
  const rows = await database.execute(sql`
    SELECT
      submission_metrics.captured_at AS date,
      COALESCE(SUM(submission_metrics.views), 0)::bigint AS views
    FROM submission_metrics
    INNER JOIN submissions ON submissions.id = submission_metrics.submission_id
    WHERE submissions.campaign_id = ${campaign.id}
      AND submissions.status = 'approved'
      AND submission_metrics.captured_at >= ${startDate}
      AND submission_metrics.captured_at <= ${endDate}
    GROUP BY submission_metrics.captured_at
    ORDER BY submission_metrics.captured_at ASC
  `);
  const viewsByDate = new Map(
    (rows as SqlRow[]).map((row) => [
      row.date as string,
      toBigInt(row.views),
    ]),
  );

  return eachUtcDate(startDate, endDate).map((date) => ({
    date,
    views: viewsByDate.get(date) ?? 0n,
  }));
}
