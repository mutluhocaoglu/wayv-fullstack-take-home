import { describe, expect, it } from "vitest";
import {
  campaignStatusEnum,
  platformEnum,
  submissionStatusEnum,
  userRoleEnum,
} from "@/server/db/schema";

describe("schema enums", () => {
  it("exposes the expected enum values", () => {
    expect(userRoleEnum.enumValues).toEqual(["admin", "creator"]);
    expect(platformEnum.enumValues).toEqual(["tiktok", "instagram", "youtube"]);
    expect(campaignStatusEnum.enumValues).toEqual([
      "draft",
      "active",
      "paused",
      "completed",
    ]);
    expect(submissionStatusEnum.enumValues).toEqual([
      "pending",
      "approved",
      "rejected",
      "paid",
    ]);
  });
});
