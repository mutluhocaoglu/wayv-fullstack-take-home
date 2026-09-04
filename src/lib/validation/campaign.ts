import { z } from "zod";
import { campaignStatusEnum, platformEnum } from "@/server/db/schema";

const maxInteger = 2_147_483_647;

export const platformValues = platformEnum.enumValues;
export const campaignStatusValues = campaignStatusEnum.enumValues;

export const platformSchema = z.enum(platformValues);
export const campaignStatusSchema = z.enum(campaignStatusValues);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const campaignFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(255),
    platforms: z.array(platformSchema).min(1, "Select at least one platform."),
    payoutPer1kViews: z.coerce.number().int().min(0).max(maxInteger),
    totalBudget: z.coerce.number().int().min(0).max(maxInteger),
    status: campaignStatusSchema,
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine(({ startsAt, endsAt }) => endsAt > startsAt, {
    message: "End date must be after the start date.",
    path: ["endsAt"],
  });

export const campaignListInputSchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(255).optional(),
  status: campaignStatusSchema.optional(),
});

export const campaignIdSchema = z.object({
  campaignId: z.string().uuid(),
});

export const campaignUpdateInputSchema = campaignIdSchema.merge(campaignFormSchema);

export type CampaignFormValues = z.output<typeof campaignFormSchema>;
export type CampaignFormInput = z.input<typeof campaignFormSchema>;
