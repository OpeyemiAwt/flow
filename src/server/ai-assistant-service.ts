import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import {
  canonicalizeNetworkId,
  MAINNET_SUPPORTED_DEPLOYMENTS,
  type CatalogTokenDeployment,
} from "../domain/supported-assets-catalog.ts";
import { runtime, type FlowDb } from "../foundation/prisma.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import { quoteOneClickPreview } from "./providers/one-click-preview.ts";

export interface AssistantActionCard {
  readonly type:
    | "BALANCE_SUMMARY"
    | "DRAFT_PAYMENT_LINK"
    | "PREVIEW_SWAP"
    | "SEND_PREVIEW"
    | "RECEIVE_ADDRESS"
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
  readonly timestamp?: string;
}

function findMentionedDeployment(
  text: string,
  fallback?: CatalogTokenDeployment,
): CatalogTokenDeployment | undefined {
  const lower = text.toLowerCase();
  const exact = MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => {
    const symMatch = new RegExp(`\\b${d.symbol.toLowerCase()}\\b`).test(lower);
    const netPrefix = d.networkKey.split("-")[0] ?? "";
    const netMatch =
      (netPrefix && lower.includes(netPrefix)) ||
      lower.includes(d.networkName.toLowerCase());
    return symMatch && netMatch;
  });
  if (exact) return exact;

  const byNetwork = MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => {
    const netPrefix = d.networkKey.split("-")[0] ?? "";
    return (
      (netPrefix && new RegExp(`\\b${netPrefix}\\b`).test(lower)) ||
      lower.includes(d.networkName.toLowerCase())
    );
  });
  const bySymbol = MAINNET_SUPPORTED_DEPLOYMENTS.find((d) =>
    new RegExp(`\\b${d.symbol.toLowerCase()}\\b`).test(lower),
  );
  if (byNetwork && !bySymbol) {
    return (
      MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) =>
          d.networkKey === byNetwork.networkKey && d.symbol === "USDC",
      ) ?? byNetwork
    );
  }
  return bySymbol ?? fallback;
}

function extractRecipientAddress(rawPrompt: string): string | null {
  const evm = rawPrompt.match(/\b0x[a-fA-F0-9]{40}\b/);
  if (evm) return evm[0];
  const nearNamed = rawPrompt.match(/\b[a-z0-9_-]{2,64}\.near\b/i);
  if (nearNamed) return nearNamed[0].toLowerCase();
  const nearImplicit = rawPrompt.match(/\b[a-f0-9]{64}\b/i);
  if (nearImplicit) return nearImplicit[0].toLowerCase();
  const solana = rawPrompt.match(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/);
  if (solana) return solana[0];
  return null;
}

function findLastCard(
  history: AssistantMessage[] | undefined,
): AssistantActionCard | null {
  if (!history || history.length === 0) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "assistant" && msg.card) {
      return msg.card;
    }
  }
  return null;
}

function findLastUserPrompt(history: AssistantMessage[] | undefined): string {
  if (!history || history.length === 0) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "user" && msg.content.trim()) {
      return msg.content.trim();
    }
  }
  return "";
}

function findLastAssistantContent(
  history: AssistantMessage[] | undefined,
): string {
  if (!history || history.length === 0) return "";
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg?.role === "assistant" && msg.content.trim()) {
      return msg.content.trim();
    }
  }
  return "";
}

