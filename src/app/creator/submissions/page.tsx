"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";

function formatDate(value: Date | string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)); }

export default function CreatorSubmissionsPage() {
  const [page, setPage] = useState(1);
  const submissions = api.submission.mine.useQuery({ page, pageSize: 10 });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">My submissions</h1>
      {submissions.isLoading ? <p className="mt-8 text-sm text-slate-600">Loading submissions...</p> : null}
      {submissions.error ? <p className="mt-8 text-sm text-red-700">Unable to load submissions.</p> : null}
      {submissions.data?.items.length === 0 ? <p className="mt-8 text-sm text-slate-600">You have not submitted any clips yet.</p> : null}
      {submissions.data?.items.length ? (
        <div className="mt-8 overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-medium">Campaign</th><th className="px-4 py-3 font-medium">Post URL</th><th className="px-4 py-3 font-medium">Platform</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Created</th></tr></thead>
            <tbody>{submissions.data.items.map((submission) => <tr className="border-t" key={submission.id}><td className="px-4 py-3 font-medium text-slate-900">{submission.campaignTitle}</td><td className="max-w-xs truncate px-4 py-3"><Link className="underline" href={`/creator/submissions/${submission.id}`}>{submission.postUrl}</Link></td><td className="px-4 py-3 capitalize">{submission.platform}</td><td className="px-4 py-3 capitalize">{submission.status}</td><td className="px-4 py-3">{formatDate(submission.createdAt)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
      {submissions.data ? <div className="mt-6 flex gap-2"><button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">Previous</button><button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={page >= submissions.data.totalPages} onClick={() => setPage((current) => current + 1)} type="button">Next</button></div> : null}
    </main>
  );
}
