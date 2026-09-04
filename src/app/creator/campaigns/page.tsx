"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/trpc/react";

function formatDate(value: Date | string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value)); }

export default function CreatorCampaignsPage() {
  const [page, setPage] = useState(1);
  const campaigns = api.campaign.active.useQuery({ page, pageSize: 20 });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Available campaigns</h1>
      {campaigns.isLoading ? <p className="mt-8 text-sm text-slate-600">Loading campaigns...</p> : null}
      {campaigns.error ? <p className="mt-8 text-sm text-red-700">Unable to load campaigns.</p> : null}
      {campaigns.data?.items.length === 0 ? <p className="mt-8 text-sm text-slate-600">No campaigns are available right now.</p> : null}
      {campaigns.data?.items.length ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {campaigns.data.items.map((campaign) => (
            <article className="rounded-lg border bg-white p-5" key={campaign.id}>
              <h2 className="font-semibold text-slate-900">{campaign.title}</h2>
              <p className="mt-2 text-sm capitalize text-slate-600">{campaign.platforms.join(", ")}</p>
              <p className="mt-1 text-sm text-slate-600">{campaign.payoutPer1kViews} cents per 1k views</p>
              <p className="mt-1 text-sm text-slate-600">{formatDate(campaign.startsAt)} to {formatDate(campaign.endsAt)}</p>
              <Link className="mt-4 inline-block text-sm font-medium underline" href={`/creator/campaigns/${campaign.id}`}>View campaign</Link>
            </article>
          ))}
        </div>
      ) : null}
      {campaigns.data ? (
        <div className="mt-6 flex gap-2">
          <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">Previous</button>
          <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={page >= campaigns.data.totalPages} onClick={() => setPage((current) => current + 1)} type="button">Next</button>
        </div>
      ) : null}
    </main>
  );
}
