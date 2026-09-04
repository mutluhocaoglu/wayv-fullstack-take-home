import { sql, type SQL } from "drizzle-orm";
import { calculatePayout } from "@/server/services/payout";

type SqlRow = Record<string, unknown>;
type SqlExecutor = {
  execute(query: SQL): PromiseLike<SqlRow[]>;
};

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

export async function getLatestSubmissionViews(
  executor: SqlExecutor,
  submissionId: string,
) {
  const rows = await executor.execute(sql`
    SELECT views
    FROM submission_metrics
    WHERE submission_id = ${submissionId}
    ORDER BY captured_at DESC
    LIMIT 1
  `);

  return rows[0] ? toBigInt(rows[0].views) : 0n;
}

export async function getCampaignSpend(
  executor: SqlExecutor,
  campaignId: string,
  payoutPer1kViews: number,
) {
  const rows = await executor.execute(sql`
    SELECT COALESCE(SUM(COALESCE(latest_metric.views, 0)::bigint / 1000), 0)::bigint AS "thousandViewUnits"
    FROM submissions
    LEFT JOIN LATERAL (
      SELECT views
      FROM submission_metrics
      WHERE submission_id = submissions.id
      ORDER BY captured_at DESC
      LIMIT 1
    ) AS latest_metric ON true
    WHERE campaign_id = ${campaignId}
      AND status IN ('approved', 'paid')
  `);

  const thousandViewUnits = toBigInt(rows[0]?.thousandViewUnits ?? 0);
  return thousandViewUnits * BigInt(payoutPer1kViews);
}

export function payoutFromLatestViews(views: bigint, payoutPer1kViews: number) {
  return calculatePayout(views, payoutPer1kViews);
}