async function tryLlmAssistantReply(params: {
  prompt: string;
  history: AssistantMessage[];
  balances: Array<{ network: string; symbol: string; displayBalance: string }>;
  addresses: Array<{ network: string; address: string }>;
}): Promise<AssistantMessage | null> {
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!geminiKey && !openaiKey && !anthropicKey) return null;

  const systemPrompt = [
    "You are Flow Copilot, the conversational AI assistant for Flow (a non-custodial multi-chain payments & treasury wallet).",
    "Be concise, natural, accurate, and directly answer the user's question using the live account context below.",
    "Never invent balances, addresses, or transaction hashes.",
    `Supported mainnet deployments: ${MAINNET_SUPPORTED_DEPLOYMENTS.map((d) => `${d.symbol} on ${d.networkName} (${d.id})`).join(", ")}.`,
    `Current verified balances: ${params.balances.length > 0 ? params.balances.map((b) => `${b.displayBalance} ${b.symbol} on ${b.network}`).join("; ") : "0 funded balances"}.`,
    `Active wallet addresses: ${params.addresses.length > 0 ? params.addresses.map((a) => `${a.network}: ${a.address}`).join("; ") : "None provisioned yet"}.`,
    "Respond ONLY with valid JSON: { \"reply\": string, \"card\"?: { \"type\": \"SEND_PREVIEW\" | \"PREVIEW_SWAP\" | \"DRAFT_PAYMENT_LINK\" | \"BALANCE_SUMMARY\" | \"RECEIVE_ADDRESS\", \"title\": string, \"data\": object } | null }.",
    "Only attach a SEND_PREVIEW card when you have sourceDeploymentId, destinationDeploymentId, assetSymbol, network, networkName, amount, recipientAddress, availableBalance, and sufficientBalance (boolean).",
  ].join("\n");

  const transcript = [
    ...params.history.slice(-10).map((m) => ({
      role: m.role,
      content: m.content,
    })),
    { role: "user" as const, content: params.prompt },
  ];

  try {
    let rawText: string | null = null;

    if (geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: transcript.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.3,
            },
          }),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      }
    } else if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0.3,
          messages: [{ role: "system", content: systemPrompt }, ...transcript],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawText = json.choices?.[0]?.message?.content ?? null;
      }
    } else if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 1024,
          system: systemPrompt,
          messages: transcript,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          content?: Array<{ text?: string }>;
        };
        rawText = json.content?.[0]?.text ?? null;
      }
    }

    if (!rawText) return null;
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as {
      reply?: string;
      card?: AssistantActionCard | null;
    };
    if (!parsed.reply) return null;

    return {
      role: "assistant",
      content: parsed.reply,
      card: parsed.card ?? null,
      timestamp: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function processAssistantQuery(params: {
  accountId: string;
  prompt: string;
  history?: AssistantMessage[];
  db?: FlowDb;
}): Promise<AssistantMessage> {
  const db = params.db ?? runtime().db;
  const rawPrompt = params.prompt.trim();
  const prompt = rawPrompt.toLowerCase();
  const lastCard = findLastCard(params.history);
  const lastUserPrompt = findLastUserPrompt(params.history).toLowerCase();
  const lastAssistantContent = findLastAssistantContent(
    params.history,
  ).toLowerCase();

  // 1. Fetch account context (balances + wallet addresses)
  const [balances, walletAddresses] = await Promise.all([
    db.$queryRaw<
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
    `,
    db.$queryRaw<
      Array<{ network: string; chain_id: string; address: string }>
    >`
      SELECT wa.network, wa.chain_id, wa.address
      FROM flow.wallet_addresses wa
      JOIN flow.wallets w ON w.id = wa.wallet_id
      WHERE w.account_id = ${params.accountId}::uuid
        AND w.status = 'ACTIVE'
        AND w.environment = 'mainnet'
      ORDER BY wa.network ASC
    `,
  ]);

  const nonZero = balances.map((row) => ({
    ...row,
    displayBalance: formatAtomicToDisplay(row.atomic_balance, row.decimals),
  }));

  const llmReply = await tryLlmAssistantReply({
    prompt: rawPrompt,
    history: params.history ?? [],
    balances: nonZero,
    addresses: walletAddresses,
  });
  if (llmReply) {
    return llmReply;
  }

  // Contextual "why" / clarification handler
  if (
    /^(why|how come|what does that mean|explain)\b/.test(prompt) &&
    lastAssistantContent
  ) {
    if (
      lastAssistantContent.includes("don't have any settlements") ||
      lastAssistantContent.includes("no funded balance") ||
      lastAssistantContent.includes("0 funded balance")
    ) {
      return {
        role: "assistant",
        content:
          "There are no completed or pending transactions recorded on this account yet, or your wallet hasn't received a synced deposit yet. Once you send, swap, or receive funds, I'll show the live settlement status here.",
        timestamp: new Date().toISOString(),
      };
    }
    if (lastAssistantContent.includes("insufficient")) {
      return {
        role: "assistant",
        content:
          nonZero.length > 0
            ? `Your synced holdings are ${nonZero.map((b) => `${b.displayBalance} ${b.symbol} on ${b.network}`).join(", ")}. You can send up to those amounts or add more funds first.`
            : "Your synced balance is currently 0, so there aren't enough funds on that network to cover the payment yet.",
        timestamp: new Date().toISOString(),
      };
    }
    if (lastAssistantContent.includes("payment for you. please provide")) {
      return {
        role: "assistant",
        content:
          "To prepare a blockchain transfer safely, I just need the exact amount and the destination wallet address (or tell me which network you want to use, like Base or Solana).",
        timestamp: new Date().toISOString(),
      };
    }
    return {
      role: "assistant",
      content: `Regarding my previous message: "${findLastAssistantContent(params.history)}". Tell me what you'd like to adjust or check next.`,
      timestamp: new Date().toISOString(),
    };
  }

  const isFollowUpModification =
    /^(what about|how about|instead|make it|change it|use |try )/.test(
      prompt,
    ) ||
    (prompt.length < 40 &&
      (Boolean(prompt.match(/\b(ethereum|base|solana|near)\b/)) ||
        Boolean(prompt.match(/^\$?\d+(\.\d+)?$/))) &&
      lastCard !== null);

  // Follow-up context carry-over for DRAFT_PAYMENT_LINK
  if (isFollowUpModification && lastCard?.type === "DRAFT_PAYMENT_LINK") {
    const amountMatch = prompt.match(/\b(\d+(?:\.\d+)?)\b/);
    const prevAmount = String(lastCard.data.amount ?? "10.00");
    const rawAmount = amountMatch ? amountMatch[1]! : prevAmount;
    const formattedAmount = rawAmount.includes(".")
      ? rawAmount
      : `${rawAmount}.00`;
    const prevDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) =>
        d.networkKey === String(lastCard.data.network ?? "") &&
        d.symbol === String(lastCard.data.assetSymbol ?? ""),
    );
    const selectedDeployment =
      findMentionedDeployment(prompt, prevDeployment) ??
      MAINNET_SUPPORTED_DEPLOYMENTS[0]!;
    const title = String(lastCard.data.title ?? "Payment request");

    return {
      role: "assistant",
      content: `Updated your payment link draft to ${formattedAmount} ${selectedDeployment.symbol} on ${selectedDeployment.networkName}. Click "Create Payment Link" below when you're ready to publish it.`,
      card: {
        type: "DRAFT_PAYMENT_LINK",
        title: "Draft Payment Link",
        data: {
          title,
          destinationAsset: `${selectedDeployment.symbol} on ${selectedDeployment.networkName}`,
          destinationAssetId: selectedDeployment.id,
          assetSymbol: selectedDeployment.symbol,
          network: selectedDeployment.networkKey,
          amount: formattedAmount,
        },
        ctaLabel: "Create Payment Link",
        ctaView: "request",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Follow-up context carry-over for SEND_PREVIEW (e.g. user supplies missing address or updates amount/network)
  const extractedAddress = extractRecipientAddress(rawPrompt);
  const previousAskedForRecipient =
    lastUserPrompt.includes("send") ||
    lastUserPrompt.includes("pay ") ||
    lastCard?.type === "SEND_PREVIEW";

  // Intent A: Balance check (including network-filtered follow-ups like "what about Solana?")
  if (
    prompt.includes("balance") ||
    prompt.includes("how much") ||
    prompt.includes("my funds") ||
    prompt.includes("holdings") ||
    (isFollowUpModification && lastCard?.type === "BALANCE_SUMMARY")
  ) {
    const networkHint = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) =>
        prompt.includes(d.networkKey.split("-")[0] ?? "") ||
        prompt.includes(d.networkName.toLowerCase()),
    );
    const filtered = networkHint
      ? nonZero.filter(
          (b) =>
            canonicalizeNetworkId(b.network) === networkHint.networkKey,
        )
      : nonZero;

    if (filtered.length === 0) {
      return {
        role: "assistant",
        content: networkHint
          ? `You currently have 0 funded balance on ${networkHint.networkName}. You can add money directly or cross-chain from another network.`
          : "You currently have no funded balance in your synced holdings. Use Add Money on Home to deposit funds.",
        timestamp: new Date().toISOString(),
      };
    }

    const summaryText = filtered
      .map((b) => `${b.displayBalance} ${b.symbol} on ${b.network}`)
      .join(", ");

    return {
      role: "assistant",
      content: networkHint
        ? `Your verified ${networkHint.networkName} balance: ${summaryText}.`
        : `Here is your current verified portfolio: ${summaryText}.`,
      card: {
        type: "BALANCE_SUMMARY",
        title: networkHint
          ? `${networkHint.networkName} Holdings`
          : "Verified Portfolio Holdings",
        data: {
          totalUsd: "Live balance",
          balances: filtered.map((b) => ({
            asset: `${b.symbol} (${b.network})`,
            balance: b.displayBalance,
          })),
          assets: filtered.map((b) => ({
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

  // Intent B: Send / Pay someone (actionable SEND_PREVIEW with Confirm & Send button)
  const inPendingSendFlow =
    lastAssistantContent.includes("payment for you. please provide") ||
    lastCard?.type === "SEND_PREVIEW";

  const looksLikeSend =
    (/\b(send|pay|transfer)\b/.test(prompt) &&
      !prompt.includes("can i pay") &&
      !prompt.includes("link") &&
      !prompt.includes("status") &&
      !prompt.includes("recent") &&
      !prompt.includes("settlement")) ||
    (inPendingSendFlow &&
      !prompt.includes("balance") &&
      !prompt.includes("link") &&
      !prompt.includes("swap") &&
      !prompt.includes("convert") &&
      !prompt.includes("settlement") &&
      !prompt.includes("address"));

  if (looksLikeSend || (previousAskedForRecipient && extractedAddress)) {
    const contextText =
      (inPendingSendFlow || previousAskedForRecipient) &&
      !/\b(send|pay|transfer)\b/.test(prompt)
        ? `${lastUserPrompt} ${rawPrompt}`
        : rawPrompt;
    const amountMatch = contextText.match(/\$?\b(\d+(?:\.\d+)?)\b/);
    const amount = amountMatch?.[1] ?? null;
    const recipient = extractedAddress ?? extractRecipientAddress(lastUserPrompt);

    const firstHeld = nonZero[0]
      ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) =>
            d.networkKey === nonZero[0]!.network &&
            d.symbol.toUpperCase() === nonZero[0]!.symbol.toUpperCase(),
        )
      : undefined;
    const deployment =
      findMentionedDeployment(
        rawPrompt,
        findMentionedDeployment(
          contextText,
          firstHeld ??
            MAINNET_SUPPORTED_DEPLOYMENTS.find(
              (d) => d.id === "base-mainnet:USDC",
            ),
        ),
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[0]!;

    if (!amount || !recipient) {
      const missingParts = [
        !amount ? "how much you want to send (e.g. `10 USDC`)" : null,
        !recipient
          ? "the recipient wallet address (0x..., Solana address, or .near)"
          : null,
      ].filter(Boolean);
      return {
        role: "assistant",
        content: `I can prepare that ${deployment.symbol} (${deployment.networkName}) payment for you. Please provide ${missingParts.join(" and ")}.`,
        timestamp: new Date().toISOString(),
      };
    }

    const held = nonZero.find(
      (b) =>
        canonicalizeNetworkId(b.network) === deployment.networkKey &&
        b.symbol.toUpperCase() === deployment.symbol.toUpperCase(),
    );
    const availableBalance = held?.displayBalance ?? "0";
    const requestedAtomic = parseDisplayToAtomic(amount, deployment.decimals);
    const heldAtomic = held ? BigInt(held.atomic_balance) : 0n;
    const sufficientBalance =
      requestedAtomic > 0n && heldAtomic >= requestedAtomic;

    return {
      role: "assistant",
      content: sufficientBalance
        ? `Ready to send ${amount} ${deployment.symbol} on ${deployment.networkName} to ${recipient}. Review the details below and click "Confirm & Send" to execute.`
        : `Prepared payment preview for ${amount} ${deployment.symbol} on ${deployment.networkName}, but your synced ${deployment.networkName} ${deployment.symbol} balance is ${availableBalance}.`,
      card: {
        type: "SEND_PREVIEW",
        title: "Confirm Payment",
        data: {
          sourceDeploymentId: deployment.id,
          destinationDeploymentId: deployment.id,
          assetSymbol: deployment.symbol,
          network: deployment.networkKey,
          networkName: deployment.networkName,
          amount,
          recipientAddress: recipient,
          availableBalance,
          sufficientBalance,
        },
        ctaLabel: "Confirm & Send",
        ctaView: "send",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent C: Swap / Convert preview (with Confirm & Convert execution)
  if (
    prompt.includes("swap") ||
    prompt.includes("convert") ||
    prompt.includes("exchange") ||
    (isFollowUpModification && lastCard?.type === "PREVIEW_SWAP")
  ) {
    const amountMatch = prompt.match(/\b(\d+(?:\.\d+)?)\b/);
    const requestedAmount =
      amountMatch?.[1] ??
      (lastCard?.type === "PREVIEW_SWAP"
        ? String(lastCard.data.amount ?? "10")
        : "10");

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

    const srcDep =
      findMentionedDeployment(
        srcPart,
        firstHeld ??
          MAINNET_SUPPORTED_DEPLOYMENTS.find(
            (d) => d.id === "base-mainnet:USDC",
          ),
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[0]!;
    const dstDep =
      findMentionedDeployment(
        dstPart,
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) => d.id === "near-mainnet:NEAR",
        ),
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[0]!;

    let routeText = `${requestedAmount} ${srcDep.symbol} (${srcDep.networkName}) → ${dstDep.symbol} (${dstDep.networkName})`;
    let assistantSummary = `Prepared a conversion preview for ${requestedAmount} ${srcDep.symbol} (${srcDep.networkName}) → ${dstDep.symbol} (${dstDep.networkName}). Review and click "Confirm & Convert" below to execute.`;

    if (srcDep.id !== dstDep.id && requestedAmount) {
      try {
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
              assistantSummary = `Live exchange quote: ${requestedAmount} ${srcDep.symbol} (${srcDep.networkName}) → ~${preview.quote.recipientDisplayAmount} ${dstDep.symbol} (${dstDep.networkName}). Click "Confirm & Convert" below to execute.`;
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
        title: "Cross-Chain Swap Preview",
        data: {
          sourceDeploymentId: srcDep.id,
          destinationDeploymentId: dstDep.id,
          fromAsset: `${srcDep.symbol} (${srcDep.networkName})`,
          toAsset: `${dstDep.symbol} (${dstDep.networkName})`,
          amount: requestedAmount,
          route: routeText,
          safetyNotice:
            "Review the route and amount carefully before confirming execution.",
        },
        ctaLabel: "Confirm & Convert",
        ctaView: "send",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent D: Draft / Create Payment Link
  if (
    prompt.includes("link") ||
    prompt.includes("invoice") ||
    prompt.includes("request") ||
    prompt.includes("get paid")
  ) {
    const amountMatch = prompt.match(/\b\d+(\.\d+)?\b/);
    const rawAmount = amountMatch ? amountMatch[0] : "10";
    const formattedAmount = rawAmount.includes(".")
      ? rawAmount
      : `${rawAmount}.00`;

    const selectedDeployment =
      findMentionedDeployment(
        prompt,
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) => d.id === "base-mainnet:USDC",
        ),
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[0]!;

    const titleMatch =
      rawPrompt.match(
        /(?:called|titled|named|for)\s+"([A-Za-z0-9][A-Za-z0-9 &,'-]{1,48})"/i,
      ) ??
      rawPrompt.match(
        /(?:called|titled|named)\s+([A-Za-z0-9][A-Za-z0-9 &,'-]{2,48})/i,
      ) ??
      rawPrompt.match(
        /(?:for\s+)(?!\d|\$\d)([A-Za-z0-9][A-Za-z0-9 &,'-]{2,48})/i,
      );
    const cleanedTitle = titleMatch?.[1]
      ? titleMatch[1]
          .replace(/\b(on\s+(ethereum|base|solana|near))\b.*$/i, "")
          .trim()
      : "Payment request";

    return {
      role: "assistant",
      content: `I've prepared a payment link for ${formattedAmount} ${selectedDeployment.symbol} on ${selectedDeployment.networkName}. Click "Create Payment Link" below to publish it right now, or ask me to adjust the amount or network.`,
      card: {
        type: "DRAFT_PAYMENT_LINK",
        title: "Draft Payment Link",
        data: {
          title: cleanedTitle || "Payment request",
          destinationAsset: `${selectedDeployment.symbol} on ${selectedDeployment.networkName}`,
          destinationAssetId: selectedDeployment.id,
          assetSymbol: selectedDeployment.symbol,
          network: selectedDeployment.networkKey,
          amount: formattedAmount,
        },
        ctaLabel: "Create Payment Link",
        ctaView: "request",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent E: Payment, Settlement & Activity Status (checks ALL transaction tables!)
  if (
    prompt.includes("status") ||
    prompt.includes("settle") ||
    prompt.includes("recent") ||
    prompt.includes("paid") ||
    prompt.includes("history") ||
    prompt.includes("activity") ||
    prompt.includes("transaction")
  ) {
    const [latestAttempts, latestOutgoing, latestAddMoney] = await Promise.all([
      db.$queryRaw<
        Array<{
          title: string;
          public_id: string;
          status: string;
          amount: string;
          destination_asset_symbol: string;
          destination_decimals: number;
          destination_tx_hash: string | null;
          settled_at: Date | null;
          created_at: Date;
        }>
      >`
        SELECT pr.title, pa.attempt_public_id as public_id, pa.status,
               pa.quoted_destination_atomic_amount as amount,
               pr.destination_asset_symbol, pr.destination_decimals,
               pa.destination_tx_hash, pa.settled_at, pa.created_at
        FROM flow.payment_attempts pa
        JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
        WHERE pr.account_id = ${params.accountId}::uuid
        ORDER BY pa.created_at DESC
        LIMIT 1
      `,
      db.$queryRaw<
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
          created_at: Date;
        }>
      >`
        SELECT public_id, job_kind, status, source_atomic_amount::text, source_decimals,
               source_asset_symbol, destination_asset_symbol,
               source_tx_hash, destination_tx_hash, settled_at, created_at
        FROM flow.outgoing_transfer_jobs
        WHERE account_id = ${params.accountId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
      db.$queryRaw<
        Array<{
          id: string;
          status: string;
          source_asset_symbol: string;
          quoted_source_display_amount: string;
          destination_asset_symbol: string;
          destination_tx_hash: string | null;
          settled_at: Date | null;
          created_at: Date;
        }>
      >`
        SELECT id::text, status, source_asset_symbol, quoted_source_display_amount,
               destination_asset_symbol, destination_tx_hash, settled_at, created_at
        FROM flow.add_money_intents
        WHERE account_id = ${params.accountId}::uuid
        ORDER BY created_at DESC
        LIMIT 1
      `,
    ]);

    const candidates: Array<{
      at: number;
      content: string;
      card: AssistantActionCard;
    }> = [];

    const toMillis = (d?: Date | string | null) =>
      d ? new Date(d).getTime() : 0;

    if (latestAttempts?.[0]) {
      const a = latestAttempts[0];
      candidates.push({
        at: toMillis(a.created_at) || toMillis(a.settled_at),
        content: `Your latest checkout settlement (${a.public_id}) for "${a.title}" is ${a.status}.`,
        card: {
          type: "PAYMENT_STATUS",
          title: `Payment: ${a.title}`,
          data: {
            publicId: a.public_id,
            status: a.status,
            amount: `Quoted: ${formatAtomicToDisplay(a.amount, a.destination_decimals)} ${a.destination_asset_symbol}`,
            settlementTxHash: a.destination_tx_hash ?? null,
            settledAt: a.settled_at ? new Date(a.settled_at).toISOString() : null,
          },
          ctaLabel: "View in Activity",
          ctaView: "activity",
        },
      });
    }

    if (latestOutgoing?.[0]) {
      const t = latestOutgoing[0];
      const formatted = formatAtomicToDisplay(
        t.source_atomic_amount,
        t.source_decimals,
      );
      candidates.push({
        at: toMillis(t.created_at) || toMillis(t.settled_at),
        content: `Your latest ${t.job_kind.toLowerCase()} (${t.public_id}) of ${formatted} ${t.source_asset_symbol} is ${t.status}.`,
        card: {
          type: "PAYMENT_STATUS",
          title: `${t.job_kind === "CONVERT" ? "Convert" : "Send"}: ${formatted} ${t.source_asset_symbol}`,
          data: {
            publicId: t.public_id,
            status: t.status,
            amount: `${formatted} ${t.source_asset_symbol} → ${t.destination_asset_symbol}`,
            settlementTxHash: t.destination_tx_hash ?? t.source_tx_hash ?? null,
            settledAt: t.settled_at ? new Date(t.settled_at).toISOString() : null,
          },
          ctaLabel: "View in Activity",
          ctaView: "activity",
        },
      });
    }

    if (latestAddMoney?.[0]) {
      const m = latestAddMoney[0];
      candidates.push({
        at: toMillis(m.created_at) || toMillis(m.settled_at),
        content: `Your latest cross-chain deposit (${m.quoted_source_display_amount} ${m.source_asset_symbol} → ${m.destination_asset_symbol}) is ${m.status}.`,
        card: {
          type: "PAYMENT_STATUS",
          title: `Add Money: ${m.quoted_source_display_amount} ${m.source_asset_symbol}`,
          data: {
            publicId: m.id,
            status: m.status,
            amount: `${m.quoted_source_display_amount} ${m.source_asset_symbol} → ${m.destination_asset_symbol}`,
            settlementTxHash: m.destination_tx_hash ?? null,
            settledAt: m.settled_at ? new Date(m.settled_at).toISOString() : null,
          },
          ctaLabel: "View in Activity",
          ctaView: "activity",
        },
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.at - a.at);
      const newest = candidates[0]!;
      return {
        role: "assistant",
        content: newest.content,
        card: newest.card,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      role: "assistant",
      content:
        "You don't have any settlements, transfers, or payment attempts yet. Once you send a payment, convert assets, or receive a deposit, I'll show the live status here.",
      timestamp: new Date().toISOString(),
    };
  }

  // Intent F: Wallet Receive / Deposit Addresses
  if (
    prompt.includes("address") ||
    prompt.includes("receive") ||
    prompt.includes("deposit") ||
    prompt.includes("wallet")
  ) {
    if (walletAddresses.length === 0) {
      return {
        role: "assistant",
        content:
          "Your wallet addresses are still being provisioned. Open Home to check wallet setup status.",
        timestamp: new Date().toISOString(),
      };
    }

    return {
      role: "assistant",
      content:
        "Here are your active Flow deposit addresses across supported networks. Click Copy on any address to receive funds.",
      card: {
        type: "RECEIVE_ADDRESS",
        title: "Your Wallet Addresses",
        data: {
          addresses: walletAddresses.map((w) => ({
            network: w.network,
            address: w.address,
          })),
        },
        ctaLabel: "Open Receive",
        ctaView: "receive",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent G: "Can I pay with USDC on Base?" & Supported Networks / Tokens
  if (
    prompt.includes("can i pay") ||
    prompt.includes("pay with") ||
    prompt.includes("network") ||
    prompt.includes("chain") ||
    prompt.includes("token") ||
    prompt.includes("support") ||
    prompt.includes("accept")
  ) {
    const dep = findMentionedDeployment(prompt);
    if (dep) {
      const held = nonZero.find(
        (b) =>
          canonicalizeNetworkId(b.network) === dep.networkKey &&
          b.symbol.toUpperCase() === dep.symbol.toUpperCase(),
      );
      const balText = held ? `${held.displayBalance} ${dep.symbol}` : "0";
      return {
        role: "assistant",
        content: `Yes — ${dep.symbol} on ${dep.networkName} is fully supported on Flow for sending, receiving, swapping, and checkout links. Your current ${dep.networkName} ${dep.symbol} balance is ${balText}. Want me to send a payment or create a payment link with it?`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      role: "assistant",
      content:
        "FLOW supports 4 primary wallet networks: Ethereum Mainnet, Base Mainnet, Solana Mainnet, and NEAR Mainnet with 11 curated assets (USDC, USDT, ETH, SOL, NEAR). Payers can also settle with 200+ tokens across 35+ blockchains via NEAR Intents.",
      timestamp: new Date().toISOString(),
    };
  }

  // Default helpful response
  return {
    role: "assistant",
    content:
      "I can check your balances, look up recent settlements, show your deposit addresses, draft & create payment links, preview swaps, or prepare a payment to send (just tell me the amount, token, and recipient address). What would you like to do?",
    timestamp: new Date().toISOString(),
  };
}
