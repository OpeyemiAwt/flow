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
import {
  CONVERT_BRIDGE_FEE_BPS,
  getConvertBridgeAppFees,
  grossUpForPlatformFee,
} from "../domain/platform-fees.ts";
import { quoteOneClickPreview } from "./providers/one-click-preview.ts";
import { getAccountFlowId, resolveFlowIdForSend } from "./flow-id-service.ts";

export interface AssistantActionCard {
  readonly type:
    | "BALANCE_SUMMARY"
    | "DRAFT_PAYMENT_LINK"
    | "PREVIEW_SWAP"
    | "SEND_PREVIEW"
    | "RECEIVE_ADDRESS"
    | "PAYMENT_STATUS"
    | "ROUTE_EXPLANATION"
    | "DISPUTE_EMAIL";
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
  readonly viaVoice?: boolean;
  readonly timestamp?: string;
}

const SUPPORT_EMAIL =
  process.env.FLOW_SUPPORT_EMAIL?.trim() || "flow@devhub.forum";

const FLOW_PRODUCT_KNOWLEDGE = [
  "FLOW Product Knowledge Base (always answer FLOW questions accurately from these facts):",
  "- What FLOW is: FLOW (https://flow.devhub.forum) is a non-custodial multi-chain payments and money app that lets users send, receive, convert, request payments, and earn native yield across 4 mainnets (NEAR Mainnet, Solana Mainnet, Base Mainnet, and Ethereum Mainnet) from a single account, with no seed phrases and no manual network switching.",
  "- Onboarding & Custody: Users sign in with Google or an email one-time code (OTP). FLOW automatically provisions real non-custodial mainnet wallet addresses on NEAR, Solana, Base, and Ethereum backed by OutLayer MPC key management and on-chain wallet policies. Supports both Personal and Business/Team accounts (with team invites and role-based access).",
  "- @flow ID & Direct Links: Users can claim a human-readable handle like name@flow (e.g. flow.devhub.forum/name@flow). Sharing a direct @flow link opens a receipt-style landing page where anyone can either Pay with FLOW (lands directly in Send pre-filled with that @flow ID) or Pay with external wallet (opens an open-amount checkout page where they can pay in any supported token or chain via NEAR Intents and it settles on NEAR into the recipient's FLOW wallet).",
  "- Send: Send supported assets to a @flow ID or a raw blockchain address (NEAR .near/implicit, Solana, Base/Ethereum 0x...). Same-asset direct sends have a 0% FLOW platform fee (network gas only). Cross-asset sends (sending one asset while the recipient receives another) route via NEAR Intents (1Click) with a 0.3% FLOW platform fee charged from the sender's wallet balance, with live estimated output shown before confirming.",
  "- Receive & Payment Links: Users can receive directly to their NEAR, Solana, Base, or Ethereum addresses (or QR codes), or create shareable Payment Links (Request tab -> New request). Payers do not need a FLOW account and can pay from any of 200+ supported tokens across chains via NEAR Intents. Payment Links support fixed or open amounts, choice of who pays routing fees (payer or creator), optional max payer limits, auto-refreshing quotes when expired links are reopened, and pause/delete controls. FLOW platform fee on Payment Links is 0%.",
  "- Convert & Bridge: Swap or bridge between assets across the user's own FLOW wallets (e.g., SOL on Solana to USDC on Base or NEAR on NEAR Mainnet) using live NEAR Intents (1Click) quotes. FLOW platform fee is 1.5% charged from wallet balance, shown up front before confirming.",
  "- Earn (Native Yield on NEAR): Users can earn yield directly from their own non-custodial NEAR wallet via LiNEAR Protocol (liquid stake NEAR for $LiNEAR with auto-compounding staking rewards; standard unstaking takes ~48 hours / ~4 NEAR epochs before claiming) and Burrow Finance (supply USDC on NEAR Mainnet for variable lending yield). FLOW charges a one-shot 0.3% deposit fee on Earn deposits and 0% on withdrawals and claims.",
  "- Flow AI Assistant: Built right into FLOW. Can answer any question about FLOW, check live portfolio balances and USD values, draft and confirm sends to @flow IDs or raw addresses, preview and run cross-chain conversions, draft and publish payment links, share deposit addresses, check settlement status, take voice notes (tap the mic, including spoken 'name at flow' handles), sync conversation history across devices (History button), and draft/send support dispute emails straight to flow@devhub.forum. Every fund-moving action or dispute email always requires the user's explicit tap to confirm.",
  "- App Sections & Tools: Home/Portfolio (balances, Send, Receive, Convert, Request, Earn, Activity), Flow AI Assistant (/assistant), Activity timeline with tx hashes, Analytics (/analytics), Market Insights (/insights), Notifications (/notifications), Security & Settings (/security: profile, @flow ID, active sessions & device revocation, Google sign-in, light/dark mode, language selector, account deletion), plus public Docs (/docs), Whitepaper (/whitepaper), Blog (/blog), Terms (/terms), Privacy (/privacy), and Support (flow@devhub.forum).",
  "- Fee Summary: Direct same-asset send = 0% | Cross-asset send = 0.3% | Payment Link checkout = 0% | Convert & Bridge = 1.5% | Earn deposit = 0.3% | Earn withdraw/claim = 0%.",
].join("\n");

