import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import {
  isFinancialExecutionDisabled,
  validateAddressForNetwork,
} from "../domain/custody.ts";
import { isFlowIdInput } from "../domain/flow-id.ts";
import {
  centsToUsd,
  computeTransferUsdCents,
  evaluateMcpSpendGuard,
  formatUsdCentsLabel,
  isValidMcpTokenFormat,
  normalizeAllowedNetworks,
  resolveMcpDeployment,
  type McpAgentKeyStatus,
} from "../domain/mcp-agents.ts";
import { hashMcpToken } from "./mcp-token-crypto.ts";
import {
  getOperationAppFees,
  getOperationPlatformFeeBps,
  isNearSourceGasSponsored,
  resolveTransferFeeBreakdown,
} from "../domain/platform-fees.ts";
import type { NetworkId } from "../domain/providers.ts";
import { isBannedIllustrativeAddress } from "../domain/quote-discovery.ts";
import {
  checkNetworkGasBalance,
  computeMaxSendableAtomic,
  MAINNET_SUPPORTED_DEPLOYMENTS,
  type CatalogTokenDeployment,
} from "../domain/supported-assets-catalog.ts";
import { runtime } from "../foundation/prisma.ts";
import { fetchSymbolUsdPrices } from "./admin-analytics-service.ts";
import { fetchLiveMainnetBalance } from "./assets/connectors/multi-chain-reconciler.ts";
import { resolveFlowIdForSend } from "./flow-id-service.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import {
  fetchOneClickCommittedQuote,
  fetchOneClickDryQuote,
} from "./providers/one-click-adapter.ts";

const MCP_SERVER_NAME = "flow-mcp";
const MCP_SERVER_VERSION = "1.0.0";
const SUPPORTED_PROTOCOL_VERSIONS = [
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;
const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
  "https://flow.devhub.forum";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-API-Key, Mcp-Session-Id, MCP-Protocol-Version, Accept",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
  "Cache-Control": "no-store",
};

interface AuthKeyRow {
  key_id: string;
  account_id: string;
  user_id: string;
  name: string;
  token_prefix: string;
  status: string;
  max_total_usd_cents: bigint | number | string;
  max_per_tx_usd_cents: bigint | number | string;
  max_daily_usd_cents: bigint | number | string | null;
  can_read: boolean;
  can_send: boolean;
  can_convert: boolean;
  can_create_payment_links: boolean;
  allowed_networks: string[] | null;
  allowed_recipients: string[] | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  total_calls: number;
  spent_total_usd_cents: bigint | number | string;
  spent_24h_usd_cents: bigint | number | string;
  flow_id: string | null;
  account_name: string | null;
  wallet_id: string | null;
  wallet_status: string | null;
}

interface AuthenticatedAgentContext {
  readonly tokenHash: string;
  readonly keyId: string;
  readonly accountId: string;
  readonly userId: string;
  readonly name: string;
  readonly status: McpAgentKeyStatus;
  readonly expiresAt: string | null;
  readonly maxTotalUsdCents: number;
  readonly maxPerTxUsdCents: number;
  readonly maxDailyUsdCents: number | null;
  readonly spentTotalUsdCents: number;
  readonly spent24hUsdCents: number;
  readonly canRead: boolean;
  readonly canSend: boolean;
  readonly canConvert: boolean;
  readonly canCreatePaymentLinks: boolean;
  readonly allowedNetworks: readonly string[];
  readonly allowedRecipients: readonly string[];
  readonly flowId: string | null;
  readonly accountName: string | null;
  readonly walletId: string | null;
  readonly walletStatus: string | null;
}

interface SnapshotAddress {
  readonly network: string;
  readonly chainId: string;
  readonly address: string;
}

interface SnapshotBalance {
  readonly networkAssetId: string;
  readonly network: string;
  readonly chainId: string;
  readonly tokenStandard: string;
  readonly contractAddress: string | null;
  readonly decimals: number;
  readonly symbol: string;
  readonly name: string;
  readonly atomicBalance: string;
  readonly syncStatus: string;
  readonly finality: string;
  readonly lastSyncedAt: string | null;
}

