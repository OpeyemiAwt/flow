import "server-only";
import { diagnosticCategory } from "../foundation/errors.ts";
import { log } from "../foundation/logger.ts";
import { runtime } from "../foundation/prisma.ts";
import { principal } from "./accounts.ts";
import { ApiFailure, reply } from "./http.ts";

export const PLATFORM_ADMIN_EMAIL = "opeyemimosesawt@gmail.com";

export interface AdminPlatformAnalytics {
  readonly totalUsers: number;
  readonly activeWallets: number;
  readonly totalAccounts: number;
  readonly movedInUsd: number;
  readonly movedOutUsd: number;
  readonly netFlowUsd: number;
  readonly asOf: string;
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

async function fetchSymbolUsdPrices(): Promise<Record<string, number>> {
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
  try {
    const [countsRow, volumeRows, prices] = await Promise.all([
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

    return {
      totalUsers: Number(countsRow?.total_users ?? 0n),
      activeWallets: Number(countsRow?.active_wallets ?? 0n),
      totalAccounts: Number(countsRow?.total_accounts ?? 0n),
      movedInUsd: Math.round(movedInUsd * 100) / 100,
      movedOutUsd: Math.round(movedOutUsd * 100) / 100,
      netFlowUsd: Math.round((movedInUsd - movedOutUsd) * 100) / 100,
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
