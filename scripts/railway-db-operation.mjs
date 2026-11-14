import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import pg from "pg";

const STAGING_ENVIRONMENT_ID = "a3c2b9e7-a102-4148-a69a-768103aa1016";
const PRODUCTION_ENVIRONMENT_ID = "7b8f3541-d3c5-483c-831a-5c0fb335a288";
const operation = process.env.FLOW_DB_OPERATION;

function fail(message) {
  console.error(
    JSON.stringify({ event: "staging_db_operation_rejected", message }),
  );
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
    fail(
      "Bootstrap is restricted to the designated Railway staging environment.",
    );
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
    fail(
      "The bootstrap URL does not identify the isolated Railway PostgreSQL service.",
    );
  }

  const client = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    ) {
      fail(
        "The bootstrap connection identity is not the expected Railway staging administrator.",
      );
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
        const existing = await client.query(
          "SELECT 1 FROM pg_roles WHERE rolname = $1",
          [role],
        );
        if (existing.rowCount) {
          fail(
            `Role ${role} already exists; refusing to rotate or alter existing credentials.`,
          );
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
        fail(
          `Database ${dbName} already exists; refusing to modify or reset it.`,
        );
      }
      await client.query(
        `CREATE DATABASE "${dbName}" OWNER "${dbName}_migrator"`,
      );
      await client.query(`REVOKE CREATE ON DATABASE "${dbName}" FROM PUBLIC`);
      await client.query(
        `GRANT CONNECT ON DATABASE "${dbName}" TO "${dbName}_app", "${dbName}_payment_worker", "${dbName}_custody_worker", "${dbName}_worker", "${dbName}_operator"`,
      );
      console.log(
        JSON.stringify({
          event: "staging_database_created",
          database: dbName,
          roles: roles.map(([suffix]) => `${dbName}_${suffix}`),
        }),
      );
    }
  } finally {
    await client.end();
  }
}

