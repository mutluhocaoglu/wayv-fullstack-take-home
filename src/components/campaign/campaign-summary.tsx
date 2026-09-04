type CampaignSummaryProps = {
  campaign: {
    title: string;
    platforms: string[];
    payoutPer1kViews: number;
    totalBudget: number;
    status: string;
    startsAt: Date | string;
    endsAt: Date | string;
  };
};

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CampaignSummary({ campaign }: CampaignSummaryProps) {
  return (
    <dl className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-slate-500">Status</dt>
        <dd className="mt-1 capitalize text-slate-900">{campaign.status}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Platforms</dt>
        <dd className="mt-1 capitalize text-slate-900">{campaign.platforms.join(", ")}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Starts at</dt>
        <dd className="mt-1 text-slate-900">{formatDate(campaign.startsAt)}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Ends at</dt>
        <dd className="mt-1 text-slate-900">{formatDate(campaign.endsAt)}</dd>
      </div>
      <div>
        <dt className="text-slate-500">Payout per 1k views</dt>
        <dd className="mt-1 text-slate-900">{campaign.payoutPer1kViews} cents</dd>
      </div>
      <div>
        <dt className="text-slate-500">Total budget</dt>
        <dd className="mt-1 text-slate-900">{campaign.totalBudget} cents</dd>
      </div>
    </dl>
  );
}