interface AccountSnapshot {
  readonly accountId: string;
  readonly flowId: string | null;
  readonly accountName: string | null;
  readonly walletId: string | null;
  readonly walletStatus: string | null;
  readonly addresses: readonly SnapshotAddress[];
  readonly balances: readonly SnapshotBalance[];
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function toSafeInt(v: bigint | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function extractRawToken(request: Request, tokenFromPath?: string): string | null {
  if (tokenFromPath?.trim()) {
    return decodeURIComponent(tokenFromPath.trim());
  }
  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader) {
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  const apiKeyHeader = request.headers.get("x-api-key")?.trim();
  if (apiKeyHeader) return apiKeyHeader;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  if (queryToken) return queryToken;
  return null;
}

async function authenticateMcpToken(
  rawToken: string,
): Promise<
  | { readonly ok: true; readonly ctx: AuthenticatedAgentContext }
  | { readonly ok: false; readonly httpStatus: number; readonly error: string }
> {
  if (!isValidMcpTokenFormat(rawToken)) {
    return {
      ok: false,
      httpStatus: 401,
      error: "Invalid FLOW MCP token format.",
    };
  }
  const tokenHash = hashMcpToken(rawToken);
  const { db } = runtime();
  const rows = await db.$queryRaw<AuthKeyRow[]>`
    SELECT * FROM flow.mcp_authenticate_key(${tokenHash}::text)
  `;
  const row = rows[0];
  if (!row) {
    return {
      ok: false,
      httpStatus: 401,
      error: "Invalid or unknown FLOW MCP token.",
    };
  }
  const status = (
    row.status === "PAUSED" || row.status === "REVOKED" ? row.status : "ACTIVE"
  ) as McpAgentKeyStatus;
  if (status !== "ACTIVE") {
    return {
      ok: false,
      httpStatus: 403,
      error: `This FLOW MCP agent key is ${status.toLowerCase()}.`,
    };
  }
  const expiresAtIso = row.expires_at ? row.expires_at.toISOString() : null;
  if (expiresAtIso && Date.parse(expiresAtIso) <= Date.now()) {
    return {
      ok: false,
      httpStatus: 403,
      error: "This FLOW MCP agent key has expired.",
    };
  }

  return {
    ok: true,
    ctx: {
      tokenHash,
      keyId: row.key_id,
      accountId: row.account_id,
      userId: row.user_id,
      name: row.name,
      status,
      expiresAt: expiresAtIso,
      maxTotalUsdCents: toSafeInt(row.max_total_usd_cents),
      maxPerTxUsdCents: toSafeInt(row.max_per_tx_usd_cents),
      maxDailyUsdCents:
        row.max_daily_usd_cents === null
          ? null
          : toSafeInt(row.max_daily_usd_cents),
      spentTotalUsdCents: toSafeInt(row.spent_total_usd_cents),
      spent24hUsdCents: toSafeInt(row.spent_24h_usd_cents),
      canRead: row.can_read,
      canSend: row.can_send,
      canConvert: row.can_convert,
      canCreatePaymentLinks: row.can_create_payment_links,
      allowedNetworks: normalizeAllowedNetworks(row.allowed_networks ?? undefined),
      allowedRecipients: row.allowed_recipients ?? [],
      flowId: row.flow_id,
      accountName: row.account_name,
      walletId: row.wallet_id,
      walletStatus: row.wallet_status,
    },
  };
}

async function fetchSnapshot(tokenHash: string): Promise<AccountSnapshot> {
  const { db } = runtime();
  const rows = await db.$queryRaw<Array<{ snapshot: AccountSnapshot | null }>>`
    SELECT flow.mcp_get_account_snapshot(${tokenHash}::text) AS snapshot
  `;
  const snapshot = rows[0]?.snapshot;
  if (!snapshot) {
    throw new Error("Unable to load FLOW account snapshot for this MCP key.");
  }
  return snapshot;
}

function findWalletAddress(
  addresses: readonly SnapshotAddress[],
  networkKey: string,
): string | null {
  const target = networkKey.toLowerCase();
  const short = target.replace(/-mainnet$/, "");
  const match = addresses.find((a) => {
    const n = a.network.toLowerCase();
    const c = a.chainId.toLowerCase();
    return n === target || n === short || c === target;
  });
  return match?.address ?? null;
}

function matchSnapshotBalance(
  balances: readonly SnapshotBalance[],
  deployment: CatalogTokenDeployment,
): SnapshotBalance | undefined {
  const netTarget = deployment.networkKey.toLowerCase();
  const shortNet = netTarget.replace(/-mainnet$/, "");
  return balances.find((b) => {
    const bNet = b.network.toLowerCase();
    const bChain = b.chainId.toLowerCase();
    const netMatches =
      bNet === netTarget || bNet === shortNet || bChain === netTarget;
    if (!netMatches) return false;
    if (deployment.standard === "NATIVE") {
      return b.tokenStandard.toUpperCase() === "NATIVE" || !b.contractAddress;
    }
    if (b.contractAddress && deployment.contractIdentifier) {
      return (
        b.contractAddress.toLowerCase() ===
        deployment.contractIdentifier.toLowerCase()
      );
    }
    return b.symbol.toUpperCase() === deployment.symbol.toUpperCase();
  });
}

async function resolveUnitPriceUsd(
  deployment: CatalogTokenDeployment,
): Promise<number | null> {
  const symUpper = deployment.symbol.toUpperCase();
  if (symUpper === "USDC" || symUpper === "USDT") return 1;
  const [quoteAsset, symbolPrices] = await Promise.all([
    resolveQuoteAsset(deployment.id).catch(() => null),
    fetchSymbolUsdPrices().catch(() => ({}) as Record<string, number>),
  ]);
  if (
    quoteAsset?.priceUsd &&
    Number.isFinite(quoteAsset.priceUsd) &&
    quoteAsset.priceUsd > 0
  ) {
    return quoteAsset.priceUsd;
  }
  const bySym = symbolPrices[symUpper];
  if (typeof bySym === "number" && Number.isFinite(bySym) && bySym > 0) {
    return bySym;
  }
  return null;
}

async function resolveLiveSpendableBalance(params: {
  readonly ctx: AuthenticatedAgentContext;
  readonly snapshot: AccountSnapshot;
  readonly deployment: CatalogTokenDeployment;
}): Promise<{
  readonly availableAtomic: bigint;
  readonly reservedAtomic: bigint;
  readonly spendableAtomic: bigint;
  readonly nativeBalanceAtomic: bigint;
  readonly sourceAssetKey: string;
}> {
  const { ctx, snapshot, deployment } = params;
  const walletAddress = findWalletAddress(
    snapshot.addresses,
    deployment.networkKey,
  );
  if (!walletAddress || snapshot.walletStatus !== "ACTIVE") {
    throw new Error(
      `Your FLOW account does not have an active mainnet wallet address on ${deployment.networkName}.`,
    );
  }

  const matched = matchSnapshotBalance(snapshot.balances, deployment);
  const observedAt = Date.parse(matched?.lastSyncedAt ?? "");
  const isStale =
    !matched ||
    matched.syncStatus !== "SYNCED" ||
    !Number.isFinite(observedAt) ||
    Date.now() - observedAt > 120_000 ||
    matched.finality === "UNKNOWN";

  const nativeDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (d) => d.networkKey === deployment.networkKey && d.standard === "NATIVE",
  );

  let availableAtomic: bigint;
  let liveNativeBalanceAtomic: bigint | null = null;

  if (isStale) {
    const networkKey = deployment.networkKey as
      | "ethereum"
      | "base"
      | "solana"
      | "near";
    const liveObs = await fetchLiveMainnetBalance({
      networkKey,
      standard: deployment.standard,
      contractIdentifier: deployment.contractIdentifier,
      address: walletAddress,
      networkAssetId: matched?.networkAssetId,
    });
    if (liveObs.syncStatus !== "SYNCED" || liveObs.finality === "UNKNOWN") {
      throw new Error(
        `Unable to fetch a live balance on ${deployment.networkName}. Please retry shortly.`,
      );
    }
    availableAtomic = BigInt(liveObs.atomicBalance);
    if (deployment.standard === "NATIVE") {
      liveNativeBalanceAtomic = availableAtomic;
    } else if (nativeDeployment) {
      const liveNative = await fetchLiveMainnetBalance({
        networkKey,
        standard: nativeDeployment.standard,
        contractIdentifier: nativeDeployment.contractIdentifier,
        address: walletAddress,
      });
      if (
        liveNative.syncStatus === "SYNCED" &&
        liveNative.finality !== "UNKNOWN"
      ) {
        liveNativeBalanceAtomic = BigInt(liveNative.atomicBalance);
      }
    }
  } else {
    availableAtomic = BigInt(matched.atomicBalance);
  }

  const nativeMatched = nativeDeployment
    ? matchSnapshotBalance(snapshot.balances, nativeDeployment)
    : undefined;
  const nativeBalanceAtomic =
    liveNativeBalanceAtomic ??
    (nativeMatched ? BigInt(nativeMatched.atomicBalance) : 0n);

  const sourceAssetKey =
    deployment.standard === "NATIVE" ? "native" : deployment.contractIdentifier;

  const { db } = runtime();
  const reservedRows = await db.$queryRaw<Array<{ reserved: string }>>`
    SELECT flow.mcp_get_reserved_atomic(
      ${ctx.tokenHash}::text,
      ${deployment.networkKey}::text,
      ${sourceAssetKey}::text
    ) AS reserved
  `;
  const reservedAtomic = BigInt(reservedRows[0]?.reserved ?? "0");
  const spendableAtomic =
    availableAtomic > reservedAtomic ? availableAtomic - reservedAtomic : 0n;

  return {
    availableAtomic,
    reservedAtomic,
    spendableAtomic,
    nativeBalanceAtomic,
    sourceAssetKey,
  };
}

function buildToolDefinitions(ctx: AuthenticatedAgentContext) {
  return [
    {
      name: "flow_get_account",
      description:
        "Get the connected FLOW account overview: @flow ID, multi-chain deposit addresses (NEAR, Solana, Base, Ethereum), and this MCP agent key's active permissions and remaining USD spend limits.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "flow_get_balances",
      description:
        "List all token balances held in the connected FLOW wallet across NEAR, Solana, Base, and Ethereum with live USD estimates.",
      inputSchema: {
        type: "object",
        properties: {
          includeZero: {
            type: "boolean",
            description: "Include zero-balance assets (defaults to false).",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "flow_list_supported_assets",
      description:
        "List every supported mainnet asset deployment ID, symbol, network, and whether NEAR gas sponsorship ($0 gas) applies.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "flow_resolve_flow_id",
      description:
        "Resolve a human-readable @flow handle (such as alex@flow) to its verified destination wallet address on a target network.",
      inputSchema: {
        type: "object",
        properties: {
          flowId: {
            type: "string",
            description: "The recipient @flow ID, e.g. alex@flow.",
          },
          network: {
            type: "string",
            description:
              "Target network: near, solana, base, or ethereum (defaults to near).",
          },
        },
        required: ["flowId"],
        additionalProperties: false,
      },
    },
    {
      name: "flow_quote_transfer",
      description:
        "Simulate a direct on-chain send, cross-chain NEAR Intents send, or wallet conversion without moving funds. Returns estimated receive amount, USD valuation, platform fee, gas sponsorship status, and whether it fits within this agent key's spend cap.",
      inputSchema: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            enum: ["SEND", "CONVERT"],
            description: "SEND (to a recipient) or CONVERT (swap/bridge inside your own wallet). Defaults to SEND.",
          },
          sourceAsset: {
            type: "string",
            description:
              "Source asset deployment ID (e.g. near-mainnet:USDC) or symbol (e.g. USDC, NEAR, SOL, ETH).",
          },
          sourceNetwork: {
            type: "string",
            description: "Optional source network (near, solana, base, ethereum).",
          },
          destinationAsset: {
            type: "string",
            description:
              "Destination asset deployment ID or symbol. Omit for direct same-asset send.",
          },
          destinationNetwork: {
            type: "string",
            description:
              "Optional destination network (near, solana, base, ethereum).",
          },
          amount: {
            type: "string",
            description: "Human-readable amount of the source asset, e.g. '15' or '0.5'.",
          },
          recipient: {
            type: "string",
            description:
              "Optional recipient @flow ID (e.g. alex@flow) or destination chain address (for SEND).",
          },
        },
        required: ["sourceAsset", "amount"],
        additionalProperties: false,
      },
    },
    {
      name: "flow_send_asset",
      description: ctx.canSend
        ? `Send an asset directly on-chain (gasless $0 on NEAR) or cross-chain via NEAR Intents to a @flow ID or wallet address. Strictly enforced against this key's USD spend cap (remaining: ${formatUsdCentsLabel(Math.max(0, ctx.maxTotalUsdCents - ctx.spentTotalUsdCents))}, max per tx: ${formatUsdCentsLabel(ctx.maxPerTxUsdCents)}).`
        : "Disabled on this MCP key (canSend = false). Attempting to call returns a permission error.",
      inputSchema: {
        type: "object",
        properties: {
          sourceAsset: {
            type: "string",
            description:
              "Source asset deployment ID (e.g. near-mainnet:USDC) or symbol (e.g. NEAR, USDC, SOL).",
          },
          sourceNetwork: {
            type: "string",
            description: "Optional source network: near, solana, base, ethereum.",
          },
          destinationAsset: {
            type: "string",
            description:
              "Optional destination asset for cross-chain or cross-asset NEAR Intents send. Omit for direct same-asset transfer.",
          },
          destinationNetwork: {
            type: "string",
            description: "Optional destination network: near, solana, base, ethereum.",
          },
          amount: {
            type: "string",
            description: "Display amount to send, e.g. '10' or '2.5'.",
          },
          recipient: {
            type: "string",
            description:
              "Recipient @flow ID (e.g. alex@flow) or destination blockchain address.",
          },
          memo: {
            type: "string",
            description: "Optional short payment note (max 140 chars).",
          },
          feeInclusive: {
            type: "boolean",
            description:
              "If true on cross-asset sends, deduct any platform fee from the entered amount rather than charging on top.",
          },
          idempotencyKey: {
            type: "string",
            description:
              "Optional UUID to guarantee safe retries without double-sending.",
          },
        },
        required: ["sourceAsset", "amount", "recipient"],
        additionalProperties: false,
      },
    },
    {
      name: "flow_convert_asset",
      description: ctx.canConvert
        ? "Convert or bridge an asset inside the user's own FLOW wallet across NEAR, Solana, Base, and Ethereum via NEAR Intents. Funds remain in the user's own wallet."
        : "Disabled on this MCP key (canConvert = false). Attempting to call returns a permission error.",
      inputSchema: {
        type: "object",
        properties: {
          sourceAsset: {
            type: "string",
            description: "Source asset deployment ID or symbol.",
          },
          sourceNetwork: {
            type: "string",
            description: "Optional source network: near, solana, base, ethereum.",
          },
          destinationAsset: {
            type: "string",
            description: "Destination asset deployment ID or symbol.",
          },
          destinationNetwork: {
            type: "string",
            description: "Optional destination network: near, solana, base, ethereum.",
          },
          amount: {
            type: "string",
            description: "Display amount of the source asset to convert.",
          },
          feeInclusive: {
            type: "boolean",
            description: "If true, deduct platform fee from the entered amount.",
          },
          idempotencyKey: {
            type: "string",
            description: "Optional UUID for safe retries.",
          },
        },
        required: ["sourceAsset", "destinationAsset", "amount"],
        additionalProperties: false,
      },
    },
    {
      name: "flow_get_transfer_status",
      description:
        "Check live execution and on-chain settlement status (and tx hashes) for a FLOW send or conversion by publicId (e.g. snd_... or cnv_...) or UUID.",
      inputSchema: {
        type: "object",
        properties: {
          transferId: {
            type: "string",
            description: "Transfer publicId (snd_... / cnv_...) or UUID.",
          },
        },
        required: ["transferId"],
        additionalProperties: false,
      },
    },
    {
      name: "flow_create_payment_link",
      description: ctx.canCreatePaymentLinks
        ? "Create a shareable FLOW Payment Link (fixed or open amount) that settles into the user's FLOW wallet with 0% FLOW fee."
        : "Disabled on this MCP key (canCreatePaymentLinks = false).",
      inputSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Short invoice or payment link title (max 120 chars).",
          },
          description: {
            type: "string",
            description: "Optional description for the payer.",
          },
          destinationAsset: {
            type: "string",
            description:
              "Asset to receive (e.g. near-mainnet:USDC or USDC). Defaults to USDC on NEAR.",
          },
          destinationNetwork: {
            type: "string",
            description: "Optional destination network: near, solana, base, ethereum.",
          },
          amount: {
            type: "string",
            description:
              "Optional fixed display amount (e.g. '25'). Omit for an open-amount payment link.",
          },
          expiresInHours: {
            type: "number",
            description: "Optional link expiration in hours (1 to 720, default 168).",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
    {
      name: "flow_list_activity",
      description:
        "List recent outgoing sends, conversions, and indexed wallet activities for the connected FLOW account.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Max items to return per category (1 to 50, default 15).",
          },
        },
        additionalProperties: false,
      },
    },
  ];
}

