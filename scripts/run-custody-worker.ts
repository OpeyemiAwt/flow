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
import {
  readPolicySponsorConfig,
  readWalletConfig,
} from "../src/foundation/wallet-environment.ts";
import { upgradeActiveWalletsToLiveExecutionPolicy } from "../src/server/custody/near-policy-sponsor.ts";
import { OutLayerAdapter } from "../src/server/custody/outlayer-adapter.ts";
import {
  processNextQueuedOutgoingJob,
  processOutgoingConfirmations,
} from "../src/server/custody/outgoing-executor.ts";
import { WalletProvisioningWorker } from "../src/server/custody/provisioning-worker.ts";
import { dispatchBlogNewsletterToSubscribers } from "../src/server/email/flow-email.ts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  assertCustodyEnvironment(process.env);
  const config = readConfig(process.env, "custody");
  const workerId =
    process.env.FLOW_CUSTODY_WORKER_ID ??
    `custody-${process.pid}-${randomUUID().slice(0, 8)}`;
  const mode = process.env.FLOW_CUSTODY_WORKER_MODE ?? "heartbeat-only";
  if (mode === "heartbeat-only") {
    if (
      process.env.FLOW_CUSTODY_REGISTRATION_AUTHORIZED === "enabled" ||
      process.env.FLOW_CUSTODY_REGISTRATION_OPEN === "enabled" ||
      process.env.FLOW_POLICY_SPONSOR_ENABLED === "enabled"
    ) {
      throw new Error(
        "Heartbeat-only custody mode cannot authorize wallet registration or policy sponsorship.",
      );
    }
    const db = getPrismaClient("custody");
    await db.$queryRaw`SELECT 1`;
    const signal = new AbortController();
    const shutdown = async (name: string) => {
      log("info", "custody_worker_shutdown", { workerId, signal: name, mode });
      signal.abort();
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    log("info", "custody_worker_heartbeat_ready", {
      workerId,
      databaseRole: config.database.role,
      registrationEnabled: false,
      mode,
    });
    const heartbeat = setInterval(() => {
      log("info", "custody_worker_heartbeat", { workerId, mode });
    }, 30_000);
    await new Promise<void>((resolve) =>
      signal.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    clearInterval(heartbeat);
    await disconnectPrismaClients();
    return;
  }
  if (mode !== "provision" && mode !== "execute") {
    throw new Error(
      "FLOW_CUSTODY_WORKER_MODE must be provision, execute, or heartbeat-only.",
    );
  }
  const walletConfig = readWalletConfig(process.env, {
    authSecret: process.env.FLOW_AUTH_SECRET,
    otpKey: process.env.FLOW_OTP_KEY,
  });
  const policySponsorConfig = readPolicySponsorConfig(process.env);
  if (
    policySponsorConfig.enabled &&
    walletConfig.compatibility.mode !== "disabled"
  ) {
    throw new Error(
      "Automated NEAR policy sponsorship requires provider compatibility mode to be disabled.",
    );
  }
  const registrationAccountId =
    process.env.FLOW_CUSTODY_REGISTRATION_ACCOUNT_ID;
  const registrationAuthorized =
    process.env.FLOW_CUSTODY_REGISTRATION_AUTHORIZED === "enabled";
  const registrationOpen =
    process.env.FLOW_CUSTODY_REGISTRATION_OPEN === "enabled";
  const isValidRegistrationAccountId =
    Boolean(registrationAccountId) &&
    UUID_REGEX.test(registrationAccountId ?? "");
  if (registrationAccountId && !isValidRegistrationAccountId) {
    throw new Error("FLOW_CUSTODY_REGISTRATION_ACCOUNT_ID must be a UUID.");
  }
  if (
    registrationOpen &&
    walletConfig.compatibility.mode !== "disabled"
  ) {
    throw new Error(
      "Open wallet registration requires provider compatibility mode to be disabled.",
    );
  }
  if (
    mode === "provision" &&
    registrationAuthorized &&
    !registrationOpen &&
    (config.environment !== "staging" ||
      walletConfig.compatibility.mode !== "disabled" ||
      !isValidRegistrationAccountId)
  ) {
    throw new Error(
      "Controlled registration requires staging, compatibility disabled, and one valid authorized account ID.",
    );
  }
  if (
    mode === "execute" &&
    (registrationAuthorized || registrationOpen) &&
    walletConfig.compatibility.mode !== "disabled"
  ) {
    throw new Error(
      "Execute mode registration requires provider compatibility mode to be disabled.",
    );
  }
  const providerEnvironment = walletConfig.compatibility.authorizationId
    ? walletConfig.compatibility.providerEnvironment
    : "mainnet";
  const controlledRegistrationAuthorized =
    mode === "provision" &&
    registrationAuthorized &&
    !registrationOpen &&
    isValidRegistrationAccountId &&
    config.environment === "staging" &&
    walletConfig.compatibility.mode === "disabled";
  const openRegistrationAuthorized =
    registrationOpen && walletConfig.compatibility.mode === "disabled";
  const adapter = new OutLayerAdapter(walletConfig.apiUrl, 5_000, {
    compatibilityConfig: walletConfig.compatibility,
    controlledRegistrationAuthorized,
    openRegistrationAuthorized,
    policyPreparationAuthorized: policySponsorConfig.enabled,
  });
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

  const db = getPrismaClient("custody");
  const worker = new WalletProvisioningWorker({
    db,
    adapter,
    walletConfig,
    workerId,
    providerEnvironment,
    compatibilityAuthorizationId: walletConfig.compatibility.authorizationId,
    registrationAccountId: registrationOpen ? undefined : registrationAccountId,
    allowNewRegistrations: registrationOpen || registrationAuthorized,
    policySponsor: {
      config: policySponsorConfig,
    },
  });

  // Optional one-shot recovery for an existing SETUP_FAILED wallet when explicitly configured
  const recoveryAccountId = process.env.FLOW_CUSTODY_RECOVERY_ACCOUNT_ID?.trim();
  const recoveryWalletId = process.env.FLOW_CUSTODY_RECOVERY_WALLET_ID?.trim();
  const recoveryJobId = process.env.FLOW_CUSTODY_RECOVERY_JOB_ID?.trim();
  if (recoveryAccountId || recoveryWalletId || recoveryJobId) {
    if (
      !policySponsorConfig.enabled ||
      !recoveryAccountId ||
      !recoveryWalletId ||
      !recoveryJobId ||
      !UUID_REGEX.test(recoveryAccountId) ||
      !UUID_REGEX.test(recoveryWalletId) ||
      !UUID_REGEX.test(recoveryJobId)
    ) {
      throw new Error(
        "Wallet recovery requires FLOW_POLICY_SPONSOR_ENABLED=enabled and valid UUIDs for RECOVERY_ACCOUNT_ID, RECOVERY_WALLET_ID, and RECOVERY_JOB_ID.",
      );
    }
    const existingState = await db.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status
      FROM flow.wallets
      WHERE id = ${recoveryWalletId}::uuid
        AND account_id = ${recoveryAccountId}::uuid
      LIMIT 1
    `;
    if (existingState[0]?.status === "SETUP_FAILED") {
      const recoveryResult = await worker.resumeFailedPolicyVerification({
        accountId: recoveryAccountId,
        jobId: recoveryJobId,
        expectedWalletId: recoveryWalletId,
        requestId:
          process.env.FLOW_CUSTODY_RECOVERY_REQUEST_ID?.trim() || randomUUID(),
        actorAuthId:
          process.env.FLOW_CUSTODY_RECOVERY_ACTOR_ID?.trim() ||
          "operator:custody-recovery",
      });
      log("info", "custody_worker_startup_recovery_completed", {
        workerId,
        accountId: recoveryAccountId,
        walletId: recoveryWalletId,
        outcome: recoveryResult.outcome,
        failureClassification: recoveryResult.failureClassification ?? null,
      });
    }
  }

  let stopping = false;
  let dispatchTimer: ReturnType<typeof setTimeout> | null = null;
  let confirmTimer: ReturnType<typeof setTimeout> | null = null;

  if (mode === "execute") {
    const dispatchIdleMs = Math.min(750, pollIntervalMs);
    const confirmIdleMs = Math.min(2_000, pollIntervalMs);

    const scheduleDispatch = (delayMs: number) => {
      if (stopping) return;
      dispatchTimer = setTimeout(async () => {
        if (stopping) return;
        let claimed = false;
        try {
          if (config.execution === "enabled") {
            claimed = await processNextQueuedOutgoingJob(
              db,
              adapter,
              walletConfig,
              workerId,
              policySponsorConfig,
            );
          }
        } catch (error: unknown) {
          log("error", "custody_outgoing_dispatch_failed", {
            workerId,
            reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          });
        } finally {
          scheduleDispatch(claimed ? 150 : dispatchIdleMs);
        }
      }, delayMs);
    };

    const scheduleConfirm = (delayMs: number) => {
      if (stopping) return;
      confirmTimer = setTimeout(async () => {
        if (stopping) return;
        let count = 0;
        try {
          count = await processOutgoingConfirmations(db, workerId);
        } catch (error: unknown) {
          log("error", "custody_outgoing_confirm_failed", {
            workerId,
            reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          });
        } finally {
          scheduleConfirm(count > 0 ? 1_200 : confirmIdleMs);
        }
      }, delayMs);
    };

    scheduleDispatch(100);
    scheduleConfirm(500);
  }

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    if (dispatchTimer) clearTimeout(dispatchTimer);
    if (confirmTimer) clearTimeout(confirmTimer);
    log("info", "custody_worker_shutdown", { workerId, signal, mode });
    await worker.stop();
    await disconnectPrismaClients();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  log("info", "custody_worker_started", {
    workerId,
    mode,
    databaseRole: config.database.role,
    registrationEnabled: registrationOpen || registrationAuthorized,
    registrationOpen,
    policySponsorEnabled: policySponsorConfig.enabled,
    policySponsorSignerMode: policySponsorConfig.enabled
      ? policySponsorConfig.signerMode
      : null,
    environment: providerEnvironment,
    executionMode: config.execution,
    registrationAccountAuthorized: registrationAuthorized,
  });
  worker.start(pollIntervalMs);

  if (
    mode === "execute" &&
    config.execution === "enabled" &&
    policySponsorConfig.enabled
  ) {
    void upgradeActiveWalletsToLiveExecutionPolicy({
      db,
      adapter,
      sponsorConfig: policySponsorConfig,
      walletConfig,
    }).catch((error: unknown) => {
      log("error", "wallet_policy_startup_upgrade_failed", {
        workerId,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    });
  }

  if (mode === "execute" && config.execution === "enabled") {
    // Dispatch latest FLOW Blog post once to any subscribed users who haven't received it yet
    void dispatchBlogNewsletterToSubscribers(db)
      .then((res) => {
        if (res.sent > 0) {
          log("info", "blog_newsletter_dispatched", {
            workerId,
            postSlug: res.postSlug,
            attempted: res.attempted,
            sent: res.sent,
          });
        }
      })
      .catch((error: unknown) => {
        log("error", "blog_newsletter_dispatch_failed", {
          workerId,
          reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        });
      });
  }
}

main().catch((error: unknown) => {
  log("error", "custody_worker_start_failed", {
    reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
  });
  process.exit(1);
});
