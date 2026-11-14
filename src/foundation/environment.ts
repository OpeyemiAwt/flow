import { isIP } from "node:net";
import { z } from "zod";
import { FlowError } from "./errors.ts";

const environmentSchema = z.object({
  FLOW_ENV: z.enum(["local", "test", "staging", "production"]),
  FLOW_EXECUTION: z.literal("disabled"),
  FLOW_TEST_DATABASE_REMOTE: z.literal("enabled").optional(),
  FLOW_TEST_DATABASE_NAME: z
    .string()
    .regex(/^flow_test_[a-z0-9_]+$/)
    .optional(),
});

type EnvironmentInput = Readonly<Record<string, string | undefined>>;
export type DatabasePurpose =
  | "runtime"
  | "worker"
  | "payment"
  | "indexer"
  | "custody"
  | "auth"
  | "operator"
  | "migration"
  | "fixture";

const databaseUrlKeys = {
  runtime: "FLOW_DATABASE_URL",
  worker: "FLOW_WORKER_DATABASE_URL",
  fixture: "FLOW_FIXTURE_DATABASE_URL",
  payment: "FLOW_PAYMENT_DATABASE_URL",
  indexer: "FLOW_INDEXER_DATABASE_URL",
  custody: "FLOW_CUSTODY_DATABASE_URL",
  auth: "FLOW_AUTH_TICKET_DATABASE_URL",
  operator: "FLOW_OPERATOR_DATABASE_URL",
  migration: "FLOW_MIGRATION_DATABASE_URL",
} as const;

const otherDatabaseCredentialKeys = [
  "FLOW_POSTGRES_ADMIN_PASSWORD",
  "FLOW_LOCAL_APP_PASSWORD",
  "FLOW_LOCAL_WORKER_PASSWORD",
  "FLOW_LOCAL_OPERATOR_PASSWORD",
  "FLOW_LOCAL_MIGRATOR_PASSWORD",
  "FLOW_TEST_APP_PASSWORD",
  "FLOW_TEST_WORKER_PASSWORD",
  "FLOW_TEST_OPERATOR_PASSWORD",
  "FLOW_TEST_MIGRATOR_PASSWORD",
  "FLOW_TEST_INDEXER_WORKER_PASSWORD",
  "POSTGRES_PASSWORD",
  "POSTGRES_PASSWORD_FILE",
  "PGPASSWORD",
  "PGPASSFILE",
  "DATABASE_URL",
  "DIRECT_URL",
];

export type DatabaseTarget = Readonly<{
  url: string;
  name: string;
  role: string;
  tls: boolean;
  verifyTlsCertificate: boolean;
}>;

function invalidConfig(message: string): never {
  throw new FlowError("INVALID_CONFIGURATION", message);
}