function toolSuccess(data: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function toolError(code: string, message: string, details?: Record<string, unknown>) {
  const payload = { ok: false, errorCode: code, message, ...(details ?? {}) };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

async function executeMcpTool(
  ctx: AuthenticatedAgentContext,
  toolName: string,
  rawArgs: Record<string, unknown> | undefined,
) {
  const args = rawArgs ?? {};

  if (toolName === "flow_get_account") {
    const snapshot = await fetchSnapshot(ctx.tokenHash);
    const remainingTotalCents = Math.max(
      0,
      ctx.maxTotalUsdCents - ctx.spentTotalUsdCents,
    );
    const remaining24hCents =
      ctx.maxDailyUsdCents === null
        ? null
        : Math.max(0, ctx.maxDailyUsdCents - ctx.spent24hUsdCents);
    return toolSuccess({
      ok: true,
      account: {
        accountId: snapshot.accountId,
        flowId: snapshot.flowId,
        directPayUrl: snapshot.flowId
          ? `${APP_BASE_URL}/${snapshot.flowId}`
          : null,
        walletStatus: snapshot.walletStatus,
        addresses: snapshot.addresses,
      },
      agentPolicy: {
        name: ctx.name,
        status: ctx.status,
        expiresAt: ctx.expiresAt,
        permissions: {
          canRead: ctx.canRead,
          canSend: ctx.canSend,
          canConvert: ctx.canConvert,
          canCreatePaymentLinks: ctx.canCreatePaymentLinks,
        },
        allowedNetworks: ctx.allowedNetworks,
        allowedRecipients: ctx.allowedRecipients,
        sendLimitsUsd: {
          maxTotalUsd: centsToUsd(ctx.maxTotalUsdCents),
          maxPerTxUsd: centsToUsd(ctx.maxPerTxUsdCents),
          maxDailyUsd:
            ctx.maxDailyUsdCents === null
              ? null
              : centsToUsd(ctx.maxDailyUsdCents),
          spentTotalUsd: centsToUsd(ctx.spentTotalUsdCents),
          spent24hUsd: centsToUsd(ctx.spent24hUsdCents),
          remainingTotalUsd: centsToUsd(remainingTotalCents),
          remaining24hUsd:
            remaining24hCents === null ? null : centsToUsd(remaining24hCents),
        },
      },
    });
  }

  if (toolName === "flow_list_supported_assets") {
    return toolSuccess({
      ok: true,
      assets: MAINNET_SUPPORTED_DEPLOYMENTS.map((d) => ({
        deploymentId: d.id,
        symbol: d.symbol,
        name: d.name,
        network: d.networkKey,
        networkName: d.networkName,
        standard: d.standard,
        decimals: d.decimals,
        nearGasSponsored: isNearSourceGasSponsored(d.networkKey),
        allowedByThisKey: ctx.allowedNetworks.includes(d.networkKey),
      })),
    });
  }

  if (toolName === "flow_get_balances") {
    const includeZero = Boolean(args.includeZero);
    const [snapshot, prices] = await Promise.all([
      fetchSnapshot(ctx.tokenHash),
      fetchSymbolUsdPrices().catch(() => ({ USDC: 1, USDT: 1 }) as Record<string, number>),
    ]);

    const items: Array<Record<string, unknown>> = [];
    let totalUsd = 0;

    for (const deployment of MAINNET_SUPPORTED_DEPLOYMENTS) {
      const matched = matchSnapshotBalance(snapshot.balances, deployment);
      const atomic = matched ? BigInt(matched.atomicBalance) : 0n;
      if (!includeZero && atomic <= 0n) continue;
      const displayBalance = formatAtomicToDisplay(atomic, deployment.decimals);
      const unitPriceUsd =
        deployment.symbol.toUpperCase() === "USDC" ||
        deployment.symbol.toUpperCase() === "USDT"
          ? 1
          : (prices[deployment.symbol.toUpperCase()] ?? null);
      const numBalance = Number.parseFloat(displayBalance);
      const usdValue =
        unitPriceUsd && Number.isFinite(numBalance)
          ? Number((numBalance * unitPriceUsd).toFixed(2))
          : null;
      if (usdValue !== null) totalUsd += usdValue;
      items.push({
        deploymentId: deployment.id,
        symbol: deployment.symbol,
        network: deployment.networkKey,
        networkName: deployment.networkName,
        displayBalance,
        atomicBalance: atomic.toString(),
        unitPriceUsd,
        usdValue,
        nearGasSponsored: isNearSourceGasSponsored(deployment.networkKey),
        syncStatus: matched?.syncStatus ?? "NOT_SYNCED",
        lastSyncedAt: matched?.lastSyncedAt ?? null,
      });
    }

    return toolSuccess({
      ok: true,
      flowId: snapshot.flowId,
      walletStatus: snapshot.walletStatus,
      estimatedTotalUsd: Number(totalUsd.toFixed(2)),
      balances: items,
    });
  }

  if (toolName === "flow_resolve_flow_id") {
    const schema = z.object({
      flowId: z.string().trim().min(2).max(128),
      network: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return toolError("INVALID_ARGUMENTS", "Provide a valid flowId (e.g. alex@flow).");
    }
    const targetDeployment = resolveMcpDeployment({
      asset: "NEAR",
      network: parsed.data.network ?? "near",
    });
    const targetNet = targetDeployment?.networkKey ?? "near-mainnet";
    try {
      const resolved = await resolveFlowIdForSend(runtime().db, {
        rawFlowId: parsed.data.flowId,
        destinationNetwork: targetNet,
      });
      return toolSuccess({
        ok: true,
        flowId: resolved.flowId,
        network: targetNet,
        recipientAddress: resolved.recipientAddress,
      });
    } catch (err) {
      return toolError(
        "FLOW_ID_NOT_FOUND",
        err instanceof Error ? err.message : "Could not resolve that @flow ID.",
      );
    }
  }

  if (toolName === "flow_quote_transfer") {
    const schema = z.object({
      operation: z.enum(["SEND", "CONVERT"]).default("SEND"),
      sourceAsset: z.string().trim().min(1),
      sourceNetwork: z.string().trim().optional(),
      destinationAsset: z.string().trim().optional(),
      destinationNetwork: z.string().trim().optional(),
      amount: z.string().trim().min(1),
      recipient: z.string().trim().optional(),
    });
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return toolError(
        "INVALID_ARGUMENTS",
        "Provide sourceAsset and amount (plus destinationAsset for cross-chain/convert).",
      );
    }
    const src = resolveMcpDeployment({
      asset: parsed.data.sourceAsset,
      network: parsed.data.sourceNetwork,
    });
    if (!src) {
      return toolError(
        "UNSUPPORTED_SOURCE_ASSET",
        `Unknown source asset: ${parsed.data.sourceAsset}. Call flow_list_supported_assets first.`,
      );
    }
    const dst = parsed.data.destinationAsset
      ? resolveMcpDeployment({
          asset: parsed.data.destinationAsset,
          network: parsed.data.destinationNetwork,
        })
      : src;
    if (!dst) {
      return toolError(
        "UNSUPPORTED_DESTINATION_ASSET",
        `Unknown destination asset: ${parsed.data.destinationAsset}.`,
      );
    }
    let amountAtomic: bigint;
    try {
      amountAtomic = parseDisplayToAtomic(parsed.data.amount, src.decimals);
    } catch {
      return toolError("INVALID_AMOUNT", "Amount must be a positive decimal number.");
    }
    if (amountAtomic <= 0n) {
      return toolError("INVALID_AMOUNT", "Amount must be greater than zero.");
    }

    const samePair = src.id === dst.id;
    const operation = parsed.data.operation;
    if (operation === "CONVERT" && samePair) {
      return toolError(
        "UNSUPPORTED_CONVERT_PAIR",
        "Source and destination assets must be different for CONVERT.",
      );
    }

    const gasSponsored = isNearSourceGasSponsored(src.networkKey);
    const feeBps = getOperationPlatformFeeBps(operation, samePair, {
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
    });
    const appFees = getOperationAppFees(operation, samePair, {
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
    });
    const feeBreakdown = resolveTransferFeeBreakdown({
      requestedAmountAtomic: amountAtomic,
      maxSpendableAtomic: null,
      feeBps,
      feeInclusive: false,
    });

    const unitPriceUsd = await resolveUnitPriceUsd(src);
    const totalDisplay = formatAtomicToDisplay(
      feeBreakdown.totalDebitAtomic,
      src.decimals,
    );
    const estimatedUsdCents = computeTransferUsdCents(totalDisplay, unitPriceUsd);

    let recipientAddress = parsed.data.recipient?.trim() || null;
    let recipientLabel: string | null = null;
    if (recipientAddress && isFlowIdInput(recipientAddress)) {
      try {
        const res = await resolveFlowIdForSend(runtime().db, {
          rawFlowId: recipientAddress,
          destinationNetwork: dst.networkKey,
        });
        recipientAddress = res.recipientAddress;
        recipientLabel = res.flowId;
      } catch (err) {
        return toolError(
          "FLOW_ID_NOT_FOUND",
          err instanceof Error ? err.message : "Could not resolve recipient @flow ID.",
        );
      }
    }

    const guard = evaluateMcpSpendGuard({
      status: ctx.status,
      expiresAtIso: ctx.expiresAt,
      operation,
      canSend: ctx.canSend,
      canConvert: ctx.canConvert,
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
      allowedNetworks: ctx.allowedNetworks,
      allowedRecipients: ctx.allowedRecipients,
      recipientAddress,
      recipientLabel,
      requestedUsdCents: estimatedUsdCents,
      maxTotalUsdCents: ctx.maxTotalUsdCents,
      maxPerTxUsdCents: ctx.maxPerTxUsdCents,
      maxDailyUsdCents: ctx.maxDailyUsdCents,
      spentTotalUsdCents: ctx.spentTotalUsdCents,
      spent24hUsdCents: ctx.spent24hUsdCents,
    });

    if (samePair) {
      return toolSuccess({
        ok: true,
        routeType: "DIRECT_ON_CHAIN",
        operation,
        source: {
          deploymentId: src.id,
          symbol: src.symbol,
          network: src.networkKey,
          amount: parsed.data.amount,
        },
        destination: {
          deploymentId: dst.id,
          symbol: dst.symbol,
          network: dst.networkKey,
          estimatedReceiveAmount: parsed.data.amount,
        },
        fees: {
          platformFeeBps: feeBps,
          platformFeeDisplay: "0",
          nearGasSponsored: gasSponsored,
        },
        estimatedUsd: estimatedUsdCents !== null ? centsToUsd(estimatedUsdCents) : null,
        policyCheck: guard.ok
          ? { allowed: true }
          : { allowed: false, code: guard.code, reason: guard.message },
      });
    }

    const snapshot = await fetchSnapshot(ctx.tokenHash);
    const refundAddr = findWalletAddress(snapshot.addresses, src.networkKey);
    const ownDstAddr = findWalletAddress(snapshot.addresses, dst.networkKey);
    const targetRecipient =
      operation === "CONVERT"
        ? ownDstAddr
        : (recipientAddress ?? ownDstAddr);

    if (!refundAddr || !targetRecipient) {
      return toolError(
        "ACTIVE_MAINNET_WALLET_REQUIRED",
        "Your FLOW account must have active mainnet wallet addresses to quote cross-chain routes.",
      );
    }

    const [srcQuote, dstQuote] = await Promise.all([
      resolveQuoteAsset(src.id),
      resolveQuoteAsset(dst.id),
    ]);
    if (!srcQuote || !dstQuote) {
      return toolError(
        "UNSUPPORTED_ROUTE",
        `Cross-chain route ${src.id} -> ${dst.id} is not available via NEAR Intents.`,
      );
    }

    const dry = await fetchOneClickDryQuote({
      originAsset: srcQuote.assetId,
      destinationAsset: dstQuote.assetId,
      amountAtomic: feeBreakdown.totalDebitAtomic.toString(),
      swapType: "EXACT_INPUT",
      recipient: targetRecipient,
      refundTo: refundAddr,
      ...(appFees.length > 0 ? { appFees } : {}),
    });

    if (!dry.ok || !dry.amountOutAtomic) {
      return toolError(
        "QUOTE_UNAVAILABLE",
        dry.errorMessage || "Unable to fetch a live NEAR Intents quote for this route.",
      );
    }

    return toolSuccess({
      ok: true,
      routeType: "NEAR_INTENTS_1CLICK",
      operation,
      source: {
        deploymentId: src.id,
        symbol: src.symbol,
        network: src.networkKey,
        principalAmount: formatAtomicToDisplay(
          feeBreakdown.principalAtomic,
          src.decimals,
        ),
        totalDebitAmount: totalDisplay,
      },
      destination: {
        deploymentId: dst.id,
        symbol: dst.symbol,
        network: dst.networkKey,
        estimatedReceiveAmount: formatAtomicToDisplay(
          BigInt(dry.amountOutAtomic),
          dst.decimals,
        ),
        minimumReceiveAmount: dry.minAmountOutAtomic
          ? formatAtomicToDisplay(BigInt(dry.minAmountOutAtomic), dst.decimals)
          : null,
      },
      fees: {
        platformFeeBps: feeBps,
        platformFeeDisplay: formatAtomicToDisplay(
          feeBreakdown.feeAtomic,
          src.decimals,
        ),
        nearGasSponsored: gasSponsored,
      },
      estimatedTimeSeconds: dry.timeEstimateSeconds ?? null,
      estimatedUsd: estimatedUsdCents !== null ? centsToUsd(estimatedUsdCents) : null,
      policyCheck: guard.ok
        ? { allowed: true }
        : { allowed: false, code: guard.code, reason: guard.message },
    });
  }

  if (toolName === "flow_send_asset") {
    if (isFinancialExecutionDisabled()) {
      return toolError(
        "PAYMENT_EXECUTION_DISABLED",
        "Financial execution is temporarily disabled on this FLOW deployment.",
      );
    }
    const schema = z.object({
      sourceAsset: z.string().trim().min(1),
      sourceNetwork: z.string().trim().optional(),
      destinationAsset: z.string().trim().optional(),
      destinationNetwork: z.string().trim().optional(),
      amount: z.string().trim().min(1),
      recipient: z.string().trim().min(2).max(160),
      memo: z.string().trim().max(140).optional(),
      feeInclusive: z.boolean().optional(),
      idempotencyKey: z.string().uuid().optional(),
    });
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return toolError(
        "INVALID_ARGUMENTS",
        "Provide sourceAsset, amount, and recipient (@flow ID or wallet address).",
      );
    }

    const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();
    const { db } = runtime();
    const existingRows = await db.$queryRaw<
      Array<{ transfer: Record<string, unknown> | null }>
    >`
      SELECT flow.mcp_find_transfer_by_idempotency(
        ${ctx.tokenHash}::text,
        ${idempotencyKey}::uuid
      ) AS transfer
    `;
    if (existingRows[0]?.transfer) {
      return toolSuccess({
        ok: true,
        idempotent: true,
        transfer: existingRows[0].transfer,
      });
    }

    const src = resolveMcpDeployment({
      asset: parsed.data.sourceAsset,
      network: parsed.data.sourceNetwork,
    });
    if (!src) {
      return toolError(
        "UNSUPPORTED_SOURCE_ASSET",
        `Unknown source asset: ${parsed.data.sourceAsset}.`,
      );
    }
    const dst = parsed.data.destinationAsset
      ? resolveMcpDeployment({
          asset: parsed.data.destinationAsset,
          network: parsed.data.destinationNetwork,
        })
      : src;
    if (!dst) {
      return toolError(
        "UNSUPPORTED_DESTINATION_ASSET",
        `Unknown destination asset: ${parsed.data.destinationAsset}.`,
      );
    }

    let amountAtomic: bigint;
    try {
      amountAtomic = parseDisplayToAtomic(parsed.data.amount, src.decimals);
    } catch {
      return toolError("INVALID_AMOUNT", "Amount must be a positive decimal.");
    }
    if (amountAtomic <= 0n) {
      return toolError("INVALID_AMOUNT", "Amount must be greater than zero.");
    }

    let recipientAddress = parsed.data.recipient.trim();
    let recipientLabel: string | null = null;
    if (isFlowIdInput(recipientAddress)) {
      try {
        const resolved = await resolveFlowIdForSend(db, {
          rawFlowId: recipientAddress,
          destinationNetwork: dst.networkKey,
        });
        recipientAddress = resolved.recipientAddress;
        recipientLabel = resolved.flowId;
      } catch (err) {
        return toolError(
          "FLOW_ID_NOT_FOUND",
          err instanceof Error ? err.message : "Unable to resolve recipient @flow ID.",
        );
      }
    }

    const addrValidation = validateAddressForNetwork(
      dst.networkKey as NetworkId,
      recipientAddress,
    );
    if (!addrValidation.valid || isBannedIllustrativeAddress(recipientAddress)) {
      return toolError(
        "INVALID_RECIPIENT_ADDRESS",
        `Invalid ${dst.networkName} recipient address.`,
      );
    }

    const isCrossAsset = dst.id !== src.id;
    const isNearGasless = isNearSourceGasSponsored(src.networkKey);
    const feeRoute = {
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
    };
    const sendFeeBps = getOperationPlatformFeeBps("SEND", !isCrossAsset, feeRoute);
    const sendAppFees = getOperationAppFees("SEND", !isCrossAsset, feeRoute);

    const snapshot = await fetchSnapshot(ctx.tokenHash);
    if (!snapshot.walletId || snapshot.walletStatus !== "ACTIVE") {
      return toolError(
        "ACTIVE_MAINNET_WALLET_REQUIRED",
        "Your FLOW account does not have an active mainnet wallet.",
      );
    }

    let balanceInfo;
    try {
      balanceInfo = await resolveLiveSpendableBalance({
        ctx,
        snapshot,
        deployment: src,
      });
    } catch (err) {
      return toolError(
        "BALANCE_CHECK_FAILED",
        err instanceof Error ? err.message : "Unable to verify spendable balance.",
      );
    }

    const maxSpendableAfterGas = computeMaxSendableAtomic({
      networkKey: src.networkKey,
      sourceStandard: src.standard,
      balanceAtomic: balanceInfo.spendableAtomic,
      gasSponsored: isNearGasless,
    });
    const feeBreakdown = resolveTransferFeeBreakdown({
      requestedAmountAtomic: amountAtomic,
      maxSpendableAtomic: maxSpendableAfterGas,
      feeBps: sendFeeBps,
      feeInclusive: Boolean(parsed.data.feeInclusive),
    });

    if (
      feeBreakdown.principalAtomic <= 0n ||
      feeBreakdown.totalDebitAtomic > balanceInfo.spendableAtomic
    ) {
      return toolError(
        "INSUFFICIENT_SPENDABLE_BALANCE",
        `Insufficient ${src.symbol} balance on ${src.networkName}. Available: ${formatAtomicToDisplay(balanceInfo.spendableAtomic, src.decimals)} ${src.symbol}.`,
      );
    }

    const gasCheck = checkNetworkGasBalance({
      networkKey: src.networkKey,
      sourceStandard: src.standard,
      requestedAmountAtomic: feeBreakdown.totalDebitAtomic,
      nativeBalanceAtomic: balanceInfo.nativeBalanceAtomic,
      gasSponsored: isNearGasless,
    });
    if (!gasCheck.ok) {
      return toolError(
        "INSUFFICIENT_GAS_BALANCE",
        gasCheck.reason || `Insufficient gas balance on ${src.networkName}.`,
      );
    }

    // Fail-closed live USD valuation BEFORE committing any quote or enqueuing custody job!
    const totalDebitDisplay = formatAtomicToDisplay(
      feeBreakdown.totalDebitAtomic,
      src.decimals,
    );
    const unitPriceUsd = await resolveUnitPriceUsd(src);
    const transferUsdCents = computeTransferUsdCents(
      totalDebitDisplay,
      unitPriceUsd,
    );

    const preGuard = evaluateMcpSpendGuard({
      status: ctx.status,
      expiresAtIso: ctx.expiresAt,
      operation: "SEND",
      canSend: ctx.canSend,
      canConvert: ctx.canConvert,
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
      allowedNetworks: ctx.allowedNetworks,
      allowedRecipients: ctx.allowedRecipients,
      recipientAddress,
      recipientLabel,
      requestedUsdCents: transferUsdCents,
      maxTotalUsdCents: ctx.maxTotalUsdCents,
      maxPerTxUsdCents: ctx.maxPerTxUsdCents,
      maxDailyUsdCents: ctx.maxDailyUsdCents,
      spentTotalUsdCents: ctx.spentTotalUsdCents,
      spent24hUsdCents: ctx.spent24hUsdCents,
    });
    if (!preGuard.ok) {
      return toolError(preGuard.code, preGuard.message);
    }

    let committedQuote: {
      quotedOutAtomic?: string;
      depositAddress?: string;
      depositMemo?: string | null;
      correlationId?: string | null;
    } | null = null;

    if (isCrossAsset) {
      const ownSourceAddress = findWalletAddress(
        snapshot.addresses,
        src.networkKey,
      );
      if (!ownSourceAddress) {
        return toolError(
          "ACTIVE_MAINNET_WALLET_REQUIRED",
          `No active ${src.networkName} wallet address found.`,
        );
      }
      const [srcQuote, dstQuote] = await Promise.all([
        resolveQuoteAsset(src.id),
        resolveQuoteAsset(dst.id),
      ]);
      if (!srcQuote || !dstQuote) {
        return toolError(
          "UNSUPPORTED_SEND_ROUTE",
          `Route ${src.id} -> ${dst.id} is not available via NEAR Intents.`,
        );
      }
      const committed = await fetchOneClickCommittedQuote({
        originAsset: srcQuote.assetId,
        destinationAsset: dstQuote.assetId,
        amountAtomic: feeBreakdown.totalDebitAtomic.toString(),
        swapType: "EXACT_INPUT",
        recipient: recipientAddress,
        refundTo: ownSourceAddress,
        ...(sendAppFees.length > 0 ? { appFees: sendAppFees } : {}),
      });
      if (
        !committed.ok ||
        !committed.depositAddress ||
        !committed.amountOutAtomic
      ) {
        return toolError(
          "QUOTE_COMMIT_FAILED",
          committed.errorMessage || "Failed to lock NEAR Intents cross-chain quote.",
        );
      }
      committedQuote = {
        quotedOutAtomic: committed.amountOutAtomic,
        depositAddress: committed.depositAddress,
        depositMemo: committed.depositMemo,
        correlationId: committed.correlationId,
      };
    }

    const destAssetKey =
      dst.standard === "NATIVE" ? "native" : dst.contractIdentifier;
    const publicId = `snd_${randomBytes(10).toString("hex")}`;
    const quotePayloadJson = JSON.stringify({
      ...(parsed.data.memo ? { userMemo: parsed.data.memo } : {}),
      ...(recipientLabel ? { recipientLabel } : {}),
      ...(snapshot.flowId ? { senderFlowId: snapshot.flowId } : {}),
      ...(sendFeeBps > 0
        ? {
            principalAtomicAmount: feeBreakdown.principalAtomic.toString(),
            platformFeeAtomic: feeBreakdown.feeAtomic.toString(),
            platformFeeBps: sendFeeBps,
            feeDeductedFromAmount: feeBreakdown.feeDeductedFromAmount,
          }
        : {}),
    });

    // Atomic row-locked budget verification + custody job insert
    const enqueueRows = await db.$queryRaw<
      Array<{ result: Record<string, unknown> }>
    >`
      SELECT flow.mcp_enqueue_transfer(
        ${ctx.tokenHash}::text,
        ${publicId}::text,
        ${snapshot.walletId}::uuid,
        ${idempotencyKey}::uuid,
        'SEND'::text,
        ${src.networkKey}::text,
        ${balanceInfo.sourceAssetKey}::text,
        ${src.symbol}::text,
        ${src.decimals}::integer,
        ${feeBreakdown.totalDebitAtomic.toString()}::numeric,
        ${totalDebitDisplay}::text,
        ${recipientAddress}::text,
        ${recipientLabel}::text,
        ${dst.networkKey}::text,
        ${destAssetKey}::text,
        ${dst.symbol}::text,
        ${dst.decimals}::integer,
        ${committedQuote?.quotedOutAtomic ?? null}::numeric,
        ${committedQuote?.depositAddress ?? null}::text,
        ${committedQuote?.depositMemo ?? null}::text,
        ${committedQuote?.correlationId ?? null}::text,
        ${quotePayloadJson}::jsonb,
        ${transferUsdCents ?? 0}::bigint
      ) AS result
    `;

    const res = enqueueRows[0]?.result;
    if (!res || res.ok !== true) {
      const errCode = String(res?.errorCode || "MCP_ENQUEUE_FAILED");
      return toolError(
        errCode,
        `Transfer blocked by agent spend guard (${errCode}).`,
        res ?? undefined,
      );
    }

    const spentTotal = toSafeInt(res.spentTotalUsdCents as number);
    const maxTotal = toSafeInt(res.maxTotalUsdCents as number);
    return toolSuccess({
      ok: true,
      routeType: isCrossAsset ? "NEAR_INTENTS_1CLICK" : "DIRECT_ON_CHAIN",
      nearGasSponsored: isNearGasless,
      transfer: res.transfer,
      estimatedUsd: centsToUsd(transferUsdCents ?? 0),
      remainingTotalUsd: centsToUsd(Math.max(0, maxTotal - spentTotal)),
      note: "Transfer queued for FLOW custody execution. Poll flow_get_transfer_status with transfer.publicId to track settlement.",
    });
  }

  if (toolName === "flow_convert_asset") {
    if (isFinancialExecutionDisabled()) {
      return toolError(
        "PAYMENT_EXECUTION_DISABLED",
        "Financial execution is temporarily disabled on this FLOW deployment.",
      );
    }
    const schema = z.object({
      sourceAsset: z.string().trim().min(1),
      sourceNetwork: z.string().trim().optional(),
      destinationAsset: z.string().trim().min(1),
      destinationNetwork: z.string().trim().optional(),
      amount: z.string().trim().min(1),
      feeInclusive: z.boolean().optional(),
      idempotencyKey: z.string().uuid().optional(),
    });
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return toolError(
        "INVALID_ARGUMENTS",
        "Provide sourceAsset, destinationAsset, and amount.",
      );
    }

    const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();
    const { db } = runtime();
    const existingRows = await db.$queryRaw<
      Array<{ transfer: Record<string, unknown> | null }>
    >`
      SELECT flow.mcp_find_transfer_by_idempotency(
        ${ctx.tokenHash}::text,
        ${idempotencyKey}::uuid
      ) AS transfer
    `;
    if (existingRows[0]?.transfer) {
      return toolSuccess({
        ok: true,
        idempotent: true,
        transfer: existingRows[0].transfer,
      });
    }

    const src = resolveMcpDeployment({
      asset: parsed.data.sourceAsset,
      network: parsed.data.sourceNetwork,
    });
    const dst = resolveMcpDeployment({
      asset: parsed.data.destinationAsset,
      network: parsed.data.destinationNetwork,
    });
    if (!src || !dst || src.id === dst.id) {
      return toolError(
        "UNSUPPORTED_CONVERT_PAIR",
        "Select two different supported mainnet assets for conversion.",
      );
    }

    let amountAtomic: bigint;
    try {
      amountAtomic = parseDisplayToAtomic(parsed.data.amount, src.decimals);
    } catch {
      return toolError("INVALID_AMOUNT", "Amount must be a positive decimal.");
    }
    if (amountAtomic <= 0n) {
      return toolError("INVALID_AMOUNT", "Amount must be greater than zero.");
    }

    const preGuard = evaluateMcpSpendGuard({
      status: ctx.status,
      expiresAtIso: ctx.expiresAt,
      operation: "CONVERT",
      canSend: ctx.canSend,
      canConvert: ctx.canConvert,
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
      allowedNetworks: ctx.allowedNetworks,
      allowedRecipients: ctx.allowedRecipients,
      requestedUsdCents: 0,
      maxTotalUsdCents: ctx.maxTotalUsdCents,
      maxPerTxUsdCents: ctx.maxPerTxUsdCents,
      maxDailyUsdCents: ctx.maxDailyUsdCents,
      spentTotalUsdCents: ctx.spentTotalUsdCents,
      spent24hUsdCents: ctx.spent24hUsdCents,
    });
    if (!preGuard.ok) {
      return toolError(preGuard.code, preGuard.message);
    }

    const snapshot = await fetchSnapshot(ctx.tokenHash);
    const ownSourceAddress = findWalletAddress(
      snapshot.addresses,
      src.networkKey,
    );
    const ownDestAddress = findWalletAddress(
      snapshot.addresses,
      dst.networkKey,
    );
    if (
      !snapshot.walletId ||
      snapshot.walletStatus !== "ACTIVE" ||
      !ownSourceAddress ||
      !ownDestAddress
    ) {
      return toolError(
        "ACTIVE_MAINNET_WALLET_REQUIRED",
        "Your FLOW account must have active mainnet wallets on both source and destination networks.",
      );
    }

    const isNearGasless = isNearSourceGasSponsored(src.networkKey);
    const feeRoute = {
      sourceNetwork: src.networkKey,
      destinationNetwork: dst.networkKey,
    };
    const convertFeeBps = getOperationPlatformFeeBps("CONVERT", false, feeRoute);
    const convertAppFees = getOperationAppFees("CONVERT", false, feeRoute);

    let balanceInfo;
    try {
      balanceInfo = await resolveLiveSpendableBalance({
        ctx,
        snapshot,
        deployment: src,
      });
    } catch (err) {
      return toolError(
        "BALANCE_CHECK_FAILED",
        err instanceof Error ? err.message : "Unable to verify spendable balance.",
      );
    }

    const maxSpendableAfterGas = computeMaxSendableAtomic({
      networkKey: src.networkKey,
      sourceStandard: src.standard,
      balanceAtomic: balanceInfo.spendableAtomic,
      gasSponsored: isNearGasless,
    });
    const feeBreakdown = resolveTransferFeeBreakdown({
      requestedAmountAtomic: amountAtomic,
      maxSpendableAtomic: maxSpendableAfterGas,
      feeBps: convertFeeBps,
      feeInclusive: Boolean(parsed.data.feeInclusive),
    });

    if (
      feeBreakdown.principalAtomic <= 0n ||
      feeBreakdown.totalDebitAtomic > balanceInfo.spendableAtomic
    ) {
      return toolError(
        "INSUFFICIENT_SPENDABLE_BALANCE",
        `Insufficient ${src.symbol} balance on ${src.networkName}.`,
      );
    }

    const gasCheck = checkNetworkGasBalance({
      networkKey: src.networkKey,
      sourceStandard: src.standard,
      requestedAmountAtomic: feeBreakdown.totalDebitAtomic,
      nativeBalanceAtomic: balanceInfo.nativeBalanceAtomic,
      gasSponsored: isNearGasless,
    });
    if (!gasCheck.ok) {
      return toolError(
        "INSUFFICIENT_GAS_BALANCE",
        gasCheck.reason || `Insufficient gas balance on ${src.networkName}.`,
      );
    }

    const [srcQuote, dstQuote] = await Promise.all([
      resolveQuoteAsset(src.id),
      resolveQuoteAsset(dst.id),
    ]);
    if (!srcQuote || !dstQuote) {
      return toolError(
        "UNSUPPORTED_CONVERT_PAIR",
        `Conversion route ${src.id} -> ${dst.id} is not supported by NEAR Intents.`,
      );
    }

    const committed = await fetchOneClickCommittedQuote({
      originAsset: srcQuote.assetId,
      destinationAsset: dstQuote.assetId,
      amountAtomic: feeBreakdown.totalDebitAtomic.toString(),
      swapType: "EXACT_INPUT",
      recipient: ownDestAddress,
      refundTo: ownSourceAddress,
      ...(convertAppFees.length > 0 ? { appFees: convertAppFees } : {}),
    });
    if (
      !committed.ok ||
      !committed.depositAddress ||
      !committed.amountOutAtomic
    ) {
      return toolError(
        "QUOTE_COMMIT_FAILED",
        committed.errorMessage || "Failed to commit conversion quote.",
      );
    }

    const totalDebitDisplay = formatAtomicToDisplay(
      feeBreakdown.totalDebitAtomic,
      src.decimals,
    );
    const unitPriceUsd = await resolveUnitPriceUsd(src);
    const auditUsdCents =
      computeTransferUsdCents(totalDebitDisplay, unitPriceUsd) ?? 0;

    const destAssetKey =
      dst.standard === "NATIVE" ? "native" : dst.contractIdentifier;
    const publicId = `cnv_${randomBytes(10).toString("hex")}`;
    const quotePayloadJson = JSON.stringify({
      principalAtomicAmount: feeBreakdown.principalAtomic.toString(),
      platformFeeAtomic: feeBreakdown.feeAtomic.toString(),
      platformFeeBps: convertFeeBps,
      feeDeductedFromAmount: feeBreakdown.feeDeductedFromAmount,
    });

    const enqueueRows = await db.$queryRaw<
      Array<{ result: Record<string, unknown> }>
    >`
      SELECT flow.mcp_enqueue_transfer(
        ${ctx.tokenHash}::text,
        ${publicId}::text,
        ${snapshot.walletId}::uuid,
        ${idempotencyKey}::uuid,
        'CONVERT'::text,
        ${src.networkKey}::text,
        ${balanceInfo.sourceAssetKey}::text,
        ${src.symbol}::text,
        ${src.decimals}::integer,
        ${feeBreakdown.totalDebitAtomic.toString()}::numeric,
        ${totalDebitDisplay}::text,
        ${ownDestAddress}::text,
        'Own FLOW wallet'::text,
        ${dst.networkKey}::text,
        ${destAssetKey}::text,
        ${dst.symbol}::text,
        ${dst.decimals}::integer,
        ${committed.amountOutAtomic}::numeric,
        ${committed.depositAddress}::text,
        ${committed.depositMemo ?? null}::text,
        ${committed.correlationId ?? null}::text,
        ${quotePayloadJson}::jsonb,
        ${auditUsdCents}::bigint
      ) AS result
    `;

    const res = enqueueRows[0]?.result;
    if (!res || res.ok !== true) {
      const errCode = String(res?.errorCode || "MCP_CONVERT_FAILED");
      return toolError(errCode, `Conversion rejected (${errCode}).`, res ?? undefined);
    }

    return toolSuccess({
      ok: true,
      routeType: "NEAR_INTENTS_1CLICK",
      nearGasSponsored: isNearGasless,
      transfer: res.transfer,
      note: "Conversion queued inside your own FLOW wallet (does not consume your external Send USD budget). Poll flow_get_transfer_status with transfer.publicId.",
    });
  }

  if (toolName === "flow_get_transfer_status") {
    const ref = typeof args.transferId === "string" ? args.transferId.trim() : "";
    if (!ref) {
      return toolError("INVALID_ARGUMENTS", "Provide transferId (publicId or UUID).");
    }
    const { db } = runtime();
    const rows = await db.$queryRaw<
      Array<{ transfer: Record<string, unknown> | null }>
    >`
      SELECT flow.mcp_get_transfer(${ctx.tokenHash}::text, ${ref}::text) AS transfer
    `;
    const transfer = rows[0]?.transfer;
    if (!transfer) {
      return toolError("TRANSFER_NOT_FOUND", `No transfer found matching ${ref}.`);
    }
    return toolSuccess({ ok: true, transfer });
  }

  if (toolName === "flow_create_payment_link") {
    if (!ctx.canCreatePaymentLinks) {
      return toolError(
        "MCP_PAYMENT_LINKS_NOT_ALLOWED",
        "This MCP agent key does not have permission to create payment links.",
      );
    }
    const schema = z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional(),
      destinationAsset: z.string().trim().optional(),
      destinationNetwork: z.string().trim().optional(),
      amount: z.string().trim().optional(),
      expiresInHours: z.number().min(1).max(720).optional(),
    });
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return toolError("INVALID_ARGUMENTS", "Provide a valid title for the payment link.");
    }
    const dst = resolveMcpDeployment({
      asset: parsed.data.destinationAsset ?? "near-mainnet:USDC",
      network: parsed.data.destinationNetwork,
    });
    if (!dst) {
      return toolError(
        "UNSUPPORTED_DESTINATION_ASSET",
        "Unsupported destination asset for payment link.",
      );
    }

    let amountMode: "FIXED" | "OPTIONAL" = "OPTIONAL";
    let atomicStr: string | null = null;
    if (parsed.data.amount) {
      try {
        const atomic = parseDisplayToAtomic(parsed.data.amount, dst.decimals);
        if (atomic <= 0n) throw new Error("Must be > 0");
        amountMode = "FIXED";
        atomicStr = atomic.toString();
      } catch {
        return toolError("INVALID_AMOUNT", "Fixed amount must be a positive decimal.");
      }
    }

    const publicId = `pr_${randomBytes(10).toString("hex")}`;
    const expiresInHours = parsed.data.expiresInHours ?? 168;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
    const { db } = runtime();
    const rows = await db.$queryRaw<
      Array<{ result: Record<string, unknown> }>
    >`
      SELECT flow.mcp_create_payment_link(
        ${ctx.tokenHash}::text,
        ${publicId}::text,
        ${parsed.data.title}::text,
        ${parsed.data.description ?? null}::text,
        ${dst.networkKey}::text,
        ${dst.id}::text,
        ${dst.symbol}::text,
        ${dst.decimals}::integer,
        ${amountMode}::text,
        ${atomicStr}::numeric,
        ${expiresAt}::timestamptz,
        '{}'::jsonb
      ) AS result
    `;
    const res = rows[0]?.result;
    if (!res || res.ok !== true) {
      return toolError(
        String(res?.errorCode || "PAYMENT_LINK_CREATE_FAILED"),
        "Could not create payment link.",
      );
    }

    return toolSuccess({
      ok: true,
      url: `${APP_BASE_URL}/pay/${publicId}`,
      paymentRequest: res.paymentRequest,
    });
  }

  if (toolName === "flow_list_activity") {
    const limitRaw = typeof args.limit === "number" ? Math.round(args.limit) : 15;
    const limit = Math.max(1, Math.min(limitRaw, 50));
    const { db } = runtime();
    const rows = await db.$queryRaw<
      Array<{ activity: Record<string, unknown> | null }>
    >`
      SELECT flow.mcp_list_activity(${ctx.tokenHash}::text, ${limit}::integer) AS activity
    `;
    return toolSuccess({
      ok: true,
      ...(rows[0]?.activity ?? { outgoingTransfers: [], walletActivities: [] }),
    });
  }

  return toolError("UNKNOWN_TOOL", `Unknown FLOW MCP tool: ${toolName}`);
}