function answerFlowProductQuestion(
  prompt: string,
  userFlowId: string | null,
): string | null {
  const p = prompt.trim().toLowerCase();

  // Simple greetings
  if (/^(hi|hey|hello|yo|gm|good morning|good afternoon|good evening|sup)[!?. ]*$/i.test(p)) {
    return "Hey! I'm Flow AI. I can answer anything about FLOW, check your live balances, send to @flow IDs or addresses, convert across chains, create payment links, or send a dispute to support. How can I help?";
  }

  // What is FLOW / What can I do with FLOW / Capabilities
  if (
    /\b(what is flow|what'?s flow|about flow|explain flow|tell me about flow|what can i do (with|on|in) flow|what does flow do|flow features|how does flow work|why flow)\b/i.test(
      p,
    )
  ) {
    return [
      "**FLOW** is a non-custodial multi-chain payments wallet across **NEAR, Solana, Base, and Ethereum** with no seed phrases or manual chain switching.",
      "",
      "Here is what you can do with FLOW:",
      "- **Send & @flow ID:** Send to human-readable handles (`name@flow`) or wallet addresses. Direct same-asset sends have a 0% FLOW fee; cross-asset sends route via NEAR Intents (0.3% fee).",
      "- **Shareable Direct Links & Payment Links:** Share your `flow.devhub.forum/name@flow` link or create fixed/open payment links. Payers can pay with FLOW or from any external wallet across 200+ tokens (0% FLOW fee).",
      "- **Convert & Bridge:** Swap assets across your own NEAR, Solana, Base, and Ethereum wallets with live quotes (1.5% FLOW fee).",
      "- **Earn Native Yield:** Stake NEAR via **LiNEAR** or supply USDC via **Burrow Finance** straight from your own NEAR wallet (0.3% deposit fee, 0% withdrawal fee).",
      "- **Flow AI & Voice Notes:** Ask questions, speak commands via voice notes, check synced conversation history, inspect Analytics/Insights, or send support disputes to `flow@devhub.forum`.",
    ].join("\n");
  }

  // What can Flow AI do
  if (
    /\b(what can you do|who are you|how can you help|help me|your capabilities)\b/i.test(
      p,
    )
  ) {
    return [
      "I'm **Flow AI**, your built-in assistant for FLOW. Here is how I can help:",
      "- **Answer FLOW questions:** Fees, @flow IDs, Earn yield, security, payment links, and supported chains.",
      "- **Check balances & activity:** View formatted live holdings, USD totals, deposit addresses, and recent settlements.",
      "- **Prepare transactions:** Send to `@flow` IDs or addresses, preview cross-chain conversions, or draft payment links (always asking you to tap confirm first).",
      "- **Voice notes & synced history:** Tap the mic to speak any command, and open the History icon to access past chats across devices.",
      "- **Support disputes:** Tell me about any payment issue and I'll draft an email directly to `flow@devhub.forum`.",
    ].join("\n");
  }

  // Fees & pricing
  if (
    /\b(fee|fees|pricing|cost|charge|commission)\b/i.test(p) &&
    !/\b(dispute|refund|missing)\b/i.test(p)
  ) {
    return [
      "Here is the **FLOW fee schedule** (shown up front before you confirm):",
      "- **Direct sends (same asset):** 0% FLOW fee (network gas only)",
      "- **Cross-asset sends:** 0.3% FLOW fee (charged from wallet balance via NEAR Intents)",
      "- **Payment Link checkouts:** 0% FLOW fee (creator chooses whether payer or creator covers routing fees)",
      "- **Convert & Bridge:** 1.5% FLOW fee (charged from wallet balance)",
      "- **Earn deposits (LiNEAR / Burrow):** 0.3% one-shot FLOW deposit fee",
      "- **Earn withdrawals & claims:** 0% FLOW fee",
    ].join("\n");
  }

  // Earn / Yield / Staking / LiNEAR / Burrow
  if (/\b(earn|yield|stake|staking|linear|burrow|apy|interest)\b/i.test(p)) {
    return [
      "In the **Earn** tab, you can put idle NEAR ecosystem assets to work directly from your own non-custodial NEAR wallet:",
      "- **LiNEAR liquid staking:** Deposit NEAR to receive `$LiNEAR` and earn auto-compounding staking rewards. Standard unstaking has NEAR's ~48-hour (~4 epoch) cooldown before you tap **Claim**.",
      "- **Burrow Finance:** Supply USDC on NEAR Mainnet to earn variable lending yield.",
      "- **Fees:** 0.3% one-shot FLOW deposit fee and **0% fee on withdrawals and claims**.",
    ].join("\n");
  }

  // @flow ID & direct pay link / external wallet
  if (
    /\b(@flow|flow id|direct link|external wallet|handle)\b/i.test(p) &&
    /\b(how|what|explain|work|works|tell me|what'?s)\b/i.test(p) &&
    !/\b(send\s+\d|pay\s+\d|transfer\s+\d)\b/i.test(p)
  ) {
    const ownLine = userFlowId
      ? `Your current FLOW ID is **${userFlowId}** (\`flow.devhub.forum/${userFlowId}\`).`
      : "You can claim your own `@flow` ID in **Settings** or from the home header.";
    return [
      `A **@flow ID** is your human-readable FLOW payment handle (like \`name@flow\`). ${ownLine}`,
      "- Anyone opening `flow.devhub.forum/name@flow` sees a clean receipt screen where they can tap **Pay with FLOW** (goes straight to Send pre-filled with your handle) or **Pay with external wallet**.",
      "- External wallet payments open an open-amount checkout where payers can send any supported token across chains via NEAR Intents, settling directly onto NEAR in your FLOW wallet.",
    ].join("\n");
  }

  // Security / Custody / Non-custodial / MPC / OutLayer / Seed phrase
  if (
    /\b(safe|safety|secure|security|custody|non-custodial|custodial|seed phrase|private key|outlayer|mpc|delete account|sessions)\b/i.test(
      p,
    )
  ) {
    return [
      "**FLOW is non-custodial.** When you sign in with Google or an email one-time code, **OutLayer MPC** provisions real mainnet wallet addresses you control on NEAR, Solana, Base, and Ethereum without requiring you to manage a seed phrase.",
      "- On-chain wallet policies protect signing, and Flow AI never moves funds or emails support without your explicit tap to confirm.",
      "- In **Settings** (`/security`), you can review active sessions, revoke other devices, manage Google sign-in, or permanently delete your account.",
    ].join("\n");
  }

  // NEAR Intents / 1Click / Cross-chain mechanics
  if (/\b(near intents|1click|one click|cross-chain|bridge|solver)\b/i.test(p) && /\b(how|what|explain|work|works)\b/i.test(p)) {
    return "FLOW routes cross-chain sends, Convert & Bridge swaps, and multi-chain payment links through **NEAR Intents (1Click)**. Solvers provide live signed quotes showing exact estimated receive amounts and costs before you confirm, letting payers settle from 200+ tokens across chains without manual bridging.";
  }

  // How Payment Links work (informational question, not creating one)
  if (
    /\b(payment link|payment links|checkout|request)\b/i.test(p) &&
    /\b(how|what|explain|work|works)\b/i.test(p)
  ) {
    return [
      "**Payment Links** let you get paid from any supported chain or token without the payer needing a FLOW account:",
      "- Open **Request -> New request** (or ask me to draft one) and choose a fixed or open amount.",
      "- On fixed-amount links, decide whether your payer covers routing fees or you absorb them, and optionally set a max payer limit.",
      "- Reopening an expired link automatically starts fresh with a live quote, and FLOW charges a **0% platform fee** on Payment Link checkouts.",
    ].join("\n");
  }

  return null;
}

export function formatAiNetworkName(network: string | null | undefined): string {
  const norm = (network ?? "").toLowerCase().trim();
  if (norm.startsWith("near")) {
    return norm.includes("testnet") ? "NEAR Testnet" : "NEAR Mainnet";
  }
  if (norm.startsWith("solana")) {
    return norm.includes("devnet") ? "Solana Devnet" : "Solana Mainnet";
  }
  if (norm.startsWith("base")) {
    return norm.includes("sepolia") ? "Base Sepolia" : "Base Mainnet";
  }
  if (norm.startsWith("ethereum") || norm === "eth") {
    return norm.includes("sepolia") ? "Ethereum Sepolia" : "Ethereum Mainnet";
  }
  return network || "Mainnet";
}

export function formatAiDisplayAmount(
  raw: string | null | undefined,
  maxDecimals = 4,
): string {
  if (!raw) return "0";
  const cleaned = raw.trim().replace(/,/g, "");
  if (!cleaned) return "0";
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return raw;
  if (parsed === 0) return "0";

  const effectiveDecimals =
    parsed > 0 && parsed < 0.01 ? Math.max(maxDecimals, 6) : maxDecimals;

  const formatIntWithCommas = (intStr: string) =>
    intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const [rawInt = "0", fracPart = ""] = cleaned.split(".");
    const intPart = rawInt.replace(/^0+(?=\d)/, "") || "0";
    if (!fracPart) return formatIntWithCommas(intPart);
    const truncated = fracPart.slice(0, effectiveDecimals).replace(/0+$/, "");
    if (!truncated) {
      if (intPart === "0" && /[1-9]/.test(fracPart)) {
        return `<0.${"0".repeat(effectiveDecimals - 1)}1`;
      }
      return formatIntWithCommas(intPart);
    }
    return `${formatIntWithCommas(intPart)}.${truncated}`;
  }

  const factor = 10 ** effectiveDecimals;
  const floored = Math.floor(parsed * factor) / factor;
  if (floored === 0 && parsed > 0) {
    return `<0.${"0".repeat(effectiveDecimals - 1)}1`;
  }
  const [iPart = "0", fPart] = floored
    .toFixed(effectiveDecimals)
    .replace(/\.?0+$/, "")
    .split(".");
  return fPart
    ? `${formatIntWithCommas(iPart)}.${fPart}`
    : formatIntWithCommas(iPart);
}

