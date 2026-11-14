import { log } from "../src/foundation/logger.ts";
import { assertPaymentEnvironment } from "../src/foundation/environment.ts";
import { getPrismaClient } from "../src/foundation/prisma.ts";
import { PaymentMonitoringWorker } from "../src/server/payments/payment-monitoring-worker.ts";

async function main(): Promise<void> {
  assertPaymentEnvironment(process.env);
  const executionMode = process.env.FLOW_EXECUTION ?? "disabled";
  if (executionMode !== "disabled" && executionMode !== "enabled") {
    throw new Error(
      "Payment worker requires FLOW_EXECUTION=enabled or FLOW_EXECUTION=disabled.",
    );
  }
  if (process.env.FLOW_PROVIDER_COMPATIBILITY_MODE !== "disabled") {
    throw new Error(
      "Payment worker requires provider compatibility to be disabled.",
    );
  }

  const workerId =
    process.env.FLOW_PAYMENT_WORKER_ID ?? `payment-${process.pid}`;
  const signal = new AbortController();
  const shutdown = (name: string) => {
    log("info", "payment_worker_shutdown_requested", {
      workerId,
      signal: name,
    });
    signal.abort();
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));

  const mode = process.env.FLOW_PAYMENT_WORKER_MODE ?? "heartbeat-only";
  if (mode === "heartbeat-only") {
    const db = getPrismaClient("payment");
    await db.$queryRaw`SELECT 1`;
    log("info", "payment_worker_heartbeat_ready", {
      workerId,
      execution: executionMode,
      mode,
    });
    const heartbeat = setInterval(() => {
      log("info", "payment_worker_heartbeat", { workerId, mode });
    }, 30_000);
    await new Promise<void>((resolve) =>
      signal.signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    clearInterval(heartbeat);
    await db.$disconnect();
    return;
  }
  if (mode !== "monitor") {
    throw new Error(
      "FLOW_PAYMENT_WORKER_MODE must be monitor or heartbeat-only.",
    );
  }

  log("info", "payment_worker_ready", { workerId, execution: executionMode });
  try {
    await new PaymentMonitoringWorker({ workerId }).runLoop({
      pollIntervalMs: Number(
        process.env.FLOW_MONITORING_POLL_INTERVAL_MS ?? 5000,
      ),
      batchSize: Number(process.env.FLOW_MONITORING_BATCH_SIZE ?? 10),
      leaseSeconds: Number(process.env.FLOW_MONITORING_LEASE_SECONDS ?? 30),
      signal: signal.signal,
    });
  } catch (error) {
    log("error", "payment_worker_crashed", {
      workerId,
      error: error instanceof Error ? error.message : "unknown error",
    });
    process.exitCode = 1;
  } finally {
    await getPrismaClient("payment").$disconnect();
  }
}

void main();
