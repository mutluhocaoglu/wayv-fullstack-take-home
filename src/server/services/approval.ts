import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@/server/db";
import {
  getCampaignSpend,
  getLatestSubmissionViews,
} from "@/server/services/campaign-spend";
import { calculatePayout } from "@/server/services/payout";

type SqlRow = Record<string, unknown>;
type SqlExecutor = {
  execute(query: SQL): PromiseLike<SqlRow[]>;
};

type ApprovalSubmission = {
  id: string;
  campaignId: string;
  status: string;
  updatedAt: Date;
};

export class SubmissionNotFoundError extends Error {}
export class InvalidSubmissionStateError extends Error {}
export class InsufficientCampaignBudgetError extends Error {}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return value;
  }

  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }

  throw new Error("Expected an integer database value.");
}

export async function approveSubmission(database: Database, submissionId: string) {
  return database.transaction(async (transaction) => {
    const executor = transaction as unknown as SqlExecutor;
    const targetRows = await executor.execute(sql`
      SELECT id, campaign_id AS "campaignId", status
      FROM submissions
      WHERE id = ${submissionId}
      LIMIT 1
    `);
    const targetSubmission = targetRows[0] as ApprovalSubmission | undefined;

    if (!targetSubmission) {
      throw new SubmissionNotFoundError("Submission not found.");
    }

    if (targetSubmission.status !== "pending") {
      throw new InvalidSubmissionStateError("Only pending submissions can be approved.");
    }

    const lockedCampaignRows = await executor.execute(sql`
      SELECT id, total_budget AS "totalBudget", payout_per_1k_views AS "payoutPer1kViews"
      FROM campaigns
      WHERE id = ${targetSubmission.campaignId}
      FOR UPDATE
    `);
    const lockedCampaign = lockedCampaignRows[0] as
      | { id: string; totalBudget: unknown; payoutPer1kViews: unknown }
      | undefined;

    if (!lockedCampaign) {
      throw new SubmissionNotFoundError("Campaign not found.");
    }

    const refreshedSubmissionRows = await executor.execute(sql`
      SELECT status
      FROM submissions
      WHERE id = ${submissionId}
      LIMIT 1
    `);
    const refreshedSubmission = refreshedSubmissionRows[0] as { status: string } | undefined;

    if (!refreshedSubmission || refreshedSubmission.status !== "pending") {
      throw new InvalidSubmissionStateError("Only pending submissions can be approved.");
    }

    const payoutPer1kViews = toNumber(lockedCampaign.payoutPer1kViews);
    const totalBudget = BigInt(toNumber(lockedCampaign.totalBudget));
    const targetViews = await getLatestSubmissionViews(executor, submissionId);
    const targetPayout = calculatePayout(targetViews, payoutPer1kViews);
    const currentSpend = await getCampaignSpend(
      executor,
      lockedCampaign.id,
      payoutPer1kViews,
    );
    const remainingBudget = totalBudget - currentSpend;

    if (targetPayout > remainingBudget) {
      throw new InsufficientCampaignBudgetError("Campaign budget is insufficient.");
    }

    const now = new Date().toISOString();
    const approvedRows = await executor.execute(sql`
      UPDATE submissions
      SET status = 'approved', updated_at = ${now}
      WHERE id = ${submissionId} AND status = 'pending'
      RETURNING id, campaign_id AS "campaignId", status, updated_at AS "updatedAt"
    `);
    const approvedSubmission = approvedRows[0] as ApprovalSubmission | undefined;

    if (!approvedSubmission) {
      throw new InvalidSubmissionStateError("Only pending submissions can be approved.");
    }

    const remainingBudgetAfterApproval = totalBudget - (currentSpend + targetPayout);
    const campaignCompleted = remainingBudgetAfterApproval === 0n;

    if (campaignCompleted) {
      await executor.execute(sql`
        UPDATE campaigns
        SET status = 'completed', updated_at = ${now}
        WHERE id = ${lockedCampaign.id}
      `);
    }

    return {
      submission: approvedSubmission,
      targetPayout,
      remainingBudget: remainingBudgetAfterApproval,
      campaignCompleted,
    };
  });
}
