"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { api } from "@/trpc/react";

const statuses = ["", "draft", "active", "paused", "completed"] as const;

export default function AdminCampaignsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("");
  const [page, setPage] = useState(1);
  const campaigns = api.campaign.list.useQuery({
    page,
    pageSize: 10,
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Campaigns</h1>
          <p className="mt-1 text-sm text-slate-600">Manage campaign configuration.</p>
        </div>
        <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/admin/campaigns/new">
          Create campaign
        </Link>
      </div>

      <form className="mt-8 flex flex-wrap gap-3" onSubmit={submitSearch}>
        <label className="sr-only" htmlFor="campaign-search">Search campaigns</label>
        <input className="rounded-md border px-3 py-2" id="campaign-search" onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title" value={searchInput} />
        <label className="sr-only" htmlFor="campaign-status">Campaign status</label>
        <select
          className="rounded-md border px-3 py-2"
          id="campaign-status"
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as (typeof statuses)[number]);
          }}
          value={status}
        >
          <option value="">All statuses</option>
          {statuses.slice(1).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <button className="rounded-md border px-4 py-2 text-sm font-medium" type="submit">Search</button>
      </form>

      {campaigns.isLoading ? <p className="mt-8 text-sm text-slate-600">Loading campaigns...</p> : null}
      {campaigns.error ? <p className="mt-8 text-sm text-red-700">Unable to load campaigns.</p> : null}

      {campaigns.data ? (
        <>
          {campaigns.data.items.length === 0 ? (
            <p className="mt-8 text-sm text-slate-600">{search || status ? "No campaigns match these filters." : "No campaigns yet."}</p>
          ) : (
            <div className="mt-8 overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3 font-medium">Title</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Platforms</th><th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {campaigns.data.items.map((campaign) => (
                    <tr className="border-t" key={campaign.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{campaign.title}</td>
                      <td className="px-4 py-3 capitalize">{campaign.status}</td>
                      <td className="px-4 py-3 capitalize">{campaign.platforms.join(", ")}</td>
                      <td className="px-4 py-3 text-right"><Link className="text-slate-900 underline" href={`/admin/campaigns/${campaign.id}`}>Details</Link><Link className="ml-4 text-slate-900 underline" href={`/admin/campaigns/${campaign.id}/edit`}>Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex items-center justify-between text-sm">
            <span>Page {campaigns.data.page} of {Math.max(campaigns.data.totalPages, 1)} ({campaigns.data.total} total)</span>
            <div className="flex gap-2">
              <button className="rounded-md border px-3 py-2 disabled:opacity-50" disabled={page === 1} onClick={() => setPage((current) => current - 1)} type="button">Previous</button>
              <button className="rounded-md border px-3 py-2 disabled:opacity-50" disabled={page >= campaigns.data.totalPages} onClick={() => setPage((current) => current + 1)} type="button">Next</button>
            </div>
          </div>
        </>
      ) : null}
    </main>
  );
}
