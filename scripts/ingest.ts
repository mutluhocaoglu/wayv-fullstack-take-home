import "./load-env";
import { db, sqlClient } from "../src/server/db";
import { ingestApprovedSubmissions } from "../src/server/services/ingestion";

async function main() {
  const date = new Date().toISOString().slice(0, 10);
  const summary = await ingestApprovedSubmissions(db, { date });

  console.log(`Metrics ingestion for ${date}`);
  console.log(`Created: ${summary.created.length}`);
  console.log(`Skipped: ${summary.skipped.length}`);
  console.log(`Failed: ${summary.failed.length}`);

  for (const failure of summary.failed) {
    console.error(`Failed ${failure.submissionId}: ${failure.reason}`);
  }

  if (summary.failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch(() => {
    console.error("Metrics ingestion failed unexpectedly.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end();
  });
