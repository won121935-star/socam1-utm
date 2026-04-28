// Turso DB에 prisma migration SQL 적용.
// 사용: DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/turso-migrate.mjs

import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const url = process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) {
  console.error("DATABASE_URL 가 필요합니다.");
  process.exit(1);
}

const client = createClient({ url, authToken });
const migrationsDir = "./prisma/migrations";
const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

console.log(`마이그레이션 ${dirs.length}개:\n  ${dirs.join("\n  ")}\n`);

for (const dir of dirs) {
  const sqlPath = join(migrationsDir, dir, "migration.sql");
  const sql = readFileSync(sqlPath, "utf-8");
  const stmts = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  console.log(`▶ ${dir} — ${stmts.length} statements`);
  for (const stmt of stmts) {
    try {
      await client.execute(stmt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/already exists/i.test(msg)) {
        process.stdout.write(".");
        continue;
      }
      console.error(`\n  ❌ ${msg}\n  SQL: ${stmt.slice(0, 100)}`);
      process.exit(1);
    }
  }
  console.log("  ✅");
}

console.log("\n=== 테이블 ===");
const tables = await client.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
);
console.log(tables.rows.map((r) => "  - " + r.name).join("\n"));
