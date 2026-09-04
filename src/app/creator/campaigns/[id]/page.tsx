"use client";

import { useParams } from "next/navigation";
import { CampaignSummary } from "@/components/campaign/campaign-summary";
import { api } from "@/trpc/react";

export default function CreatorCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaign = api.campaign.byId.useQuery({ campaignId: params.id });
  if (campaign.isLoading) return <main className="p-8">Loading campaign...</main>;
  if (campaign.error) return <main className="p-8">Campaign unavailable.</main>;
  if (!campaign.data) return null;
  return <main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-semibold text-slate-900">{campaign.data.title}</h1><section className="mt-8 rounded-lg border bg-white p-6"><CampaignSummary campaign={campaign.data} /></section></main>;
}