async function bootstrapProduction() {
  if (
    process.env.FLOW_ENV !== "production" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== PRODUCTION_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "production-empty-only" ||
    process.env.FLOW_PRODUCTION_BOOTSTRAP_APPROVED !== "enabled" ||
    process.env.FLOW_PUBLIC_SIGNUP_ENABLED !== "disabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled" ||
    process.env.FLOW_WALLET_REGISTRATION_ENABLED !== "disabled"
  ) {
    fail(
      "Production bootstrap is gated to the isolated, explicitly approved production environment.",
    );
  }

  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawUrl) fail("FLOW_BOOTSTRAP_DATABASE_URL is required.");
  const adminUrl = new URL(rawUrl);
  if (
    !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  ) {
    fail(
      "The production bootstrap URL must identify the Railway PostgreSQL administrator.",
    );
  }

  const roleSuffixes = [
    "app",
    "auth_worker",
    "custody_worker",
    "payment_worker",
    "indexer_worker",
    "operator",
    "migrator",
  ];
  const roleCredentials = roleSuffixes.map((suffix) => {
    const variable = `FLOW_PRODUCTION_${suffix.toUpperCase()}_PASSWORD`;
    const password = process.env[variable];
    if (!password || !/^[a-f0-9]{64}$/.test(password)) {
      fail(`${variable} must contain a generated 256-bit hex credential.`);
    }
    return { suffix, variable, password };
  });

  const admin = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    ) {
      fail(
        "Production bootstrap connection has an unexpected database identity.",
      );
    }

    // Fail closed: production bootstrap is create-only. It never resets, alters,
    // or adopts an existing database/role, including one with unfamiliar ownership.
    const database = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = 'flow_production'",
    );
    if (database.rowCount)
      fail("flow_production already exists; refusing to mutate it.");
    for (const { suffix } of roleCredentials) {
      const role = `flow_production_${suffix}`;
      const existing = await admin.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1",
        [role],
      );
      if (existing.rowCount)
        fail(`Role ${role} already exists; refusing to alter it.`);
    }

    for (const { suffix, password } of roleCredentials) {
      const role = `flow_production_${suffix}`;
      await admin.query(
        `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
      );
    }
    const legacyWorker = await admin.query(
      "SELECT 1 FROM pg_roles WHERE rolname = 'flow_production_worker'",
    );
    if (legacyWorker.rowCount)
      fail("Role flow_production_worker already exists; refusing to alter it.");
    await admin.query(
      'CREATE ROLE "flow_production_worker" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
    );
    await admin.query(
      'CREATE DATABASE "flow_production" OWNER "flow_production_migrator"',
    );
    await admin.query(
      'REVOKE CREATE ON DATABASE "flow_production" FROM PUBLIC',
    );
    await admin.query(
      'GRANT CONNECT ON DATABASE "flow_production" TO "flow_production_app", "flow_production_auth_worker", "flow_production_custody_worker", "flow_production_payment_worker", "flow_production_indexer_worker", "flow_production_operator"',
    );
    console.log(
      JSON.stringify({
        event: "production_empty_database_created",
        database: "flow_production",
        roles: roleSuffixes.map((suffix) => `flow_production_${suffix}`),
      }),
    );
  } finally {
    await admin.end();
  }
}

async function exportProductionPostgresCa() {
  if (
    process.env.FLOW_ENV !== "production" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== PRODUCTION_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "production-empty-only" ||
    process.env.FLOW_PRODUCTION_BOOTSTRAP_APPROVED !== "enabled" ||
    process.env.FLOW_PUBLIC_SIGNUP_ENABLED !== "disabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled" ||
    process.env.FLOW_WALLET_REGISTRATION_ENABLED !== "disabled"
  ) {
    fail(
      "Production CA export is restricted to the isolated production environment.",
    );
  }
  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawUrl) fail("FLOW_BOOTSTRAP_DATABASE_URL is required.");
  const adminUrl = new URL(rawUrl);
  if (
    !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  ) {
    fail(
      "Production CA export requires the isolated Railway PostgreSQL administrator.",
    );
  }
  const admin = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    ) {
      fail(
        "Production CA export connection has an unexpected database identity.",
      );
    }
    const settings = await admin.query(
      "SELECT current_setting('data_directory') AS data_directory, current_setting('ssl_cert_file') AS ssl_cert_file, current_setting('ssl_ca_file') AS ssl_ca_file",
    );
    const { data_directory, ssl_cert_file, ssl_ca_file } = settings.rows[0];
    const certDirectory = String(ssl_cert_file).slice(
      0,
      String(ssl_cert_file).lastIndexOf("/"),
    );
    const candidates = [
      ssl_ca_file,
      `${data_directory}/certs/root.crt`,
      `${data_directory}/root.crt`,
      `${certDirectory}/root.crt`,
      `${certDirectory}/ca.crt`,
    ].filter((candidate) => typeof candidate === "string" && candidate.length);
    for (const candidate of new Set(candidates)) {
      try {
        const result = await admin.query(
          "SELECT pg_read_file($1) AS certificate",
          [candidate],
        );
        const certificate = result.rows[0]?.certificate;
        if (
          typeof certificate === "string" &&
          certificate.startsWith("-----BEGIN CERTIFICATE-----") &&
          certificate.trimEnd().endsWith("-----END CERTIFICATE-----")
        ) {
          console.log(
            JSON.stringify({
              event: "production_postgres_root_ca",
              certificate,
            }),
          );
          return;
        }
      } catch {
        // Continue to the other known Railway Postgres CA locations.
      }
    }
    console.log(
      JSON.stringify({
        event: "production_postgres_ca_probe",
        dataDirectory: data_directory,
        certificateFile: ssl_cert_file,
        caFile: ssl_ca_file,
      }),
    );
    fail("Production PostgreSQL root certificate is unavailable or invalid.");
  } finally {
    await admin.end();
  }
}

async function migrateProduction() {
  if (
    process.env.FLOW_ENV !== "production" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== PRODUCTION_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "production-empty-only" ||
    process.env.FLOW_PRODUCTION_BOOTSTRAP_APPROVED !== "enabled" ||
    process.env.FLOW_PUBLIC_SIGNUP_ENABLED !== "disabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled" ||
    process.env.FLOW_WALLET_REGISTRATION_ENABLED !== "disabled"
  ) {
    fail(
      "Production migrations require the gated isolated production environment.",
    );
  }
  const migrationUrl = new URL(process.env.FLOW_MIGRATION_DATABASE_URL ?? "");
  if (
    migrationUrl.pathname !== "/flow_production" ||
    decodeURIComponent(migrationUrl.username) !== "flow_production_migrator"
  ) {
    fail(
      "The production migration URL must use the dedicated flow_production migrator role.",
    );
  }
  const migrationEnv = { ...process.env };
  delete migrationEnv.FLOW_BOOTSTRAP_DATABASE_URL;
  for (const key of Object.keys(migrationEnv)) {
    if (/^FLOW_PRODUCTION_.*_PASSWORD$/.test(key)) delete migrationEnv[key];
  }
  const child = spawn(
    "node",
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      "prisma.config.ts",
    ],
    { stdio: "inherit", env: migrationEnv },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status) => resolve(status ?? 1));
  });
  if (code !== 0)
    fail(`Production forward migrations failed with exit ${code}.`);
  console.log(
    JSON.stringify({
      event: "production_forward_migrations_complete",
      database: "flow_production",
    }),
  );
}

async function recoverProductionM6() {
  if (
    process.env.FLOW_ENV !== "production" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== PRODUCTION_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "production-empty-only" ||
    process.env.FLOW_PRODUCTION_MIGRATION_RECOVERY_APPROVED !== "enabled" ||
    process.env.FLOW_PUBLIC_SIGNUP_ENABLED !== "disabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled" ||
    process.env.FLOW_WALLET_REGISTRATION_ENABLED !== "disabled"
  )
    fail(
      "Production migration recovery is not explicitly gated and disabled-safe.",
    );
  const rawAdminUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  const rawMigrationUrl = process.env.FLOW_MIGRATION_DATABASE_URL;
  if (!rawAdminUrl || !rawMigrationUrl)
    fail("Production recovery credentials are required.");
  const adminUrl = new URL(rawAdminUrl);
  const migrationUrl = new URL(rawMigrationUrl);
  if (
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres" ||
    !adminUrl.hostname.endsWith(".railway.internal") ||
    migrationUrl.pathname !== "/flow_production" ||
    decodeURIComponent(migrationUrl.username) !== "flow_production_migrator"
  )
    fail(
      "Production recovery URLs do not identify the isolated database and migrator role.",
    );
  const admin = new pg.Client({
    connectionString: rawAdminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    )
      fail("Production recovery administrator identity is unexpected.");
    const scopedAdminUrl = new URL(rawAdminUrl);
    scopedAdminUrl.pathname = "/flow_production";
    const scopedAdmin = new pg.Client({
      connectionString: scopedAdminUrl.toString(),
      connectionTimeoutMillis: 5000,
    });
    await scopedAdmin.connect();
    try {
      const scopedIdentity = await scopedAdmin.query(
        "SELECT current_database() AS database, current_user AS role",
      );
      if (
        scopedIdentity.rows[0]?.database !== "flow_production" ||
        scopedIdentity.rows[0]?.role !== "postgres"
      )
        fail("Production recovery database identity is unexpected.");
      const db = await admin.query(
        "SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = 'flow_production'",
      );
      if (db.rows[0]?.owner !== "flow_production_migrator")
        fail("Production database ownership is unexpected; refusing recovery.");
      const failed = await scopedAdmin.query(
        "SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL",
      );
      if (
        failed.rowCount !== 1 ||
        failed.rows[0]?.migration_name !==
          "20261110000000_m6_rehearsal_authorization"
      )
        fail(
          "Production migration state is not the specifically reviewed M6 failure; refusing recovery.",
        );
      const role = await admin.query(
        "SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'flow_production_worker'",
      );
      if (!role.rowCount) {
        await admin.query(
          'CREATE ROLE "flow_production_worker" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
        );
      } else if (
        role.rows[0].rolcanlogin ||
        role.rows[0].rolsuper ||
        role.rows[0].rolcreatedb ||
        role.rows[0].rolcreaterole ||
        role.rows[0].rolreplication ||
        role.rows[0].rolbypassrls
      ) {
        fail(
          "Existing legacy worker role is not a harmless NOLOGIN compatibility role; refusing recovery.",
        );
      }
      const membership = await admin.query(
        "SELECT 1 FROM pg_auth_members WHERE roleid = (SELECT oid FROM pg_roles WHERE rolname = 'flow_production_worker') OR member = (SELECT oid FROM pg_roles WHERE rolname = 'flow_production_worker') LIMIT 1",
      );
      if (membership.rowCount)
        fail("Legacy worker role has memberships; refusing recovery.");
      console.log(
        JSON.stringify({
          event: "production_m6_recovery_preflight_passed",
          database: "flow_production",
          failedMigration: "20261110000000_m6_rehearsal_authorization",
          compatibilityRole: "NOLOGIN and no memberships",
        }),
      );
    } finally {
      await scopedAdmin.end();
    }
  } finally {
    await admin.end();
  }
  const migrationEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: "production",
    FLOW_ENV: "production",
    FLOW_EXECUTION: "disabled",
    FLOW_MIGRATION_DATABASE_URL: migrationUrl.toString(),
  };
  const runPrisma = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        "node",
        [
          "node_modules/prisma/build/index.js",
          ...args,
          "--config",
          "prisma.config.ts",
        ],
        { stdio: "inherit", env: migrationEnv },
      );
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  const resolveCode = await runPrisma([
    "migrate",
    "resolve",
    "--rolled-back",
    "20261110000000_m6_rehearsal_authorization",
  ]);
  if (resolveCode !== 0)
    fail(
      `Production migration recovery resolve failed with exit ${resolveCode}.`,
    );
  const deployCode = await runPrisma(["migrate", "deploy"]);
  if (deployCode !== 0)
    fail(`Production forward migrations failed with exit ${deployCode}.`);
  console.log(
    JSON.stringify({
      event: "production_m6_recovery_and_forward_migrations_complete",
      database: "flow_production",
    }),
  );
}

async function rehearseProductionMigrations() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_TEST_DATABASE_REMOTE !== "enabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail("Production-shaped migration rehearsal is restricted to isolated QA.");
  }
  const rawAdminUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawAdminUrl) fail("Isolated QA administrator URL is required.");
  const adminUrl = new URL(rawAdminUrl);
  if (
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  )
    fail("QA admin URL does not identify the isolated Railway database.");

  const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID?.replaceAll("-", "");
  if (!deploymentId || !/^[a-f0-9]{32}$/i.test(deploymentId))
    fail(
      "Railway deployment identity is required for isolated rehearsal names.",
    );
  const name = `flow_test_prodshape_${deploymentId.slice(0, 10).toLowerCase()}_${randomBytes(5).toString("hex")}`;
  const suffixes = [
    "app",
    "auth_worker",
    "custody_worker",
    "payment_worker",
    "indexer_worker",
    "operator",
    "migrator",
  ];
  const passwords = new Map(
    suffixes.map((suffix) => [suffix, randomBytes(32).toString("hex")]),
  );
  const admin = new pg.Client({
    connectionString: rawAdminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    )
      fail("QA administrator connection has an unexpected identity.");
    const existing = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (existing.rowCount)
      fail(
        "Generated rehearsal database already exists; refusing to reuse it.",
      );
    for (const suffix of [...suffixes, "worker"]) {
      const role = `${name}_${suffix}`;
      const found = await admin.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1",
        [role],
      );
      if (found.rowCount)
        fail("Generated rehearsal role already exists; refusing to reuse it.");
      if (suffix === "worker") {
        await admin.query(
          `CREATE ROLE "${role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
        );
      } else {
        await admin.query(
          `CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sqlLiteral(passwords.get(suffix))}`,
        );
      }
    }
    await admin.query(`CREATE DATABASE "${name}" OWNER "${name}_migrator"`);
    await admin.query(`REVOKE CREATE ON DATABASE "${name}" FROM PUBLIC`);
    await admin.query(
      `GRANT CONNECT ON DATABASE "${name}" TO ${[...suffixes.filter((s) => s !== "migrator"), "worker"].map((s) => `"${name}_${s}"`).join(", ")}`,
    );

    const migrationUrl = new URL(process.env.FLOW_MIGRATION_DATABASE_URL ?? "");
    if (
      migrationUrl.pathname !== "/flow_test" ||
      decodeURIComponent(migrationUrl.username) !== "flow_test_migrator"
    )
      fail("Rehearsal must derive from the isolated QA migration URL.");
    migrationUrl.pathname = `/${name}`;
    migrationUrl.username = `${name}_migrator`;
    migrationUrl.password = passwords.get("migrator");
    const migrationEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "production",
      FLOW_ENV: "test",
      FLOW_TEST_DATABASE_REMOTE: "enabled",
      FLOW_TEST_DATABASE_NAME: name,
      FLOW_EXECUTION: "disabled",
      FLOW_MIGRATION_DATABASE_URL: migrationUrl.toString(),
    };
    const child = spawn(
      "node",
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--config",
        "prisma.config.ts",
      ],
      { stdio: "inherit", env: migrationEnv },
    );
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (status) => resolve(status ?? 1));
    });
    if (code !== 0)
      fail(`Production-shaped forward migrations failed with exit ${code}.`);

    const verifyUrl = new URL(rawAdminUrl);
    verifyUrl.pathname = `/${name}`;
    const verifier = new pg.Client({
      connectionString: verifyUrl.toString(),
      connectionTimeoutMillis: 5000,
    });
    await verifier.connect();
    try {
      const check = await verifier.query(
        `SELECT r.rolcanlogin AS can_login,
          EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid = r.oid OR m.member = r.oid) AS has_memberships,
          EXISTS (SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) a WHERE n.nspname = 'flow' AND a.grantee = r.oid) AS has_schema_grant,
          EXISTS (SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))) a WHERE c.relnamespace = 'flow'::regnamespace AND a.grantee = r.oid) AS has_relation_grant,
          EXISTS (SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE p.pronamespace = 'flow'::regnamespace AND a.grantee = r.oid) AS has_function_grant,
          EXISTS (SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) a WHERE d.datname = current_database() AND a.grantee = r.oid) AS has_database_grant
        FROM pg_roles r WHERE r.rolname = $1`,
        [`${name}_worker`],
      );
      const row = check.rows[0];
      if (
        !row ||
        row.can_login ||
        row.has_memberships ||
        row.has_schema_grant ||
        row.has_relation_grant ||
        row.has_function_grant ||
        row.has_database_grant
      )
        fail(
          "Production-shaped legacy worker role retained login or database privileges.",
        );
      console.log(
        JSON.stringify({
          event: "production_shaped_migration_rehearsal_passed",
          database: name,
          migrations: "all forward migrations",
          legacyWorkerLogin: false,
          legacyWorkerPrivileges: "none",
        }),
      );
    } finally {
      await verifier.end();
    }
  } finally {
    await admin.end();
  }
}

