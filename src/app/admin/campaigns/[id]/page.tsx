"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CampaignSummary } from "@/components/campaign/campaign-summary";
import { api } from "@/trpc/react";

const insufficientBudgetMessage =
  "This submission cannot be approved because the campaign budget is insufficient.";

export default function AdminCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const utils = api.useUtils();
  const [rejectingSubmissionId, setRejectingSubmissionId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const campaign = api.campaign.byId.useQuery({ campaignId: params.id });
  const queue = api.submission.pendingByCampaign.useQuery({
    campaignId: params.id,
    page: 1,
    pageSize: 20,
  });
  const refreshQueue = async () => {
    await Promise.all([
      utils.submission.pendingByCampaign.invalidate({
        campaignId: params.id,
        page: 1,
        pageSize: 20,
      }),
      utils.campaign.byId.invalidate({ campaignId: params.id }),
    ]);
  };
  const approve = api.submission.approve.useMutation({ onSuccess: refreshQueue });
  const reject = api.submission.reject.useMutation({
    onSuccess: async () => {
      setRejectingSubmissionId(null);
      setRejectionReason("");
      await refreshQueue();
    },
  });

  if (campaign.isLoading) return <main className="p-8">Loading campaign...</main>;
  if (campaign.error) return <main className="p-8">Unable to load campaign.</main>;
  if (!campaign.data) return null;

  const approvalError = approve.error?.message === "INSUFFICIENT_CAMPAIGN_BUDGET"
    ? insufficientBudgetMessage
    : approve.error?.message;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900">{campaign.data.title}</h1>
        <Link className="rounded-md border px-4 py-2 text-sm font-medium" href={`/admin/campaigns/${campaign.data.id}/edit`}>Edit campaign</Link>
      </div>
      <section className="mt-8 rounded-lg border bg-white p-6"><CampaignSummary campaign={campaign.data} /></section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold text-slate-900">Review queue</h2>
        {queue.isLoading ? <p className="mt-4 text-sm text-slate-600">Loading pending submissions...</p> : null}
        {queue.error ? <p className="mt-4 text-sm text-red-700">Unable to load the review queue.</p> : null}
        {queue.data?.items.length === 0 ? <p className="mt-4 text-sm text-slate-600">No pending submissions.</p> : null}
        {approvalError ? <p className="mt-4 text-sm text-red-700">{approvalError}</p> : null}
        {queue.data?.items.length ? (
          <div className="mt-4 overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-medium">Creator</th><th className="px-4 py-3 font-medium">Platform</th><th className="px-4 py-3 font-medium">Post URL</th><th className="px-4 py-3 font-medium">Views</th><th className="px-4 py-3 font-medium">Estimated payout</th><th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {queue.data.items.map((submission) => (
                  <tr className="border-t" key={submission.id}>
                    <td className="px-4 py-3">{submission.creatorEmail}</td>
                    <td className="px-4 py-3 capitalize">{submission.platform}</td>
                    <td className="max-w-xs truncate px-4 py-3"><a className="underline" href={submission.postUrl} rel="noreferrer" target="_blank">{submission.postUrl}</a></td>
                    <td className="px-4 py-3">{submission.latestViews}</td>
                    <td className="px-4 py-3">{submission.estimatedPayoutCents} cents</td>
                    <td className="px-4 py-3 text-right">
                      <button className="rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50" disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate({ submissionId: submission.id })} type="button">{approve.isPending ? "Approving..." : "Approve"}</button>
                      <button className="ml-2 rounded-md border px-3 py-2 disabled:opacity-50" disabled={approve.isPending || reject.isPending} onClick={() => { setRejectingSubmissionId(submission.id); setRejectionReason(""); }} type="button">Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {rejectingSubmissionId ? (
        <div aria-labelledby="reject-dialog-title" aria-modal="true" className="fixed inset-0 flex items-center justify-center bg-slate-900/40 p-6" role="dialog">
          <form className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg" onSubmit={(event) => { event.preventDefault(); reject.mutate({ submissionId: rejectingSubmissionId, rejectionReason }); }}>
            <h2 className="text-lg font-semibold text-slate-900" id="reject-dialog-title">Reject submission</h2>
            <label className="mt-4 block text-sm font-medium text-slate-800">Reason<textarea className="mt-1 w-full rounded-md border px-3 py-2" onChange={(event) => setRejectionReason(event.target.value)} required rows={4} value={rejectionReason} /></label>
            {reject.error ? <p className="mt-3 text-sm text-red-700">{reject.error.message}</p> : null}
            <div className="mt-4 flex justify-end gap-2"><button className="rounded-md border px-3 py-2" disabled={reject.isPending} onClick={() => setRejectingSubmissionId(null)} type="button">Cancel</button><button className="rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50" disabled={reject.isPending || rejectionReason.trim().length === 0} type="submit">{reject.isPending ? "Rejecting..." : "Reject"}</button></div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