async function processSingleRpcMessage(
  ctx: AuthenticatedAgentContext,
  msg: JsonRpcRequest,
): Promise<Record<string, unknown> | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined;
  const method = msg.method;

  if (msg.jsonrpc !== "2.0" || typeof method !== "string") {
    if (isNotification) return null;
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32600, message: "Invalid JSON-RPC 2.0 request." },
    };
  }

  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    return null;
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "initialize") {
    const requestedVersion =
      typeof msg.params?.protocolVersion === "string"
        ? msg.params.protocolVersion
        : SUPPORTED_PROTOCOL_VERSIONS[0];
    const negotiated = SUPPORTED_PROTOCOL_VERSIONS.includes(
      requestedVersion as (typeof SUPPORTED_PROTOCOL_VERSIONS)[number],
    )
      ? requestedVersion
      : "2025-03-26";
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: negotiated,
        capabilities: {
          tools: { listChanged: false },
          resources: { listChanged: false },
        },
        serverInfo: {
          name: MCP_SERVER_NAME,
          version: MCP_SERVER_VERSION,
        },
        instructions: [
          `Connected to FLOW wallet (${ctx.flowId ?? ctx.accountId}) via agent key "${ctx.name}".`,
          "Call flow_get_account and flow_get_balances first to inspect deposit addresses, live holdings, and remaining USD spend limits.",
          "NEAR-source sends and conversions are gasless ($0 gas sponsored by FLOW). Cross-chain sends route automatically via NEAR Intents.",
          "Use flow_quote_transfer to preview fees and receive amounts before calling flow_send_asset or flow_convert_asset.",
        ].join(" "),
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: buildToolDefinitions(ctx),
      },
    };
  }

  if (method === "tools/call") {
    const toolName =
      typeof msg.params?.name === "string" ? msg.params.name : "";
    const toolArgs =
      msg.params?.arguments && typeof msg.params.arguments === "object"
        ? (msg.params.arguments as Record<string, unknown>)
        : {};
    try {
      const result = await executeMcpTool(ctx, toolName, toolArgs);
      return { jsonrpc: "2.0", id, result };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        result: toolError(
          "TOOL_EXECUTION_ERROR",
          err instanceof Error ? err.message : "Unexpected tool execution error.",
        ),
      };
    }
  }

  if (method === "resources/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        resources: [
          {
            uri: "flow://account/overview",
            name: "FLOW Account & Spend Limits",
            description:
              "Current @flow ID, multi-chain deposit addresses, and active MCP agent spend policy.",
            mimeType: "application/json",
          },
          {
            uri: "flow://assets/catalog",
            name: "FLOW Supported Assets Catalog",
            description:
              "Supported mainnet deployments across NEAR, Solana, Base, and Ethereum.",
            mimeType: "application/json",
          },
        ],
      },
    };
  }

  if (method === "resources/read") {
    const uri = typeof msg.params?.uri === "string" ? msg.params.uri : "";
    if (uri === "flow://account/overview") {
      const data = await executeMcpTool(ctx, "flow_get_account", {});
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: data.content[0]?.text ?? "{}",
            },
          ],
        },
      };
    }
    if (uri === "flow://assets/catalog") {
      const data = await executeMcpTool(ctx, "flow_list_supported_assets", {});
      return {
        jsonrpc: "2.0",
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: data.content[0]?.text ?? "{}",
            },
          ],
        },
      };
    }
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32002, message: `Unknown resource URI: ${uri}` },
    };
  }

  if (isNotification) return null;
  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