async function migrate() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_TEST_DATABASE_REMOTE !== "enabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail(
      "Migration is restricted to the isolated flow_test QA database first.",
    );
  }
  const migrationEnv = { ...process.env };
  const databaseName = process.env.FLOW_TEST_DATABASE_NAME ?? "flow_test";
  if (!/^flow_test_[a-z0-9_]+$/.test(databaseName))
    fail("Invalid isolated QA database name.");
  const migrationUrl = new URL(migrationEnv.FLOW_MIGRATION_DATABASE_URL ?? "");
  if (
    migrationUrl.pathname !== "/flow_test" ||
    decodeURIComponent(migrationUrl.username) !== "flow_test_migrator"
  ) {
    fail(
      "The QA migration credential must begin scoped to the isolated flow_test database.",
    );
  }
  if (databaseName !== "flow_test") {
    const password =
      process.env[`${databaseName.toUpperCase()}_MIGRATOR_PASSWORD`];
    if (!password || !/^[a-f0-9]{64}$/.test(password))
      fail("Validation migrator credential is missing.");
    migrationUrl.username = `${databaseName}_migrator`;
    migrationUrl.password = password;
  }
  migrationUrl.pathname = `/${databaseName}`;
  migrationEnv.FLOW_MIGRATION_DATABASE_URL = migrationUrl.toString();
  migrationEnv.FLOW_TEST_DATABASE_NAME = databaseName;
  delete migrationEnv.FLOW_BOOTSTRAP_DATABASE_URL;
  for (const key of Object.keys(migrationEnv)) {
    if (/^FLOW_(?:STAGING|TEST)_.*_PASSWORD$/.test(key))
      delete migrationEnv[key];
  }
  if (databaseName === "flow_test_validation") {
    const bootstrapUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
    if (!bootstrapUrl)
      fail(
        "Isolated admin URL is required to verify failed QA migration rollback.",
      );
    const adminUrl = new URL(bootstrapUrl);
    adminUrl.pathname = `/${databaseName}`;
    const admin = new pg.Client({
      connectionString: adminUrl.toString(),
      connectionTimeoutMillis: 5000,
    });
    await admin.connect();
    try {
      const schema = await admin.query(
        "SELECT 1 FROM pg_namespace WHERE nspname = 'flow'",
      );
      if (schema.rowCount)
        fail(
          "Validation migration left the flow schema present; refusing automatic repair.",
        );
      const history = await admin.query(
        "SELECT table_schema FROM information_schema.tables WHERE table_name = '_prisma_migrations'",
      );
      if (history.rowCount > 1)
        fail("Validation database has unexpected Prisma history tables.");
      if (history.rowCount === 1) {
        if (history.rows[0].table_schema !== "public")
          fail(
            "Validation migration history is outside the expected public schema.",
          );
        const entries = await admin.query(
          "SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations",
        );
        if (
          entries.rowCount !== 1 ||
          entries.rows[0].migration_name !== "20261106000000_flow_namespace" ||
          entries.rows[0].finished_at !== null ||
          entries.rows[0].rolled_back_at !== null
        ) {
          fail(
            "Validation migration history differs from the single expected failed first migration.",
          );
        }
        await admin.query(
          'ALTER TABLE public._prisma_migrations OWNER TO "flow_test_validation_migrator"',
        );
      }
    } finally {
      await admin.end();
    }
    await new Promise((resolve, reject) => {
      const recovery = spawn(
        "node",
        [
          "node_modules/prisma/build/index.js",
          "migrate",
          "resolve",
          "--rolled-back",
          "20261106000000_flow_namespace",
          "--config",
          "prisma.config.ts",
        ],
        { stdio: "inherit", env: migrationEnv },
      );
      recovery.once("error", reject);
      recovery.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`migration recovery exit ${code}`)),
      );
    }).catch((error) =>
      fail(`Isolated QA migration recovery failed safely: ${error.message}`),
    );
  }
  const child = spawn(
    "node",
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      "prisma.config.ts",
    ],
    {
      stdio: "inherit",
      env: migrationEnv,
    },
  );
  child.once("error", (error) => {
    console.error(
      JSON.stringify({
        event: "qa_migration_start_failed",
        error: error.message,
      }),
    );
    process.exit(1);
  });
  child.once("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1;
  });
}

async function migrateStaging() {
  if (
    process.env.FLOW_ENV !== "staging" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "staging-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail(
      "Migration is restricted to the designated isolated staging database.",
    );
  }

  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  const password = process.env.FLOW_STAGING_MIGRATOR_PASSWORD;
  if (!rawUrl || !password || !/^[a-f0-9]{64}$/.test(password)) {
    fail(
      "The isolated staging bootstrap URL and generated migrator credential are required.",
    );
  }
  const migrationUrl = new URL(rawUrl);
  if (
    !migrationUrl.hostname.endsWith(".railway.internal") ||
    migrationUrl.pathname !== "/railway" ||
    decodeURIComponent(migrationUrl.username) !== "postgres"
  ) {
    fail(
      "The staging migration source does not identify the isolated Railway PostgreSQL service.",
    );
  }
  migrationUrl.pathname = "/flow_staging";
  migrationUrl.username = "flow_staging_migrator";
  migrationUrl.password = password;
  migrationUrl.search = "?sslmode=require&uselibpqcompat=true";

  const migrationEnv = {
    ...process.env,
    FLOW_MIGRATION_DATABASE_URL: migrationUrl.toString(),
  };
  delete migrationEnv.FLOW_BOOTSTRAP_DATABASE_URL;
  delete migrationEnv.FLOW_TEST_DATABASE_REMOTE;
  delete migrationEnv.FLOW_TEST_DATABASE_NAME;
  for (const key of Object.keys(migrationEnv)) {
    if (/^FLOW_(?:STAGING|TEST)_.*_PASSWORD$/.test(key))
      delete migrationEnv[key];
  }
  const child = spawn(
    "node",
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--config",
      "prisma.config.ts",
    ],
    {
      stdio: "inherit",
      env: migrationEnv,
    },
  );
  child.once("error", (error) => {
    console.error(
      JSON.stringify({
        event: "staging_migration_start_failed",
        error: error.message,
      }),
    );
    process.exit(1);
  });
  child.once("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1;
  });
}

