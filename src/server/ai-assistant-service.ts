import { formatAtomicToDisplay } from "../domain/atomic-amounts.ts";
import { runtime, type FlowDb } from "../foundation/prisma.ts";

export interface AssistantActionCard {
  readonly type:
    | "BALANCE_SUMMARY"
    | "DRAFT_PAYMENT_LINK"
    | "PREVIEW_SWAP"
    | "PAYMENT_STATUS"
    | "ROUTE_EXPLANATION";
  readonly title: string;
  readonly data: Record<string, unknown>;
  readonly ctaLabel?: string;
  readonly ctaView?: string;
}

export interface AssistantMessage {
  readonly id?: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly card?: AssistantActionCard | null;
  readonly timestamp: string;
}

export async function processAssistantQuery(params: {
  accountId: string;
  prompt: string;
  db?: FlowDb;
}): Promise<AssistantMessage> {
  const db = params.db ?? runtime().db;
  const prompt = params.prompt.trim().toLowerCase();

  // 1. Fetch account context (balances, payment requests, recent activities)
  const balances = await db.$queryRaw<
    Array<{
      network: string;
      symbol: string;
      atomic_balance: string;
      decimals: number;
    }>
  >`
    SELECT na.network, COALESCE(na.symbol_override,a.symbol) AS symbol, wb.atomic_balance::text, na.decimals
    FROM flow.wallet_balances wb
    JOIN flow.network_assets na ON na.id = wb.network_asset_id
    JOIN flow.assets a ON a.id = na.asset_id
    JOIN flow.wallets w ON w.id = wb.wallet_id
    WHERE w.account_id = ${params.accountId}::uuid
      AND wb.atomic_balance > 0 AND wb.sync_status = 'SYNCED'
      AND w.status = 'ACTIVE' AND w.environment = 'mainnet' AND na.is_verified AND na.status = 'ACTIVE'
  `;

  const nonZero = balances.map((row) => ({
    ...row,
    displayBalance: formatAtomicToDisplay(row.atomic_balance, row.decimals),
  }));

  // Intent A: Balance check
  if (
    prompt.includes("balance") ||
    prompt.includes("how much") ||
    prompt.includes("my funds") ||
    prompt.includes("holdings")
  ) {
    if (nonZero.length === 0) {
      return {
        role: "assistant",
        content:
          "No funded balance was found in the synced holdings. Open Home to check wallet and balance status.",
        timestamp: new Date().toISOString(),
      };
    }

    const summaryText = nonZero
      .map((b) => `${b.displayBalance} ${b.symbol} on ${b.network}`)
      .join(", ");

    return {
      role: "assistant",
      content: `Here is your current verified portfolio: you hold ${summaryText}.`,
      card: {
        type: "BALANCE_SUMMARY",
        title: "Verified Portfolio Holdings",
        data: {
          totalUsd: "Price unavailable",
          assets: nonZero.map((b) => ({
            symbol: b.symbol,
            network: b.network,
            balance: b.displayBalance,
          })),
        },
        ctaLabel: "View All Assets",
        ctaView: "dashboard",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent B: Swap to NEAR / Swap Assets
  if (
    prompt.includes("swap") ||
    prompt.includes("convert") ||
    prompt.includes("exchange")
  ) {
    return {
      role: "assistant",
      content:
        "Choose your asset, network and amount in Convert to check for an available quote.",
      card: {
        type: "PREVIEW_SWAP",
        title: "Swap via NEAR Intents",
        data: {
          fromAsset: "Select source asset",
          toAsset: "NEAR (NEAR Mainnet)",
          amount: "Enter amount",
          route: "Quote unavailable",
          executionNotice:
            "Preview only. Outgoing custody signing remains disabled by safety policy.",
        },
        ctaLabel: "Review Swap Quote",
        ctaView: "dashboard",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent C: Create Payment Link
  if (
    prompt.includes("link") ||
    prompt.includes("invoice") ||
    prompt.includes("request") ||
    prompt.includes("get paid")
  ) {
    const amountMatch = prompt.match(/\b\d+(\.\d+)?\b/);
    const amount = amountMatch ? amountMatch[0] : "100";

    return {
      role: "assistant",
      content: `I've prepared a draft payment link for $${amount}.00 USDC. Payers will be able to settle using stablecoins or any supported token across Ethereum, Base, Solana, and NEAR.`,
      card: {
        type: "DRAFT_PAYMENT_LINK",
        title: "Draft Payment Link",
        data: {
          title: "Payment request",
          destinationAsset: "USDC on Base",
          assetSymbol: "USDC",
          amount: `${amount}.00`,
        },
        ctaLabel: "Open Payment Links",
        ctaView: "payment-links",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent D: Payment status
  if (
    prompt.includes("status") ||
    prompt.includes("settled") ||
    prompt.includes("recent") ||
    prompt.includes("paid")
  ) {
    const latestAttempt = await db.$queryRaw<
      Array<{
        title: string;
        public_id: string;
        status: string;
        amount: string;
        settled_at: Date | null;
      }>
    >`
      SELECT pr.title, pa.attempt_public_id as public_id, pa.status, pa.quoted_destination_atomic_amount as amount, pa.settled_at
      FROM flow.payment_attempts pa
      JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
      WHERE pr.account_id = ${params.accountId}::uuid
      ORDER BY pa.created_at DESC
      LIMIT 1
    `;

    if (latestAttempt.length > 0 && latestAttempt[0]) {
      const a = latestAttempt[0];
      return {
        role: "assistant",
        content: `Your latest payment attempt (${a.public_id}) for "${a.title}" is ${a.status}.`,
        card: {
          type: "PAYMENT_STATUS",
          title: `Payment: ${a.title}`,
          data: {
            publicId: a.public_id,
            status: a.status,
            amount: `${(Number(a.amount) / 10 ** 6).toFixed(2)} USDC`,
            settledAt: a.settled_at ? a.settled_at.toISOString() : null,
          },
          ctaLabel: "View in Activity",
          ctaView: "activity",
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Intent E: Supported networks & tokens
  if (
    prompt.includes("network") ||
    prompt.includes("chain") ||
    prompt.includes("token") ||
    prompt.includes("support")
  ) {
    return {
      role: "assistant",
      content:
        "FLOW supports 4 primary self-custody wallet networks: Ethereum Mainnet, Base Mainnet, Solana Mainnet, and NEAR Mainnet with 11 curated deployments. Through NEAR Intents/1Click integration, payers can also pay with over 200 non-wrapped tokens across 35+ blockchains, which are automatically converted into your preferred settlement asset.",
      timestamp: new Date().toISOString(),
    };
  }

  // Default response
  return {
    role: "assistant",
    content:
      "I am your Flow AI Assistant. I can help you check verified balances, review your recent payments, draft a new payment link, or preview cross-chain swaps powered by NEAR Intents. What would you like to do?",
    timestamp: new Date().toISOString(),
  };
}
