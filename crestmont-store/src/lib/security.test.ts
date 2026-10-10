import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { products } from "@/catalog/products";
import { commerce } from "@/config/commerce";
import { operations } from "@/config/operations";

import { exposedSecretVariables, isOrderDatabaseEnabled, parseDatabaseUrl } from "./db/config";
import { FULFILLMENT_STATUSES, MOVEMENT_TYPES, PAYMENT_STATUSES, SHIPMENT_STATUSES } from "./orders/types";

const root = path.join(__dirname, "..", "..");
function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "generated"].includes(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else out.push(p);
  }
  return out;
}
const source = files(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
const nonTest = source.filter((f) => !f.endsWith(".test.ts"));

/** Modules that hold credentials or perform privileged writes. */
const SERVER_ONLY = ["@/lib/db/prisma", "@/lib/db/client-factory", "@/lib/orders/repository", "@/lib/orders/service", "@/lib/orders/webhook", "@/lib/stripe", "@/lib/deliver", "@/lib/rate-limit", "@/generated/prisma"];

describe("server-only database access", () => {
  it("no client component imports a database, payment or other server-only module", () => {
    for (const f of source) {
      const text = readFileSync(f, "utf8");
      if (!/^["']use client["']/m.test(text)) continue;
      for (const mod of SERVER_ONLY) {
        const valueImport = new RegExp(`^import (?!type )[^;]*from ["']${mod.replace(/\//g, "\\/")}[^"']*["']`, "m");
        expect(valueImport.test(text), `${path.relative(root, f)} imports ${mod}`).toBe(false);
      }
    }
  });

  it("credential-bearing modules are guarded with server-only", () => {
    for (const rel of ["src/lib/db/prisma.ts", "src/lib/orders/repository.ts", "src/lib/orders/webhook.ts", "src/lib/stripe.ts", "src/lib/deliver.ts", "src/lib/rate-limit.ts"]) {
      expect(readFileSync(path.join(root, rel), "utf8")).toMatch(/^import "server-only";/m);
    }
  });

  it("DATABASE_URL is read in exactly one module, and never through a public variable", () => {
    const readers = nonTest.filter((f) => /env(\.|\[")DATABASE_URL/.test(readFileSync(f, "utf8")));
    expect(readers.map((f) => path.relative(root, f))).toEqual(["src/lib/db/config.ts"]);
    expect(nonTest.some((f) => /NEXT_PUBLIC_[A-Z_]*(DATABASE|PASSWORD|SECRET)/.test(readFileSync(f, "utf8")))).toBe(false);
  });

  it("only the server-only prisma module creates the production client", () => {
    const users = nonTest.filter((f) => /createPrismaClient\(/.test(readFileSync(f, "utf8")) && !f.endsWith("client-factory.ts"));
    expect(users.map((f) => path.relative(root, f))).toEqual(["src/lib/db/prisma.ts"]);
  });

  it("flags credentials placed in public variables", () => {
    expect(exposedSecretVariables({ NEXT_PUBLIC_DATABASE_URL: "mysql://x", NEXT_PUBLIC_SITE_URL: "https://a.test" })).toEqual(["NEXT_PUBLIC_DATABASE_URL"]);
  });

  it("parses MySQL connection strings and rejects anything else", () => {
    expect(parseDatabaseUrl("mysql://u_1:p%40ss@db.host.test:3306/crestmont?connectionLimit=3")).toMatchObject({
      host: "db.host.test",
      port: 3306,
      user: "u_1",
      password: "p@ss",
      database: "crestmont",
      connectionLimit: 3,
    });
    expect(parseDatabaseUrl("postgres://u:p@h/db")).toBeNull();
    expect(parseDatabaseUrl("mysql://h/db")).toBeNull();
    expect(parseDatabaseUrl("")).toBeNull();
  });

  it("the database stays disabled until the operator switches it on, even with DATABASE_URL present", () => {
    expect(operations.orderDatabaseEnabled).toBe(false);
    expect(isOrderDatabaseEnabled({ DATABASE_URL: "mysql://u:p@h:3306/db" })).toBe(false);
  });
});

describe("domain types match the Prisma schema", () => {
  const schema = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
  const enumValues = (name: string) =>
    (new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema)?.[1] ?? "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*/, "").trim())
      .filter(Boolean);
  it("status enums are identical", () => {
    expect(enumValues("PaymentStatus")).toEqual([...PAYMENT_STATUSES]);
    expect(enumValues("FulfillmentStatus")).toEqual([...FULFILLMENT_STATUSES]);
    expect(enumValues("ShipmentStatus")).toEqual([...SHIPMENT_STATUSES]);
    expect(enumValues("MovementType")).toEqual([...MOVEMENT_TYPES]);
  });
});

describe("no committed credentials", () => {
  // The scanner itself contains the patterns, so it is excluded.
  const all = files(root).filter((f) => !/\.(png|jpg|ico|woff2?)$/.test(f) && !f.endsWith("package-lock.json") && f !== __filename);
  it("contains no Stripe, database, Resend or JWT secrets", () => {
    const patterns = [
      /sk_(live|test)_[A-Za-z0-9]{10,}/,
      /rk_(live|test)_[A-Za-z0-9]{10,}/,
      /whsec_[A-Za-z0-9]{10,}/,
      /re_[A-Za-z0-9]{20,}/,
      /eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
      // mysql://user:password@remote-host — a real-looking credential. Documented
      // placeholders (PASSWORD, <password>) and local test servers are allowed.
      /mysql:\/\/[^:\s/]+:(?!PASSWORD@|<password>@)[^@\s]{6,}@(?!127\.0\.0\.1|localhost|HOST|db\.host\.test|h[:/])/,
    ];
    for (const f of all) {
      const text = readFileSync(f, "utf8");
      for (const p of patterns) expect(p.test(text), `${path.relative(root, f)} matches ${p}`).toBe(false);
    }
  });

  it(".env.example holds placeholders only", () => {
    const lines = readFileSync(path.join(root, ".env.example"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l));
    for (const l of lines) {
      const [key, value] = l.split("=");
      expect(value === "" || (key === "STRIPE_AUTOMATIC_TAX" && value === "false"), l).toBe(true);
    }
  });
});

describe("this phase changes no commercial state", () => {
  it("payments remain disabled and no product is active", () => {
    expect(commerce.paymentsEnabled).toBe(false);
    expect(products.filter((p) => p.status === "active")).toHaveLength(0);
  });
});