async function provisionAuthTicketRole() {
  if (
    process.env.FLOW_ENV !== "staging" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "staging-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  )
    fail("Auth-ticket role provisioning is restricted to isolated staging.");
  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  const password = process.env.FLOW_STAGING_AUTH_TICKET_PASSWORD;
  if (!rawUrl || !password || !/^[a-f0-9]{64}$/.test(password))
    fail(
      "Isolated staging administrator URL and generated auth-ticket credential are required.",
    );
  const adminUrl = new URL(rawUrl);
  if (
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  )
    fail(
      "Bootstrap URL does not identify the isolated Railway PostgreSQL service.",
    );
  const client = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    )
      fail("Unexpected staging bootstrap identity.");
    const roleName = "flow_staging_auth_worker";
    const existing = await client.query(
      "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [roleName],
    );
    if (existing.rowCount) {
      const role = existing.rows[0];
      if (
        !role.rolcanlogin ||
        role.rolsuper ||
        role.rolcreatedb ||
        role.rolcreaterole ||
        role.rolreplication ||
        role.rolbypassrls
      )
        fail(
          "Existing auth-ticket role violates restricted-role policy; refusing to alter it.",
        );
    } else {
      await client.query(
        `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
      );
    }
    const memberships = await client.query(
      "SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = $1)",
      [roleName],
    );
    if (memberships.rowCount)
      fail(
        "Auth-ticket role has role memberships; refusing inherited privileges.",
      );
    const stagingAdminUrl = new URL(rawUrl);
    stagingAdminUrl.pathname = "/flow_staging";
    const stagingAdmin = new pg.Client({
      connectionString: stagingAdminUrl.toString(),
      connectionTimeoutMillis: 5000,
    });
    await stagingAdmin.connect();
    try {
      await stagingAdmin.query(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA flow FROM "${roleName}"`,
      );
      await stagingAdmin.query(
        `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA flow FROM "${roleName}"`,
      );
      await stagingAdmin.query(
        `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA flow FROM "${roleName}"`,
      );
      await stagingAdmin.query(`GRANT USAGE ON SCHEMA flow TO "${roleName}"`);
      await stagingAdmin.query(
        `GRANT EXECUTE ON FUNCTION flow.issue_email_auth_ticket(text, text) TO "${roleName}"`,
      );
      await stagingAdmin.query(
        `GRANT EXECUTE ON FUNCTION flow.issue_google_auth_ticket(text, text, bigint) TO "${roleName}"`,
      );
    } finally {
      await stagingAdmin.end();
    }
    const targetUrl = new URL(rawUrl);
    targetUrl.pathname = "/flow_staging";
    targetUrl.username = roleName;
    targetUrl.password = password;
    const probe = new pg.Client({
      connectionString: targetUrl.toString(),
      connectionTimeoutMillis: 3000,
    });
    await probe.connect();
    try {
      const { rows } = await probe.query(
        `SELECT current_database() = 'flow_staging' AS correct_database, current_user = $1 AS correct_role, NOT has_table_privilege(current_user, 'flow.auth_users', 'SELECT') AS no_auth_table_read, NOT has_table_privilege(current_user, 'flow.wallets', 'SELECT') AS no_wallet_read, NOT has_table_privilege(current_user, 'flow.auth_sessions', 'INSERT') AS no_session_write, has_function_privilege(current_user, 'flow.issue_email_auth_ticket(text,text)', 'EXECUTE') AS can_issue_email_ticket, has_function_privilege(current_user, 'flow.issue_google_auth_ticket(text,text,bigint)', 'EXECUTE') AS can_issue_google_ticket`,
        [roleName],
      );
      const p = rows[0];
      if (
        !p.correct_database ||
        !p.correct_role ||
        !p.no_auth_table_read ||
        !p.no_wallet_read ||
        !p.no_session_write ||
        !p.can_issue_email_ticket ||
        !p.can_issue_google_ticket
      )
        fail(
          "Auth-ticket role privilege verification failed; application credentials were not changed.",
        );
    } finally {
      await probe.end();
    }
    console.log(
      JSON.stringify({
        event: "staging_auth_ticket_role_verified",
        database: "flow_staging",
        role: roleName,
        table_access: "none",
        functions: "guarded_auth_ticket_issuance_only",
      }),
    );
  } finally {
    await client.end();
  }
}

