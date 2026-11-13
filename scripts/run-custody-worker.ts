import { randomUUID } from "node:crypto";
import {
  assertCustodyEnvironment,
  readConfig,
} from "../src/foundation/environment.ts";
import { log } from "../src/foundation/logger.ts";
import {
  disconnectPrismaClients,
  getPrismaClient,
} from "../src/foundation/prisma.ts";
import { readWalletConfig } from "../src/foundation/wallet-environment.ts";
import { OutLayerAdapter } from "../src/server/custody/outlayer-adapter.ts";
import { WalletProvisioningWorker } from "../src/server/custody/provisioning-worker.ts";

async function main(): Promise<void> {
  assertCustodyEnvironment(process.env);
  const config = readConfig(process.env, "custody");
  const walletConfig = readWalletConfig(process.env, {
    authSecret: process.env.FLOW_AUTH_SECRET,
    otpKey: process.env.FLOW_OTP_KEY,
  });
  const registrationAccountId = process.env.FLOW_CUSTODY_REGISTRATION_ACCOUNT_ID;
  const registrationAuthorized =
    process.env.FLOW_CUSTODY_REGISTRATION_AUTHORIZED === "enabled";
  const isValidRegistrationAccountId =
    Boolean(registrationAccountId) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      registrationAccountId ?? "",
    );
  if (registrationAccountId && !isValidRegistrationAccountId) {
    throw new Error("FLOW_CUSTODY_REGISTRATION_ACCOUNT_ID must be a UUID.");
  }
  if (
    registrationAuthorized &&
    (config.environment !== "staging" ||
      walletConfig.compatibility.mode !== "disabled" ||
      !isValidRegistrationAccountId)
  ) {
    throw new Error(
      "Controlled registration requires staging, compatibility disabled, and one valid authorized account ID.",
    );
  }
  const providerEnvironment = walletConfig.compatibility.authorizationId
    ? walletConfig.compatibility.providerEnvironment
    : "mainnet";
  const adapter = new OutLayerAdapter(walletConfig.apiUrl, 5_000, {
    compatibilityConfig: walletConfig.compatibility,
  });
  const workerId =
    process.env.FLOW_CUSTODY_WORKER_ID ??
    `custody-${process.pid}-${randomUUID().slice(0, 8)}`;
  const pollIntervalMs = Number(
    process.env.FLOW_CUSTODY_POLL_INTERVAL_MS ?? "5000",
  );
  if (
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs < 1000 ||
    pollIntervalMs > 60_000
  ) {
    throw new Error(
      "FLOW_CUSTODY_POLL_INTERVAL_MS must be between 1000 and 60000.",
    );
  }

  const worker = new WalletProvisioningWorker({
    db: getPrismaClient("custody"),
    adapter,
    walletConfig,
    workerId,
    providerEnvironment,
    compatibilityAuthorizationId: walletConfig.compatibility.authorizationId,
    registrationAccountId,
    allowNewRegistrations: registrationAuthorized,
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log("info", "custody_worker_shutdown", { workerId, signal });
    await worker.stop();
    await disconnectPrismaClients();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  log("info", "custody_worker_started", {
    workerId,
    databaseRole: config.database.role,
    registrationEnabled: false,
    environment: providerEnvironment,
    registrationAccountAuthorized: registrationAuthorized,
  });
  worker.start(pollIntervalMs);
}

main().catch((error: unknown) => {
  log("error", "custody_worker_start_failed", {
    reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
  });
  process.exit(1);
});
