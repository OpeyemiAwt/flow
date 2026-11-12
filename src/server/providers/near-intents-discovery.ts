import {
  MAINNET_SUPPORTED_DEPLOYMENTS,
  type CatalogTokenDeployment,
} from "../../domain/supported-assets-catalog.ts";
import { MAX_SUPPORTED_DECIMALS } from "../../domain/atomic-amounts.ts";
import { ONE_CLICK_ASSET_MAPPINGS } from "../../domain/quote-discovery.ts";

export type TokenCapability =
  | "DISCOVERABLE_BY_PROVIDER"
  | "CAN_RECEIVE_TO"
  | "CAN_DIRECT_DEPOSIT"
  | "CAN_HOLD_IN_FLOW"
  | "CAN_SEND_FROM_FLOW";

export interface DiscoveredToken {
  readonly id: string;
  readonly assetId: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimals: number;
  readonly networkKey: string;
  readonly networkName: string;
  readonly ecosystem: "evm" | "solana" | "near" | "other";
  readonly standard: "NATIVE" | "ERC20" | "SPL" | "NEP141" | "OTHER";
  readonly contractAddress: string | null;
  readonly priceUsd: number | null;
  readonly priceUpdatedAt: string | null;
  readonly isNative: boolean;
  readonly isWrapped: boolean;
  readonly capabilities: readonly TokenCapability[];
}

export interface Raw1ClickToken {
  readonly assetId: string;
  readonly decimals: number;
  readonly blockchain: string;
  readonly symbol: string;
  readonly price?: number | null;
  readonly priceUpdatedAt?: string | null;
  readonly contractAddress?: string | null;
  readonly coingeckoId?: string | null;
}

const CHAIN_MAPPING: Record<
  string,
  {
    networkKey: string;
    networkName: string;
    ecosystem: "evm" | "solana" | "near" | "other";
  }
> = {
  near: { networkKey: "near-mainnet", networkName: "NEAR", ecosystem: "near" },
  base: { networkKey: "base-mainnet", networkName: "Base", ecosystem: "evm" },
  eth: {
    networkKey: "ethereum-mainnet",
    networkName: "Ethereum",
    ecosystem: "evm",
  },
  sol: {
    networkKey: "solana-mainnet",
    networkName: "Solana",
    ecosystem: "solana",
  },
  arb: {
    networkKey: "arbitrum-mainnet",
    networkName: "Arbitrum",
    ecosystem: "evm",
  },
  op: {
    networkKey: "optimism-mainnet",
    networkName: "Optimism",
    ecosystem: "evm",
  },
  pol: {
    networkKey: "polygon-mainnet",
    networkName: "Polygon",
    ecosystem: "evm",
  },
  avax: {
    networkKey: "avalanche-mainnet",
    networkName: "Avalanche",
    ecosystem: "evm",
  },
  btc: {
    networkKey: "bitcoin-mainnet",
    networkName: "Bitcoin",
    ecosystem: "other",
  },
  monad: {
    networkKey: "monad-mainnet",
    networkName: "Monad",
    ecosystem: "evm",
  },
  sui: { networkKey: "sui-mainnet", networkName: "Sui", ecosystem: "other" },
  tron: { networkKey: "tron-mainnet", networkName: "Tron", ecosystem: "other" },
  aptos: {
    networkKey: "aptos-mainnet",
    networkName: "Aptos",
    ecosystem: "other",
  },
  bsc: {
    networkKey: "binance-smart-chain",
    networkName: "BNB Chain",
    ecosystem: "evm",
  },
  adi: { networkKey: "adi-mainnet", networkName: "ADI", ecosystem: "evm" },
  aurora: {
    networkKey: "aurora-mainnet",
    networkName: "Aurora",
    ecosystem: "evm",
  },
  bera: {
    networkKey: "berachain-mainnet",
    networkName: "Berachain",
    ecosystem: "evm",
  },
  gnosis: {
    networkKey: "gnosis-mainnet",
    networkName: "Gnosis",
    ecosystem: "evm",
  },
  plasma: {
    networkKey: "plasma-mainnet",
    networkName: "Plasma",
    ecosystem: "evm",
  },
  scroll: {
    networkKey: "scroll-mainnet",
    networkName: "Scroll",
    ecosystem: "evm",
  },
  xlayer: {
    networkKey: "xlayer-mainnet",
    networkName: "X Layer",
    ecosystem: "evm",
  },
};

