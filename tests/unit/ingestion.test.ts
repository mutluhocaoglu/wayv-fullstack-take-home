import { describe, expect, it } from "vitest";
import { isSubmissionMetricUniqueViolation } from "@/server/services/ingestion";

describe("submission metric unique violation detection", () => {
  it("matches only the submission/day uniqueness constraint", () => {
    expect(
      isSubmissionMetricUniqueViolation({
        code: "23505",
        constraint_name: "submission_metrics_submission_id_captured_at_unique",
      }),
    ).toBe(true);
    expect(
      isSubmissionMetricUniqueViolation({
        cause: {
          code: "23505",
          constraint_name: "submission_metrics_submission_id_captured_at_unique",
        },
      }),
    ).toBe(true);
    expect(
      isSubmissionMetricUniqueViolation({
        code: "23505",
        constraint_name: "submissions_campaign_id_post_url_unique",
      }),
    ).toBe(false);
  });
});
