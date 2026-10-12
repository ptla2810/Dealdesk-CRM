/**
 * Runs a real PostgreSQL server for local development without Docker or a
 * system install, using the `embedded-postgres` binaries in node_modules.
 *
 *   npm run db:start      # keep this running in its own terminal
 *
 * Data is persisted in ./.pgdata. Creates the `salesflow` and `salesflow_test`
 * databases on first start. Not intended for production — point DATABASE_URL
 * at a managed PostgreSQL instance there.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const databaseDir = path.resolve(process.cwd(), ".pgdata");
const firstRun = !existsSync(path.join(databaseDir, "PG_VERSION"));

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
  onLog: () => {},
});

async function main() {
  if (firstRun) {
    console.log(`Initialising new cluster in ${databaseDir} …`);
    await pg.initialise();
  }
  await pg.start();
  if (firstRun) {
    await pg.createDatabase("salesflow");
    await pg.createDatabase("salesflow_test");
  }
  console.log(`PostgreSQL listening on postgresql://postgres:postgres@localhost:${port}`);
  console.log("Databases: salesflow, salesflow_test. Press Ctrl+C to stop.");
}

async function shutdown() {
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch(async (err) => {
  console.error(err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
// Keep the process alive while the server runs.
setInterval(() => {}, 1 << 30);
