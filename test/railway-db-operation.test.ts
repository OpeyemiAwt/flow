import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const script = new URL("../scripts/railway-db-operation.mjs", import.meta.url);

test("staging database operations fail closed outside the designated staging environment", () => {
  const sentinel = "do-not-log-this-admin-secret";
  const result = spawnSync(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      FLOW_DB_OPERATION: "bootstrap-staging-and-qa",
      FLOW_ENV: "production",
      RAILWAY_ENVIRONMENT_ID: "production",
      FLOW_DB_TARGET: "staging-only",
      FLOW_EXECUTION: "disabled",
      FLOW_PROVIDER_COMPATIBILITY_MODE: "disabled",
      FLOW_BOOTSTRAP_DATABASE_URL: `postgresql://postgres:${sentinel}@db.railway.internal:5432/railway`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 78);
  assert.match(
    result.stderr,
    /restricted to the designated Railway staging environment/,
  );
  assert.ok(!result.stderr.includes(sentinel));
});

test("QA migration operation refuses staging or production migration targets", () => {
  const sentinel = "migration-secret-sentinel";
  const result = spawnSync(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      FLOW_DB_OPERATION: "migrate-qa",
      FLOW_ENV: "staging",
      RAILWAY_ENVIRONMENT_ID: "a3c2b9e7-a102-4148-a69a-768103aa1016",
      FLOW_DB_TARGET: "staging-only",
      FLOW_EXECUTION: "disabled",
      FLOW_MIGRATION_DATABASE_URL: `postgresql://flow_staging_migrator:${sentinel}@db.railway.internal:5432/flow_staging?sslmode=require&sslaccept=strict`,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 78);
  assert.match(
    result.stderr,
    /restricted to the isolated flow_test QA database first/,
  );
  assert.ok(!result.stderr.includes(sentinel));
});

test("repeatable QA integration operation fails closed outside the isolated test target", () => {
  const sentinel = "qa-admin-secret-sentinel";
  const result = spawnSync(process.execPath, [script.pathname], {
    env: {
      ...process.env,
      FLOW_DB_OPERATION: "test-security-qa-twice",
      FLOW_ENV: "staging",
      RAILWAY_ENVIRONMENT_ID: "a3c2b9e7-a102-4148-a69a-768103aa1016",
      FLOW_DB_TARGET: "staging-only",
      FLOW_EXECUTION: "disabled",
      FLOW_PROVIDER_COMPATIBILITY_MODE: "disabled",
      FLOW_BOOTSTRAP_DATABASE_URL: `postgresql://postgres:${sentinel}@db.railway.internal:5432/railway`,
      FLOW_MIGRATION_DATABASE_URL:
        "postgresql://flow_test_migrator:secret@db.railway.internal:5432/flow_test",
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 78);
  assert.match(result.stderr, /isolated Railway QA environment/);
  assert.ok(!result.stderr.includes(sentinel));
});
