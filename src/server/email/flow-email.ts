import { createHmac, timingSafeEqual } from "node:crypto";
import {
  BLOG_POSTS,
  formatBlogDate,
  getBlogPostBySlug,
  type BlogPost,
} from "../../content/blog-posts.ts";
import { log } from "../../foundation/logger.ts";
import type { FlowDb } from "../../foundation/prisma.ts";

const APP_BASE_URL = (
  process.env.FLOW_APP_ORIGIN?.trim() || "https://flow.devhub.forum"
).replace(/\/+$/, "");

function resolveMailerConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.FLOW_MAIL_API_KEY?.trim();
  const from = process.env.FLOW_MAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatEmailAmount(
  raw: string | null | undefined,
  maxDecimals = 4,
): string {
  if (!raw) return "0";
  const cleaned = raw.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    const parsed = Number.parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return raw;
    if (parsed === 0) return "0";
    const factor = 10 ** maxDecimals;
    const floored = Math.floor(parsed * factor) / factor;
    if (floored === 0 && parsed > 0) {
      return `<0.${"0".repeat(maxDecimals - 1)}1`;
    }
    return floored.toFixed(maxDecimals).replace(/\.?0+$/, "");
  }
  const [intPart, fracPart = ""] = cleaned.split(".");
  if (!fracPart) return intPart || "0";
  const truncated = fracPart.slice(0, maxDecimals).replace(/0+$/, "");
  if (!truncated) {
    if ((intPart === "0" || intPart === "") && /[1-9]/.test(fracPart)) {
      return `<0.${"0".repeat(maxDecimals - 1)}1`;
    }
    return intPart || "0";
  }
  return `${intPart || "0"}.${truncated}`;
}

function shortenAddress(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("@flow") || trimmed.length <= 24) return trimmed;
  return `${trimmed.slice(0, 8)}...${trimmed.slice(-6)}`;
}

function formatNetworkLabel(network: string): string {
  switch (network.toLowerCase()) {
    case "near":
    case "near-mainnet":
      return "NEAR";
    case "solana":
    case "solana-mainnet":
      return "Solana";
    case "base":
    case "base-mainnet":
      return "Base";
    case "ethereum":
    case "ethereum-mainnet":
      return "Ethereum";
    default:
      return network;
  }
}

function explorerUrlForTx(network: string, txHash: string | null): string | null {
  if (!txHash || txHash.startsWith("outlayer-req:")) return null;
  switch (network.toLowerCase()) {
    case "near":
    case "near-mainnet":
      return `https://nearblocks.io/txns/${encodeURIComponent(txHash)}`;
    case "solana":
    case "solana-mainnet":
      return `https://solscan.io/tx/${encodeURIComponent(txHash)}`;
    case "base":
    case "base-mainnet":
      return `https://basescan.org/tx/${encodeURIComponent(txHash)}`;
    case "ethereum":
    case "ethereum-mainnet":
      return `https://etherscan.io/tx/${encodeURIComponent(txHash)}`;
    default:
      return null;
  }
}

export type EmailPreferenceKind = "newsletter" | "transactions";

export function signEmailUnsubscribeToken(payload: {
  accountId: string;
  userId: string;
  kind: EmailPreferenceKind;
}): string | null {
  const secret = process.env.FLOW_AUTH_SECRET?.trim();
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = createHmac("sha256", secret)
    .update(`flow-email-unsub:${body}`)
    .digest("base64url");
  return `${body}.${sig}`;
}

