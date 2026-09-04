"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import {
  campaignFormSchema,
  campaignStatusValues,
  platformValues,
  type CampaignFormInput,
  type CampaignFormValues,
} from "@/lib/validation/campaign";

type CampaignFormProps = {
  defaultValues?: Partial<Omit<CampaignFormValues, "startsAt" | "endsAt">> & {
    startsAt?: Date | string;
    endsAt?: Date | string;
  };
  error?: string;
  isPending: boolean;
  onSubmit: (values: CampaignFormValues) => void;
  submitLabel: string;
};

function toDateTimeLocal(value: Date | string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function CampaignForm({
  defaultValues,
  error,
  isPending,
  onSubmit,
  submitLabel,
}: CampaignFormProps) {
  const form = useForm<CampaignFormInput, unknown, CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      title: defaultValues?.title ?? "",
      platforms: defaultValues?.platforms ?? [],
      payoutPer1kViews: defaultValues?.payoutPer1kViews ?? 0,
      totalBudget: defaultValues?.totalBudget ?? 0,
      status: defaultValues?.status ?? "draft",
      startsAt: toDateTimeLocal(defaultValues?.startsAt),
      endsAt: toDateTimeLocal(defaultValues?.endsAt),
    } as z.input<typeof campaignFormSchema>,
  });

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <label className="block text-sm font-medium text-slate-800">
        Title
        <input className="mt-1 w-full rounded-md border px-3 py-2" {...form.register("title")} />
        {form.formState.errors.title ? (
          <span className="mt-1 block text-sm text-red-700">
            {form.formState.errors.title.message}
          </span>
        ) : null}
      </label>

      <fieldset>
        <legend className="text-sm font-medium text-slate-800">Platforms</legend>
        <div className="mt-2 flex gap-4">
          {platformValues.map((platform) => (
            <label className="flex items-center gap-2 text-sm" key={platform}>
              <input type="checkbox" value={platform} {...form.register("platforms")} />
              {platform}
            </label>
          ))}
        </div>
        {form.formState.errors.platforms ? (
          <span className="mt-1 block text-sm text-red-700">
            {form.formState.errors.platforms.message}
          </span>
        ) : null}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          Payout per 1k views (cents)
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            min="0"
            step="1"
            type="number"
            {...form.register("payoutPer1kViews")}
          />
          {form.formState.errors.payoutPer1kViews ? (
            <span className="mt-1 block text-sm text-red-700">
              {form.formState.errors.payoutPer1kViews.message}
            </span>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Total budget (cents)
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            min="0"
            step="1"
            type="number"
            {...form.register("totalBudget")}
          />
          {form.formState.errors.totalBudget ? (
            <span className="mt-1 block text-sm text-red-700">
              {form.formState.errors.totalBudget.message}
            </span>
          ) : null}
        </label>
      </div>

      <label className="block text-sm font-medium text-slate-800">
        Status
        <select className="mt-1 w-full rounded-md border px-3 py-2" {...form.register("status")}>
          {campaignStatusValues.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800">
          Starts at
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            type="datetime-local"
            {...form.register("startsAt")}
          />
          {form.formState.errors.startsAt ? (
            <span className="mt-1 block text-sm text-red-700">
              {form.formState.errors.startsAt.message}
            </span>
          ) : null}
        </label>

        <label className="block text-sm font-medium text-slate-800">
          Ends at
          <input
            className="mt-1 w-full rounded-md border px-3 py-2"
            type="datetime-local"
            {...form.register("endsAt")}
          />
          {form.formState.errors.endsAt ? (
            <span className="mt-1 block text-sm text-red-700">
              {form.formState.errors.endsAt.message}
            </span>
          ) : null}
        </label>
      </div>

      {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      <button
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
