import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Rebuilds the dedicated test database from migrations once per run, so every run starts
 * from the same schema. Refuses to touch any database whose name does not contain "test".
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example). Start Postgres with `npm run db:start`.");
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName)) throw new Error(`Refusing to run tests against "${dbName}": the test database name must contain "test".`);

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await prisma.$disconnect();
  }
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
