import { NextResponse } from "next/server";
import {
  getDiscoveredTokens,
  type TokenCapability,
} from "../../../../server/providers/near-intents-discovery.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COINGECKO_SYMBOL_MAP: Record<string, string> = {
  NEAR: "near",
  ETH: "ethereum",
  WETH: "ethereum",
  SOL: "solana",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

let cached24hChanges: {
  values: Record<string, number>;
  expiresAt: number;
} | null = null;

async function fetch24hPriceChanges(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cached24hChanges && cached24hChanges.expiresAt > now) {
    return cached24hChanges.values;
  }

  try {
    const ids = Array.from(new Set(Object.values(COINGECKO_SYMBOL_MAP))).join(
      ",",
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      { signal: controller.signal, cache: "no-store" },
    );
    clearTimeout(timer);
    if (!res.ok) return cached24hChanges?.values ?? {};
    const json = (await res.json()) as Record<
      string,
      { usd_24h_change?: number }
    >;
    const values: Record<string, number> = {};
    for (const [symbol, cgId] of Object.entries(COINGECKO_SYMBOL_MAP)) {
      const ch = json[cgId]?.usd_24h_change;
      if (typeof ch === "number" && Number.isFinite(ch)) {
        values[symbol] = Math.round(ch * 100) / 100;
      }
    }
    cached24hChanges = { values, expiresAt: now + 5 * 60 * 1000 };
    return values;
  } catch {
    return cached24hChanges?.values ?? {};
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
    const network = url.searchParams.get("network")?.trim().toLowerCase() ?? "";
    const capability = url.searchParams.get(
      "capability",
    ) as TokenCapability | null;

    const [allTokens, priceChanges24h] = await Promise.all([
      getDiscoveredTokens({
        excludeWrapped: true, // User-facing wrapped tokens excluded per owner directive
      }),
      fetch24hPriceChanges(),
    ]);

    let filtered = allTokens;

    if (network) {
      filtered = filtered.filter(
        (t) =>
          t.networkKey.toLowerCase() === network ||
          t.networkName.toLowerCase() === network,
      );
    }

    if (capability) {
      filtered = filtered.filter((t) => t.capabilities.includes(capability));
    }

    if (search) {
      filtered = filtered.filter(
        (t) =>
          t.symbol.toLowerCase().includes(search) ||
          t.name.toLowerCase().includes(search) ||
          t.networkName.toLowerCase().includes(search) ||
          (t.contractAddress &&
            t.contractAddress.toLowerCase().includes(search)),
      );
    }

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      tokens: filtered,
      priceChanges24h,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch tokens",
      },
      { status: 500 },
    );
  }
}