function assertCredentialScope(
  source: EnvironmentInput,
  purpose: DatabasePurpose,
): void {
  if (Object.keys(source).some((key) => key.startsWith("NEXT_PUBLIC_"))) {
    invalidConfig("Public environment variables are disabled for FLOW M0.");
  }
  const disallowedUrls =
    purpose === "migration"
      ? [
          "FLOW_DATABASE_URL",
          "FLOW_WORKER_DATABASE_URL",
          "FLOW_PAYMENT_DATABASE_URL",
          "FLOW_INDEXER_DATABASE_URL",
          "FLOW_CUSTODY_DATABASE_URL",
          "FLOW_AUTH_TICKET_DATABASE_URL",
          "FLOW_OPERATOR_DATABASE_URL",
        ]
      : purpose === "auth"
        ? [
            "FLOW_MIGRATION_DATABASE_URL",
            "FLOW_WORKER_DATABASE_URL",
            "FLOW_PAYMENT_DATABASE_URL",
            "FLOW_INDEXER_DATABASE_URL",
            "FLOW_CUSTODY_DATABASE_URL",
            "FLOW_OPERATOR_DATABASE_URL",
          ]
        : purpose === "custody"
          ? [
              "FLOW_DATABASE_URL",
              "FLOW_WORKER_DATABASE_URL",
              "FLOW_PAYMENT_DATABASE_URL",
              "FLOW_INDEXER_DATABASE_URL",
              "FLOW_AUTH_TICKET_DATABASE_URL",
              "FLOW_OPERATOR_DATABASE_URL",
              "FLOW_MIGRATION_DATABASE_URL",
            ]
          : purpose === "runtime"
            ? [
                "FLOW_MIGRATION_DATABASE_URL",
                "FLOW_CUSTODY_DATABASE_URL",
                "FLOW_INDEXER_DATABASE_URL",
              ]
            : purpose === "payment"
              ? [
                  "FLOW_DATABASE_URL",
                  "FLOW_WORKER_DATABASE_URL",
                  "FLOW_INDEXER_DATABASE_URL",
                  "FLOW_CUSTODY_DATABASE_URL",
                  "FLOW_AUTH_TICKET_DATABASE_URL",
                  "FLOW_OPERATOR_DATABASE_URL",
                  "FLOW_MIGRATION_DATABASE_URL",
                ]
              : purpose === "worker"
                ? [
                    "FLOW_DATABASE_URL",
                    "FLOW_PAYMENT_DATABASE_URL",
                    "FLOW_INDEXER_DATABASE_URL",
                    "FLOW_CUSTODY_DATABASE_URL",
                    "FLOW_AUTH_TICKET_DATABASE_URL",
                    "FLOW_OPERATOR_DATABASE_URL",
                    "FLOW_MIGRATION_DATABASE_URL",
                  ]
                : purpose === "indexer"
                  ? [
                      "FLOW_DATABASE_URL",
                      "FLOW_WORKER_DATABASE_URL",
                      "FLOW_PAYMENT_DATABASE_URL",
                      "FLOW_CUSTODY_DATABASE_URL",
                      "FLOW_AUTH_TICKET_DATABASE_URL",
                      "FLOW_OPERATOR_DATABASE_URL",
                      "FLOW_MIGRATION_DATABASE_URL",
                      "FLOW_FIXTURE_DATABASE_URL",
                    ]
                  : purpose === "fixture"
                    ? [
                        "FLOW_DATABASE_URL",
                        "FLOW_WORKER_DATABASE_URL",
                        "FLOW_PAYMENT_DATABASE_URL",
                        "FLOW_INDEXER_DATABASE_URL",
                        "FLOW_CUSTODY_DATABASE_URL",
                        "FLOW_AUTH_TICKET_DATABASE_URL",
                        "FLOW_OPERATOR_DATABASE_URL",
                        "FLOW_MIGRATION_DATABASE_URL",
                      ]
                    : ["FLOW_MIGRATION_DATABASE_URL"];
  if (
    disallowedUrls.some((k) => source[k] !== undefined) ||
    otherDatabaseCredentialKeys.some((key) => source[key] !== undefined)
  ) {
    invalidConfig(
      `Supply only the FLOW ${purpose} database credential to this process.`,
    );
  }
}

const SPONSOR_SECRET_ENV_KEYS = [
  "FLOW_NEAR_SPONSOR_PRIVATE_KEY",
  "FLOW_NEAR_SPONSOR_SIGNER_TOKEN",
] as const;

function assertSponsorCredentialsIsolated(
  source: EnvironmentInput,
  contextLabel: string,
): void {
  if (SPONSOR_SECRET_ENV_KEYS.some((key) => source[key] !== undefined)) {
    invalidConfig(
      `NEAR sponsor signing credentials are strictly isolated to the custody worker and prohibited in ${contextLabel}.`,
    );
  }
}

export function assertWebEnvironment(source: EnvironmentInput): void {
  if (source.FLOW_CUSTODY_DATABASE_URL !== undefined) {
    invalidConfig(
      "Custody database credentials are strictly isolated from the web process.",
    );
  }
  assertCredentialScope(source, "runtime");
  assertSponsorCredentialsIsolated(source, "the web process");
  if (source.FLOW_WALLET_ENCRYPTION_KEY !== undefined) {
    invalidConfig(
      "Supply only the FLOW web runtime credentials to this process. Custody encryption keys are isolated to the wallet worker.",
    );
  }
  if (source.FLOW_OPERATOR_DATABASE_URL !== undefined) {
    invalidConfig(
      "Supply only the FLOW web runtime credentials to this process. Privileged operator database credentials are strictly isolated.",
    );
  }
  if (source.FLOW_WORKER_DATABASE_URL !== undefined) {
    invalidConfig(
      "Supply only FLOW_DATABASE_URL and the restricted FLOW_AUTH_TICKET_DATABASE_URL to the web process.",
    );
  }
  if (source.FLOW_PAYMENT_DATABASE_URL !== undefined) {
    invalidConfig(
      "Payment worker credentials are strictly isolated from the web process.",
    );
  }
  if (source.FLOW_INDEXER_DATABASE_URL !== undefined) {
    invalidConfig(
      "Indexer worker credentials are strictly isolated from the web process.",
    );
  }
  if (source.FLOW_FIXTURE_DATABASE_URL !== undefined) {
    invalidConfig(
      "QA fixture credentials are strictly isolated from the web process.",
    );
  }
}

