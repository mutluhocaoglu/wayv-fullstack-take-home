export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <section className="w-full max-w-2xl rounded-2xl border bg-white p-10 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Wayv take-home bootstrap
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          The application foundation is in place. Feature pages, CRUD flows,
          auth switching, approvals, ingestion, and analytics are intentionally
          left for later implementation steps.
        </p>
      </section>
    </main>
  );
}