async function provisionStagingIndexerHeartbeatRole() {
  if (
    process.env.FLOW_ENV !== "staging" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "staging-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled" ||
    process.env.FLOW_INDEXER_WORKER_MODE !== "heartbeat-only"
  )
    fail(
      "Indexer heartbeat role provisioning is restricted to isolated staging.",
    );
  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  const password = process.env.FLOW_STAGING_INDEXER_WORKER_PASSWORD;
  if (!rawUrl || !password || !/^[a-f0-9]{64}$/.test(password))
    fail(
      "Staging administrator URL and generated indexer credential are required.",
    );
  const adminUrl = new URL(rawUrl);
  if (
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  )
    fail(
      "Bootstrap URL does not identify the isolated Railway PostgreSQL service.",
    );
  const client = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const identity = await client.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    )
      fail("Unexpected staging bootstrap identity.");
    const roleName = "flow_staging_indexer_worker";
    const existing = await client.query(
      "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1",
      [roleName],
    );
    if (existing.rowCount) {
      const role = existing.rows[0];
      if (
        !role.rolcanlogin ||
        role.rolsuper ||
        role.rolcreatedb ||
        role.rolcreaterole ||
        role.rolreplication ||
        role.rolbypassrls
      )
        fail(
          "Existing indexer role violates restricted-role policy; refusing to alter it.",
        );
    } else {
      await client.query(
        `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sqlLiteral(password)}`,
      );
    }
    const memberships = await client.query(
      "SELECT 1 FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = $1)",
      [roleName],
    );
    if (memberships.rowCount)
      fail(
        "Indexer role has inherited memberships; refusing heartbeat activation.",
      );
    await client.query(
      `REVOKE ALL PRIVILEGES ON DATABASE flow_staging FROM "${roleName}"`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE flow_staging TO "${roleName}"`,
    );
    console.log(
      JSON.stringify({
        event: "staging_indexer_heartbeat_role_ready",
        database: "flow_staging",
        role: roleName,
        privileges: ["CONNECT"],
      }),
    );
  } finally {
    await client.end();
  }
}

async function testQa() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_TEST_DATABASE_REMOTE !== "enabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail(
      "Database integration tests are restricted to the isolated Railway flow_test database.",
    );
  }

  const migrationUrl = new URL(process.env.FLOW_MIGRATION_DATABASE_URL ?? "");
  const databaseName = process.env.FLOW_TEST_DATABASE_NAME ?? "flow_test";
  if (
    migrationUrl.pathname !== "/flow_test" ||
    decodeURIComponent(migrationUrl.username) !== "flow_test_migrator"
  ) {
    fail("The QA migration URL must begin scoped to flow_test.");
  }
  if (databaseName !== "flow_test") {
    const password =
      process.env[`${databaseName.toUpperCase()}_MIGRATOR_PASSWORD`];
    if (!password || !/^[a-f0-9]{64}$/.test(password))
      fail("Validation migrator credential is missing.");
    migrationUrl.username = `${databaseName}_migrator`;
    migrationUrl.password = password;
  }
  migrationUrl.pathname = `/${databaseName}`;
  if (
    !/^flow_test_[a-z0-9_]+$/.test(databaseName) ||
    migrationUrl.pathname !== `/${databaseName}` ||
    decodeURIComponent(migrationUrl.username) !== `${databaseName}_migrator` ||
    migrationUrl.searchParams.size !== 2 ||
    migrationUrl.searchParams.get("sslmode") !== "require" ||
    migrationUrl.searchParams.get("uselibpqcompat") !== "true"
  ) {
    fail("The QA migration URL must target flow_test over encrypted TLS.");
  }

  const databaseEnv = { ...process.env };
  delete databaseEnv.FLOW_BOOTSTRAP_DATABASE_URL;
  delete databaseEnv.FLOW_MIGRATION_DATABASE_URL;
  for (const key of Object.keys(databaseEnv)) {
    if (/^FLOW_(?:STAGING|TEST)_.*_PASSWORD$/.test(key)) {
      delete databaseEnv[key];
    }
  }

  const testRoles = [
    [
      "FLOW_DATABASE_URL",
      "app",
      databaseName === "flow_test"
        ? "FLOW_TEST_APP_PASSWORD"
        : `${databaseName.toUpperCase()}_APP_PASSWORD`,
    ],
    [
      "FLOW_WORKER_DATABASE_URL",
      "worker",
      databaseName === "flow_test"
        ? "FLOW_TEST_LEGACY_WORKER_PASSWORD"
        : `${databaseName.toUpperCase()}_WORKER_PASSWORD`,
    ],
    [
      "FLOW_FIXTURE_DATABASE_URL",
      "fixture",
      databaseName === "flow_test"
        ? "FLOW_TEST_FIXTURE_PASSWORD"
        : `${databaseName.toUpperCase()}_FIXTURE_PASSWORD`,
    ],
    [
      "FLOW_PAYMENT_DATABASE_URL",
      "payment_worker",
      databaseName === "flow_test"
        ? "FLOW_TEST_PAYMENT_WORKER_PASSWORD"
        : `${databaseName.toUpperCase()}_PAYMENT_WORKER_PASSWORD`,
    ],
    [
      "FLOW_INDEXER_DATABASE_URL",
      "indexer_worker",
      databaseName === "flow_test"
        ? "FLOW_TEST_INDEXER_WORKER_PASSWORD"
        : `${databaseName.toUpperCase()}_INDEXER_WORKER_PASSWORD`,
    ],
    [
      "FLOW_CUSTODY_DATABASE_URL",
      "custody_worker",
      databaseName === "flow_test"
        ? "FLOW_TEST_CUSTODY_WORKER_PASSWORD"
        : `${databaseName.toUpperCase()}_CUSTODY_WORKER_PASSWORD`,
    ],
    [
      "FLOW_AUTH_TICKET_DATABASE_URL",
      "auth_worker",
      databaseName === "flow_test"
        ? "FLOW_TEST_AUTH_TICKET_PASSWORD"
        : `${databaseName.toUpperCase()}_AUTH_TICKET_PASSWORD`,
    ],
    [
      "FLOW_OPERATOR_DATABASE_URL",
      "operator",
      databaseName === "flow_test"
        ? "FLOW_TEST_OPERATOR_PASSWORD"
        : `${databaseName.toUpperCase()}_OPERATOR_PASSWORD`,
    ],
  ];
  for (const [targetVariable, suffix, passwordVariable] of testRoles) {
    const password = process.env[passwordVariable];
    if (!password || !/^[a-f0-9]{64}$/.test(password)) {
      fail(
        `${passwordVariable} must contain the generated isolated QA credential.`,
      );
    }
    const url = new URL(migrationUrl);
    url.username = `${databaseName}_${suffix}`;
    url.password = password;
    databaseEnv[targetVariable] = url.toString();
  }
  databaseEnv.FLOW_TEST_DATABASE_REMOTE = "enabled";
  databaseEnv.FLOW_TEST_DATABASE_NAME = databaseName;

  const child = spawn("node", ["--test", "test/database.integration.ts"], {
    stdio: "inherit",
    env: databaseEnv,
  });
  child.once("error", (error) => {
    console.error(
      JSON.stringify({
        event: "qa_database_tests_start_failed",
        error: error.message,
      }),
    );
    process.exit(1);
  });
  child.once("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1;
  });
}

async function createQaValidationDatabase() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_TEST_DATABASE_REMOTE !== "enabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  )
    fail(
      "QA validation database creation is restricted to isolated remote tests.",
    );
  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawUrl) fail("Isolated Railway PostgreSQL bootstrap URL is required.");
  const adminUrl = new URL(rawUrl);
  if (
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres"
  ) {
    fail(
      "QA database admin URL does not identify isolated Railway PostgreSQL.",
    );
  }
  const client = new pg.Client({
    connectionString: rawUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const name = "flow_test_validation";
    for (const suffix of [
      "app",
      "worker",
      "payment_worker",
      "indexer_worker",
      "fixture",
      "auth_worker",
      "operator",
      "migrator",
    ]) {
      const roleName = `${name}_${suffix}`;
      const variable = `${name.toUpperCase()}_${suffix.toUpperCase()}_PASSWORD`;
      const password = process.env[variable];
      if (!password || !/^[a-f0-9]{64}$/.test(password))
        fail(`${variable} must contain a generated 256-bit hex credential.`);
      const exists = await client.query(
        "SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1",
        [roleName],
      );
      if (exists.rowCount) {
        const role = exists.rows[0];
        if (
          !role.rolcanlogin ||
          role.rolsuper ||
          role.rolcreatedb ||
          role.rolcreaterole ||
          role.rolreplication ||
          role.rolbypassrls !== (suffix === "fixture")
        ) {
          fail(
            `Existing role ${roleName} does not meet the restricted QA role policy.`,
          );
        }
      } else {
        await client.query(
          `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION ${suffix === "fixture" ? "BYPASSRLS" : "NOBYPASSRLS"} PASSWORD ${sqlLiteral(password)}`,
        );
      }
      const credentialCheckUrl = new URL(adminUrl);
      credentialCheckUrl.username = roleName;
      credentialCheckUrl.password = password;
      const credentialCheck = new pg.Client({
        connectionString: credentialCheckUrl.toString(),
        connectionTimeoutMillis: 3000,
      });
      await credentialCheck
        .connect()
        .then(() => credentialCheck.end())
        .catch(() =>
          fail(
            `Existing/generated QA credential check failed for ${roleName}; refusing to rotate it.`,
          ),
        );
    }
    const exists = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [name],
    );
    if (!exists.rowCount)
      await client.query(`CREATE DATABASE "${name}" OWNER "${name}_migrator"`);
    else
      await client.query(
        `ALTER DATABASE "${name}" OWNER TO "${name}_migrator"`,
      );
    await client.query(`REVOKE CREATE ON DATABASE "${name}" FROM PUBLIC`);
    await client.query(
      `GRANT CONNECT ON DATABASE "${name}" TO "${name}_app", "${name}_worker", "${name}_payment_worker", "${name}_fixture", "${name}_auth_worker", "${name}_operator"`,
    );
    console.log(
      JSON.stringify({
        event: "qa_validation_roles_ready",
        database: name,
        roles: [
          "app",
          "worker",
          "payment_worker",
          "indexer_worker",
          "fixture",
          "auth_worker",
          "operator",
          "migrator",
        ].map((suffix) => `${name}_${suffix}`),
      }),
    );
  } finally {
    await client.end();
  }
}

async function testSecurityQa() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_TEST_DATABASE_REMOTE !== "enabled" ||
    process.env.FLOW_TEST_DATABASE_NAME !== "flow_test_validation" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail(
      "Security integration tests require the fresh isolated validation database.",
    );
  }
  const migrationUrl = new URL(process.env.FLOW_MIGRATION_DATABASE_URL ?? "");
  if (
    migrationUrl.pathname !== "/flow_test" ||
    decodeURIComponent(migrationUrl.username) !== "flow_test_migrator"
  )
    fail("The QA migration credential must begin scoped to flow_test.");
  migrationUrl.pathname = "/flow_test_validation";
  migrationUrl.username = "flow_test_validation_migrator";
  migrationUrl.password =
    process.env.FLOW_TEST_VALIDATION_MIGRATOR_PASSWORD ?? "";
  if (!/^[a-f0-9]{64}$/.test(migrationUrl.password))
    fail("Validation migrator credential is missing.");
  const databaseEnv = { ...process.env };
  delete databaseEnv.FLOW_BOOTSTRAP_DATABASE_URL;
  delete databaseEnv.FLOW_MIGRATION_DATABASE_URL;
  for (const key of Object.keys(databaseEnv))
    if (/^FLOW_(?:STAGING|TEST)_.*_PASSWORD$/.test(key))
      delete databaseEnv[key];
  const roles = [
    [
      "FLOW_DATABASE_URL",
      "flow_test_validation_app",
      process.env.FLOW_TEST_VALIDATION_APP_PASSWORD,
    ],
    [
      "FLOW_WORKER_DATABASE_URL",
      "flow_test_validation_worker",
      process.env.FLOW_TEST_VALIDATION_WORKER_PASSWORD,
    ],
    [
      "FLOW_FIXTURE_DATABASE_URL",
      "flow_test_validation_fixture",
      process.env.FLOW_TEST_VALIDATION_FIXTURE_PASSWORD,
    ],
    [
      "FLOW_PAYMENT_DATABASE_URL",
      "flow_test_validation_payment_worker",
      process.env.FLOW_TEST_VALIDATION_PAYMENT_WORKER_PASSWORD,
    ],
    [
      "FLOW_AUTH_TICKET_DATABASE_URL",
      "flow_test_validation_auth_worker",
      process.env.FLOW_TEST_VALIDATION_AUTH_TICKET_PASSWORD,
    ],
    [
      "FLOW_OPERATOR_DATABASE_URL",
      "flow_test_validation_operator",
      process.env.FLOW_TEST_VALIDATION_OPERATOR_PASSWORD,
    ],
  ];
  for (const [key, role, password] of roles) {
    if (!password || !/^[a-f0-9]{64}$/.test(password))
      fail("Isolated QA role credential is missing.");
    const url = new URL(migrationUrl);
    url.username = role;
    url.password = password;
    databaseEnv[key] = url.toString();
  }
  databaseEnv.FLOW_TEST_DATABASE_REMOTE = "enabled";
  databaseEnv.FLOW_TEST_DATABASE_NAME = "flow_test_validation";
  const child = spawn("node", ["--test", "test/security.integration.mjs"], {
    stdio: "inherit",
    env: databaseEnv,
  });
  child.once("error", (error) => {
    console.error(
      JSON.stringify({
        event: "qa_security_tests_start_failed",
        error: error.message,
      }),
    );
    process.exit(1);
  });
  child.once("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1;
  });
}

async function testSecurityQaTwice() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_TEST_DATABASE_REMOTE !== "enabled" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  )
    fail(
      "Repeatable security tests require the isolated Railway QA environment.",
    );

  const rawAdminUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  const rawMigrationUrl = process.env.FLOW_MIGRATION_DATABASE_URL;
  if (!rawAdminUrl || !rawMigrationUrl)
    fail("Isolated QA database credentials are required.");
  const adminUrl = new URL(rawAdminUrl);
  const migrationBase = new URL(rawMigrationUrl);
  if (
    !adminUrl.hostname.endsWith(".railway.internal") ||
    adminUrl.pathname !== "/railway" ||
    decodeURIComponent(adminUrl.username) !== "postgres" ||
    migrationBase.pathname !== "/flow_test" ||
    decodeURIComponent(migrationBase.username) !== "flow_test_migrator"
  )
    fail(
      "QA credentials do not identify the isolated Railway Postgres service.",
    );

  const admin = new pg.Client({
    connectionString: rawAdminUrl,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    if (
      identity.rows[0]?.database !== "railway" ||
      identity.rows[0]?.role !== "postgres"
    ) {
      fail("QA bootstrap connection has an unexpected database identity.");
    }

    const deploymentId = process.env.RAILWAY_DEPLOYMENT_ID?.replaceAll("-", "");
    if (!deploymentId || !/^[a-f0-9]{32}$/i.test(deploymentId)) {
      fail(
        "Railway deployment identity is required for idempotent QA database names.",
      );
    }
    // Railway may restart a failed one-shot deployment with the same
    // deployment ID. Give each process invocation fresh isolated databases so
    // a retry never collides with, rotates credentials for, or mutates a prior
    // QA run. These databases are intentionally retained for review.
    const runId = randomBytes(5).toString("hex");
    const failedSuites = [];

    for (let pass = 1; pass <= 2; pass++) {
      const name = `flow_test_qa_${deploymentId.slice(0, 12).toLowerCase()}_${runId}_${pass}`;
      const existingDatabase = await admin.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [name],
      );
      if (existingDatabase.rowCount)
        fail(
          `QA database for pass ${pass} already exists; refusing to rerun the one-shot operation.`,
        );
      const roles = [
        "app",
        "payment_worker",
        "indexer_worker",
        "fixture",
        "worker",
        "custody_worker",
        "auth_worker",
        "operator",
        "migrator",
      ];
      const credentials = new Map(
        roles.map((suffix) => [suffix, randomBytes(32).toString("hex")]),
      );
      for (const suffix of roles) {
        const roleName = `${name}_${suffix}`;
        const existingRole = await admin.query(
          "SELECT 1 FROM pg_roles WHERE rolname = $1",
          [roleName],
        );
        if (existingRole.rowCount)
          fail(
            `QA role for pass ${pass} already exists; refusing to rotate it.`,
          );
        await admin.query(
          `CREATE ROLE "${roleName}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION ${suffix === "fixture" ? "BYPASSRLS" : "NOBYPASSRLS"} PASSWORD ${sqlLiteral(credentials.get(suffix))}`,
        );
      }
      await admin.query(`CREATE DATABASE "${name}" OWNER "${name}_migrator"`);
      await admin.query(`REVOKE CREATE ON DATABASE "${name}" FROM PUBLIC`);
      await admin.query(
        `GRANT CONNECT ON DATABASE "${name}" TO "${name}_app", "${name}_payment_worker", "${name}_indexer_worker", "${name}_fixture", "${name}_worker", "${name}_custody_worker", "${name}_auth_worker", "${name}_operator"`,
      );

      const databaseEnv = { ...process.env, FLOW_TEST_DATABASE_NAME: name };
      delete databaseEnv.FLOW_BOOTSTRAP_DATABASE_URL;
      for (const key of Object.keys(databaseEnv)) {
        if (/^FLOW_(?:STAGING|TEST|FLOW_TEST_QA_).*_PASSWORD$/.test(key))
          delete databaseEnv[key];
      }
      const makeUrl = (suffix) => {
        const url = new URL(migrationBase);
        url.pathname = `/${name}`;
        url.username = `${name}_${suffix}`;
        url.password = credentials.get(suffix);
        return url.toString();
      };
      databaseEnv.FLOW_MIGRATION_DATABASE_URL = makeUrl("migrator");
      databaseEnv.FLOW_DATABASE_URL = makeUrl("app");
      databaseEnv.FLOW_WORKER_DATABASE_URL = makeUrl("worker");
      databaseEnv.FLOW_FIXTURE_DATABASE_URL = makeUrl("fixture");
      databaseEnv.FLOW_PAYMENT_DATABASE_URL = makeUrl("payment_worker");
      databaseEnv.FLOW_INDEXER_DATABASE_URL = makeUrl("indexer_worker");
      databaseEnv.FLOW_CUSTODY_DATABASE_URL = makeUrl("custody_worker");
      databaseEnv.FLOW_AUTH_TICKET_DATABASE_URL = makeUrl("auth_worker");
      databaseEnv.FLOW_OPERATOR_DATABASE_URL = makeUrl("operator");

      const migrationEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        FLOW_ENV: "test",
        FLOW_EXECUTION: "disabled",
        FLOW_TEST_DATABASE_REMOTE: "enabled",
        FLOW_TEST_DATABASE_NAME: name,
        FLOW_MIGRATION_DATABASE_URL: databaseEnv.FLOW_MIGRATION_DATABASE_URL,
      };
      const integrationEnv = { ...databaseEnv };
      delete integrationEnv.FLOW_BOOTSTRAP_DATABASE_URL;
      delete integrationEnv.FLOW_MIGRATION_DATABASE_URL;
      delete integrationEnv.FLOW_DB_OPERATION;

      const run = (label, args, env) =>
        new Promise((resolve) => {
          console.log(
            JSON.stringify({
              event: "qa_suite_start",
              runId,
              pass,
              suite: label,
              database: name,
            }),
          );
          const child = spawn("node", args, { stdio: "inherit", env });
          child.once("error", () => resolve(false));
          child.once("exit", (code) => resolve(code === 0));
        });
      const migrationsReady = await run(
        "migrations",
        [
          "node_modules/prisma/build/index.js",
          "migrate",
          "deploy",
          "--config",
          "prisma.config.ts",
        ],
        migrationEnv,
      );
      if (!migrationsReady) failedSuites.push({ pass, suite: "migrations" });
      if (migrationsReady) {
        const securityPassed = await run(
          "complete security integration",
          ["--test", "test/security.integration.mjs"],
          integrationEnv,
        );
        if (!securityPassed)
          failedSuites.push({ pass, suite: "complete security integration" });
        const databasePassed = await run(
          "database integration",
          ["--test", "test/database.integration.ts"],
          integrationEnv,
        );
        if (!databasePassed)
          failedSuites.push({ pass, suite: "database integration" });
      } else {
        failedSuites.push(
          { pass, suite: "complete security integration (not run)" },
          { pass, suite: "database integration (not run)" },
        );
      }
      console.log(
        JSON.stringify({
          event: "qa_suite_pass",
          runId,
          pass,
          database: name,
          result: failedSuites.some((failure) => failure.pass === pass)
            ? "failed"
            : "passed",
        }),
      );
    }
    if (failedSuites.length) {
      console.error(
        JSON.stringify({
          event: "qa_twice_summary",
          runId,
          result: "failed",
          failures: failedSuites,
        }),
      );
      fail(
        "One or more complete isolated QA pass suites failed; review the per-suite summaries.",
      );
    }
    console.log(
      JSON.stringify({ event: "qa_twice_summary", runId, result: "passed" }),
    );
  } catch (error) {
    fail(`Repeatable QA suite stopped safely: ${error.message}`);
  } finally {
    await admin.end();
  }
}

