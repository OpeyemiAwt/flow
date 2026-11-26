import "server-only";
import { resolveNearGasSponsorAccountId } from "../domain/platform-fees.ts";
import { diagnosticCategory } from "../foundation/errors.ts";
import { log } from "../foundation/logger.ts";
import { runtime } from "../foundation/prisma.ts";
import { principal } from "./accounts.ts";
import { ApiFailure, reply } from "./http.ts";

export const PLATFORM_ADMIN_EMAIL = "opeyemimosesawt@gmail.com";

export interface AdminGasSponsorSnapshot {
  readonly accountId: string;
  readonly balanceNear: number | null;
  readonly balanceUsd: number | null;
  readonly estimatedTxsRemaining: number | null;
  readonly status: "healthy" | "low" | "critical" | "unavailable";
}

export interface AdminPlatformAnalytics {
  readonly totalUsers: number;
  readonly activeWallets: number;
  readonly totalAccounts: number;
  readonly movedInUsd: number;
  readonly movedOutUsd: number;
  readonly netFlowUsd: number;
  readonly gasSponsor: AdminGasSponsorSnapshot;
  readonly asOf: string;
}

const NEAR_GAS_SPONSOR_AVG_COST_NEAR = 0.0025;

async function fetchLiveNearSponsorBalance(
  accountId: string,
): Promise<number | null> {
  const endpoints = Array.from(
    new Set(
      [
        process.env.FLOW_NEAR_RPC_URL?.trim(),
        "https://rpc.mainnet.near.org",
        "https://free.rpc.fastnear.com",
        "https://near.lava.build",
      ].filter((u): u is string => Boolean(u)),
    ),
  );

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "1",
          method: "query",
          params: {
            request_type: "view_account",
            finality: "final",
            account_id: accountId,
          },
        }),
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        result?: { amount?: string };
      };
      const raw = json.result?.amount;
      if (raw && /^[0-9]+$/.test(raw)) {
        const scaled = Number(BigInt(raw) / 100_000_000_000_000_000_000n);
        return scaled / 10_000;
      }
    } catch {
      // Try fallback RPC
    }
  }
  return null;
}

export function isPlatformAdmin(
  email: string | null | undefined,
  verifiedEmail: boolean,
): boolean {
  return (
    verifiedEmail &&
    typeof email === "string" &&
    email.trim().toLowerCase() === PLATFORM_ADMIN_EMAIL
  );
}

export async function fetchSymbolUsdPrices(): Promise<Record<string, number>> {
  const fallback: Record<string, number> = {
    USDC: 1,
    USDT: 1,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch("https://1click.chaindefuser.com/v0/tokens", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return fallback;
    const tokens = (await res.json()) as Array<{
      symbol?: string;
      price?: number | string | null;
    }>;
    if (!Array.isArray(tokens)) return fallback;
    const prices: Record<string, number> = { ...fallback };
    for (const token of tokens) {
      const sym = token.symbol?.trim().toUpperCase();
      const priceNum = Number(token.price);
      if (sym && Number.isFinite(priceNum) && priceNum > 0 && !(sym in prices)) {
        prices[sym] = priceNum;
      }
    }
    return prices;
  } catch {
    return fallback;
  }
}

export async function loadAdminAnalyticsData(
  sessionToken: string,
): Promise<AdminPlatformAnalytics> {
  const { db } = runtime();
  const sponsorAccountId = resolveNearGasSponsorAccountId();
  try {
    const [countsRow, volumeRows, prices, sponsorBalanceNear] =
      await Promise.all([
        db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${sessionToken}, true)`;
          const rows = await tx.$queryRaw<
            Array<{
              total_users: bigint;
              active_wallets: bigint;
              total_accounts: bigint;
            }>
          >`SELECT * FROM flow.get_admin_platform_user_counts()`;
          return rows[0];
        }),
        db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${sessionToken}, true)`;
          return tx.$queryRaw<
            Array<{
              direction: string;
              asset_symbol: string;
              total_display: string;
            }>
          >`SELECT direction, asset_symbol, total_display::text FROM flow.get_admin_platform_volume_buckets()`;
        }),
        fetchSymbolUsdPrices(),
        fetchLiveNearSponsorBalance(sponsorAccountId),
      ]);

    let movedInUsd = 0;
    let movedOutUsd = 0;

    for (const row of volumeRows) {
      const amount = Number(row.total_display);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const price = prices[row.asset_symbol.toUpperCase()] ?? 0;
      const usd = amount * price;
      if (row.direction === "IN") {
        movedInUsd += usd;
      } else if (row.direction === "OUT") {
        movedOutUsd += usd;
      }
    }

    const nearPriceUsd = prices["NEAR"] ?? 0;
    const sponsorBalanceUsd =
      sponsorBalanceNear !== null && nearPriceUsd > 0
        ? Math.round(sponsorBalanceNear * nearPriceUsd * 100) / 100
        : null;
    const estimatedTxsRemaining =
      sponsorBalanceNear !== null
        ? Math.max(
            0,
            Math.floor(
              Math.max(0, sponsorBalanceNear - 0.005) /
                NEAR_GAS_SPONSOR_AVG_COST_NEAR,
            ),
          )
        : null;
    const sponsorStatus: AdminGasSponsorSnapshot["status"] =
      sponsorBalanceNear === null
        ? "unavailable"
        : sponsorBalanceNear < 0.1
          ? "critical"
          : sponsorBalanceNear < 0.5
            ? "low"
            : "healthy";

    return {
      totalUsers: Number(countsRow?.total_users ?? 0n),
      activeWallets: Number(countsRow?.active_wallets ?? 0n),
      totalAccounts: Number(countsRow?.total_accounts ?? 0n),
      movedInUsd: Math.round(movedInUsd * 100) / 100,
      movedOutUsd: Math.round(movedOutUsd * 100) / 100,
      netFlowUsd: Math.round((movedInUsd - movedOutUsd) * 100) / 100,
      gasSponsor: {
        accountId: sponsorAccountId,
        balanceNear: sponsorBalanceNear,
        balanceUsd: sponsorBalanceUsd,
        estimatedTxsRemaining,
        status: sponsorStatus,
      },
      asOf: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const err = error as {
      code?: string;
      meta?: { code?: string; message?: string };
      message?: string;
    };
    log("error", "admin_analytics_load_failed", {
      category: diagnosticCategory(error),
      code: err?.code,
      pgCode: err?.meta?.code,
      metaMessage: err?.meta?.message?.slice(0, 200),
      message: err?.message?.slice(0, 200),
    });
    throw error;
  }
}

export async function getAdminAnalytics(request: Request): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  if (!isPlatformAdmin(actor.email, actor.verifiedEmail)) {
    throw new ApiFailure(404, "NOT_FOUND");
  }
  const token = actor.session.token;
  if (!token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }
  const analytics = await loadAdminAnalyticsData(token);
  return reply(200, { ok: true, analytics });
}
