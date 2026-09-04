"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CampaignSummary } from "@/components/campaign/campaign-summary";
import { api } from "@/trpc/react";

export default function AdminCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaign = api.campaign.byId.useQuery({ campaignId: params.id });
  if (campaign.isLoading) return <main className="p-8">Loading campaign...</main>;
  if (campaign.error) return <main className="p-8">Unable to load campaign.</main>;
  if (!campaign.data) return null;
  return <main className="mx-auto max-w-3xl px-6 py-10"><div className="flex items-center justify-between gap-4"><h1 className="text-2xl font-semibold text-slate-900">{campaign.data.title}</h1><Link className="rounded-md border px-4 py-2 text-sm font-medium" href={`/admin/campaigns/${campaign.data.id}/edit`}>Edit campaign</Link></div><section className="mt-8 rounded-lg border bg-white p-6"><CampaignSummary campaign={campaign.data} /></section></main>;
}
