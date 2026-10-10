import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (migrations, generate).
 *
 * DATABASE_URL is read from the environment of the shell running the CLI —
 * it is never committed. Format: mysql://USER:PASSWORD@HOST:PORT/DATABASE
 * See docs/HOSTINGER_SETUP.md.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
