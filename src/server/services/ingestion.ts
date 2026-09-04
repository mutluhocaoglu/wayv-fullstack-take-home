import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Database } from "@/server/db";
import { submissionMetrics, submissions } from "@/server/db/schema";

export type MetricValues = {
  views: bigint;
  likes: bigint;
  comments: bigint;
};

type ApprovedSubmission = {
  id: string;
};

export type MetricGenerator = (
  previousMetric: MetricValues | null,
  submission: ApprovedSubmission,
) => MetricValues;

export type IngestionSummary = {
  created: string[];
  skipped: string[];
  failed: Array<{ submissionId: string; reason: string }>;
};

type IngestionOptions = {
  date: string;
  generateMetric?: MetricGenerator;
  submissionIds?: string[];
};

function assertDateOnly(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Ingestion date must use YYYY-MM-DD.");
  }
}

function assertMetricIsValid(metric: MetricValues, previousMetric: MetricValues | null) {
  if (metric.views < 0n || metric.likes < 0n || metric.comments < 0n) {
    throw new Error("Generated metrics cannot be negative.");
  }

  if (previousMetric && metric.views < previousMetric.views) {
    throw new Error("Generated views cannot decrease.");
  }
}

export function generateFakeMetric(previousMetric: MetricValues | null): MetricValues {
  const previous = previousMetric ?? { views: 0n, likes: 0n, comments: 0n };
  const viewIncrease = BigInt(Math.floor(Math.random() * 901) + 100);

  return {
    views: previous.views + viewIncrease,
    likes: previous.likes + viewIncrease / 10n,
    comments: previous.comments + viewIncrease / 50n,
  };
}

export function isSubmissionMetricUniqueViolation(error: unknown) {
  const isTargetConstraint = (value: unknown) => {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const databaseError = value as { code?: string; constraint_name?: string };
    return (
      databaseError.code === "23505" &&
      databaseError.constraint_name ===
        "submission_metrics_submission_id_captured_at_unique"
    );
  };

  return (
    isTargetConstraint(error) ||
    isTargetConstraint((error as { cause?: unknown })?.cause)
  );
}

export async function ingestApprovedSubmissions(
  database: Database,
  options: IngestionOptions,
): Promise<IngestionSummary> {
  assertDateOnly(options.date);

  const generateMetric = options.generateMetric ?? generateFakeMetric;
  const summary: IngestionSummary = { created: [], skipped: [], failed: [] };

  if (options.submissionIds?.length === 0) {
    return summary;
  }

  const approvedSubmissions = await database
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.status, "approved"),
        options.submissionIds
          ? inArray(submissions.id, options.submissionIds)
          : undefined,
      ),
    );

  for (const submission of approvedSubmissions) {
    try {
      const existingToday = await database.query.submissionMetrics.findFirst({
        where: and(
          eq(submissionMetrics.submissionId, submission.id),
          eq(submissionMetrics.capturedAt, options.date),
        ),
      });

      if (existingToday) {
        summary.skipped.push(submission.id);
        continue;
      }

      const previousMetric = await database.query.submissionMetrics.findFirst({
        where: and(
          eq(submissionMetrics.submissionId, submission.id),
          lt(submissionMetrics.capturedAt, options.date),
        ),
        orderBy: [desc(submissionMetrics.capturedAt)],
      });
      const previousValues = previousMetric
        ? {
            views: previousMetric.views,
            likes: previousMetric.likes,
            comments: previousMetric.comments,
          }
        : null;
      const generatedMetric = generateMetric(previousValues, submission);

      assertMetricIsValid(generatedMetric, previousValues);

      try {
        await database.insert(submissionMetrics).values({
          submissionId: submission.id,
          capturedAt: options.date,
          ...generatedMetric,
        });
        summary.created.push(submission.id);
      } catch (error) {
        if (isSubmissionMetricUniqueViolation(error)) {
          summary.skipped.push(submission.id);
          continue;
        }

        throw error;
      }
    } catch {
      summary.failed.push({
        submissionId: submission.id,
        reason: "Unable to ingest metrics for this submission.",
      });
    }
  }

  return summary;
}
