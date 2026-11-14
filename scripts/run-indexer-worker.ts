import { randomUUID } from "node:crypto";
import { errorCode } from "../src/foundation/errors.ts";
import { assertIndexerEnvironment } from "../src/foundation/environment.ts";
import { log } from "../src/foundation/logger.ts";
import {
  disconnectPrismaClients,
  getPrismaClient,
} from "../src/foundation/prisma.ts";
import {
  reconcileWalletBalances,
  getDefaultRpcConfig,
} from "../src/server/assets/connectors/multi-chain-reconciler.ts";
import { ingestWalletActivities } from "../src/server/assets/indexers/multi-chain-activity-ingester.ts";

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });

async function main(): Promise<void> {
  assertIndexerEnvironment(process.env);
  const mode = process.env.FLOW_INDEXER_WORKER_MODE ?? "heartbeat-only";
  if (mode !== "heartbeat-only" && mode !== "process") {
    throw new Error(
      "FLOW_INDEXER_WORKER_MODE must be heartbeat-only or process.",
    );
  }
  const workerId =
    process.env.FLOW_INDEXER_WORKER_ID ??
    `indexer-${process.pid}-${randomUUID().slice(0, 8)}`;
  const db = getPrismaClient("indexer");
  await db.$queryRaw`SELECT 1`;
  const controller = new AbortController();
  const stop = (signalName: string) => {
    log("info", "indexer_worker_shutdown", {
      workerId,
      signal: signalName,
      mode,
    });
    controller.abort();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  log("info", "indexer_worker_heartbeat_ready", {
    workerId,
    mode,
    databaseRole: "indexer_worker",
  });

  if (mode === "heartbeat-only") {
    const heartbeat = setInterval(
      () => log("info", "indexer_worker_heartbeat", { workerId, mode }),
      30_000,
    );
    await new Promise<void>((resolve) =>
      controller.signal.addEventListener("abort", () => resolve(), {
        once: true,
      }),
    );
    clearInterval(heartbeat);
    await disconnectPrismaClients();
    return;
  }

  const rawPollMs = Number(process.env.FLOW_INDEXER_POLL_INTERVAL_MS ?? "400");
  const pollIntervalMs = Number.isFinite(rawPollMs)
    ? Math.max(250, Math.min(5_000, Math.trunc(rawPollMs)))
    : 400;

  while (!controller.signal.aborted) {
    try {
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
        FROM flow.claim_account_sync_job(${workerId}, 60)
      `;
      const job = jobs[0];
      if (!job) {
        await sleep(pollIntervalMs, controller.signal);
        continue;
      }
      try {
        const [wallet] = await db.$queryRaw<
          Array<{ environment: "mainnet" | "testnet" }>
        >`
          SELECT environment FROM flow.wallets WHERE id = ${job.wallet_id}::uuid
        `;
        if (!wallet) throw new Error("WALLET_NOT_AVAILABLE");
        if (job.job_type === "BALANCE_REFRESH") {
          await reconcileWalletBalances(
            db,
            job.wallet_id,
            getDefaultRpcConfig(wallet.environment),
          );
        } else if (job.job_type === "ACTIVITY_SYNC") {
          await ingestWalletActivities(db, job.wallet_id, {
            rpcConfig: getDefaultRpcConfig(wallet.environment),
          });
        } else {
          throw new Error("UNSUPPORTED_SYNC_JOB");
        }
        await db.$queryRaw`SELECT flow.finish_account_sync_job(${job.job_id}::uuid, ${job.lease_token}::uuid, NULL)`;
        log("info", "indexer_job_completed", {
          workerId,
          jobType: job.job_type,
        });
      } catch (error) {
        const code = errorCode(error);
        const safeCode = code === "INTERNAL_ERROR" ? "SYNC_FAILED" : code;
        const [result] = await db.$queryRaw<
          Array<{ finish_account_sync_job: string }>
        >`
          SELECT flow.finish_account_sync_job(${job.job_id}::uuid, ${job.lease_token}::uuid, ${safeCode})
        `;
        log("info", "indexer_job_failed", {
          workerId,
          jobType: job.job_type,
          result: result?.finish_account_sync_job ?? "UNKNOWN",
        });
      }
    } catch (error) {
      log("error", "indexer_worker_loop_error", {
        workerId,
        errorCode: errorCode(error),
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
