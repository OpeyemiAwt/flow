import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = new URL("../scripts/railway-db-operation.mjs", import.meta.url);

test("production-shaped migration rehearsal refuses production or non-QA environments", () => {
  const sentinel = "rehearsal-admin-secret-sentinel";
  const result = spawnSync(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      FLOW_DB_OPERATION: "rehearse-production-migrations",
      FLOW_ENV: "production",
      RAILWAY_ENVIRONMENT_ID: "7b8f3541-d3c5-483c-831a-5c0fb335a288",
      FLOW_DB_TARGET: "production-empty-only",
      FLOW_EXECUTION: "disabled",
      FLOW_PROVIDER_COMPATIBILITY_MODE: "disabled",
      FLOW_BOOTSTRAP_DATABASE_URL: `postgresql://postgres:${sentinel}@db.railway.internal:5432/railway`,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 78);
  assert.match(result.stderr, /restricted to isolated QA/);
  assert.ok(!result.stderr.includes(sentinel));
});

test("forward migration revokes privileges from only a non-login legacy worker role", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20261115000000_retire_nonlogin_legacy_worker/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /current_database\(\) \|\| '_worker'/);
  assert.match(migration, /IF FOUND AND NOT can_login THEN/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA flow/);
  assert.match(
    migration,
    /REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA flow/,
  );
  assert.doesNotMatch(migration, /DROP ROLE|DROP TABLE|TRUNCATE|DELETE FROM/i);
});
