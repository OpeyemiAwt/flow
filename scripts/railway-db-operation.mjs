import { spawn } from "node:child_process";
import pg from "pg";

const STAGING_ENVIRONMENT_ID = "a3c2b9e7-a102-4148-a69a-768103aa1016";
const operation = process.env.FLOW_DB_OPERATION;

function fail(message) {
  console.error(JSON.stringify({ event: "staging_db_operation_rejected", message }));
  process.exit(78);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function bootstrap() {
  if (
    process.env.FLOW_ENV !== "staging" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "staging-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail("Bootstrap is restricted to the designated Railway staging environment.");
  }

  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawUrl) fail("FLOW_BOOTSTRAP_DATABASE_URL is required.");
  const adminUrl = new URL(rawUrl);
  if (
    adminUrl.protocol !== "postgresql:" &&
    adminUrl.protocol !== "postgres:"
  ) {
    fail("The staging bootstrap URL must use PostgreSQL.");
  }
  if (
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  ) {
    fail("The bootstrap URL does not identify the isolated Railway PostgreSQL service.");
  }

  const client = new pg.Client({ connectionString: rawUrl, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (identity.rows[0]?.database !== "railway" || identity.rows[0]?.role !== "postgres") {
      fail("The bootstrap connection identity is not the expected Railway staging administrator.");
    }

    for (const env of ["staging", "test"]) {
      const dbName = `flow_${env}`;
      const roles = [
        ["app", `FLOW_${env.toUpperCase()}_APP_PASSWORD`],
        ["payment_worker", `FLOW_${env.toUpperCase()}_PAYMENT_WORKER_PASSWORD`],
        ["custody_worker", `FLOW_${env.toUpperCase()}_CUSTODY_WORKER_PASSWORD`],
        ["worker", `FLOW_${env.toUpperCase()}_LEGACY_WORKER_PASSWORD`],
        ["operator", `FLOW_${env.toUpperCase()}_OPERATOR_PASSWORD`],
        ["migrator", `FLOW_${env.toUpperCase()}_MIGRATOR_PASSWORD`],
      ];

      for (const [suffix, variable] of roles) {
        const role = `${dbName}_${suffix}`;
        const password = process.env[variable];
        if (!password || !/^[a-f0-9]{64}$/.test(password)) {
          fail(`${variable} must contain a generated 256-bit hex credential.`);
        }
        const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
        if (existing.rowCount) {
          fail(`Role ${role} already exists; refusing to rotate or alter existing credentials.`);
        }
        await client.query(
          `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
        );
      }

      const databaseExists = await client.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1",
        [dbName],
      );
      if (databaseExists.rowCount) {
        fail(`Database ${dbName} already exists; refusing to modify or reset it.`);
      }
      await client.query(`CREATE DATABASE "${dbName}" OWNER "${dbName}_migrator"`);
      await client.query(`REVOKE CREATE ON DATABASE "${dbName}" FROM PUBLIC`);
      await client.query(`GRANT CONNECT ON DATABASE "${dbName}" TO "${dbName}_app", "${dbName}_payment_worker", "${dbName}_custody_worker", "${dbName}_worker", "${dbName}_operator"`);
      console.log(JSON.stringify({ event: "staging_database_created", database: dbName, roles: roles.map(([suffix]) => `${dbName}_${suffix}`) }));
    }
  } finally {
    await client.end();
  }
}

async function migrate() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_EXECUTION !== "disabled"
  ) {
    fail("Migration is restricted to the isolated flow_test QA database first.");
  }
  const migrationEnv = { ...process.env };
  delete migrationEnv.FLOW_BOOTSTRAP_DATABASE_URL;
  for (const key of Object.keys(migrationEnv)) {
    if (/^FLOW_(?:STAGING|TEST)_.*_PASSWORD$/.test(key)) {
      delete migrationEnv[key];
    }
  }
  const child = spawn("node", ["node_modules/prisma/build/index.js", "migrate", "deploy", "--config", "prisma.config.ts"], {
    stdio: "inherit",
    env: migrationEnv,
  });
  child.once("error", (error) => {
    console.error(JSON.stringify({ event: "qa_migration_start_failed", error: error.message }));
    process.exit(1);
  });
  child.once("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1;
  });
}

if (operation === "bootstrap-staging-and-qa") await bootstrap();
else if (operation === "migrate-qa") await migrate();
else fail("FLOW_DB_OPERATION is unsupported.");
