import "server-only";
import {
  REFRESH_COOLDOWN_MS,
  serializePortfolio,
} from "../domain/portfolio.ts";
import { isFinancialExecutionDisabled } from "../domain/custody.ts";
import { runtime } from "../foundation/prisma.ts";
import { access, principal } from "./accounts.ts";
import { getAccountBalances } from "./assets/asset-service.ts";
import { getAccountWalletPublicProjection } from "./custody/job-repository.ts";
import { readAccountSync, requestAccountSync } from "./account-sync.ts";
import { ApiFailure, reply } from "./http.ts";

export type {
  SerializedAccountPortfolio,
  SerializedWalletBalanceRecord,
} from "../domain/portfolio.ts";
export {
  REFRESH_COOLDOWN_MS,
  serializePortfolio,
} from "../domain/portfolio.ts";

export async function readPortfolio(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  const projection = await getAccountBalances(db, accountId, {
    sessionToken: actor.session.token,
  });

  const serialized = serializePortfolio(projection);
  const sync = await readAccountSync(
    accountId,
    actor.session.token,
    "BALANCE_REFRESH",
  );
  const elapsedMs = sync
    ? Math.max(0, Date.now() - new Date(sync.updatedAt).getTime())
    : REFRESH_COOLDOWN_MS;
  const remaining = Math.max(
    0,
    Math.ceil((REFRESH_COOLDOWN_MS - elapsedMs) / 1000),
  );
  return reply(200, {
    ...serialized,
    ...(remaining > 0 ? { cooldownRemainingSeconds: remaining } : {}),
    ...(sync ? { syncStatus: sync.status, syncJobId: sync.jobId } : {}),
  });
}

export async function refreshPortfolio(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  const job = await requestAccountSync(
    accountId,
    actor.session.token,
    "BALANCE_REFRESH",
  );
  void requestAccountSync(
    accountId,
    actor.session.token,
    "ACTIVITY_SYNC",
  ).catch(() => {});
  if (job?.job_status === "RATE_LIMITED") {
    throw new ApiFailure(429, "RATE_LIMIT_EXCEEDED");
  }
  const projection = await getAccountBalances(db, accountId, {
    sessionToken: actor.session.token,
  });

  const serialized = serializePortfolio(projection);
  if (!job) throw new ApiFailure(409, "ONBOARDING_REQUIRED");
  return reply(200, {
    ...serialized,
    cooldownRemainingSeconds: Math.ceil(REFRESH_COOLDOWN_MS / 1000),
    syncStatus: job.job_status.toLowerCase(),
    syncJobId: job.job_id,
  });
}

export async function readPortfolioSyncStatus(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);
  if (!actor.session.token) throw new ApiFailure(401, "AUTH_REQUIRED");
  return reply(200, {
    sync: await readAccountSync(
      accountId,
      actor.session.token,
      "BALANCE_REFRESH",
    ),
  });
}

export async function provisionAccountWallet(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  const walletProjection = await getAccountWalletPublicProjection(
    db,
    accountId,
  );
  const jobs = await db.$queryRaw<Array<{ status: string }>>`
    SELECT status FROM flow.wallet_provisioning_jobs
    WHERE account_id = ${accountId}::uuid LIMIT 1
  `;
  const job = jobs[0];
  if (!job) throw new ApiFailure(409, "ONBOARDING_REQUIRED");

  return reply(202, {
    outcome: "queued",
    walletStatus: walletProjection
      ? walletProjection.status.toLowerCase()
      : "setup_pending",
    stage: job.status.toLowerCase(),
    executionEnabled: !isFinancialExecutionDisabled(),
  });
}

export async function readWalletProvisioningStatus(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);
  if (!actor.session.token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const [wallet, jobs] = await Promise.all([
    getAccountWalletPublicProjection(db, accountId),
    db.$queryRaw<Array<{ status: string; attempts: number; updatedAt: Date }>>`
      SELECT status, attempts, updated_at AS "updatedAt"
      FROM flow.wallet_provisioning_jobs
      WHERE account_id = ${accountId}::uuid
      LIMIT 1
    `,
  ]);
  const job = jobs[0];
  const requiredNetworks = ["near", "base", "ethereum", "solana"] as const;
  const expectedChainIds = wallet?.isTestnet
    ? {
        near: "near-testnet",
        base: "84532",
        ethereum: "1",
        solana: "solana-devnet",
      }
    : {
        near: "near-mainnet",
        base: "8453",
        ethereum: "1",
        solana: "solana-mainnet",
      };
  const verifiedNetworks = wallet
    ? requiredNetworks.filter((network) =>
        wallet.addresses.some(
          (address) =>
            address.network.toLowerCase() === network &&
            address.chainId === expectedChainIds[network],
        ),
      )
    : [];
  const walletReady = Boolean(
    wallet?.provisioningComplete &&
    verifiedNetworks.length === requiredNetworks.length &&
    requiredNetworks.every((network) =>
      wallet?.capabilities.some(
        (capability) =>
          capability.network.toLowerCase() === network &&
          capability.canDeriveAddress,
      ),
    ),
  );
  const walletStatus = walletReady
    ? "active"
    : wallet?.status.toLowerCase() === "frozen"
      ? "frozen"
      : job?.status === "UNKNOWN" || job?.status === "MANUAL_REVIEW"
        ? "recovery_pending"
        : job?.status === "FAILED"
          ? "setup_failed"
          : [
                "LEASED",
                "REGISTERED",
                "PROVISIONED",
                "POLICY_VERIFYING",
              ].includes(job?.status ?? "")
            ? "provisioning"
            : "setup_pending";

  return reply(200, {
    accountId,
    walletStatus,
    stage: walletReady
      ? "wallet_ready"
      : (job?.status.toLowerCase() ?? "pending"),
    attempts: job?.attempts ?? 0,
    updatedAt: job?.updatedAt ?? wallet?.updatedAt ?? null,
    verifiedNetworks,
    requiredNetworks,
    addresses: walletReady
      ? wallet!.addresses.filter((address) =>
          requiredNetworks.includes(
            address.network.toLowerCase() as (typeof requiredNetworks)[number],
          ),
        )
      : [],
    walletReady,
    executionEnabled: !isFinancialExecutionDisabled(),
  });
}
