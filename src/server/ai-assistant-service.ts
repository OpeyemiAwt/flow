import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import {
  canonicalizeNetworkId,
  MAINNET_SUPPORTED_DEPLOYMENTS,
} from "../domain/supported-assets-catalog.ts";
import { runtime, type FlowDb } from "../foundation/prisma.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import { quoteOneClickPreview } from "./providers/one-click-preview.ts";

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
          totalUsd: "Live balance",
          balances: nonZero.map((b) => ({
            asset: `${b.symbol} (${b.network})`,
            balance: b.displayBalance,
          })),
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

  // Intent B: Swap / Convert preview with live 1Click dry quote when possible
  if (
    prompt.includes("swap") ||
    prompt.includes("convert") ||
    prompt.includes("exchange")
  ) {
    const amountMatch = prompt.match(/\b(\d+(?:\.\d+)?)\b/);
    const requestedAmount = amountMatch?.[1] ?? "10";

    const findMentionedDeployment = (fragment: string, fallbackId: string) => {
      const lower = fragment.toLowerCase();
      const mentioned = MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) =>
          lower.includes(d.symbol.toLowerCase()) &&
          (lower.includes(d.networkKey.split("-")[0] ?? "") ||
            lower.includes(d.networkName.toLowerCase())),
      );
      if (mentioned) return mentioned;
      const bySymbol = MAINNET_SUPPORTED_DEPLOYMENTS.find((d) =>
        new RegExp(`\\b${d.symbol.toLowerCase()}\\b`).test(lower),
      );
      return (
        bySymbol ??
        MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === fallbackId)!
      );
    };

    const splitIdx = Math.max(prompt.indexOf(" to "), prompt.indexOf(" into "));
    const srcPart = splitIdx > 0 ? prompt.slice(0, splitIdx) : prompt;
    const dstPart = splitIdx > 0 ? prompt.slice(splitIdx) : "near";

    const firstHeld = nonZero[0]
      ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) =>
            d.networkKey === nonZero[0]!.network &&
            d.symbol.toUpperCase() === nonZero[0]!.symbol.toUpperCase(),
        )
      : undefined;

    const srcDep = findMentionedDeployment(
      srcPart,
      firstHeld?.id ?? "base-mainnet:USDC",
    );
    const dstDep = findMentionedDeployment(dstPart, "near-mainnet:NEAR");

    let routeText = `${requestedAmount} ${srcDep.symbol} (${srcDep.networkName}) → ${dstDep.symbol} (${dstDep.networkName})`;
    let assistantSummary = `Open Convert in Send & Transfer to review a live NEAR Intents quote from ${srcDep.symbol} (${srcDep.networkName}) to ${dstDep.symbol} (${dstDep.networkName}).`;

    if (srcDep.id !== dstDep.id && amountMatch) {
      try {
        const walletAddresses = await db.$queryRaw<
          Array<{ network: string; chain_id: string; address: string }>
        >`
          SELECT wa.network, wa.chain_id, wa.address
          FROM flow.wallet_addresses wa
          JOIN flow.wallets w ON w.id = wa.wallet_id
          WHERE w.account_id = ${params.accountId}::uuid
            AND w.status = 'ACTIVE'
            AND w.environment = 'mainnet'
        `;
        const refundTo = walletAddresses.find(
          (w) =>
            (canonicalizeNetworkId(w.chain_id) ??
              canonicalizeNetworkId(w.network)) === srcDep.networkKey,
        )?.address;
        const recipient = walletAddresses.find(
          (w) =>
            (canonicalizeNetworkId(w.chain_id) ??
              canonicalizeNetworkId(w.network)) === dstDep.networkKey,
        )?.address;

        if (refundTo && recipient) {
          const [srcAsset, dstAsset] = await Promise.all([
            resolveQuoteAsset(srcDep.id),
            resolveQuoteAsset(dstDep.id),
          ]);
          const atomic = parseDisplayToAtomic(requestedAmount, srcDep.decimals);
          if (srcAsset && dstAsset && atomic > 0n) {
            const preview = await quoteOneClickPreview({
              source: srcAsset,
              destination: dstAsset,
              operationId: `ai:${params.accountId}`,
              amountAtomic: atomic.toString(),
              swapType: "EXACT_INPUT",
              recipient,
              refundTo,
            });
            if (preview.ok) {
              routeText = `${requestedAmount} ${srcDep.symbol} → ~${preview.quote.recipientDisplayAmount} ${dstDep.symbol}`;
              assistantSummary = `Live NEAR Intents dry quote: ${requestedAmount} ${srcDep.symbol} (${srcDep.networkName}) → ~${preview.quote.recipientDisplayAmount} ${dstDep.symbol} (${dstDep.networkName}). Explicitly authorize with a security code in Convert before sending.`;
            }
          }
        }
      } catch {
        // Keep helpful non-fabricated fallback
      }
    }

    return {
      role: "assistant",
      content: assistantSummary,
      card: {
        type: "PREVIEW_SWAP",
        title: "Swap via NEAR Intents",
        data: {
          fromAsset: `${srcDep.symbol} (${srcDep.networkName})`,
          toAsset: `${dstDep.symbol} (${dstDep.networkName})`,
          amount: requestedAmount,
          route: routeText,
          safetyNotice:
            "Preview only — conversions require explicit review and step-up verification before signing.",
        },
        ctaLabel: "Review Swap Quote",
        ctaView: "send",
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
    const rawAmount = amountMatch ? amountMatch[0] : "100";
    const formattedAmount = rawAmount.includes(".")
      ? rawAmount
      : `${rawAmount}.00`;

    let selectedDeployment =
      MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === "base-mainnet:USDC") ??
      MAINNET_SUPPORTED_DEPLOYMENTS[0]!;
    for (const dep of MAINNET_SUPPORTED_DEPLOYMENTS) {
      const symMatch = new RegExp(`\\b${dep.symbol.toLowerCase()}\\b`).test(
        prompt,
      );
      const netHint =
        prompt.includes(dep.networkKey.split("-")[0] ?? "") ||
        prompt.includes(dep.networkName.toLowerCase());
      if (symMatch && netHint) {
        selectedDeployment = dep;
        break;
      }
      if (symMatch) {
        selectedDeployment = dep;
      }
    }

    const titleMatch =
      params.prompt.match(
        /(?:called|titled|named|for)\s+"([A-Za-z0-9][A-Za-z0-9 &,'-]{1,48})"/i,
      ) ??
      params.prompt.match(
        /(?:called|titled|named)\s+([A-Za-z0-9][A-Za-z0-9 &,'-]{2,48})/i,
      ) ??
      params.prompt.match(
        /(?:for\s+)(?!\d|\$\d)([A-Za-z0-9][A-Za-z0-9 &,'-]{2,48})/i,
      );
    const cleanedTitle = titleMatch?.[1]
      ? titleMatch[1]
          .replace(/\b(on\s+(ethereum|base|solana|near))\b.*$/i, "")
          .trim()
      : "Payment request";

    return {
      role: "assistant",
      content: `I've prepared a draft payment link for ${formattedAmount} ${selectedDeployment.symbol} on ${selectedDeployment.networkName}. Payers can settle using stablecoins or supported tokens across Ethereum, Base, Solana, and NEAR.`,
      card: {
        type: "DRAFT_PAYMENT_LINK",
        title: "Draft Payment Link",
        data: {
          title: cleanedTitle || "Payment request",
          destinationAsset: `${selectedDeployment.symbol} on ${selectedDeployment.networkName}`,
          assetSymbol: selectedDeployment.symbol,
          network: selectedDeployment.networkKey,
          amount: formattedAmount,
        },
        ctaLabel: "Open Payment Links",
        ctaView: "request",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent D: Payment & Transfer Status
  if (
    prompt.includes("status") ||
    prompt.includes("settled") ||
    prompt.includes("recent") ||
    prompt.includes("paid") ||
    prompt.includes("transfer") ||
    prompt.includes("activity")
  ) {
    const latestAttempt = await db.$queryRaw<
      Array<{
        title: string;
        public_id: string;
        status: string;
        amount: string;
        destination_asset_symbol: string;
        destination_decimals: number;
        destination_tx_hash?: string | null;
        settled_at: Date | null;
      }>
    >`
      SELECT pr.title, pa.attempt_public_id as public_id, pa.status,
             pa.quoted_destination_atomic_amount as amount,
             pr.destination_asset_symbol, pr.destination_decimals,
             pa.destination_tx_hash, pa.settled_at
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
            amount: `Quoted: ${formatAtomicToDisplay(a.amount, a.destination_decimals)} ${a.destination_asset_symbol}`,
            settlementTxHash: a.destination_tx_hash ?? null,
            settledAt: a.settled_at ? a.settled_at.toISOString() : null,
          },
          ctaLabel: "View in Activity",
          ctaView: "activity",
        },
        timestamp: new Date().toISOString(),
      };
    }

    const latestOutgoing = await db.$queryRaw<
      Array<{
        public_id: string;
        job_kind: string;
        status: string;
        source_atomic_amount: string;
        source_decimals: number;
        source_asset_symbol: string;
        destination_asset_symbol: string;
        source_tx_hash: string | null;
        destination_tx_hash: string | null;
        settled_at: Date | null;
      }>
    >`
      SELECT public_id, job_kind, status, source_atomic_amount::text, source_decimals,
             source_asset_symbol, destination_asset_symbol,
             source_tx_hash, destination_tx_hash, settled_at
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${params.accountId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (latestOutgoing.length > 0 && latestOutgoing[0]) {
      const t = latestOutgoing[0];
      const formatted = formatAtomicToDisplay(
        t.source_atomic_amount,
        t.source_decimals,
      );
      return {
        role: "assistant",
        content: `Your latest ${t.job_kind.toLowerCase()} (${t.public_id}) of ${formatted} ${t.source_asset_symbol} is ${t.status}.`,
        card: {
          type: "PAYMENT_STATUS",
          title: `${t.job_kind === "CONVERT" ? "Convert" : "Send"}: ${formatted} ${t.source_asset_symbol}`,
          data: {
            publicId: t.public_id,
            status: t.status,
            amount: `${formatted} ${t.source_asset_symbol} → ${t.destination_asset_symbol}`,
            settlementTxHash: t.destination_tx_hash ?? t.source_tx_hash ?? null,
            settledAt: t.settled_at ? t.settled_at.toISOString() : null,
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
