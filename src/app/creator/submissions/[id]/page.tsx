"use client";

import { useParams } from "next/navigation";
import { api } from "@/trpc/react";

function formatDate(value: Date | string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

export default function CreatorSubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const submission = api.submission.byId.useQuery({ submissionId: params.id });
  if (submission.isLoading) return <main className="p-8">Loading submission...</main>;
  if (submission.error) return <main className="p-8">Submission not found.</main>;
  if (!submission.data) return null;
  return <main className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-semibold text-slate-900">Submission details</h1><dl className="mt-8 grid gap-4 rounded-lg border bg-white p-6 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Campaign</dt><dd className="mt-1 text-slate-900">{submission.data.campaignTitle}</dd></div><div><dt className="text-slate-500">Platform</dt><dd className="mt-1 capitalize text-slate-900">{submission.data.platform}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Post URL</dt><dd className="mt-1 break-all text-slate-900">{submission.data.postUrl}</dd></div><div><dt className="text-slate-500">Status</dt><dd className="mt-1 capitalize text-slate-900">{submission.data.status}</dd></div><div><dt className="text-slate-500">Current views</dt><dd className="mt-1 text-slate-900">{submission.data.latestViews}</dd></div><div><dt className="text-slate-500">Estimated earnings</dt><dd className="mt-1 text-slate-900">{submission.data.estimatedPayoutCents} cents</dd></div><div><dt className="text-slate-500">Created</dt><dd className="mt-1 text-slate-900">{formatDate(submission.data.createdAt)}</dd></div>{submission.data.rejectionReason ? <div className="sm:col-span-2"><dt className="text-slate-500">Rejection reason</dt><dd className="mt-1 text-slate-900">{submission.data.rejectionReason}</dd></div> : null}</dl></main>;
}
