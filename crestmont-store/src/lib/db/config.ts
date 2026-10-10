import { operations } from "@/config/operations";

/**
 * Parses DATABASE_URL (server-side only; never NEXT_PUBLIC_).
 *
 *   mysql://USER:PASSWORD@HOST:PORT/DATABASE[?connectionLimit=5&ssl=true]
 *
 * Works with Hostinger's MySQL/MariaDB databases.
 */
export type DatabaseConnectionConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  ssl: boolean;
  allowPublicKeyRetrieval: boolean;
};

export function parseDatabaseUrl(raw: string | undefined): DatabaseConnectionConfig | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "mysql:" && url.protocol !== "mariadb:") return null;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!url.hostname || !url.username || !database) return null;
  const limit = Number(url.searchParams.get("connectionLimit") ?? 5);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    connectionLimit: Number.isInteger(limit) && limit > 0 && limit <= 50 ? limit : 5,
    ssl: url.searchParams.get("ssl") === "true",
    allowPublicKeyRetrieval: url.searchParams.get("allowPublicKeyRetrieval") === "true",
  };
}

export function readDatabaseConfig(env: Record<string, string | undefined> = process.env): DatabaseConnectionConfig | null {
  return parseDatabaseUrl(env.DATABASE_URL);
}

/**
 * Database features (order records, reservations, order lookup) are used only
 * when the operator has run the migrations and switched
 * operations.orderDatabaseEnabled on, AND DATABASE_URL is valid.
 */
export function isOrderDatabaseEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return operations.orderDatabaseEnabled && readDatabaseConfig(env) !== null;
}

/** Misconfiguration that must never ship: a credential exposed through a public variable. */
export function exposedSecretVariables(env: Record<string, string | undefined> = process.env): string[] {
  return Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && /DATABASE|PASSWORD|SECRET|PRIVATE|SERVICE_ROLE/i.test(k) && env[k]);
}
