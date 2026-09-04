import "./load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sqlClient } from "../src/server/db";

async function main() {
  await migrate(db, {
    migrationsFolder: "./drizzle",
  });

  console.log("Migrations applied");
}

main()
  .catch((error) => {
    console.error("Migration failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sqlClient.end();
  });