async function testUnit() {
  if (
    process.env.FLOW_ENV !== "test" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "qa-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail("Unit tests are restricted to the isolated Railway QA service.");
  }

  const child = spawn("npm", ["test"], {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      FLOW_EXECUTION: "disabled",
    },
  });
  child.once("error", (error) => {
    console.error(
      JSON.stringify({
        event: "qa_unit_tests_start_failed",
        error: error.message,
      }),
    );
    process.exit(1);
  });
  child.once("exit", (code) => {
    if (code !== 0) process.exitCode = code ?? 1;
  });
}

async function inspectStagingReadiness() {
  if (
    process.env.FLOW_ENV !== "staging" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== STAGING_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "staging-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail(
      "Staging inspection is restricted to the designated isolated staging environment.",
    );
  }
  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawUrl) fail("FLOW_BOOTSTRAP_DATABASE_URL is required.");
  const stagingUrl = new URL(rawUrl);
  if (
    !stagingUrl.hostname.endsWith(".railway.internal") ||
    stagingUrl.pathname !== "/railway" ||
    decodeURIComponent(stagingUrl.username) !== "postgres"
  ) {
    fail(
      "Staging inspection URL does not identify the isolated Railway PostgreSQL service.",
    );
  }
  stagingUrl.pathname = "/flow_staging";
  stagingUrl.search = "?sslmode=require&uselibpqcompat=true";

  const admin = new pg.Client({
    connectionString: stagingUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const q = async (sql) => (await admin.query(sql)).rows;
    const migrations = await q(
      "SELECT COUNT(*)::int AS applied_count, MAX(migration_name) AS latest_migration FROM public._prisma_migrations WHERE finished_at IS NOT NULL",
    );
    const accounts = await q(
      "SELECT id, kind::text AS kind, name, personal_owner_id, created_at FROM flow.accounts ORDER BY created_at ASC LIMIT 50",
    );
    const users = await q(
      "SELECT id, auth_user_id, active, created_at FROM flow.users ORDER BY created_at ASC LIMIT 50",
    );
    const authUsers = await q(`
      SELECT
        au.id,
        au.email_verified,
        au.email_enrolled,
        au.mailbox_paused,
        EXISTS (
          SELECT 1 FROM flow.google_subject_bindings g WHERE g.user_id = au.id
        ) AS has_google,
        au.created_at
      FROM flow.auth_users au
      ORDER BY au.created_at ASC
      LIMIT 50
    `);
    const wallets = await q(
      "SELECT id, account_id, provider, environment, provider_wallet_id, near_account_id, status::text AS status, policy_state, key_id, left(key_digest, 12) AS key_digest_prefix, created_at FROM flow.wallets ORDER BY created_at ASC LIMIT 50",
    );
    const provisioningJobs = await q(
      "SELECT id, account_id, status::text AS status, attempts, failure_classification, last_error, created_at, updated_at FROM flow.wallet_provisioning_jobs ORDER BY created_at ASC LIMIT 50",
    );
    const operators = await q(
      "SELECT id, auth_user_id, role, status, enrolled_at FROM flow.custody_operators ORDER BY enrolled_at ASC LIMIT 25",
    );
    const compatAuths = await q(
      "SELECT id, account_id, environment, status, max_registrations, registrations_attempted, registrations_completed, expires_at FROM flow.provider_compatibility_authorizations ORDER BY created_at ASC LIMIT 25",
    );
    const counts = await q(`
      SELECT
        (SELECT COUNT(*)::int FROM flow.account_sync_jobs) AS account_sync_jobs,
        (SELECT COUNT(*)::int FROM flow.payment_requests) AS payment_requests,
        (SELECT COUNT(*)::int FROM flow.payment_attempts) AS payment_attempts,
        (SELECT COUNT(*)::int FROM flow.add_money_intents) AS add_money_intents,
        (SELECT COUNT(*)::int FROM flow.outgoing_transfer_jobs) AS outgoing_transfer_jobs,
        (SELECT COUNT(*)::int FROM flow.wallet_balances) AS wallet_balances,
        (SELECT COUNT(*)::int FROM flow.wallet_activities) AS wallet_activities
    `);

    const authIdentities = await q(
      "SELECT id, user_id, provider_id, google_binding_order::text AS google_binding_order, created_at FROM flow.auth_identities ORDER BY created_at ASC LIMIT 50",
    );
    const googleBindingsSummary = await q(
      "SELECT COUNT(*)::int AS count, array_agg(user_id ORDER BY created_at ASC) AS user_ids FROM flow.google_subject_bindings",
    );
    const authSessionsSummary = await q(
      "SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP)::int AS active_count, MAX(created_at) AS latest_created_at FROM flow.auth_sessions",
    );
    const authIntents = await q(
      "SELECT purpose, verified, attempts, google_start_order::text AS google_start_order, user_id, issued_at, expires_at FROM flow.auth_intents ORDER BY issued_at DESC LIMIT 25",
    );
    const authTicketsSummary = await q(
      "SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE consumed_at IS NULL)::int AS unconsumed_count, MAX(created_at) AS latest_created_at FROM flow.auth_issuance_tickets",
    );
    const authThrottlesSummary = await q(
      "SELECT split_part(key, ':', 1) || ':' || split_part(key, ':', 2) AS bucket, count, expires_at FROM flow.auth_throttles ORDER BY expires_at DESC LIMIT 25",
    );
    const recentAuditEvents = await q(
      "SELECT kind, actor_auth_id, account_id, target_id, created_at FROM flow.security_audit_events ORDER BY created_at DESC LIMIT 30",
    );
    const dbClock = await q(
      "SELECT current_setting('TIMEZONE') AS timezone, CURRENT_TIMESTAMP AS current_ts, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS current_ts_utc",
    );
    const authFunctionChecks = await q(`
      SELECT
        pg_get_functiondef('flow.issue_google_auth_ticket(text,text,bigint)'::regprocedure) AS issue_google_def,
        pg_get_functiondef('flow.issue_email_auth_ticket(text,text)'::regprocedure) AS issue_email_def,
        pg_get_functiondef('flow.trg_auth_sessions_validate_insert()'::regprocedure) AS trg_session_def
    `);
    const roleChecks = {};
    for (const [label, roleName, passwordEnv] of [
      [
        "payment",
        "flow_staging_payment_worker",
        "FLOW_STAGING_PAYMENT_WORKER_PASSWORD",
      ],
      [
        "indexer",
        "flow_staging_indexer_worker",
        "FLOW_STAGING_INDEXER_WORKER_PASSWORD",
      ],
      [
        "custody",
        "flow_staging_custody_worker",
        "FLOW_STAGING_CUSTODY_WORKER_PASSWORD",
      ],
      ["app", "flow_staging_app", "FLOW_STAGING_APP_PASSWORD"],
      [
        "auth_ticket",
        "flow_staging_auth_worker",
        "FLOW_STAGING_AUTH_TICKET_PASSWORD",
      ],
    ]) {
      const pw = process.env[passwordEnv];
      if (!pw) {
        roleChecks[label] = { configured: false };
        continue;
      }
      const roleUrl = new URL(stagingUrl.toString());
      roleUrl.username = roleName;
      roleUrl.password = pw;
      const rc = new pg.Client({
        connectionString: roleUrl.toString(),
        connectionTimeoutMillis: 5000,
      });
      try {
        await rc.connect();
      } catch (err) {
        roleChecks[label] = {
          connectError: err instanceof Error ? err.message : String(err),
        };
        continue;
      }
      try {
        const res = await rc.query(`
          SELECT
            current_user AS role,
            session_user AS session_user,
            has_schema_privilege(current_user, 'flow', 'USAGE') AS can_use_flow_schema,
            has_function_privilege(current_user, 'flow.claim_active_add_money_intents(text,integer,integer)', 'EXECUTE') AS can_claim_add_money,
            has_function_privilege(current_user, 'flow.claim_account_sync_job(text,integer)', 'EXECUTE') AS can_claim_sync,
            has_function_privilege(current_user, 'flow.claim_outgoing_transfer_for_custody(text,integer)', 'EXECUTE') AS can_claim_outgoing,
            has_function_privilege(current_user, 'flow.issue_google_auth_ticket(text,text,bigint)', 'EXECUTE') AS can_issue_google_ticket,
            has_function_privilege(current_user, 'flow.issue_email_auth_ticket(text,text)', 'EXECUTE') AS can_issue_email_ticket,
            has_sequence_privilege(current_user, 'flow.google_oauth_order', 'USAGE') AS can_use_google_order_seq,
            has_table_privilege(current_user, 'flow.auth_users', 'INSERT') AS can_insert_auth_users,
            has_table_privilege(current_user, 'flow.auth_identities', 'INSERT') AS can_insert_auth_identities,
            has_table_privilege(current_user, 'flow.google_subject_bindings', 'INSERT') AS can_insert_google_bindings,
            has_table_privilege(current_user, 'flow.auth_sessions', 'INSERT') AS can_insert_auth_sessions,
            has_table_privilege(current_user, 'flow.outgoing_transfer_jobs', 'UPDATE') AS can_direct_update_outgoing,
            has_table_privilege(current_user, 'flow.wallets', 'DELETE') AS can_delete_wallets
        `);
        let ticketProbe = null;
        let emailTicketProbe = null;
        if (label === "auth_ticket") {
          try {
            await rc.query(
              "SELECT flow.issue_google_auth_ticket('__diag_nonexistent_sub__', '__diag_nonexistent_user__', 1)",
            );
            ticketProbe = "unexpected_success";
          } catch (probeErr) {
            ticketProbe =
              probeErr instanceof Error ? probeErr.message : String(probeErr);
          }
          try {
            await rc.query(
              "SELECT flow.issue_email_auth_ticket('__diag_nonexistent_slot__', '__diag_nonexistent_digest__')",
            );
            emailTicketProbe = "unexpected_success";
          } catch (probeErr) {
            emailTicketProbe =
              probeErr instanceof Error ? probeErr.message : String(probeErr);
          }
        }
        roleChecks[label] = {
          ...res.rows[0],
          ...(ticketProbe ? { ticketProbe } : {}),
          ...(emailTicketProbe ? { emailTicketProbe } : {}),
        };
      } finally {
        await rc.end();
      }
    }

    console.log(
      JSON.stringify({
        event: "staging_readiness_snapshot",
        migrations: migrations[0],
        counts: counts[0],
        accounts,
        users,
        authUsers,
        authIdentities,
        googleBindingsSummary: googleBindingsSummary[0],
        authSessionsSummary: authSessionsSummary[0],
        authIntents,
        authTicketsSummary: authTicketsSummary[0],
        authThrottlesSummary,
        recentAuditEvents,
        dbClock: dbClock[0],
        authFunctionFlags: {
          googleRequiresWorkerSuffix:
            authFunctionChecks[0]?.issue_google_def?.includes(
              "LIKE '%_worker'",
            ) ?? null,
          emailRequiresWorkerSuffix:
            authFunctionChecks[0]?.issue_email_def?.includes(
              "LIKE '%_worker'",
            ) ?? null,
          emailUsesUtcAtZone:
            authFunctionChecks[0]?.issue_email_def?.includes(
              "AT TIME ZONE 'UTC'",
            ) ?? null,
          trgRequiresActiveTicket:
            authFunctionChecks[0]?.trg_session_def?.includes(
              "flow.active_auth_ticket_id",
            ) ?? null,
          issueGoogleDef: authFunctionChecks[0]?.issue_google_def ?? null,
          issueEmailDef: authFunctionChecks[0]?.issue_email_def ?? null,
          trgSessionDef: authFunctionChecks[0]?.trg_session_def ?? null,
        },
        wallets,
        provisioningJobs,
        operators,
        compatAuths,
        roleChecks,
      }),
    );
  } finally {
    await admin.end();
  }
}