export function verifyEmailUnsubscribeToken(token: string): {
  accountId: string;
  userId: string;
  kind: EmailPreferenceKind;
} | null {
  const secret = process.env.FLOW_AUTH_SECRET?.trim();
  if (!secret || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret)
    .update(`flow-email-unsub:${body}`)
    .digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as { accountId?: unknown; userId?: unknown; kind?: unknown };
    if (
      typeof parsed.accountId === "string" &&
      typeof parsed.userId === "string" &&
      (parsed.kind === "newsletter" || parsed.kind === "transactions")
    ) {
      return {
        accountId: parsed.accountId,
        userId: parsed.userId,
        kind: parsed.kind,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildUnsubscribeUrl(params?: {
  accountId: string;
  userId: string;
  kind: EmailPreferenceKind;
}): string | null {
  if (!params) return null;
  const token = signEmailUnsubscribeToken(params);
  if (!token) return null;
  return `${APP_BASE_URL}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}

function wrapFlowEmailShell(options: {
  preheader: string;
  headerBadge: string;
  bodyHtml: string;
  unsubscribeUrl?: string | null;
  unsubscribeLabel?: string;
}): string {
  const settingsUrl = `${APP_BASE_URL}/security`;
  const logoUrl = `${APP_BASE_URL}/assets/flow-symbol-white.png`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FLOW</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:#0B0C0E;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(options.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F5F4;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;background-color:#FFFFFF;border-radius:22px;overflow:hidden;border:1px solid #E6E4DF;">
          <!-- Brand Header -->
          <tr>
            <td style="background-color:#0B0C0E;padding:22px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <a href="${APP_BASE_URL}" style="text-decoration:none;display:inline-flex;align-items:center;">
                      <img src="${logoUrl}" alt="FLOW" width="24" height="24" style="display:inline-block;vertical-align:middle;border:0;" />
                      <span style="margin-left:9px;font-size:16px;font-weight:700;letter-spacing:-0.02em;color:#FFFFFF;vertical-align:middle;">FLOW</span>
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background-color:rgba(255,255,255,0.10);color:#E5E7EB;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(options.headerBadge)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:30px 28px 28px;">
              ${options.bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid #EFECE6;background-color:#FAFAFA;">
              <p style="margin:0;font-size:12px;line-height:1.6;color:#6B7280;">
                FLOW · Multi-chain money across NEAR, Solana, Base, and Ethereum.
              </p>
              <p style="margin:6px 0 0;font-size:12px;line-height:1.6;color:#9CA3AF;">
                <a href="${settingsUrl}" style="color:#4B5563;text-decoration:underline;">Manage email settings</a>
                ${
                  options.unsubscribeUrl
                    ? ` &nbsp;·&nbsp; <a href="${options.unsubscribeUrl}" style="color:#4B5563;text-decoration:underline;">${escapeHtml(options.unsubscribeLabel ?? "Unsubscribe")}</a>`
                    : ""
                }
                &nbsp;·&nbsp; <a href="${APP_BASE_URL}/blog" style="color:#4B5563;text-decoration:underline;">FLOW Blog</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildWelcomeEmail(params: {
  displayName?: string | null;
}): { subject: string; html: string; text: string } {
  const firstName =
    params.displayName?.trim().split(/\s+/)[0] || "there";
  const openFlowUrl = `${APP_BASE_URL}/app`;
  const subject = "Welcome to FLOW — your multi-chain wallet is ready";

  const bodyHtml = `
    <h1 style="margin:0 0 10px;font-size:26px;font-weight:600;letter-spacing:-0.025em;line-height:1.2;color:#0B0C0E;">
      Welcome to FLOW, ${escapeHtml(firstName)}.
    </h1>
    <p style="margin:0 0 22px;font-size:15px;line-height:1.65;color:#4B5563;">
      Your non-custodial multi-chain account is set up and ready to go. One sign-in gives you real mainnet wallets across <strong>NEAR, Solana, Base, and Ethereum</strong> with zero seed phrases to juggle.
    </p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background-color:#F7F7F5;border-radius:16px;border:1px solid #ECEAE4;">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;">What you can do on FLOW</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="padding:0 0 11px;font-size:14px;line-height:1.55;color:#1F2937;">
                <strong style="color:#0B0C0E;">Send with @flow IDs</strong> — Claim your handle and share <span style="color:#FF1A1A;font-weight:600;">flow.devhub.forum/name@flow</span> so anyone can pay you without copying long wallet addresses.
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 11px;font-size:14px;line-height:1.55;color:#1F2937;">
                <strong style="color:#0B0C0E;">Move across chains</strong> — Send, receive, and convert between NEAR, Solana, Base, and Ethereum powered by NEAR Intents.
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 11px;font-size:14px;line-height:1.55;color:#1F2937;">
                <strong style="color:#0B0C0E;">Payment Links &amp; Receipts</strong> — Create shareable payment links for anything, attach memos, and get clean verified receipts automatically.
              </td>
            </tr>
            <tr>
              <td style="padding:0;font-size:14px;line-height:1.55;color:#1F2937;">
                <strong style="color:#0B0C0E;">Native Earn</strong> — Put idle NEAR and USDC to work directly on LiNEAR and Burrow from your own wallet.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
      <tr>
        <td style="border-radius:999px;background-color:#0B0C0E;">
          <a href="${openFlowUrl}" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;">
            Open FLOW →
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;line-height:1.6;color:#6B7280;">
      Tip: Visit <strong>Settings → Notifications</strong> anytime to customize transaction receipt emails or subscribe to the FLOW Blog newsletter.
    </p>
  `;

  const html = wrapFlowEmailShell({
    preheader:
      "Your multi-chain wallet across NEAR, Solana, Base, and Ethereum is ready.",
    headerBadge: "Welcome",
    bodyHtml,
  });

  const text = [
    `Welcome to FLOW, ${firstName}.`,
    "",
    "Your non-custodial multi-chain account is set up and ready across NEAR, Solana, Base, and Ethereum.",
    "",
    "What you can do on FLOW:",
    "- Send with @flow IDs and your direct payment link (flow.devhub.forum/name@flow)",
    "- Send, receive, and convert across chains powered by NEAR Intents",
    "- Create Payment Links, attach memos, and get instant receipts",
    "- Earn native yield on NEAR and USDC directly from your wallet",
    "",
    `Open FLOW: ${openFlowUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export interface TransactionReceiptEmailParams {
  readonly accountId: string;
  readonly userId: string;
  readonly recipientEmail: string;
  readonly jobId: string;
  readonly publicId: string;
  readonly jobKind: "SEND" | "CONVERT";
  readonly sourceAmountDisplay: string;
  readonly sourceSymbol: string;
  readonly sourceNetwork: string;
  readonly destinationAmountDisplay?: string | null;
  readonly destinationSymbol: string;
  readonly destinationNetwork: string;
  readonly senderLabel: string;
  readonly recipientLabel: string;
  readonly memo?: string | null;
  readonly txHash?: string | null;
  readonly settledAt?: Date | string;
}

export function buildTransactionReceiptEmail(
  params: TransactionReceiptEmailParams,
): { subject: string; html: string; text: string } {
  const srcAmt = formatEmailAmount(params.sourceAmountDisplay, 4);
  const dstAmt = formatEmailAmount(
    params.destinationAmountDisplay ?? params.sourceAmountDisplay,
    4,
  );
  const isConvert = params.jobKind === "CONVERT";
  const isCrossChain =
    params.sourceNetwork !== params.destinationNetwork ||
    params.sourceSymbol !== params.destinationSymbol;

  const subject = isConvert
    ? `FLOW Receipt: Converted ${srcAmt} ${params.sourceSymbol} to ${dstAmt} ${params.destinationSymbol}`
    : `FLOW Receipt: Sent ${srcAmt} ${params.sourceSymbol}`;

  const settledDate = params.settledAt
    ? new Date(params.settledAt)
    : new Date();
  const formattedTime = Number.isNaN(settledDate.getTime())
    ? new Date().toUTCString()
    : settledDate.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      });

  const networkDisplay =
    params.sourceNetwork === params.destinationNetwork
      ? formatNetworkLabel(params.sourceNetwork)
      : `${formatNetworkLabel(params.sourceNetwork)} → ${formatNetworkLabel(params.destinationNetwork)}`;

  const explorerLink = explorerUrlForTx(
    params.destinationNetwork,
    params.txHash ?? null,
  );
  const unsubscribeUrl = buildUnsubscribeUrl({
    accountId: params.accountId,
    userId: params.userId,
    kind: "transactions",
  });

  const rows: Array<[string, string]> = [
    ["Type", isConvert ? "Convert & Bridge" : isCrossChain ? "Cross-chain Send" : "Direct Send"],
    ["From", shortenAddress(params.senderLabel)],
    ["To", shortenAddress(params.recipientLabel)],
    ...(isCrossChain
      ? [["Delivered", `${dstAmt} ${params.destinationSymbol}`] as [string, string]]
      : []),
    ...(params.memo?.trim()
      ? [["Memo", params.memo.trim()] as [string, string]]
      : []),
    ["Network", networkDisplay],
    ["Reference", params.publicId],
    ["Settled", formattedTime],
  ];

  const rowsHtml = rows
    .map(
      ([label, val], idx) => `
      <tr>
        <td style="padding:10px 0;${idx > 0 ? "border-top:1px solid #ECEAE4;" : ""}font-size:13px;color:#6B7280;vertical-align:top;width:36%;">${escapeHtml(label)}</td>
        <td align="right" style="padding:10px 0;${idx > 0 ? "border-top:1px solid #ECEAE4;" : ""}font-size:13px;font-weight:600;color:#0B0C0E;vertical-align:top;word-break:break-word;">${escapeHtml(val)}</td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    <div style="margin:0 0 14px;">
      <span style="display:inline-block;padding:5px 11px;border-radius:999px;background-color:#ECFDF5;border:1px solid #A7F3D0;color:#047857;font-size:11.5px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">
        Completed ✓
      </span>
    </div>

    <p style="margin:0 0 4px;font-size:13px;font-weight:500;color:#6B7280;">
      ${isConvert ? "Amount converted" : "Amount sent"}
    </p>
    <h1 style="margin:0 0 6px;font-size:34px;font-weight:600;letter-spacing:-0.03em;line-height:1.1;color:#0B0C0E;">
      ${escapeHtml(srcAmt)} ${escapeHtml(params.sourceSymbol)}
    </h1>
    ${
      isCrossChain
        ? `<p style="margin:0 0 22px;font-size:14px;color:#4B5563;">Delivered <strong style="color:#0B0C0E;">${escapeHtml(dstAmt)} ${escapeHtml(params.destinationSymbol)}</strong> via NEAR Intents</p>`
        : `<p style="margin:0 0 22px;font-size:14px;color:#4B5563;">Confirmed on ${escapeHtml(formatNetworkLabel(params.sourceNetwork))}</p>`
    }

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background-color:#F7F7F5;border-radius:16px;border:1px solid #ECEAE4;">
      <tr>
        <td style="padding:8px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${rowsHtml}
          </table>
        </td>
      </tr>
    </table>

    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="border-radius:999px;background-color:#0B0C0E;">
          <a href="${APP_BASE_URL}/app" style="display:inline-block;padding:12px 22px;font-size:13.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;">
            Open FLOW
          </a>
        </td>
        ${
          explorerLink
            ? `<td style="width:10px;"></td>
               <td style="border-radius:999px;border:1px solid #D6D3CD;background-color:#FFFFFF;">
                 <a href="${explorerLink}" style="display:inline-block;padding:11px 20px;font-size:13.5px;font-weight:600;color:#0B0C0E;text-decoration:none;border-radius:999px;">
                   View on explorer →
                 </a>
               </td>`
            : ""
        }
      </tr>
    </table>
  `;

  const html = wrapFlowEmailShell({
    preheader: `${subject} (${params.publicId})`,
    headerBadge: "Receipt",
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Turn off receipt emails",
  });

  const text = [
    subject,
    "Status: Completed",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(explorerLink ? [`Explorer: ${explorerLink}`] : []),
    "",
    `Open FLOW: ${APP_BASE_URL}/app`,
    ...(unsubscribeUrl ? [`Turn off receipt emails: ${unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject, html, text };
}

export function buildBlogNewsletterEmail(params: {
  post: BlogPost;
  accountId: string;
  userId: string;
  displayName?: string | null;
}): { subject: string; html: string; text: string } {
  const { post } = params;
  const articleUrl = `${APP_BASE_URL}/blog/${post.slug}`;
  const bannerUrl = `${APP_BASE_URL}${post.ogImage}`;
  const unsubscribeUrl = buildUnsubscribeUrl({
    accountId: params.accountId,
    userId: params.userId,
    kind: "newsletter",
  });
  const subject = `FLOW Blog: ${post.title}`;

  const highlightsHtml = post.highlights
    .map(
      (item, idx) => `
      <tr>
        <td style="padding:9px 0;${idx > 0 ? "border-top:1px solid #ECEAE4;" : ""}font-size:12.5px;color:#6B7280;width:38%;">${escapeHtml(item.label)}</td>
        <td align="right" style="padding:9px 0;${idx > 0 ? "border-top:1px solid #ECEAE4;" : ""}font-size:13px;font-weight:600;color:#0B0C0E;word-break:break-word;">${escapeHtml(item.value)}</td>
      </tr>`,
    )
    .join("");

  const leadParagraph = post.sections[0]?.paragraphs[0] ?? "";

  const bodyHtml = `
    <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6B7280;">
      <span style="color:#FF1A1A;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(post.category)}</span>
      &nbsp;·&nbsp; ${escapeHtml(formatBlogDate(post.publishedAt))}
      &nbsp;·&nbsp; ${escapeHtml(post.readTime)}
    </p>

    <h1 style="margin:0 0 12px;font-size:25px;font-weight:600;letter-spacing:-0.025em;line-height:1.2;color:#0B0C0E;">
      ${escapeHtml(post.title)}
    </h1>

    <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#4B5563;">
      ${escapeHtml(post.summary)}
    </p>

    <a href="${articleUrl}" style="display:block;margin:0 0 22px;border-radius:14px;overflow:hidden;border:1px solid #E6E4DF;text-decoration:none;">
      <img src="${bannerUrl}" alt="${escapeHtml(post.title)}" width="524" style="display:block;width:100%;height:auto;border:0;" />
    </a>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background-color:#F7F7F5;border-radius:14px;border:1px solid #ECEAE4;">
      <tr>
        <td style="padding:6px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            ${highlightsHtml}
          </table>
        </td>
      </tr>
    </table>

    ${
      leadParagraph
        ? `<p style="margin:0 0 24px;font-size:14.5px;line-height:1.65;color:#374151;">${escapeHtml(leadParagraph)}</p>`
        : ""
    }

    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="border-radius:999px;background-color:#0B0C0E;">
          <a href="${articleUrl}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:999px;">
            Read full article →
          </a>
        </td>
      </tr>
    </table>
  `;

  const html = wrapFlowEmailShell({
    preheader: post.summary,
    headerBadge: "Newsletter",
    bodyHtml,
    unsubscribeUrl,
    unsubscribeLabel: "Unsubscribe from newsletter",
  });

  const text = [
    `FLOW Blog · ${post.category} · ${formatBlogDate(post.publishedAt)}`,
    "",
    post.title,
    "",
    post.summary,
    "",
    ...post.highlights.map((h) => `${h.label}: ${h.value}`),
    "",
    `Read full article: ${articleUrl}`,
    ...(unsubscribeUrl ? [`Unsubscribe: ${unsubscribeUrl}`] : []),
  ].join("\n");

  return { subject, html, text };
}

async function deliverViaResend(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl?: string | null;
}): Promise<{ ok: boolean; providerMessageId?: string }> {
  const cfg = resolveMailerConfig();
  if (!cfg) {
    return { ok: false };
  }
  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    };
    const body: Record<string, unknown> = {
      from: cfg.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    };
    if (params.unsubscribeUrl) {
      body.headers = {
        "List-Unsubscribe": `<${params.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
      headers,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const payload: unknown = await res.json().catch(() => undefined);
      const id =
        payload &&
        typeof payload === "object" &&
        "id" in payload &&
        typeof payload.id === "string"
          ? payload.id
          : undefined;
      return { ok: true, providerMessageId: id };
    }
    await res.body?.cancel();
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

async function sendDedupedEmail(
  db: FlowDb,
  params: {
    dedupeKey: string;
    kind: "WELCOME" | "TX_RECEIPT" | "BLOG_NEWSLETTER";
    userId: string;
    accountId: string;
    to: string;
    subject: string;
    html: string;
    text: string;
    unsubscribeUrl?: string | null;
  },
): Promise<boolean> {
  if (!resolveMailerConfig()) return false;
  try {
    const [claim] = await db.$queryRaw<Array<{ claimed: boolean }>>`
      SELECT flow.claim_email_delivery(
        ${params.dedupeKey}::text,
        ${params.kind}::text,
        ${params.userId}::uuid,
        ${params.accountId}::uuid,
        ${params.to}::text,
        ${params.subject}::text
      ) AS claimed
    `;
    if (!claim?.claimed) {
      return false;
    }

    const result = await deliverViaResend({
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      unsubscribeUrl: params.unsubscribeUrl,
    });

    if (result.ok) {
      if (result.providerMessageId) {
        await db.$executeRaw`
          SELECT flow.mark_email_delivery_sent(
            ${params.dedupeKey}::text,
            ${result.providerMessageId}::text
          )
        `.catch(() => {});
      }
      log("info", "flow_email_sent", {
        kind: params.kind,
        dedupeKey: params.dedupeKey,
        providerMessageId: result.providerMessageId ?? null,
      });
      return true;
    }

    await db.$executeRaw`
      SELECT flow.release_email_delivery_claim(${params.dedupeKey}::text)
    `.catch(() => {});
    log("error", "flow_email_failed", {
      kind: params.kind,
      dedupeKey: params.dedupeKey,
    });
    return false;
  } catch (error: unknown) {
    log("error", "flow_email_error", {
      kind: params.kind,
      dedupeKey: params.dedupeKey,
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    return false;
  }
}

export async function sendWelcomeEmailIfEligible(
  db: FlowDb,
  params: {
    userId: string;
    accountId: string;
    email: string;
    displayName?: string | null;
  },
): Promise<boolean> {
  const email = params.email.trim();
  if (!email) return false;
  const tpl = buildWelcomeEmail({ displayName: params.displayName });
  return sendDedupedEmail(db, {
    dedupeKey: `welcome:${params.userId}`,
    kind: "WELCOME",
    userId: params.userId,
    accountId: params.accountId,
    to: email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
  });
}

export async function sendSettledOutgoingReceiptEmail(
  db: FlowDb,
  jobId: string,
): Promise<boolean> {
  if (!resolveMailerConfig()) return false;
  try {
    const [job] = await db.$queryRaw<
      Array<{
        id: string;
        public_id: string;
        account_id: string;
        job_kind: "SEND" | "CONVERT";
        source_network: string;
        source_asset_symbol: string;
        source_decimals: number;
        source_atomic_amount: string;
        destination_network: string;
        destination_asset_symbol: string;
        destination_decimals: number;
        expected_destination_atomic_amount: string | null;
        recipient_address: string;
        source_tx_hash: string | null;
        destination_tx_hash: string | null;
        provider_quote_payload: Record<string, unknown> | null;
        settled_at: Date | null;
      }>
    >`
      SELECT
        id,
        public_id,
        account_id,
        job_kind,
        source_network,
        source_asset_symbol,
        source_decimals,
        source_atomic_amount,
        destination_network,
        destination_asset_symbol,
        destination_decimals,
        expected_destination_atomic_amount,
        recipient_address,
        source_tx_hash,
        destination_tx_hash,
        provider_quote_payload,
        settled_at
      FROM flow.get_settled_outgoing_job_for_email(${jobId}::uuid)
    `;
    if (!job) return false;

    // Skip internal Earn protocol contract operations from send receipts
    const payload = job.provider_quote_payload ?? {};
    const userMemo =
      typeof payload.userMemo === "string" ? payload.userMemo : null;
    if (userMemo && userMemo.startsWith("earn:")) return false;

    const [target] = await db.$queryRaw<
      Array<{
        user_id: string;
        email: string;
        display_name: string;
        flow_id: string | null;
        email_transactions: boolean;
      }>
    >`
      SELECT user_id, email, display_name, flow_id, email_transactions
      FROM flow.get_account_tx_email_target(${job.account_id}::uuid)
    `;
    if (!target || !target.email || !target.email_transactions) {
      return false;
    }

    const { formatAtomicToDisplay } = await import(
      "../../domain/atomic-amounts.ts"
    );
    const principalAtomic =
      typeof payload.principalAtomicAmount === "string"
        ? payload.principalAtomicAmount
        : job.source_atomic_amount;
    const sourceDisplay = formatAtomicToDisplay(
      principalAtomic,
      job.source_decimals,
    );
    const destDisplay = job.expected_destination_atomic_amount
      ? formatAtomicToDisplay(
          job.expected_destination_atomic_amount,
          job.destination_decimals,
        )
      : sourceDisplay;

    const recipientLabel =
      typeof payload.recipientLabel === "string" && payload.recipientLabel
        ? payload.recipientLabel
        : job.job_kind === "CONVERT"
          ? target.flow_id || "Your FLOW wallet"
          : job.recipient_address;
    const senderLabel = target.flow_id || target.display_name || "Your FLOW wallet";

    const receiptParams: TransactionReceiptEmailParams = {
      accountId: job.account_id,
      userId: target.user_id,
      recipientEmail: target.email,
      jobId: job.id,
      publicId: job.public_id,
      jobKind: job.job_kind,
      sourceAmountDisplay: sourceDisplay,
      sourceSymbol: job.source_asset_symbol,
      sourceNetwork: job.source_network,
      destinationAmountDisplay: destDisplay,
      destinationSymbol: job.destination_asset_symbol,
      destinationNetwork: job.destination_network,
      senderLabel,
      recipientLabel,
      memo: userMemo,
      txHash: job.destination_tx_hash ?? job.source_tx_hash,
      settledAt: job.settled_at ?? new Date(),
    };

    const tpl = buildTransactionReceiptEmail(receiptParams);
    const unsubscribeUrl = buildUnsubscribeUrl({
      accountId: job.account_id,
      userId: target.user_id,
      kind: "transactions",
    });

    return sendDedupedEmail(db, {
      dedupeKey: `tx:${job.id}`,
      kind: "TX_RECEIPT",
      userId: target.user_id,
      accountId: job.account_id,
      to: target.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      unsubscribeUrl,
    });
  } catch (error: unknown) {
    log("error", "tx_receipt_email_dispatch_error", {
      jobId,
      reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
    });
    return false;
  }
}

export async function sendBlogNewsletterPostToUser(
  db: FlowDb,
  subscriber: {
    accountId: string;
    userId: string;
    email: string;
    displayName?: string | null;
  },
  post: BlogPost,
): Promise<boolean> {
  const tpl = buildBlogNewsletterEmail({
    post,
    accountId: subscriber.accountId,
    userId: subscriber.userId,
    displayName: subscriber.displayName,
  });
  const unsubscribeUrl = buildUnsubscribeUrl({
    accountId: subscriber.accountId,
    userId: subscriber.userId,
    kind: "newsletter",
  });

  return sendDedupedEmail(db, {
    dedupeKey: `blog:${post.slug}:${subscriber.userId}`,
    kind: "BLOG_NEWSLETTER",
    userId: subscriber.userId,
    accountId: subscriber.accountId,
    to: subscriber.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    unsubscribeUrl,
  });
}

/**
 * Dispatches a blog post (defaults to the latest post in BLOG_POSTS) to all
 * active verified users subscribed to the FLOW Blog newsletter (`email_newsletter = true`).
 * Strictly deduplicated per (slug, user_id) in `flow.email_deliveries`.
 */
export async function dispatchBlogNewsletterToSubscribers(
  db: FlowDb,
  slug?: string,
): Promise<{ postSlug: string | null; attempted: number; sent: number }> {
  if (!resolveMailerConfig()) {
    return { postSlug: null, attempted: 0, sent: 0 };
  }
  const post = slug ? getBlogPostBySlug(slug) : BLOG_POSTS[0];
  if (!post) {
    return { postSlug: null, attempted: 0, sent: 0 };
  }

  const subscribers = await db.$queryRaw<
    Array<{
      account_id: string;
      user_id: string;
      email: string;
      display_name: string | null;
    }>
  >`
    SELECT account_id, user_id, email, display_name
    FROM flow.list_newsletter_subscribers()
  `;

  let sent = 0;
  for (const sub of subscribers) {
    const ok = await sendBlogNewsletterPostToUser(
      db,
      {
        accountId: sub.account_id,
        userId: sub.user_id,
        email: sub.email,
        displayName: sub.display_name,
      },
      post,
    );
    if (ok) sent += 1;
  }

  return { postSlug: post.slug, attempted: subscribers.length, sent };
}
