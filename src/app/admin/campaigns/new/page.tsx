"use client";

import { useRouter } from "next/navigation";
import { CampaignForm } from "@/components/campaign/campaign-form";
import type { CampaignFormValues } from "@/lib/validation/campaign";
import { api } from "@/trpc/react";

export default function NewCampaignPage() {
  const router = useRouter();
  const createCampaign = api.campaign.create.useMutation({ onSuccess: (campaign) => router.push(`/admin/campaigns/${campaign.id}`) });
  return <main className="mx-auto max-w-2xl px-6 py-10"><h1 className="text-2xl font-semibold text-slate-900">Create campaign</h1><div className="mt-8 rounded-lg border bg-white p-6"><CampaignForm error={createCampaign.error?.message} isPending={createCampaign.isPending} onSubmit={(values: CampaignFormValues) => createCampaign.mutate(values)} submitLabel="Create campaign" /></div></main>;
}
