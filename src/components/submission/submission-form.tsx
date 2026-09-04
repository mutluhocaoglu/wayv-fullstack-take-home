"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  submissionCreateSchema,
  type SubmissionCreateInput,
  type SubmissionCreateValues,
} from "@/lib/validation/submission";

type SubmissionFormProps = {
  campaignId: string;
  error?: string;
  isPending: boolean;
  platforms: SubmissionCreateInput["platform"][];
  onSubmit: (values: SubmissionCreateValues) => void;
};

export function SubmissionForm({ campaignId, error, isPending, onSubmit, platforms }: SubmissionFormProps) {
  const form = useForm<SubmissionCreateInput, unknown, SubmissionCreateValues>({
    resolver: zodResolver(submissionCreateSchema),
    defaultValues: { campaignId, postUrl: "", platform: platforms[0]! },
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <input type="hidden" {...form.register("campaignId")} />
      <label className="block text-sm font-medium text-slate-800">
        Platform
        <select className="mt-1 w-full rounded-md border px-3 py-2" {...form.register("platform")}>
          {platforms.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
        </select>
        {form.formState.errors.platform ? <span className="mt-1 block text-sm text-red-700">{form.formState.errors.platform.message}</span> : null}
      </label>
      <label className="block text-sm font-medium text-slate-800">
        Post URL
        <input className="mt-1 w-full rounded-md border px-3 py-2" placeholder="https://..." type="url" {...form.register("postUrl")} />
        {form.formState.errors.postUrl ? <span className="mt-1 block text-sm text-red-700">{form.formState.errors.postUrl.message}</span> : null}
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={isPending} type="submit">{isPending ? "Submitting..." : "Submit clip"}</button>
    </form>
  );
}