export function assertWorkerEnvironment(source: EnvironmentInput): void {
  if (source.FLOW_MIGRATION_DATABASE_URL !== undefined) {
    invalidConfig(
      "Migration credentials must remain strictly isolated and are prohibited in worker runtime.",
    );
  }
  if (source.FLOW_OPERATOR_DATABASE_URL !== undefined) {
    invalidConfig(
      "Operator credentials must remain strictly isolated and are prohibited in worker runtime.",
    );
  }
  assertCredentialScope(source, "worker");
  assertSponsorCredentialsIsolated(source, "legacy worker runtime");
  if (
    source.FLOW_WALLET_ENCRYPTION_KEY !== undefined ||
    source.FLOW_OUTLAYER_API_KEY !== undefined
  ) {
    invalidConfig("Legacy workers cannot receive custody credentials.");
  }
}

export function assertPaymentEnvironment(source: EnvironmentInput): void {
  assertCredentialScope(source, "payment");
  assertSponsorCredentialsIsolated(source, "the payment worker");
  if (source.FLOW_WALLET_ENCRYPTION_KEY !== undefined) {
    invalidConfig(
      "Custody encryption keys are strictly isolated from the payment worker.",
    );
  }
  if (
    source.FLOW_EXECUTION !== "disabled" ||
    source.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    invalidConfig(
      "Payment worker requires financial execution and provider compatibility to remain disabled.",
    );
  }
}

export function assertIndexerEnvironment(source: EnvironmentInput): void {
  assertCredentialScope(source, "indexer");
  assertSponsorCredentialsIsolated(source, "the indexer worker");
  if (
    source.FLOW_WALLET_ENCRYPTION_KEY !== undefined ||
    source.FLOW_OUTLAYER_API_KEY !== undefined
  ) {
    invalidConfig("Indexer workers cannot receive custody credentials.");
  }
  if (
    source.FLOW_EXECUTION !== "disabled" ||
    source.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
  ) {
    invalidConfig(
      "Indexer workers require financial execution and provider compatibility to remain disabled.",
    );
  }
}

export function assertCustodyEnvironment(source: EnvironmentInput): void {
  assertCredentialScope(source, "custody");
  const heartbeatOnly = source.FLOW_CUSTODY_WORKER_MODE === "heartbeat-only";
  const executeMode = source.FLOW_CUSTODY_WORKER_MODE === "execute";
  if (!heartbeatOnly && !source.FLOW_WALLET_ENCRYPTION_KEY) {
    invalidConfig("Custody worker encryption configuration is required.");
  }
  if (executeMode) {
    if (
      source.FLOW_EXECUTION === "enabled" &&
      source.FLOW_PROVIDER_COMPATIBILITY_MODE &&
      source.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled"
    ) {
      invalidConfig(
        "Custody worker execute mode requires provider compatibility mode to remain disabled.",
      );
    }
    return;
  }
  if (source.FLOW_EXECUTION !== "disabled") {
    invalidConfig("Custody worker requires FLOW_EXECUTION=disabled.");
  }
}

export function assertOperatorEnvironment(source: EnvironmentInput): void {
  assertSponsorCredentialsIsolated(source, "operator runtime");
  if (source.FLOW_MIGRATION_DATABASE_URL !== undefined) {
    invalidConfig(
      "Migration credentials must remain strictly isolated and are prohibited in operator runtime.",
    );
  }
  if (source.FLOW_WALLET_ENCRYPTION_KEY !== undefined) {
    invalidConfig(
      "Wallet encryption key is strictly isolated to the wallet worker and is prohibited in operator runtime.",
    );
  }
}

function parseDatabaseUrl(value: string | undefined, variable: string): URL {
  if (!value || /\s/.test(value)) {
    return invalidConfig(`${variable} must be an encoded PostgreSQL URL.`);
  }

  try {
    return new URL(value);
  } catch {
    return invalidConfig(`${variable} must be an encoded PostgreSQL URL.`);
  }
}

function hasDatabasePassword(url: URL): boolean {
  try {
    const password = decodeURIComponent(url.password);
    return password.trim().length >= 16 && !password.startsWith("replace-");
  } catch {
    return false;
  }
}

