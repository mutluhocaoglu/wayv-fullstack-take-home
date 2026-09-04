"use client";

import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";

export function DevUserSwitcher() {
  const router = useRouter();
  const users = api.auth.devUsers.useQuery();
  const switchUser = api.auth.switchUser.useMutation({
    onSuccess: (user) => {
      router.push(user.role === "admin" ? "/admin/campaigns" : "/creator/campaigns");
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <section className="w-full max-w-2xl rounded-2xl border bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Select a development user
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your selected user is stored in a signed, HTTP-only development cookie.
        </p>

        {users.isLoading ? <p className="mt-6 text-sm text-slate-600">Loading users...</p> : null}
        {users.error ? (
          <p className="mt-6 text-sm text-red-700">Unable to load development users.</p>
        ) : null}

        {users.data ? (
          <ul className="mt-6 space-y-3">
            {users.data.map((user) => (
              <li
                className="flex items-center justify-between gap-4 rounded-lg border p-4"
                key={user.id}
              >
                <div>
                  <p className="font-medium text-slate-900">{user.email}</p>
                  <p className="text-sm capitalize text-slate-600">{user.role}</p>
                </div>
                <button
                  className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={switchUser.isPending}
                  onClick={() => switchUser.mutate({ userId: user.id })}
                  type="button"
                >
                  {switchUser.isPending ? "Selecting..." : "Select"}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {switchUser.error ? (
          <p className="mt-4 text-sm text-red-700">Unable to switch development user.</p>
        ) : null}
      </section>
    </main>
  );
}