async function inspectProductionReadiness() {
  if (
    process.env.FLOW_ENV !== "production" ||
    process.env.RAILWAY_ENVIRONMENT_ID !== PRODUCTION_ENVIRONMENT_ID ||
    process.env.FLOW_DB_TARGET !== "production-empty-only" ||
    process.env.FLOW_EXECUTION !== "disabled" ||
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    fail(
      "Production inspection is restricted to the designated isolated production environment.",
    );
  }
  const rawUrl = process.env.FLOW_BOOTSTRAP_DATABASE_URL;
  if (!rawUrl) fail("FLOW_BOOTSTRAP_DATABASE_URL is required.");
  const prodUrl = new URL(rawUrl);
  if (
    !prodUrl.hostname.endsWith(".railway.internal") ||
    prodUrl.pathname !== "/railway" ||
    decodeURIComponent(prodUrl.username) !== "postgres"
  ) {
    fail(
      "Production inspection URL does not identify the isolated Railway PostgreSQL service.",
    );
  }
  prodUrl.pathname = "/flow_production";
  prodUrl.search = "?sslmode=require&uselibpqcompat=true";

  const admin = new pg.Client({
    connectionString: prodUrl.toString(),
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  try {
    const q = async (sql) => (await admin.query(sql)).rows;
    const migrations = await q(
      "SELECT COUNT(*)::int AS applied_count, MAX(migration_name) AS latest_migration FROM public._prisma_migrations WHERE finished_at IS NOT NULL",
    );
    const dbClock = await q(
      "SELECT current_setting('TIMEZONE') AS timezone, CURRENT_TIMESTAMP AS current_ts",
    );
    const counts = await q(`
      SELECT
        (SELECT COUNT(*)::int FROM flow.auth_users) AS auth_users,
        (SELECT COUNT(*)::int FROM flow.auth_identities) AS auth_identities,
        (SELECT COUNT(*)::int FROM flow.auth_sessions) AS auth_sessions,
        (SELECT COUNT(*)::int FROM flow.auth_intents) AS auth_intents,
        (SELECT COUNT(*)::int FROM flow.google_subject_bindings) AS google_bindings,
        (SELECT COUNT(*)::int FROM flow.users) AS users,
        (SELECT COUNT(*)::int FROM flow.accounts) AS accounts,
        (SELECT COUNT(*)::int FROM flow.wallets) AS wallets,
        (SELECT COUNT(*)::int FROM flow.wallet_provisioning_jobs) AS provisioning_jobs
    `);
    const roleChecks = {};
    for (const [label, roleName, passwordEnv] of [
      ["app", "flow_production_app", "FLOW_PRODUCTION_APP_PASSWORD"],
      [
        "auth_worker",
        "flow_production_auth_worker",
        "FLOW_PRODUCTION_AUTH_WORKER_PASSWORD",
      ],
      [
        "custody_worker",
        "flow_production_custody_worker",
        "FLOW_PRODUCTION_CUSTODY_WORKER_PASSWORD",
      ],
      [
        "payment_worker",
        "flow_production_payment_worker",
        "FLOW_PRODUCTION_PAYMENT_WORKER_PASSWORD",
      ],
      [
        "indexer_worker",
        "flow_production_indexer_worker",
        "FLOW_PRODUCTION_INDEXER_WORKER_PASSWORD",
      ],
    ]) {
      const pw = process.env[passwordEnv];
      if (!pw) {
        roleChecks[label] = { configured: false };
        continue;
      }
      const roleUrl = new URL(prodUrl.toString());
      roleUrl.username = roleName;
      roleUrl.password = pw;
      const rc = new pg.Client({
        connectionString: roleUrl.toString(),
        connectionTimeoutMillis: 5000,
      });
      try {
        await rc.connect();
      } catch (err) {
        roleChecks[label] = {
          connectError: err instanceof Error ? err.message : String(err),
        };
        continue;
      }
      try {
        const res = await rc.query(`
          SELECT
            current_user AS current_user,
            has_schema_privilege(current_user, 'flow', 'USAGE') AS can_use_flow_schema,
            has_function_privilege(current_user, 'flow.issue_google_auth_ticket(text,text,bigint)', 'EXECUTE') AS can_issue_google_ticket,
            has_function_privilege(current_user, 'flow.issue_email_auth_ticket(text,text)', 'EXECUTE') AS can_issue_email_ticket,
            has_sequence_privilege(current_user, 'flow.google_oauth_order', 'USAGE') AS can_use_google_order_seq,
            has_table_privilege(current_user, 'flow.auth_users', 'INSERT') AS can_insert_auth_users,
            has_table_privilege(current_user, 'flow.auth_identities', 'INSERT') AS can_insert_auth_identities,
            has_table_privilege(current_user, 'flow.google_subject_bindings', 'INSERT') AS can_insert_google_bindings,
            has_table_privilege(current_user, 'flow.auth_sessions', 'INSERT') AS can_insert_auth_sessions,
            has_table_privilege(current_user, 'flow.auth_intents', 'INSERT') AS can_insert_auth_intents,
            has_table_privilege(current_user, 'flow.users', 'INSERT') AS can_insert_users,
            has_table_privilege(current_user, 'flow.accounts', 'INSERT') AS can_insert_accounts,
            has_table_privilege(current_user, 'flow.account_memberships', 'INSERT') AS can_insert_account_memberships,
            has_table_privilege(current_user, 'flow.wallet_provisioning_jobs', 'INSERT') AS can_insert_provisioning_jobs,
            has_table_privilege(current_user, 'flow.wallets', 'SELECT') AS can_select_wallets_table,
            has_table_privilege(current_user, 'flow.security_audit_events', 'INSERT') AS can_insert_audit_events
        `);
        let ticketProbe = null;
        let emailTicketProbe = null;
        if (label === "auth_worker") {
          try {
            await rc.query(
              "SELECT flow.issue_google_auth_ticket('__diag_nonexistent_sub__', '__diag_nonexistent_user__', 1)",
            );
            ticketProbe = "unexpected_success";
          } catch (probeErr) {
            ticketProbe =
              probeErr instanceof Error ? probeErr.message : String(probeErr);
          }
          try {
            await rc.query(
              "SELECT flow.issue_email_auth_ticket('__diag_nonexistent__@example.com', 'none')",
            );
            emailTicketProbe = "unexpected_success";
          } catch (probeErr) {
            emailTicketProbe =
              probeErr instanceof Error ? probeErr.message : String(probeErr);
          }
        }
        roleChecks[label] = {
          ...res.rows[0],
          ...(ticketProbe ? { ticketProbe } : {}),
          ...(emailTicketProbe ? { emailTicketProbe } : {}),
        };
      } finally {
        await rc.end();
      }
    }
    console.log(
      JSON.stringify({
        event: "production_readiness_snapshot",
        migrations: migrations[0],
        dbClock: dbClock[0],
        counts: counts[0],
        roleChecks,
      }),
    );
  } finally {
    await admin.end();
  }
}

function idle() {
  const stagingSafe =
    process.env.FLOW_ENV === "test" &&
    process.env.RAILWAY_ENVIRONMENT_ID === STAGING_ENVIRONMENT_ID &&
    process.env.FLOW_DB_TARGET === "qa-only" &&
    process.env.FLOW_EXECUTION === "disabled" &&
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE === "disabled";
  const productionSafe =
    process.env.FLOW_ENV === "production" &&
    process.env.RAILWAY_ENVIRONMENT_ID === PRODUCTION_ENVIRONMENT_ID &&
    process.env.FLOW_DB_TARGET === "production-empty-only" &&
    process.env.FLOW_PUBLIC_SIGNUP_ENABLED === "disabled" &&
    process.env.FLOW_WALLET_REGISTRATION_ENABLED === "disabled" &&
    process.env.FLOW_EXECUTION === "disabled" &&
    process.env.FLOW_PROVIDER_COMPATIBILITY_MODE === "disabled";
  if (!productionSafe && !stagingSafe) {
    fail("Idle mode is restricted to explicitly gated isolated environments.");
  }
  console.log(
    JSON.stringify({
      event: productionSafe
        ? "production_database_operation_idle"
        : "qa_database_operation_idle",
    }),
  );
}

if (operation === "bootstrap-staging-and-qa") await bootstrap();
else if (operation === "bootstrap-production-empty")
  await bootstrapProduction();
else if (operation === "migrate-production") await migrateProduction();
else if (operation === "recover-production-m6") await recoverProductionM6();
else if (operation === "rehearse-production-migrations")
  await rehearseProductionMigrations();
else if (operation === "export-production-postgres-ca")
  await exportProductionPostgresCa();
else if (operation === "migrate-staging") await migrateStaging();
else if (operation === "inspect-staging-readiness")
  await inspectStagingReadiness();
else if (operation === "inspect-production-readiness")
  await inspectProductionReadiness();
else if (operation === "provision-auth-ticket-role")
  await provisionAuthTicketRole();
else if (operation === "provision-indexer-heartbeat-role")
  await provisionStagingIndexerHeartbeatRole();
else if (operation === "migrate-qa") await migrate();
else if (operation === "test-qa") await testQa();
else if (operation === "create-qa-validation")
  await createQaValidationDatabase();
else if (operation === "test-security-qa") await testSecurityQa();
else if (operation === "test-security-qa-twice") await testSecurityQaTwice();
else if (operation === "test-unit") await testUnit();
else if (operation === "idle") idle();
else fail("FLOW_DB_OPERATION is unsupported.");
