import { z } from "zod";
import { paginationSchema, platformSchema } from "@/lib/validation/campaign";
import { submissionStatusEnum } from "@/server/db/schema";

const postUrlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL.")
  .transform((value) => new URL(value))
  .refine((url) => url.protocol === "https:" || url.protocol === "http:", {
    message: "Post URL must use HTTP or HTTPS.",
  })
  .transform((url) => url.toString());

function isValidPlatformPostUrl(
  platform: "tiktok" | "instagram" | "youtube",
  url: string,
) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  switch (platform) {
    case "tiktok":
      return (
        host === "tiktok.com" &&
        /^\/@[^/]+\/video\/\d+/.test(parsed.pathname)
      );

    case "instagram":
      return (
        host === "instagram.com" &&
        /^\/(p|reel|reels)\/[^/]+/.test(parsed.pathname)
      );

    case "youtube":
      return (
        (host === "youtube.com" &&
          ((parsed.pathname === "/watch" && parsed.searchParams.has("v")) ||
            /^\/shorts\/[^/]+/.test(parsed.pathname))) ||
        host === "youtu.be"
      );

    default:
      return false;
  }
}

export const submissionCreateSchema = z
  .object({
    campaignId: z.string().uuid(),
    postUrl: postUrlSchema,
    platform: platformSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!isValidPlatformPostUrl(value.platform, value.postUrl)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["postUrl"],
        message: `Enter a valid ${value.platform} post URL.`,
      });
    }
  });

export const submissionStatusSchema = z.enum(
  submissionStatusEnum.enumValues,
);

export const submissionMineInputSchema = paginationSchema.extend({
  status: submissionStatusSchema.optional(),
});

export const submissionIdSchema = z.object({
  submissionId: z.string().uuid(),
});

export type SubmissionCreateInput = z.input<typeof submissionCreateSchema>;
export type SubmissionCreateValues = z.output<typeof submissionCreateSchema>;