export function handleMcpOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function handleMcpGet(
  request: Request,
  tokenFromPath?: string,
): Promise<Response> {
  const rawToken = extractRawToken(request, tokenFromPath);
  if (!rawToken) {
    return new Response(
      JSON.stringify({
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
        transport: "streamable-http",
        endpoint: `${APP_BASE_URL}/api/mcp`,
        authentication:
          "Pass Authorization: Bearer <flw_mcp_token> or use your tokenized MCP URL.",
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json",
        },
      },
    );
  }

  const auth = await authenticateMcpToken(rawToken);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.httpStatus,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      transport: "streamable-http",
      agentName: auth.ctx.name,
      flowId: auth.ctx.flowId,
      remainingTotalUsd: centsToUsd(
        Math.max(0, auth.ctx.maxTotalUsdCents - auth.ctx.spentTotalUsdCents),
      ),
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    },
  );
}

export function handleMcpDelete(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export async function handleMcpPost(
  request: Request,
  tokenFromPath?: string,
): Promise<Response> {
  const rawToken = extractRawToken(request, tokenFromPath);
  if (!rawToken) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32001,
          message:
            "Missing FLOW MCP token. Supply Authorization: Bearer flw_mcp_... or use your tokenized MCP URL.",
        },
      }),
      {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  const auth = await authenticateMcpToken(rawToken);
  if (!auth.ok) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32001, message: auth.error },
      }),
      {
        status: auth.httpStatus,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error: invalid JSON body." },
      }),
      {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }

  if (Array.isArray(parsedBody)) {
    const responses: Array<Record<string, unknown>> = [];
    for (const item of parsedBody) {
      const res = await processSingleRpcMessage(
        auth.ctx,
        (item ?? {}) as JsonRpcRequest,
      );
      if (res) responses.push(res);
    }
    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: CORS_HEADERS });
    }
    return new Response(JSON.stringify(responses), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const response = await processSingleRpcMessage(
    auth.ctx,
    (parsedBody ?? {}) as JsonRpcRequest,
  );
  if (!response) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