/**
 * Known user-facing wrapped tokens that should be excluded from customer selectors
 * per owner directive (e.g. WETH, WBTC, wNEAR).
 * Solver-internal omnibus representations (.omft.near) are NOT excluded.
 */
const EXCLUDED_WRAPPED_SYMBOLS = new Set([
  "WETH",
  "WNEAR",
  "WBTC",
  "WSOL",
  "WMATIC",
  "WAVAX",
  "WBNB",
  "WFTM",
]);

let cachedTokens: DiscoveredToken[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;
let refreshInFlight: Promise<DiscoveredToken[]> | undefined;

/**
 * Returns whether a symbol represents a user-facing wrapped derivative.
 */
export function isUserFacingWrappedToken(
  symbol: string,
  coingeckoId?: string | null,
): boolean {
  const baseSymbol = symbol.split("(")[0]?.trim().toUpperCase() ?? "";
  return (
    EXCLUDED_WRAPPED_SYMBOLS.has(baseSymbol) ||
    (coingeckoId?.toLowerCase().split("-").includes("wrapped") ?? false)
  );
}

/**
 * Maps provider metadata without asserting that a particular route is quotable.
 */
export function normalizeDiscoveredToken(raw: Raw1ClickToken): DiscoveredToken {
  const chainInfo = CHAIN_MAPPING[raw.blockchain.toLowerCase()] ?? {
    networkKey: `${raw.blockchain.toLowerCase()}-mainnet`,
    networkName: raw.blockchain.toUpperCase(),
    ecosystem: "other" as const,
  };

  const isNative =
    !raw.contractAddress ||
    raw.contractAddress.trim() === "" ||
    raw.contractAddress.toLowerCase() === "native";

  let standard: "NATIVE" | "ERC20" | "SPL" | "NEP141" | "OTHER" = "OTHER";
  if (isNative) {
    standard = "NATIVE";
  } else if (chainInfo.ecosystem === "evm") {
    standard = "ERC20";
  } else if (chainInfo.ecosystem === "solana") {
    standard = "SPL";
  } else if (chainInfo.ecosystem === "near") {
    standard = "NEP141";
  }

  const nativeNear =
    raw.assetId === ONE_CLICK_ASSET_MAPPINGS["near-mainnet:NEAR"] &&
    chainInfo.networkKey === "near-mainnet" &&
    raw.decimals === 24 &&
    (raw.contractAddress === "wrap.near" || isNative);
  const isWrapped =
    !nativeNear && isUserFacingWrappedToken(raw.symbol, raw.coingeckoId);
  const custodyMatch = MAINNET_SUPPORTED_DEPLOYMENTS.find((deployment) => {
    if (
      deployment.networkKey !== chainInfo.networkKey ||
      deployment.decimals !== raw.decimals ||
      ONE_CLICK_ASSET_MAPPINGS[deployment.id] !== raw.assetId
    )
      return false;
    if (deployment.id === "near-mainnet:NEAR") return nativeNear;
    if (deployment.symbol !== raw.symbol.toUpperCase()) return false;
    if (deployment.standard === "NATIVE") return isNative;
    if (!raw.contractAddress || deployment.standard !== standard) return false;
    return standard === "ERC20"
      ? deployment.contractIdentifier.toLowerCase() ===
          raw.contractAddress.toLowerCase()
      : deployment.contractIdentifier === raw.contractAddress;
  });

  if (custodyMatch) {
    const curated = curatedToken(custodyMatch);
    return {
      ...curated,
      capabilities: [...curated.capabilities, "DISCOVERABLE_BY_PROVIDER"],
      priceUsd:
        typeof raw.price === "number" &&
        Number.isFinite(raw.price) &&
        raw.price > 0
          ? raw.price
          : null,
      priceUpdatedAt:
        typeof raw.priceUpdatedAt === "string" ? raw.priceUpdatedAt : null,
    };
  }

  return {
    id: raw.assetId,
    assetId: raw.assetId,
    symbol: raw.symbol,
    name: raw.symbol,
    decimals: raw.decimals,
    ...chainInfo,
    standard,
    contractAddress: isNative ? null : (raw.contractAddress ?? null),
    priceUsd:
      typeof raw.price === "number" &&
      Number.isFinite(raw.price) &&
      raw.price > 0
        ? raw.price
        : null,
    priceUpdatedAt:
      typeof raw.priceUpdatedAt === "string" ? raw.priceUpdatedAt : null,
    isNative,
    isWrapped,
    capabilities: ["DISCOVERABLE_BY_PROVIDER"],
  };
}

function curatedToken(deployment: CatalogTokenDeployment): DiscoveredToken {
  const isNative = deployment.standard === "NATIVE";
  const capabilities: TokenCapability[] = [
    "CAN_RECEIVE_TO",
    "CAN_DIRECT_DEPOSIT",
    "CAN_HOLD_IN_FLOW",
    "CAN_SEND_FROM_FLOW",
  ];
  return {
    id: deployment.id,
    assetId: ONE_CLICK_ASSET_MAPPINGS[deployment.id]!,
    symbol: deployment.symbol,
    name: deployment.name,
    decimals: deployment.decimals,
    networkKey: deployment.networkKey,
    networkName: deployment.networkName,
    ecosystem: deployment.ecosystem,
    standard: deployment.standard,
    contractAddress: isNative ? null : deployment.contractIdentifier,
    priceUsd: null,
    priceUpdatedAt: null,
    isNative,
    isWrapped: false,
    capabilities,
  };
}

export function getStaticFallbackTokens(): DiscoveredToken[] {
  return MAINNET_SUPPORTED_DEPLOYMENTS.filter(
    (d) => ONE_CLICK_ASSET_MAPPINGS[d.id],
  ).map(curatedToken);
}

function isProviderToken(input: unknown): input is Raw1ClickToken {
  if (!input || typeof input !== "object") return false;
  const token = input as Partial<Raw1ClickToken>;
  return (
    typeof token.assetId === "string" &&
    /^[a-z0-9][a-zA-Z0-9:._-]{2,127}$/.test(token.assetId) &&
    typeof token.blockchain === "string" &&
    /^[a-z0-9_-]{1,32}$/i.test(token.blockchain) &&
    typeof token.symbol === "string" &&
    token.symbol.trim().length > 0 &&
    token.symbol.length <= 32 &&
    typeof token.decimals === "number" &&
    Number.isInteger(token.decimals) &&
    token.decimals >= 0 &&
    token.decimals <= MAX_SUPPORTED_DECIMALS &&
    (token.contractAddress == null ||
      typeof token.contractAddress === "string") &&
    (token.coingeckoId == null || typeof token.coingeckoId === "string")
  );
}

async function fetchTokens(): Promise<DiscoveredToken[]> {
  const curated = getStaticFallbackTokens();
  try {
    const response = await fetch("https://1click.chaindefuser.com/v0/tokens", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("Token registry unavailable");
    const data: unknown = await response.json();
    if (!Array.isArray(data)) throw new Error("Malformed token registry");

    const tokens = new Map(curated.map((token) => [token.assetId, token]));
    const reservedIds = new Set(tokens.keys());
    for (const row of data.filter(isProviderToken)) {
      const token = normalizeDiscoveredToken(row);
      if (
        !reservedIds.has(token.assetId) ||
        token.capabilities.includes("CAN_HOLD_IN_FLOW")
      ) {
        tokens.set(token.assetId, token);
      }
    }
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    return [...tokens.values()];
  } catch {
    cacheExpiresAt = Date.now() + 15_000;
    return cachedTokens ?? curated;
  }
}

export async function getDiscoveredTokens(options?: {
  forceRefresh?: boolean;
  excludeWrapped?: boolean;
}): Promise<DiscoveredToken[]> {
  if (options?.forceRefresh || !cachedTokens || Date.now() >= cacheExpiresAt) {
    refreshInFlight ??= fetchTokens()
      .then((tokens) => {
        cachedTokens = tokens;
        return tokens;
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
    await refreshInFlight;
  }
  const tokens = cachedTokens ?? [];
  return options?.excludeWrapped ? tokens.filter((t) => !t.isWrapped) : tokens;
}

export async function resolveQuoteAsset(
  id: string,
): Promise<DiscoveredToken | null> {
  const exact = (token: DiscoveredToken) =>
    token.id === id || token.assetId === id;
  const curated = getStaticFallbackTokens().find(exact);
  if (curated) return curated;
  const tokens = await getDiscoveredTokens({ excludeWrapped: true });
  return tokens.find(exact) ?? null;
}
