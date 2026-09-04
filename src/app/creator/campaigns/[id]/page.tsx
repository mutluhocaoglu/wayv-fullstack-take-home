"use client";

import { useParams, useRouter } from "next/navigation";
import { CampaignSummary } from "@/components/campaign/campaign-summary";
import { SubmissionForm } from "@/components/submission/submission-form";
import type { SubmissionCreateValues } from "@/lib/validation/submission";
import { api } from "@/trpc/react";

export default function CreatorCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const campaign = api.campaign.byId.useQuery({ campaignId: params.id });
  const createSubmission = api.submission.create.useMutation({ onSuccess: () => router.push("/creator/submissions") });

  if (campaign.isLoading) return <main className="p-8">Loading campaign...</main>;
  if (campaign.error) return <main className="p-8">Campaign unavailable.</main>;
  if (!campaign.data) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">{campaign.data.title}</h1>
      <section className="mt-8 rounded-lg border bg-white p-6"><CampaignSummary campaign={campaign.data} /></section>
      <section className="mt-6 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold text-slate-900">Submit a clip</h2>
        <p className="mt-1 text-sm text-slate-600">Choose a platform enabled for this campaign.</p>
        <div className="mt-5"><SubmissionForm campaignId={campaign.data.id} error={createSubmission.error?.message} isPending={createSubmission.isPending} onSubmit={(values: SubmissionCreateValues) => createSubmission.mutate(values)} platforms={campaign.data.platforms} /></div>
      </section>
    </main>
  );
}