function hasExpectedTls(
  url: URL,
  purpose: DatabasePurpose,
  tls: boolean,
  remoteTestDatabase: boolean,
  stagingRailwayDatabase: boolean,
): boolean {
  if (!tls) {
    return url.search === "";
  }

  // Railway's private Postgres certificate is self-signed. Permit encrypted
  // transport without chain validation only for the isolated flow_test DB.
  if (remoteTestDatabase || stagingRailwayDatabase) {
    return (
      url.searchParams.size === 2 &&
      url.searchParams.get("sslmode") === "require" &&
      url.searchParams.get("uselibpqcompat") === "true"
    );
  }

  if (purpose !== "migration") {
    return (
      url.searchParams.size === 1 &&
      url.searchParams.get("sslmode") === "verify-full"
    );
  }

  return (
    url.searchParams.size === 2 &&
    url.searchParams.get("sslmode") === "require" &&
    url.searchParams.get("sslaccept") === "strict"
  );
}

export function readConfig(source: EnvironmentInput, purpose: DatabasePurpose) {
  assertCredentialScope(source, purpose);

  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join("."));
    return invalidConfig(
      `Invalid FLOW configuration fields: ${fields.join(", ")}.`,
    );
  }

  const { FLOW_ENV: environment, FLOW_EXECUTION: execution } = result.data;
  if (
    purpose === "runtime" &&
    environment !== "test" &&
    [
      "FLOW_WORKER_DATABASE_URL",
      "FLOW_PAYMENT_DATABASE_URL",
      "FLOW_INDEXER_DATABASE_URL",
      "FLOW_FIXTURE_DATABASE_URL",
    ].some((key) => source[key] !== undefined)
  ) {
    invalidConfig(
      "Worker and QA fixture database credentials are prohibited in the web runtime.",
    );
  }
  if (
    source.FLOW_TEST_DATABASE_REMOTE !== undefined &&
    environment !== "test"
  ) {
    invalidConfig("Remote test database mode is restricted to FLOW_ENV=test.");
  }
  if (
    source.FLOW_TEST_DATABASE_NAME !== undefined &&
    (environment !== "test" || source.FLOW_TEST_DATABASE_REMOTE !== "enabled")
  ) {
    invalidConfig(
      "Alternate database names are restricted to isolated remote QA.",
    );
  }
  if (purpose === "fixture" && environment !== "test") {
    invalidConfig(
      "Fixture database credentials are restricted to isolated FLOW_ENV=test.",
    );
  }
  if (
    source.FLOW_FIXTURE_DATABASE_URL !== undefined &&
    environment !== "test"
  ) {
    invalidConfig(
      "Fixture database credentials are restricted to isolated FLOW_ENV=test.",
    );
  }
  const tls =
    environment === "staging" ||
    environment === "production" ||
    (environment === "test" && source.FLOW_TEST_DATABASE_REMOTE === "enabled");
  const variable = databaseUrlKeys[purpose];
  const databaseName =
    environment === "test"
      ? (source.FLOW_TEST_DATABASE_NAME ?? "flow_test")
      : `flow_${environment}`;
  const roleSuffix =
    purpose === "runtime"
      ? "app"
      : purpose === "worker"
        ? "worker"
        : purpose === "payment"
          ? "payment_worker"
          : purpose === "indexer"
            ? "indexer_worker"
            : purpose === "fixture"
              ? "fixture"
              : purpose === "custody"
                ? "custody_worker"
                : purpose === "auth"
                  ? "auth_worker"
                  : purpose === "operator"
                    ? "operator"
                    : "migrator";
  const role = `${databaseName}_${roleSuffix}`;
  const url = parseDatabaseUrl(source[variable], variable);

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.port ||
    url.port === "0" ||
    url.hash ||
    url.pathname !== `/${databaseName}` ||
    url.username !== role ||
    !hasDatabasePassword(url)
  ) {
    return invalidConfig(
      `${variable} must target ${databaseName} as ${role} with a real password.`,
    );
  }

  const validHost = tls
    ? isIP(url.hostname) === 0 &&
      /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) &&
      !url.hostname.toLowerCase().endsWith(".localhost")
    : url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    !validHost ||
    !hasExpectedTls(
      url,
      purpose,
      tls,
      environment === "test" && source.FLOW_TEST_DATABASE_REMOTE === "enabled",
      environment === "staging" &&
        url.hostname.toLowerCase().endsWith(".railway.internal"),
    )
  ) {
    return invalidConfig(
      `${variable} has an invalid host or TLS configuration for ${environment}.`,
    );
  }

  const database: DatabaseTarget = {
    url: url.href,
    name: databaseName,
    role,
    tls,
    verifyTlsCertificate: !(
      (environment === "test" &&
        source.FLOW_TEST_DATABASE_REMOTE === "enabled") ||
      (environment === "staging" &&
        url.hostname.toLowerCase().endsWith(".railway.internal"))
    ),
  };
  return { environment, execution, database };
}
