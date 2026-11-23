import { randomUUID } from "node:crypto";
import { FlowError, errorCode } from "../src/foundation/errors.ts";
import { assertIndexerEnvironment } from "../src/foundation/environment.ts";
import { log } from "../src/foundation/logger.ts";
import {
  disconnectPrismaClients,
  getPrismaClient,
  type FlowDb,
} from "../src/foundation/prisma.ts";
import {
  getDefaultRpcConfig,
  reconcileWalletBalances,
} from "../src/server/assets/connectors/multi-chain-reconciler.ts";
import { ingestWalletActivities } from "../src/server/assets/indexers/multi-chain-activity-ingester.ts";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => {
      reject(new FlowError("RPC_TIMEOUT", `${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function drainUrgentSyncJobs(
  db: FlowDb,
  workerId: string,
  signal: AbortSignal,
): Promise<number> {
  let processed = 0;
  // Drain up to 25 queued user-requested sync jobs immediately before doing periodic sweeps.
  while (!signal.aborted && processed < 25) {
    const jobs = await db.$queryRaw<
      Array<{
        job_id: string;
        account_id: string;
        wallet_id: string;
        job_type: string;
        lease_token: string;
      }>
    >`
      SELECT job_id, account_id, wallet_id, job_type, lease_token
      FROM flow.claim_account_sync_job(${workerId}, 120)
    `;
    const job = jobs[0];
    if (!job) break;
    processed += 1;

    try {
      const [wallet] = await db.$queryRaw<
        Array<{ environment: "mainnet" | "testnet" }>
      >`
        SELECT environment FROM flow.wallets WHERE id = ${job.wallet_id}::uuid
      `;
      if (!wallet) throw new Error("WALLET_NOT_AVAILABLE");
      const rpcConfig = getDefaultRpcConfig(wallet.environment);
      if (job.job_type === "BALANCE_REFRESH") {
        await withTimeout(
          reconcileWalletBalances(db, job.wallet_id, rpcConfig),
          25_000,
          "BALANCE_REFRESH",
        );
      } else if (job.job_type === "ACTIVITY_SYNC") {
        await withTimeout(
          ingestWalletActivities(db, job.wallet_id, { rpcConfig }),
          30_000,
          "ACTIVITY_SYNC",
        );
      } else {
        throw new Error("UNSUPPORTED_SYNC_JOB");
      }
      await db.$queryRaw`SELECT flow.finish_account_sync_job(${job.job_id}::uuid, ${job.lease_token}::uuid, NULL)`;
      log("info", "indexer_job_completed", {
        workerId,
        jobType: job.job_type,
        walletId: job.wallet_id,
      });
    } catch (error) {
      const code = errorCode(error);
      const safeCode = code === "INTERNAL_ERROR" ? "SYNC_FAILED" : code;
      try {
        const [result] = await db.$queryRaw<
          Array<{ finish_account_sync_job: string }>
        >`
          SELECT flow.finish_account_sync_job(${job.job_id}::uuid, ${job.lease_token}::uuid, ${safeCode})
        `;
        log("info", "indexer_job_failed", {
          workerId,
          jobType: job.job_type,
          walletId: job.wallet_id,
          errorCode: safeCode,
          result: result?.finish_account_sync_job ?? "UNKNOWN",
        });
      } catch (finishErr) {
        log("error", "indexer_job_finish_failed", {
          workerId,
          jobType: job.job_type,
          errorMessage:
            finishErr instanceof Error
              ? finishErr.message.slice(0, 160)
              : String(finishErr),
        });
      }
    }
  }
  return processed;
}

async function main(): Promise<void> {
  assertIndexerEnvironment(process.env);
  const mode = process.env.FLOW_INDEXER_WORKER_MODE ?? "heartbeat-only";
  if (mode !== "heartbeat-only" && mode !== "process") {
    throw new Error(
      "FLOW_INDEXER_WORKER_MODE must be heartbeat-only or process.",
    );
  }
  const workerId =
    process.env.FLOW_INDEXER_WORKER_ID?.trim() ||
    `indexer-${process.pid}-${randomUUID().slice(0, 8)}`;
  const rawPollMs = Number.parseInt(
    process.env.FLOW_INDEXER_POLL_INTERVAL_MS ?? "1000",
    10,
  );
  const pollIntervalMs = Number.isFinite(rawPollMs)
    ? Math.max(500, Math.min(10_000, Math.trunc(rawPollMs)))
    : 1_000;
  const controller = new AbortController();
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.once(sig, () => {
      log("info", "indexer_worker_shutdown", {
        workerId,
        signal: sig,
        mode,
      });
      controller.abort();
    });
  }

  const db = getPrismaClient("indexer");
  await db.$queryRaw`SELECT 1 AS ok`;
  log("info", "indexer_worker_heartbeat_ready", {
    workerId,
    mode,
    databaseRole: "indexer_worker",
  });

  if (mode === "heartbeat-only") {
    while (!controller.signal.aborted) {
      log("info", "indexer_worker_heartbeat", { workerId, mode });
      await sleep(30_000, controller.signal);
    }
    await disconnectPrismaClients();
    return;
  }

  const rawPeriodicBalanceMs = Number.parseInt(
    process.env.FLOW_INDEXER_PERIODIC_SYNC_MS ?? "12000",
    10,
  );
  const periodicBalanceIntervalMs = Number.isFinite(rawPeriodicBalanceMs)
    ? Math.max(5_000, Math.min(120_000, Math.trunc(rawPeriodicBalanceMs)))
    : 12_000;
  const periodicActivityIntervalMs = 60_000;

  let lastBalanceSweepAt = 0;
  let lastActivitySweepAt = 0;

  while (!controller.signal.aborted) {
    try {
      // 1. Always drain urgent user-requested BALANCE_REFRESH / ACTIVITY_SYNC jobs first.
      const drained = await drainUrgentSyncJobs(db, workerId, controller.signal);
      if (drained > 0) {
        continue;
      }

      const now = Date.now();
      const shouldSyncBalances =
        now - lastBalanceSweepAt >= periodicBalanceIntervalMs;
      const shouldSyncActivities =
        now - lastActivitySweepAt >= periodicActivityIntervalMs;

      if (shouldSyncBalances || shouldSyncActivities) {
        if (shouldSyncBalances) lastBalanceSweepAt = now;
        if (shouldSyncActivities) lastActivitySweepAt = now;

        // Prioritize wallets whose balances are oldest / never synced so every account stays fresh.
        const activeWallets = await db.$queryRaw<
          Array<{ id: string; environment: "mainnet" | "testnet" }>
        >`
          SELECT w.id, w.environment
          FROM flow.wallets w
          WHERE w.status = 'ACTIVE'
            AND EXISTS (
              SELECT 1 FROM flow.wallet_addresses wa WHERE wa.wallet_id = w.id
            )
          ORDER BY (
            SELECT MIN(wb.last_synced_at)
            FROM flow.wallet_balances wb
            WHERE wb.wallet_id = w.id
          ) ASC NULLS FIRST
          LIMIT 50
        `;

        for (const activeWallet of activeWallets) {
          if (controller.signal.aborted) break;

          // Never block urgent user refresh jobs behind periodic background sweeps.
          await drainUrgentSyncJobs(db, workerId, controller.signal);
          if (controller.signal.aborted) break;

          const rpcConfig = getDefaultRpcConfig(
            activeWallet.environment ?? "mainnet",
          );

          if (shouldSyncBalances) {
            try {
              await withTimeout(
                reconcileWalletBalances(db, activeWallet.id, rpcConfig),
                15_000,
                "periodic_balance_sync",
              );
            } catch (err) {
              log("info", "indexer_periodic_sync_error", {
                workerId,
                walletId: activeWallet.id,
                phase: "balance",
                errorCode: errorCode(err),
                errorMessage:
                  err instanceof Error ? err.message.slice(0, 200) : String(err),
              });
            }
          }

          if (shouldSyncActivities) {
            // Re-check urgent jobs before slower activity ingestion.
            await drainUrgentSyncJobs(db, workerId, controller.signal);
            if (controller.signal.aborted) break;

            try {
              await withTimeout(
                ingestWalletActivities(db, activeWallet.id, { rpcConfig }),
                20_000,
                "periodic_activity_sync",
              );
            } catch (err) {
              log("info", "indexer_periodic_sync_error", {
                workerId,
                walletId: activeWallet.id,
                phase: "activity",
                errorCode: errorCode(err),
                errorMessage:
                  err instanceof Error ? err.message.slice(0, 200) : String(err),
              });
            }
          }
        }
      }

      await sleep(pollIntervalMs, controller.signal);
    } catch (error) {
      log("error", "indexer_worker_loop_error", {
        workerId,
        errorCode: errorCode(error),
        errorMessage:
          error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
      await sleep(2_000, controller.signal);
    }
  }
  await disconnectPrismaClients();
}

main().catch((error: unknown) => {
  log("error", "indexer_worker_start_failed", { reason: errorCode(error) });
  process.exit(1);
});
