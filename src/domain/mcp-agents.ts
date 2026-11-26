import { createHash, randomBytes } from "node:crypto";
import {
  MAINNET_SUPPORTED_DEPLOYMENTS,
  type CatalogTokenDeployment,
} from "./supported-assets-catalog.ts";

export const MCP_TOKEN_PREFIX = "flw_mcp_";

export const ALL_MCP_NETWORKS = [
  "near-mainnet",
  "solana-mainnet",
  "base-mainnet",
  "ethereum-mainnet",
] as const;

export type McpNetworkKey = (typeof ALL_MCP_NETWORKS)[number];

export type McpAgentKeyStatus = "ACTIVE" | "PAUSED" | "REVOKED";

export interface McpSpendGuardInput {
  readonly status: McpAgentKeyStatus;
  readonly expiresAtIso: string | null;
  readonly nowMs?: number;
  readonly operation: "SEND" | "CONVERT";
  readonly canSend: boolean;
  readonly canConvert: boolean;
  readonly sourceNetwork: string;
  readonly destinationNetwork: string;
  readonly allowedNetworks: readonly string[];
  readonly allowedRecipients: readonly string[];
  readonly recipientAddress?: string | null;
  readonly recipientLabel?: string | null;
  readonly requestedUsdCents: number | null;
  readonly maxTotalUsdCents: number;
  readonly maxPerTxUsdCents: number;
  readonly maxDailyUsdCents: number | null;
  readonly spentTotalUsdCents: number;
  readonly spent24hUsdCents: number;
}

export type McpSpendGuardResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code:
        | "MCP_KEY_NOT_ACTIVE"
        | "MCP_KEY_EXPIRED"
        | "MCP_SEND_NOT_ALLOWED"
        | "MCP_CONVERT_NOT_ALLOWED"
        | "MCP_NETWORK_NOT_ALLOWED"
        | "MCP_RECIPIENT_NOT_ALLOWED"
        | "MCP_READ_ONLY_BUDGET"
        | "MCP_USD_VALUATION_REQUIRED"
        | "MCP_PER_TX_LIMIT_EXCEEDED"
        | "MCP_DAILY_LIMIT_EXCEEDED"
        | "MCP_TOTAL_LIMIT_EXCEEDED";
      readonly message: string;
    };

export function generateMcpToken(): {
  readonly rawToken: string;
  readonly tokenPrefix: string;
  readonly tokenHash: string;
} {
  const secret = randomBytes(28).toString("hex"); // 224 bits of entropy
  const rawToken = `${MCP_TOKEN_PREFIX}${secret}`;
  return {
    rawToken,
    tokenPrefix: rawToken.slice(0, 16),
    tokenHash: hashMcpToken(rawToken),
  };
}

export function hashMcpToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim(), "utf8").digest("hex");
}

export function isValidMcpTokenFormat(token: string | null | undefined): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  return /^flw_mcp_[0-9a-f]{48,64}$/i.test(trimmed);
}

export function usdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd <= 0) return 0;
  return Math.round(usd * 100);
}

export function centsToUsd(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.round(cents) / 100;
}

