"use client";

import { useParams, useRouter } from "next/navigation";
import { CampaignForm } from "@/components/campaign/campaign-form";
import type { CampaignFormValues } from "@/lib/validation/campaign";
import { api } from "@/trpc/react";

export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaign = api.campaign.byId.useQuery({ campaignId: params.id });
  const updateCampaign = api.campaign.update.useMutation({ onSuccess: (updatedCampaign) => router.push(`/admin/campaigns/${updatedCampaign.id}`) });
  if (campaign.isLoading) return <main className="p-8">Loading campaign...</main>;
  if (campaign.error || !campaign.data) return <main className="p-8">Unable to load campaign.</main>;
  return <main className="mx-auto max-w-2xl px-6 py-10"><h1 className="text-2xl font-semibold text-slate-900">Edit campaign</h1><div className="mt-8 rounded-lg border bg-white p-6"><CampaignForm defaultValues={campaign.data} error={updateCampaign.error?.message} isPending={updateCampaign.isPending} onSubmit={(values: CampaignFormValues) => updateCampaign.mutate({ campaignId: params.id, ...values })} submitLabel="Save changes" /></div></main>;
}