function formatUsdLabel(usd: number | null | undefined): string | null {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return null;
  if (usd === 0) return "$0.00";
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

function normalizeSpokenFlowIds(rawPrompt: string): string {
  // Handle voice transcripts like "yemigraffix at flow" -> "yemigraffix@flow"
  return rawPrompt.replace(
    /\b([a-zA-Z0-9][a-zA-Z0-9._-]{1,31})\s+at\s+flow\b/gi,
    (_m, handle: string) => `${handle.toLowerCase()}@flow`,
  );
}

function extractFlowId(rawPrompt: string): string | null {
  const normalized = normalizeSpokenFlowIds(rawPrompt);
  const match = normalized.match(/\b([a-z0-9][a-z0-9._-]{1,31}@flow)\b/i);
  return match?.[1]?.toLowerCase() ?? null;
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

function extractTransactionRef(rawPrompt: string): string | null {
  const flowRef = rawPrompt.match(/\b(pr_[a-zA-Z0-9_-]{8,64}|pa_[a-zA-Z0-9_-]{8,64}|ot_[a-zA-Z0-9_-]{8,64})\b/);
  if (flowRef?.[1]) return flowRef[1];
  const evmHash = rawPrompt.match(/\b0x[a-fA-F0-9]{64}\b/);
  if (evmHash?.[0]) return evmHash[0];
  const solSig = rawPrompt.match(/\b[1-9A-HJ-NP-Za-km-z]{64,88}\b/);
  if (solSig?.[0]) return solSig[0];
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

interface EnrichedBalance {
  readonly network: string;
  readonly canonicalNetwork: string;
  readonly networkName: string;
  readonly symbol: string;
  readonly atomic_balance: string;
  readonly decimals: number;
  readonly rawDisplayBalance: string;
  readonly displayBalance: string;
  readonly usdValue: number | null;
  readonly usdFormatted: string | null;
}

interface RecentTxContext {
  readonly kind: string;
  readonly publicId: string;
  readonly status: string;
  readonly summary: string;
  readonly txHash: string | null;
  readonly createdAt: string;
}

interface ResolvedFlowRecipientContext {
  readonly flowId: string;
  readonly accountName: string;
  readonly network: string;
  readonly networkName: string;
  readonly recipientAddress: string;
}

function buildBalanceSummaryCard(
  items: EnrichedBalance[],
  title: string,
): AssistantActionCard {
  const knownUsd = items.filter((b) => b.usdValue !== null);
  const totalUsdNum =
    knownUsd.length > 0
      ? knownUsd.reduce((sum, b) => sum + (b.usdValue ?? 0), 0)
      : null;

  return {
    type: "BALANCE_SUMMARY",
    title,
    data: {
      totalUsd: formatUsdLabel(totalUsdNum) ?? "Live balance",
      balances: items.map((b) => ({
        symbol: b.symbol,
        network: b.canonicalNetwork,
        networkName: b.networkName,
        asset: `${b.symbol} · ${b.networkName}`,
        balance: b.displayBalance,
        usdValue: b.usdFormatted,
      })),
      assets: items.map((b) => ({
        symbol: b.symbol,
        network: b.canonicalNetwork,
        networkName: b.networkName,
        balance: b.displayBalance,
        usdValue: b.usdFormatted,
      })),
    },
    ctaLabel: "View All Assets",
    ctaView: "dashboard",
  };
}

async function tryLlmAssistantReply(params: {
  prompt: string;
  history: AssistantMessage[];
  balances: EnrichedBalance[];
  totalUsdLabel: string | null;
  addresses: Array<{ network: string; networkName: string; address: string }>;
  userFlowId: string | null;
  userEmail?: string | null;
  recentTxs: RecentTxContext[];
  resolvedRecipient: ResolvedFlowRecipientContext | null;
}): Promise<AssistantMessage | null> {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!groqKey && !geminiKey && !openaiKey && !anthropicKey) return null;

  const balancesContext =
    params.balances.length > 0
      ? params.balances
          .map(
            (b) =>
              `${b.displayBalance} ${b.symbol} on ${b.networkName}${b.usdFormatted ? ` (${b.usdFormatted})` : ""} [id=${b.canonicalNetwork}:${b.symbol}]`,
          )
          .join("; ")
      : "0 funded balances";

  const recentTxContext =
    params.recentTxs.length > 0
      ? params.recentTxs
          .map(
            (tx) =>
              `${tx.kind} ${tx.publicId}: ${tx.summary} (${tx.status}${tx.txHash ? `, tx=${tx.txHash}` : ""})`,
          )
          .join("; ")
      : "No recent transactions yet";

  const systemPrompt = [
    "You are Flow AI, the conversational assistant and product expert inside FLOW.",
    "Style rules: Be clear, warm, concise, and genuinely helpful. Answer general conversations and any question about FLOW (what FLOW is, what users can do with FLOW, how features work, fees, security/custody, @flow IDs, direct links, external wallet checkout, Earn, Convert, Payment Links, voice notes, disputes, etc.) accurately using the FLOW Product Knowledge Base below. For conversational or informational questions (like 'what can I do with flow?' or 'how do fees work?'), give a clear, scannable answer with bullet points where helpful and set card to null. Never dump raw 18-digit decimals (always use clean formatted numbers like 6.5587 NEAR or $20.14). Never use em dashes. Never invent balances, addresses, or transaction hashes.",
    FLOW_PRODUCT_KNOWLEDGE,
    `User FLOW ID: ${params.userFlowId ?? "Not claimed yet"}.`,
    `Total verified portfolio value: ${params.totalUsdLabel ?? "Unavailable"}.`,
    `Verified balances: ${balancesContext}.`,
    `Active wallet addresses: ${params.addresses.length > 0 ? params.addresses.map((a) => `${a.networkName} (${a.network}): ${a.address}`).join("; ") : "None provisioned yet"}.`,
    `Recent activity: ${recentTxContext}.`,
    params.resolvedRecipient
      ? `Resolved recipient from prompt: ${params.resolvedRecipient.flowId} (${params.resolvedRecipient.accountName}) -> ${params.resolvedRecipient.recipientAddress} on ${params.resolvedRecipient.networkName} (${params.resolvedRecipient.network}).`
      : "No @flow recipient resolved in this message.",
    `Supported mainnet deployments: ${MAINNET_SUPPORTED_DEPLOYMENTS.map((d) => `${d.symbol} on ${d.networkName} (${d.id})`).join(", ")}.`,
    "Return ONLY valid JSON matching this schema:",
    '{ "reply": string, "card": { "type": "BALANCE_SUMMARY" | "SEND_PREVIEW" | "PREVIEW_SWAP" | "DRAFT_PAYMENT_LINK" | "RECEIVE_ADDRESS" | "PAYMENT_STATUS" | "DISPUTE_EMAIL", "title": string, "data": object } | null }',
    "Card rules (set card to null unless the user is actively asking to view data or perform one of these actions):",
    "- BALANCE_SUMMARY: Use when the user asks for balances/holdings. Set data to { \"networkFilter\": \"near-mainnet\" | \"base-mainnet\" | \"solana-mainnet\" | \"ethereum-mainnet\" | null }. Server will populate exact verified balances.",
    "- SEND_PREVIEW: Use ONLY when you have amount, assetSymbol, sourceDeploymentId, destinationDeploymentId, and recipientAddress (use the resolved @flow recipientAddress above if user named a @flow ID). Data keys: sourceDeploymentId, destinationDeploymentId, assetSymbol, network, networkName, amount, recipientAddress, recipientFlowId (optional), memo (optional).",
    "- PREVIEW_SWAP: Use when user asks to swap/convert. Data keys: sourceDeploymentId, destinationDeploymentId, fromAsset, toAsset, amount, route, safetyNotice.",
    "- DRAFT_PAYMENT_LINK: Use when user asks to create/draft a payment link or invoice. Data keys: title, destinationAsset, destinationAssetId, assetSymbol, network, amount.",
    "- RECEIVE_ADDRESS: Use when user asks for wallet/deposit addresses. Data: {}.",
    "- PAYMENT_STATUS: Use when user asks about latest transfer/settlement status. Data keys: publicId, status, amount, settlementTxHash.",
    `- DISPUTE_EMAIL: Use whenever the user wants to file/send a dispute, report missing/stuck funds, or message FLOW support (${SUPPORT_EMAIL}). If they explained what happened, immediately draft the card with data keys: { "subject": string, "category": "Missing Funds" | "Failed Transfer" | "Checkout Issue" | "Account Support", "message": string, "transactionRef": string }. Tell them they can review/edit and tap Send Dispute.`,
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

    if (groqKey) {
      const model =
        process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
      const res = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(12_000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model,
            response_format: { type: "json_object" },
            temperature: 0.3,
            max_tokens: 1400,
            messages: [
              { role: "system", content: systemPrompt },
              ...transcript,
            ],
          }),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawText = json.choices?.[0]?.message?.content ?? null;
      } else {
        // Rate limit (429) or transient error -> fall back cleanly to intent engine
        await res.body?.cancel().catch(() => {});
      }
    }

    if (!rawText && geminiKey) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          signal: AbortSignal.timeout(12_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: transcript.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.25,
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
    }

    if (!rawText && openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          temperature: 0.25,
          messages: [{ role: "system", content: systemPrompt }, ...transcript],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        rawText = json.choices?.[0]?.message?.content ?? null;
      }
    }

    if (!rawText && anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: AbortSignal.timeout(12_000),
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
    if (!parsed.reply || typeof parsed.reply !== "string") return null;

    // Server-verify and sanitize any card returned by the LLM
    let verifiedCard: AssistantActionCard | null = parsed.card ?? null;
    if (verifiedCard) {
      if (verifiedCard.type === "BALANCE_SUMMARY") {
        const netFilter =
          typeof verifiedCard.data?.networkFilter === "string"
            ? canonicalizeNetworkId(verifiedCard.data.networkFilter)
            : null;
        const list = netFilter
          ? params.balances.filter((b) => b.canonicalNetwork === netFilter)
          : params.balances;
        verifiedCard =
          list.length > 0
            ? buildBalanceSummaryCard(
                list,
                netFilter
                  ? `${formatAiNetworkName(netFilter)} Holdings`
                  : "Portfolio Balances",
              )
            : null;
      } else if (verifiedCard.type === "RECEIVE_ADDRESS") {
        verifiedCard =
          params.addresses.length > 0
            ? {
                type: "RECEIVE_ADDRESS",
                title: "Your Deposit Addresses",
                data: {
                  addresses: params.addresses.map((a) => ({
                    network: a.networkName,
                    networkKey: a.network,
                    address: a.address,
                  })),
                },
                ctaLabel: "Open Receive",
                ctaView: "receive",
              }
            : null;
      } else if (verifiedCard.type === "SEND_PREVIEW") {
        const d = verifiedCard.data ?? {};
        const srcDep =
          MAINNET_SUPPORTED_DEPLOYMENTS.find(
            (x) => x.id === String(d.sourceDeploymentId ?? ""),
          ) ??
          findMentionedDeployment(
            `${String(d.assetSymbol ?? "")} ${String(d.network ?? "")}`,
          );
        const dstDep =
          MAINNET_SUPPORTED_DEPLOYMENTS.find(
            (x) => x.id === String(d.destinationDeploymentId ?? ""),
          ) ?? srcDep;
        const rawAmt = String(d.amount ?? "").replace(/[^0-9.]/g, "");
        const recAddr = String(
          d.recipientAddress ||
            params.resolvedRecipient?.recipientAddress ||
            "",
        ).trim();

        if (!srcDep || !dstDep || !rawAmt || !recAddr) {
          verifiedCard = null;
        } else {
          const held = params.balances.find(
            (b) =>
              b.canonicalNetwork === srcDep.networkKey &&
              b.symbol.toUpperCase() === srcDep.symbol.toUpperCase(),
          );
          let sufficient = false;
          try {
            const reqAtomic = parseDisplayToAtomic(rawAmt, srcDep.decimals);
            const heldAtomic = held ? BigInt(held.atomic_balance) : 0n;
            sufficient = reqAtomic > 0n && heldAtomic >= reqAtomic;
          } catch {
            sufficient = false;
          }
          const isCross = srcDep.networkKey !== dstDep.networkKey;
          verifiedCard = {
            type: "SEND_PREVIEW",
            title: isCross ? "Confirm Cross-Chain Send" : "Confirm Send",
            data: {
              sourceDeploymentId: srcDep.id,
              destinationDeploymentId: dstDep.id,
              assetSymbol: srcDep.symbol,
              network: srcDep.networkKey,
              networkName: isCross
                ? `${srcDep.networkName} → ${dstDep.networkName}`
                : srcDep.networkName,
              amount: formatAiDisplayAmount(rawAmt, 6),
              rawAmount: rawAmt,
              recipientAddress: recAddr,
              recipientFlowId:
                (typeof d.recipientFlowId === "string" && d.recipientFlowId) ||
                params.resolvedRecipient?.flowId ||
                null,
              memo: typeof d.memo === "string" ? d.memo.trim() : "",
              availableBalance: held?.displayBalance ?? "0",
              sufficientBalance: sufficient,
            },
            ctaLabel: "Confirm & Send",
            ctaView: "send",
          };
        }
      } else if (verifiedCard.type === "DISPUTE_EMAIL") {
        const d = verifiedCard.data ?? {};
        verifiedCard = {
          type: "DISPUTE_EMAIL",
          title: verifiedCard.title || "Send Dispute to Support",
          data: {
            subject:
              String(d.subject ?? "").trim() || "Transaction Dispute",
            category:
              String(d.category ?? "").trim() || "General Dispute",
            message:
              String(d.message ?? "").trim() || params.prompt,
            transactionRef: String(d.transactionRef ?? "").trim(),
            supportEmail: SUPPORT_EMAIL,
          },
          ctaLabel: "Send Dispute",
        };
      }
    }

    return {
      role: "assistant",
      content: parsed.reply,
      card: verifiedCard,
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
  userEmail?: string | null;
  db?: FlowDb;
}): Promise<AssistantMessage> {
  const db = params.db ?? runtime().db;
  const rawPrompt = normalizeSpokenFlowIds(params.prompt.trim());
  const prompt = rawPrompt.toLowerCase();
  const lastCard = findLastCard(params.history);
  const lastUserPrompt = findLastUserPrompt(params.history).toLowerCase();
  const lastAssistantContent = findLastAssistantContent(
    params.history,
  ).toLowerCase();

  // 1. Fetch account context (balances, wallet addresses, @flow ID, recent activity)
  const [balances, walletAddresses, userFlowId, recentOutgoing, recentAttempts] =
    await Promise.all([
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
      getAccountFlowId(db, params.accountId).catch(() => null),
      db
        .$queryRaw<
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
          SELECT public_id, job_kind, status,
                 COALESCE(source_atomic_amount::text, '0') as source_atomic_amount,
                 source_decimals, source_asset_symbol, destination_asset_symbol,
                 source_tx_hash, destination_tx_hash, settled_at, created_at
          FROM flow.outgoing_transfer_jobs
          WHERE account_id = ${params.accountId}::uuid
          ORDER BY created_at DESC
          LIMIT 5
        `
        .catch(() => []),
      db
        .$queryRaw<
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
                 COALESCE(pa.quoted_destination_atomic_amount::text, '0') as amount,
                 pr.destination_asset_symbol, pr.destination_decimals,
                 pa.destination_tx_hash, pa.settled_at, pa.created_at
          FROM flow.payment_attempts pa
          JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
          WHERE pr.account_id = ${params.accountId}::uuid
          ORDER BY pa.created_at DESC
          LIMIT 3
        `
        .catch(() => []),
    ]);

  // Enrich balances with crisp display formatting + live USD estimates
  const enrichedBalances: EnrichedBalance[] = await Promise.all(
    balances.map(async (row) => {
      const canonical = canonicalizeNetworkId(row.network) ?? row.network;
      const rawDisplay = formatAtomicToDisplay(
        row.atomic_balance,
        row.decimals,
      );
      const cleanDisplay = formatAiDisplayAmount(rawDisplay);
      let usdValue: number | null = null;
      const symUpper = row.symbol.toUpperCase();
      const numVal = Number.parseFloat(rawDisplay);
      if (Number.isFinite(numVal)) {
        if (symUpper === "USDC" || symUpper === "USDT") {
          usdValue = numVal;
        } else {
          try {
            const resolved = await resolveQuoteAsset(
              `${canonical}:${row.symbol}`,
            );
            if (resolved?.priceUsd && resolved.priceUsd > 0) {
              usdValue = numVal * resolved.priceUsd;
            }
          } catch {
            // Optional price enrichment
          }
        }
      }
      return {
        network: row.network,
        canonicalNetwork: canonical,
        networkName: formatAiNetworkName(canonical),
        symbol: row.symbol,
        atomic_balance: row.atomic_balance,
        decimals: row.decimals,
        rawDisplayBalance: rawDisplay,
        displayBalance: cleanDisplay,
        usdValue,
        usdFormatted: formatUsdLabel(usdValue),
      };
    }),
  );

  enrichedBalances.sort(
    (a, b) => (b.usdValue ?? -1) - (a.usdValue ?? -1),
  );

  const knownUsdBalances = enrichedBalances.filter((b) => b.usdValue !== null);
  const totalUsdNum =
    knownUsdBalances.length > 0
      ? knownUsdBalances.reduce((acc, b) => acc + (b.usdValue ?? 0), 0)
      : null;
  const totalUsdLabel = formatUsdLabel(totalUsdNum);

  const formattedAddresses = walletAddresses.map((w) => {
    const canonical =
      canonicalizeNetworkId(w.chain_id) ??
      canonicalizeNetworkId(w.network) ??
      w.network;
    return {
      network: canonical,
      networkName: formatAiNetworkName(canonical),
      address: w.address,
    };
  });

  const recentTxs: RecentTxContext[] = [
    ...recentOutgoing.map((t) => ({
      kind: t.job_kind,
      publicId: t.public_id,
      status: t.status,
      summary: `${formatAiDisplayAmount(formatAtomicToDisplay(t.source_atomic_amount, t.source_decimals))} ${t.source_asset_symbol} -> ${t.destination_asset_symbol}`,
      txHash: t.destination_tx_hash ?? t.source_tx_hash ?? null,
      createdAt: new Date(t.created_at).toISOString(),
    })),
    ...recentAttempts.map((a) => ({
      kind: "CHECKOUT",
      publicId: a.public_id,
      status: a.status,
      summary: `${formatAiDisplayAmount(formatAtomicToDisplay(a.amount, a.destination_decimals))} ${a.destination_asset_symbol} (${a.title})`,
      txHash: a.destination_tx_hash ?? null,
      createdAt: new Date(a.created_at).toISOString(),
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);

  // Resolve any @flow ID mentioned in the prompt (or recent send turns)
  let resolvedRecipient: ResolvedFlowRecipientContext | null = null;
  const mentionedFlowId = extractFlowId(rawPrompt);
  if (mentionedFlowId) {
    const firstHeldDep = enrichedBalances[0]
      ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) =>
            d.networkKey === enrichedBalances[0]!.canonicalNetwork &&
            d.symbol.toUpperCase() === enrichedBalances[0]!.symbol.toUpperCase(),
        )
      : undefined;
    const hintedDep = findMentionedDeployment(rawPrompt, firstHeldDep);
    const targetNetwork = hintedDep?.networkKey ?? "near-mainnet";
    try {
      const resolved = await resolveFlowIdForSend(db, {
        rawFlowId: mentionedFlowId,
        destinationNetwork: targetNetwork,
      });
      resolvedRecipient = {
        flowId: resolved.flowId,
        accountName: resolved.accountName,
        network: targetNetwork,
        networkName: formatAiNetworkName(targetNetwork),
        recipientAddress: resolved.recipientAddress,
      };
    } catch {
      // Try NEAR fallback if target network wasn't provisioned yet
      if (targetNetwork !== "near-mainnet") {
        try {
          const resolved = await resolveFlowIdForSend(db, {
            rawFlowId: mentionedFlowId,
            destinationNetwork: "near-mainnet",
          });
          resolvedRecipient = {
            flowId: resolved.flowId,
            accountName: resolved.accountName,
            network: "near-mainnet",
            networkName: "NEAR Mainnet",
            recipientAddress: resolved.recipientAddress,
          };
        } catch {
          resolvedRecipient = null;
        }
      }
    }
  }

  // 2. Primary path: Groq LLM (with automatic silent fallback to intent engine if rate-limited or unavailable)
  const llmReply = await tryLlmAssistantReply({
    prompt: rawPrompt,
    history: params.history ?? [],
    balances: enrichedBalances,
    totalUsdLabel,
    addresses: formattedAddresses,
    userFlowId,
    userEmail: params.userEmail,
    recentTxs,
    resolvedRecipient,
  });
  if (llmReply) {
    return llmReply;
  }

  // =========================================================================
  // 3. Deterministic Intent-Based Fallback (always available even under 429)
  // =========================================================================

  // Intent 0: Dispute / Support Email to flow@devhub.forum
  const looksLikeDispute =
    /\b(dispute|complain|complaint|file a dispute|raise a dispute|report.*(issue|bug|problem|missing|wrong|scam|payment|transfer)|email.*support|contact.*support|send.*support|support.*team|funds.*missing|never arrived|didn'?t arrive|stuck transfer)\b/i.test(
      prompt,
    ) ||
    (lastCard?.type === "DISPUTE_EMAIL" &&
      !prompt.includes("balance") &&
      !prompt.includes("send ") &&
      !prompt.includes("swap"));

  if (looksLikeDispute) {
    const txRef =
      extractTransactionRef(rawPrompt) ??
      recentTxs[0]?.txHash ??
      recentTxs[0]?.publicId ??
      "";
    const category = /missing|never arrived|didn'?t arrive/i.test(prompt)
      ? "Missing Funds"
      : /checkout|link|invoice/i.test(prompt)
        ? "Checkout Issue"
        : /fail|stuck|error|transfer|send/i.test(prompt)
          ? "Failed Transfer"
          : "Account Support";

    const isBareRequest =
      rawPrompt.length < 28 &&
      /^(i want to |please )?(file|open|send|submit|make)?\s*(a )?dispute\.?$/i.test(
        rawPrompt,
      );

    if (isBareRequest) {
      return {
        role: "assistant",
        content:
          "I can send a dispute directly to FLOW Support (flow@devhub.forum). Tell me what happened and which payment or transaction it involves, and I will draft it for you to review and send.",
        timestamp: new Date().toISOString(),
      };
    }

    const cleanedSubject =
      category === "Missing Funds"
        ? "Missing funds dispute"
        : category === "Checkout Issue"
          ? "Checkout payment dispute"
          : category === "Failed Transfer"
            ? "Transfer dispute"
            : "Account support dispute";

    return {
      role: "assistant",
      content: `I drafted your dispute for FLOW Support (${SUPPORT_EMAIL}). Review or edit the details below, then tap Send Dispute.`,
      card: {
        type: "DISPUTE_EMAIL",
        title: "Send Dispute to FLOW Support",
        data: {
          subject: cleanedSubject,
          category,
          message: rawPrompt,
          transactionRef: txRef,
          supportEmail: SUPPORT_EMAIL,
        },
        ctaLabel: "Send Dispute",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent 0.5: General FLOW product Q&A / conversational fallback
  const productAnswer = answerFlowProductQuestion(prompt, userFlowId);
  if (productAnswer) {
    return {
      role: "assistant",
      content: productAnswer,
      timestamp: new Date().toISOString(),
    };
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
          "There are no completed or pending transactions recorded on this account yet, or your wallet hasn't received a synced deposit yet. Once you send, swap, or receive funds, I'll show the live status here.",
        timestamp: new Date().toISOString(),
      };
    }
    if (lastAssistantContent.includes("insufficient")) {
      return {
        role: "assistant",
        content:
          enrichedBalances.length > 0
            ? `Your synced holdings are ${enrichedBalances.map((b) => `${b.displayBalance} ${b.symbol} on ${b.networkName}`).join(", ")}. You can send up to those amounts or add funds first.`
            : "Your synced balance is currently 0, so there aren't enough funds on that network to cover the payment yet.",
        timestamp: new Date().toISOString(),
      };
    }
    return {
      role: "assistant",
      content: `Regarding my previous message: "${findLastAssistantContent(params.history)}". Let me know what you'd like to adjust or check next.`,
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
      content: `Updated your payment link draft to ${formattedAmount} ${selectedDeployment.symbol} on ${selectedDeployment.networkName}. Tap Create Payment Link below when ready.`,
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

  const extractedAddress = extractRecipientAddress(rawPrompt);
  const previousAskedForRecipient =
    lastUserPrompt.includes("send") ||
    lastUserPrompt.includes("pay ") ||
    lastCard?.type === "SEND_PREVIEW";

  // Intent A: Balance check
  if (
    prompt.includes("balance") ||
    prompt.includes("how much") ||
    prompt.includes("my funds") ||
    prompt.includes("holdings") ||
    prompt.includes("portfolio") ||
    (isFollowUpModification && lastCard?.type === "BALANCE_SUMMARY")
  ) {
    const networkHint = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (d) =>
        prompt.includes(d.networkKey.split("-")[0] ?? "") ||
        prompt.includes(d.networkName.toLowerCase()),
    );
    const filtered = networkHint
      ? enrichedBalances.filter(
          (b) => b.canonicalNetwork === networkHint.networkKey,
        )
      : enrichedBalances;

    if (filtered.length === 0) {
      return {
        role: "assistant",
        content: networkHint
          ? `You currently have 0 funded balance on ${networkHint.networkName}.`
          : "You currently have no funded balances synced yet. Tap Add Money to fund your wallet.",
        timestamp: new Date().toISOString(),
      };
    }

    const totalFilteredUsd = filtered.some((b) => b.usdValue !== null)
      ? formatUsdLabel(
          filtered.reduce((acc, b) => acc + (b.usdValue ?? 0), 0),
        )
      : null;

    return {
      role: "assistant",
      content: networkHint
        ? `Here is your ${networkHint.networkName} balance${totalFilteredUsd ? ` (${totalFilteredUsd})` : ""}.`
        : `Your portfolio balance${totalFilteredUsd ? ` is ${totalFilteredUsd}` : ""} across ${filtered.length} ${filtered.length === 1 ? "asset" : "assets"}.`,
      card: buildBalanceSummaryCard(
        filtered,
        networkHint
          ? `${networkHint.networkName} Holdings`
          : "Portfolio Balances",
      ),
      timestamp: new Date().toISOString(),
    };
  }

  // Intent B: Send / Pay someone (supports wallet addresses AND @flow IDs!)
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

  if (
    looksLikeSend ||
    (previousAskedForRecipient && (extractedAddress || resolvedRecipient))
  ) {
    const userHistory = (params.history ?? [])
      .filter((m) => m.role === "user")
      .map((m) => normalizeSpokenFlowIds(m.content.trim()));
    let threadStartIdx = userHistory.length - 1;
    for (let i = userHistory.length - 1; i >= 0; i--) {
      const text = (userHistory[i] ?? "").toLowerCase();
      if (/\b(send|pay|transfer)\b/.test(text)) {
        threadStartIdx = i;
        break;
      }
    }
    const threadTurns = /\b(send|pay|transfer)\b/.test(prompt)
      ? [rawPrompt]
      : [...userHistory.slice(Math.max(0, threadStartIdx)), rawPrompt];

    const firstHeld = enrichedBalances[0]
      ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) =>
            d.networkKey === enrichedBalances[0]!.canonicalNetwork &&
            d.symbol.toUpperCase() ===
              enrichedBalances[0]!.symbol.toUpperCase(),
        )
      : undefined;

    let sourceDeployment: CatalogTokenDeployment =
      firstHeld ??
      MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) => d.id === "base-mainnet:USDC",
      ) ??
      MAINNET_SUPPORTED_DEPLOYMENTS[0]!;
    let destinationNetworkHint: string | null = null;
    let amount: string | null = null;
    let recipient: string | null = resolvedRecipient?.recipientAddress ?? null;
    let recipientFlowId: string | null = resolvedRecipient?.flowId ?? null;

    if (resolvedRecipient) {
      destinationNetworkHint = resolvedRecipient.network;
    }

    for (const turn of threadTurns) {
      const addr = extractRecipientAddress(turn);
      if (addr) {
        recipient = addr;
        recipientFlowId = null;
        if (addr.endsWith(".near") || /^[a-f0-9]{64}$/i.test(addr)) {
          destinationNetworkHint = "near-mainnet";
        } else if (!addr.startsWith("0x")) {
          destinationNetworkHint = "solana-mainnet";
        }
      }

      const flowHandle = extractFlowId(turn);
      const cleanedTurn = (addr ? turn.replace(addr, " ") : turn).replace(
        flowHandle ?? "",
        " ",
      );
      const lowerTurn = cleanedTurn.toLowerCase();
      const toSplit = lowerTurn.split(/\bto\b/);
      const srcPart = toSplit[0] ?? lowerTurn;
      const dstPart = toSplit.slice(1).join(" ");

      const srcMentioned = findMentionedDeployment(srcPart);
      if (srcMentioned) {
        const hasNetworkInTurn = /\b(ethereum|base|solana|near)\b/i.test(
          srcPart,
        );
        if (hasNetworkInTurn || threadTurns.indexOf(turn) === 0) {
          sourceDeployment = srcMentioned;
        } else if (
          srcMentioned.symbol.toUpperCase() !==
          sourceDeployment.symbol.toUpperCase()
        ) {
          const sameNet = MAINNET_SUPPORTED_DEPLOYMENTS.find(
            (d) =>
              d.networkKey === sourceDeployment.networkKey &&
              d.symbol.toUpperCase() === srcMentioned.symbol.toUpperCase(),
          );
          sourceDeployment = sameNet ?? srcMentioned;
        }
      }

      if (dstPart) {
        if (/\bnear\b/.test(dstPart)) destinationNetworkHint = "near-mainnet";
        else if (/\bsolana\b/.test(dstPart))
          destinationNetworkHint = "solana-mainnet";
        else if (/\bbase\b/.test(dstPart))
          destinationNetworkHint = "base-mainnet";
        else if (/\bethereum\b/.test(dstPart))
          destinationNetworkHint = "ethereum-mainnet";
      }

      const amtMatch = cleanedTurn.match(/\$?\b(\d+(?:\.\d+)?)\b/);
      if (amtMatch?.[1]) {
        amount = amtMatch[1];
      }
    }

    let destinationDeployment: CatalogTokenDeployment = sourceDeployment;
    if (
      destinationNetworkHint &&
      destinationNetworkHint !== sourceDeployment.networkKey
    ) {
      destinationDeployment =
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) =>
            d.networkKey === destinationNetworkHint &&
            d.symbol.toUpperCase() === sourceDeployment.symbol.toUpperCase(),
        ) ??
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) => d.networkKey === destinationNetworkHint,
        ) ??
        sourceDeployment;
    }

    const isCrossChain =
      sourceDeployment.networkKey !== destinationDeployment.networkKey;

    if (!amount || !recipient) {
      const missingParts = [
        !amount ? "how much you want to send (e.g. 10 USDC)" : null,
        !recipient
          ? "the recipient @flow ID or wallet address (0x..., Solana, or .near)"
          : null,
      ].filter(Boolean);
      const routeLabel = isCrossChain
        ? `${sourceDeployment.symbol} (${sourceDeployment.networkName}) -> ${destinationDeployment.symbol} (${destinationDeployment.networkName})`
        : `${sourceDeployment.symbol} (${sourceDeployment.networkName})`;
      return {
        role: "assistant",
        content: `I can prepare that ${routeLabel} payment for you. Please provide ${missingParts.join(" and ")}.`,
        timestamp: new Date().toISOString(),
      };
    }

    const held = enrichedBalances.find(
      (b) =>
        b.canonicalNetwork === sourceDeployment.networkKey &&
        b.symbol.toUpperCase() === sourceDeployment.symbol.toUpperCase(),
    );
    const availableBalance = held?.displayBalance ?? "0";
    const requestedAtomic = parseDisplayToAtomic(
      amount,
      sourceDeployment.decimals,
    );
    const heldAtomic = held ? BigInt(held.atomic_balance) : 0n;
    const sufficientBalance =
      requestedAtomic > 0n && heldAtomic >= requestedAtomic;

    const toLabel = recipientFlowId ?? recipient;

    return {
      role: "assistant",
      content: sufficientBalance
        ? `Ready to send ${formatAiDisplayAmount(amount, 6)} ${sourceDeployment.symbol} to ${toLabel}. Review the preview below and tap Confirm & Send.`
        : `Prepared your preview for ${formatAiDisplayAmount(amount, 6)} ${sourceDeployment.symbol} on ${sourceDeployment.networkName}, but your available balance is ${availableBalance} ${sourceDeployment.symbol}.`,
      card: {
        type: "SEND_PREVIEW",
        title: isCrossChain ? "Confirm Cross-Chain Send" : "Confirm Send",
        data: {
          sourceDeploymentId: sourceDeployment.id,
          destinationDeploymentId: destinationDeployment.id,
          assetSymbol: sourceDeployment.symbol,
          network: sourceDeployment.networkKey,
          networkName: isCrossChain
            ? `${sourceDeployment.networkName} → ${destinationDeployment.networkName}`
            : sourceDeployment.networkName,
          amount: formatAiDisplayAmount(amount, 6),
          rawAmount: amount,
          recipientAddress: recipient,
          recipientFlowId,
          availableBalance,
          sufficientBalance,
        },
        ctaLabel: "Confirm & Send",
        ctaView: "send",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent C: Swap / Convert preview
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

    const firstHeld = enrichedBalances[0]
      ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) =>
            d.networkKey === enrichedBalances[0]!.canonicalNetwork &&
            d.symbol.toUpperCase() ===
              enrichedBalances[0]!.symbol.toUpperCase(),
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

    let routeText = `${formatAiDisplayAmount(requestedAmount, 6)} ${srcDep.symbol} (${srcDep.networkName}) → ${dstDep.symbol} (${dstDep.networkName})`;
    let assistantSummary = `Prepared a conversion preview for ${formatAiDisplayAmount(requestedAmount, 6)} ${srcDep.symbol} to ${dstDep.symbol}. Review and tap Confirm & Convert below.`;

    if (srcDep.id !== dstDep.id && requestedAmount) {
      try {
        const refundTo = formattedAddresses.find(
          (w) => w.network === srcDep.networkKey,
        )?.address;
        const recipient = formattedAddresses.find(
          (w) => w.network === dstDep.networkKey,
        )?.address;

        if (refundTo && recipient) {
          const [srcAsset, dstAsset] = await Promise.all([
            resolveQuoteAsset(srcDep.id),
            resolveQuoteAsset(dstDep.id),
          ]);
          const atomic = parseDisplayToAtomic(requestedAmount, srcDep.decimals);
          if (srcAsset && dstAsset && atomic > 0n) {
            const { feeAtomic, grossAtomic } = grossUpForPlatformFee(
              atomic,
              CONVERT_BRIDGE_FEE_BPS,
            );
            const preview = await quoteOneClickPreview({
              source: srcAsset,
              destination: dstAsset,
              operationId: `ai:${params.accountId}`,
              amountAtomic: grossAtomic.toString(),
              principalAmountAtomic: atomic.toString(),
              platformFeeAtomic: feeAtomic.toString(),
              swapType: "EXACT_INPUT",
              recipient,
              refundTo,
              appFees: getConvertBridgeAppFees(),
            });
            if (preview.ok) {
              const estOut = formatAiDisplayAmount(
                preview.quote.recipientDisplayAmount,
              );
              routeText = `${formatAiDisplayAmount(requestedAmount, 6)} ${srcDep.symbol} → ~${estOut} ${dstDep.symbol}`;
              assistantSummary = `Live quote: ${formatAiDisplayAmount(requestedAmount, 6)} ${srcDep.symbol} (${srcDep.networkName}) converts to ~${estOut} ${dstDep.symbol} (${dstDep.networkName}). Tap Confirm & Convert below to execute.`;
            }
          }
        }
      } catch {
        // Keep clean fallback
      }
    }

    return {
      role: "assistant",
      content: assistantSummary,
      card: {
        type: "PREVIEW_SWAP",
        title: "Cross-Chain Conversion",
        data: {
          sourceDeploymentId: srcDep.id,
          destinationDeploymentId: dstDep.id,
          fromAsset: `${srcDep.symbol} · ${srcDep.networkName}`,
          toAsset: `${dstDep.symbol} · ${dstDep.networkName}`,
          amount: requestedAmount,
          route: routeText,
          safetyNotice:
            "Review the route and estimated output before confirming.",
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
      content: `Prepared a payment link for ${formattedAmount} ${selectedDeployment.symbol} on ${selectedDeployment.networkName}. Tap Create Payment Link below to publish it.`,
      card: {
        type: "DRAFT_PAYMENT_LINK",
        title: "Draft Payment Link",
        data: {
          title: cleanedTitle || "Payment request",
          destinationAsset: `${selectedDeployment.symbol} on ${selectedDeployment.networkName}`,
          destinationAssetId: selectedDeployment.id,
          assetSymbol: selectedDeployment.symbol,
          network: selectedDeployment.networkKey,
          networkName: selectedDeployment.networkName,
          amount: formattedAmount,
        },
        ctaLabel: "Create Payment Link",
        ctaView: "request",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent E: Recent Settlement & Activity Status
  if (
    prompt.includes("status") ||
    prompt.includes("settle") ||
    prompt.includes("recent") ||
    prompt.includes("paid") ||
    prompt.includes("history") ||
    prompt.includes("activity") ||
    prompt.includes("transaction")
  ) {
    const newest = recentTxs[0];
    if (newest) {
      return {
        role: "assistant",
        content: `Your latest ${newest.kind.toLowerCase()} (${newest.summary}) is currently ${newest.status}.`,
        card: {
          type: "PAYMENT_STATUS",
          title: `${newest.kind === "CONVERT" ? "Convert" : newest.kind === "SEND" ? "Send" : "Checkout"} Status`,
          data: {
            publicId: newest.publicId,
            status: newest.status,
            amount: newest.summary,
            settlementTxHash: newest.txHash,
            settledAt: newest.createdAt,
          },
          ctaLabel: "View in Activity",
          ctaView: "activity",
        },
        timestamp: new Date().toISOString(),
      };
    }

    return {
      role: "assistant",
      content:
        "You don't have any settlements, transfers, or payment attempts yet. Once you send, convert, or receive funds, I'll show live status here.",
      timestamp: new Date().toISOString(),
    };
  }

  // Intent F: Receive / Deposit Addresses
  if (
    prompt.includes("address") ||
    prompt.includes("receive") ||
    prompt.includes("deposit") ||
    prompt.includes("wallet")
  ) {
    if (formattedAddresses.length === 0) {
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
        "Here are your active FLOW deposit addresses across supported networks. Tap Copy on any address to receive funds.",
      card: {
        type: "RECEIVE_ADDRESS",
        title: "Your Deposit Addresses",
        data: {
          addresses: formattedAddresses.map((w) => ({
            network: w.networkName,
            networkKey: w.network,
            address: w.address,
          })),
        },
        ctaLabel: "Open Receive",
        ctaView: "receive",
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Intent G: Supported Networks / Assets
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
      const held = enrichedBalances.find(
        (b) =>
          b.canonicalNetwork === dep.networkKey &&
          b.symbol.toUpperCase() === dep.symbol.toUpperCase(),
      );
      const balText = held
        ? `${held.displayBalance} ${dep.symbol}${held.usdFormatted ? ` (${held.usdFormatted})` : ""}`
        : `0 ${dep.symbol}`;
      return {
        role: "assistant",
        content: `Yes, ${dep.symbol} on ${dep.networkName} is supported on FLOW for sending, receiving, swapping, and payment links. Your current balance is ${balText}.`,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      role: "assistant",
      content:
        "FLOW supports 4 primary wallet networks (NEAR Mainnet, Solana Mainnet, Base Mainnet, and Ethereum Mainnet) plus 200+ tokens across chains via NEAR Intents.",
      timestamp: new Date().toISOString(),
    };
  }

  return {
    role: "assistant",
    content:
      "I can check your balances, send to @flow IDs or wallet addresses, convert across chains, create payment links, check settlements, or submit a dispute to FLOW Support. What would you like to do?",
    timestamp: new Date().toISOString(),
  };
}