export function formatUsdCentsLabel(cents: number): string {
  const val = centsToUsd(cents);
  return `$${val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Computes conservative USD cents for a transfer amount (rounds UP to the nearest cent
 * when > 0 so micro-transfers cannot slip past a tight budget cap).
 */
export function computeTransferUsdCents(
  displayAmount: string,
  unitPriceUsd: number | null | undefined,
): number | null {
  if (
    typeof unitPriceUsd !== "number" ||
    !Number.isFinite(unitPriceUsd) ||
    unitPriceUsd <= 0
  ) {
    return null;
  }
  const amount = Number.parseFloat(displayAmount.trim().replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const rawCents = amount * unitPriceUsd * 100;
  if (!Number.isFinite(rawCents) || rawCents <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(rawCents));
}

export function normalizeAllowedNetworks(
  networks: readonly string[] | undefined,
): McpNetworkKey[] {
  if (!networks || networks.length === 0) {
    return [...ALL_MCP_NETWORKS];
  }
  const valid = new Set<McpNetworkKey>();
  for (const raw of networks) {
    const key = normalizeNetworkInput(raw);
    if (key) valid.add(key);
  }
  return valid.size > 0 ? Array.from(valid) : [...ALL_MCP_NETWORKS];
}

export function normalizeRecipientAllowlist(
  recipients: readonly string[] | undefined,
): string[] {
  if (!recipients || recipients.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of recipients) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out.slice(0, 50);
}

export function normalizeNetworkInput(
  raw: string | null | undefined,
): McpNetworkKey | null {
  const norm = (raw ?? "").trim().toLowerCase();
  if (!norm) return null;
  if (norm === "near" || norm === "near-mainnet") return "near-mainnet";
  if (norm === "sol" || norm === "solana" || norm === "solana-mainnet") {
    return "solana-mainnet";
  }
  if (norm === "base" || norm === "base-mainnet") return "base-mainnet";
  if (
    norm === "eth" ||
    norm === "ethereum" ||
    norm === "ethereum-mainnet"
  ) {
    return "ethereum-mainnet";
  }
  return null;
}

/**
 * Resolves a FLOW mainnet deployment from either an exact deployment ID
 * (e.g. "near-mainnet:USDC") or human-friendly symbol + optional network
 * (e.g. symbol="USDC", network="near").
 */
export function resolveMcpDeployment(input: {
  readonly deploymentId?: string | null;
  readonly asset?: string | null;
  readonly network?: string | null;
}): CatalogTokenDeployment | null {
  const exactId = input.deploymentId?.trim();
  if (exactId) {
    const direct = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) => d.id.toLowerCase() === exactId.toLowerCase(),
    );
    if (direct) return direct;
  }

  const assetRaw = (input.asset ?? exactId ?? "").trim();
  if (!assetRaw) return null;

  // Support "USDC on near" or "near:USDC" shorthand
  let symbolPart = assetRaw;
  let networkHint = input.network?.trim() || null;

  const colonMatch = assetRaw.match(/^([a-z0-9-]+):([a-z0-9._-]+)$/i);
  if (colonMatch) {
    const parsedNet = normalizeNetworkInput(colonMatch[1]);
    if (parsedNet) {
      networkHint = parsedNet;
      symbolPart = colonMatch[2] ?? assetRaw;
    }
  } else {
    const onMatch = assetRaw.match(/^([a-z0-9._-]+)\s+(?:on|in)\s+([a-z0-9-]+)$/i);
    if (onMatch) {
      symbolPart = onMatch[1] ?? assetRaw;
      networkHint = onMatch[2] ?? networkHint;
    }
  }

  const normalizedNet = normalizeNetworkInput(networkHint);
  const symbolUpper = symbolPart.trim().toUpperCase();

  if (normalizedNet) {
    const byBoth = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) =>
        d.networkKey === normalizedNet &&
        d.symbol.toUpperCase() === symbolUpper,
    );
    if (byBoth) return byBoth;
  }

  // Default native assets when network is omitted
  if (!normalizedNet) {
    if (symbolUpper === "NEAR") {
      return (
        MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === "near-mainnet:NEAR") ??
        null
      );
    }
    if (symbolUpper === "SOL") {
      return (
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) => d.id === "solana-mainnet:SOL",
        ) ?? null
      );
    }
    if (symbolUpper === "ETH") {
      return (
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) => d.id === "ethereum-mainnet:ETH",
        ) ?? null
      );
    }
    // Prefer NEAR Mainnet (gasless $0!) when USDC/USDT network isn't specified
    const nearMatch = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) =>
        d.networkKey === "near-mainnet" &&
        d.symbol.toUpperCase() === symbolUpper,
    );
    if (nearMatch) return nearMatch;
  }

  return (
    MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) => d.symbol.toUpperCase() === symbolUpper,
    ) ?? null
  );
}

/**
 * Pure pre-flight spend guardrail evaluation (mirrored atomically inside
 * Postgres `flow.mcp_enqueue_transfer` under a FOR UPDATE row lock).
 */
export function evaluateMcpSpendGuard(
  input: McpSpendGuardInput,
): McpSpendGuardResult {
  if (input.status !== "ACTIVE") {
    return {
      ok: false,
      code: "MCP_KEY_NOT_ACTIVE",
      message: `This MCP agent key is ${input.status.toLowerCase()} and cannot execute transfers.`,
    };
  }
  const nowMs = input.nowMs ?? Date.now();
  if (input.expiresAtIso) {
    const expMs = Date.parse(input.expiresAtIso);
    if (Number.isFinite(expMs) && expMs <= nowMs) {
      return {
        ok: false,
        code: "MCP_KEY_EXPIRED",
        message: "This MCP agent key has expired.",
      };
    }
  }
  if (input.operation === "SEND" && !input.canSend) {
    return {
      ok: false,
      code: "MCP_SEND_NOT_ALLOWED",
      message: "This MCP agent key does not have permission to send assets.",
    };
  }
  if (input.operation === "CONVERT" && !input.canConvert) {
    return {
      ok: false,
      code: "MCP_CONVERT_NOT_ALLOWED",
      message:
        "This MCP agent key does not have permission to convert or bridge assets.",
    };
  }
  if (
    !input.allowedNetworks.includes(input.sourceNetwork) ||
    !input.allowedNetworks.includes(input.destinationNetwork)
  ) {
    return {
      ok: false,
      code: "MCP_NETWORK_NOT_ALLOWED",
      message: `Network route (${input.sourceNetwork} -> ${input.destinationNetwork}) is outside this agent key's allowed networks.`,
    };
  }

  // Convert stays inside the user's own FLOW wallet and does not consume Send allowance
  if (input.operation === "CONVERT") {
    return { ok: true };
  }

  if (input.allowedRecipients.length > 0) {
    const recNorm = (input.recipientAddress ?? "").trim().toLowerCase();
    const lblNorm = (input.recipientLabel ?? "").trim().toLowerCase();
    const matched = input.allowedRecipients.some((allowed) => {
      const a = allowed.trim().toLowerCase();
      return a === recNorm || (lblNorm.length > 0 && a === lblNorm);
    });
    if (!matched) {
      return {
        ok: false,
        code: "MCP_RECIPIENT_NOT_ALLOWED",
        message:
          "Recipient is not in this MCP agent key's allowed recipients list.",
      };
    }
  }

  if (input.maxTotalUsdCents <= 0) {
    return {
      ok: false,
      code: "MCP_READ_ONLY_BUDGET",
      message:
        "This MCP agent key has a $0.00 spend cap (read-only) and cannot send funds.",
    };
  }
  if (input.requestedUsdCents === null || input.requestedUsdCents < 0) {
    return {
      ok: false,
      code: "MCP_USD_VALUATION_REQUIRED",
      message:
        "Unable to verify live USD value for this asset. Transfer blocked to protect your spend limit.",
    };
  }
  if (
    input.maxPerTxUsdCents > 0 &&
    input.requestedUsdCents > input.maxPerTxUsdCents
  ) {
    return {
      ok: false,
      code: "MCP_PER_TX_LIMIT_EXCEEDED",
      message: `Transfer value (${formatUsdCentsLabel(input.requestedUsdCents)}) exceeds this agent's per-transaction limit (${formatUsdCentsLabel(input.maxPerTxUsdCents)}).`,
    };
  }
  if (
    input.maxDailyUsdCents !== null &&
    input.spent24hUsdCents + input.requestedUsdCents > input.maxDailyUsdCents
  ) {
    const rem = Math.max(0, input.maxDailyUsdCents - input.spent24hUsdCents);
    return {
      ok: false,
      code: "MCP_DAILY_LIMIT_EXCEEDED",
      message: `Transfer value (${formatUsdCentsLabel(input.requestedUsdCents)}) exceeds this agent's remaining 24-hour allowance (${formatUsdCentsLabel(rem)} of ${formatUsdCentsLabel(input.maxDailyUsdCents)}).`,
    };
  }
  if (input.spentTotalUsdCents + input.requestedUsdCents > input.maxTotalUsdCents) {
    const rem = Math.max(0, input.maxTotalUsdCents - input.spentTotalUsdCents);
    return {
      ok: false,
      code: "MCP_TOTAL_LIMIT_EXCEEDED",
      message: `Transfer value (${formatUsdCentsLabel(input.requestedUsdCents)}) exceeds this agent's remaining total budget (${formatUsdCentsLabel(rem)} of ${formatUsdCentsLabel(input.maxTotalUsdCents)}).`,
    };
  }

  return { ok: true };
}

export function buildMcpClientConfigs(params: {
  readonly baseUrl: string;
  readonly rawToken: string;
}): {
  readonly endpointUrl: string;
  readonly tokenizedUrl: string;
  readonly claudeJson: string;
  readonly codexToml: string;
  readonly antigravityJson: string;
  readonly cursorJson: string;
} {
  const cleanBase = params.baseUrl.replace(/\/+$/, "");
  const endpointUrl = `${cleanBase}/api/mcp`;
  const tokenizedUrl = `${cleanBase}/api/mcp/${params.rawToken}`;

  const claudeJson = JSON.stringify(
    {
      mcpServers: {
        flow: {
          type: "http",
          url: endpointUrl,
          headers: {
            Authorization: `Bearer ${params.rawToken}`,
          },
        },
      },
    },
    null,
    2,
  );

  const codexToml = [
    "[mcp_servers.flow]",
    `url = "${endpointUrl}"`,
    "http_headers = { Authorization = \"Bearer " + params.rawToken + "\" }",
  ].join("\n");

  const antigravityJson = JSON.stringify(
    {
      mcpServers: {
        flow: {
          serverUrl: endpointUrl,
          headers: {
            Authorization: `Bearer ${params.rawToken}`,
          },
        },
      },
    },
    null,
    2,
  );

  const cursorJson = JSON.stringify(
    {
      mcpServers: {
        flow: {
          url: endpointUrl,
          headers: {
            Authorization: `Bearer ${params.rawToken}`,
          },
        },
      },
    },
    null,
    2,
  );

  return {
    endpointUrl,
    tokenizedUrl,
    claudeJson,
    codexToml,
    antigravityJson,
    cursorJson,
  };
}
