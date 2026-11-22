"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SerializedWalletActivityRecord } from "../domain/activities.ts";
import { FlowLogo } from "./flow-logo.tsx";

function truncateMiddle(value: string, head = 8, tail = 6): string {
  if (!value || value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatNetworkName(network: string): string {
  const n = network.toLowerCase();
  if (n.includes("near")) return "NEAR";
  if (n.includes("solana")) return "Solana";
  if (n.includes("base")) return "Base";
  if (n.includes("ethereum") || n === "1") return "Ethereum";
  return network;
}

function formatReceiptDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const time = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
  return `${weekday}, ${monthDay} • ${time}`;
}

function formatAmountDisplay(displayAmount: string): string {
  const num = Math.abs(Number.parseFloat(displayAmount));
  if (!Number.isFinite(num)) return displayAmount.replace(/^[-+]/, "");
  if (num === 0) return "0";
  if (num < 0.001) return "<0.001";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function resolveReceiptFields(activity: SerializedWalletActivityRecord) {
  const meta = (activity.metadata ?? {}) as Record<string, unknown>;
  const jobKind = typeof meta.jobKind === "string" ? meta.jobKind : null;
  const executionStatus =
    typeof meta.executionStatus === "string" ? meta.executionStatus : null;
  const memoRaw =
    (typeof meta.memo === "string" && meta.memo.trim()) ||
    (typeof meta.paymentTitle === "string" && meta.paymentTitle.trim()) ||
    (typeof meta.title === "string" && meta.title.trim()) ||
    (typeof meta.description === "string" && meta.description.trim()) ||
    null;
  const rawRecipientLabel =
    typeof meta.recipientLabel === "string" && meta.recipientLabel.trim()
      ? meta.recipientLabel.trim()
      : null;
  const flowIdMatch = rawRecipientLabel?.match(/\b([a-z0-9][a-z0-9._-]*@flow)\b/i);
  const recipientLabel = flowIdMatch ? flowIdMatch[1] : rawRecipientLabel;

  let typeLabel =
    activity.direction === "OUTGOING" ? "Transfer" : "Received";
  if (jobKind === "CONVERT") {
    typeLabel = "Convert & Bridge";
  } else if (
    activity.activityType === "FLOW_CROSS_CHAIN_SETTLEMENT" ||
    activity.activityType === "FLOW_PAYMENT"
  ) {
    typeLabel =
      activity.direction === "INCOMING"
        ? "Payment Link Settlement"
        : "Cross-chain Transfer";
  } else if (
    activity.toAddress === "linear-protocol.near" ||
    activity.fromAddress === "linear-protocol.near"
  ) {
    typeLabel =
      activity.direction === "OUTGOING" ? "Earn Deposit (LiNEAR)" : "Earn Claim (LiNEAR)";
  } else if (
    activity.toAddress === "contract.main.burrow.near" ||
    activity.fromAddress === "contract.main.burrow.near"
  ) {
    typeLabel =
      activity.direction === "OUTGOING" ? "Earn Deposit (Burrow)" : "Earn Withdraw (Burrow)";
  }

  const counterpartyLabel =
    activity.direction === "OUTGOING" ? "Sent to" : "Received from";
  const rawCounterparty =
    activity.direction === "OUTGOING"
      ? activity.toAddress
      : activity.fromAddress;
  const counterpartyValue =
    recipientLabel ||
    (rawCounterparty ? truncateMiddle(rawCounterparty, 10, 8) : "FLOW Wallet");

  const isFailed =
    executionStatus === "FAILED" ||
    executionStatus === "REFUNDED" ||
    executionStatus === "EXPIRED";
  const statusTone: "completed" | "failed" | "pending" = isFailed
    ? "failed"
    : activity.finality === "FINALIZED"
      ? "completed"
      : "pending";
  const statusLabel = isFailed
    ? executionStatus!.charAt(0) + executionStatus!.slice(1).toLowerCase()
    : activity.finality === "FINALIZED"
      ? "Completed"
      : activity.finality === "CONFIRMED"
        ? "Confirming"
        : "Pending";

  const statusColors =
    statusTone === "completed"
      ? {
          pillClass:
            "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
          bgHex: "rgba(16, 185, 129, 0.14)",
          textHex: "#047857",
        }
      : statusTone === "failed"
        ? {
            pillClass:
              "bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-400",
            bgHex: "rgba(239, 68, 68, 0.14)",
            textHex: "#B91C1C",
          }
        : {
            pillClass:
              "bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
            bgHex: "rgba(245, 158, 11, 0.16)",
            textHex: "#B45309",
          };

  const hasExplorerLink =
    activity.finality === "FINALIZED" &&
    Boolean(activity.explorerUrl) &&
    !activity.txHash.startsWith("snd_") &&
    !activity.txHash.startsWith("cnv_") &&
    !activity.txHash.startsWith("am_") &&
    !activity.txHash.startsWith("ern_");

  const isIncoming = activity.direction === "INCOMING";
  const directionSign = isIncoming ? "+" : "-";
  const formattedAmount = `${directionSign}${formatAmountDisplay(activity.displayAmount)} ${activity.assetSymbol}`;

  return {
    isIncoming,
    typeLabel,
    counterpartyLabel,
    counterpartyValue,
    rawCounterparty,
    memo: memoRaw,
    statusLabel,
    statusTone,
    statusColors,
    networkName: formatNetworkName(activity.network),
    formattedAmount,
    formattedDate: formatReceiptDate(
      activity.blockTimestamp || activity.observedAt,
    ),
    hasExplorerLink,
  };
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function renderReceiptPngBlob(
  activity: SerializedWalletActivityRecord,
): Promise<Blob | null> {
  const fields = resolveReceiptFields(activity);
  const rows: Array<{ label: string; value: string }> = [
    { label: "Type", value: fields.typeLabel },
    { label: fields.counterpartyLabel, value: fields.counterpartyValue },
    {
      label: "Amount",
      value: `${fields.formattedAmount} (${fields.networkName})`,
    },
  ];
  if (fields.memo) {
    rows.push({ label: "Memo", value: fields.memo });
  }
  rows.push({ label: "Status", value: fields.statusLabel });

  const W = 960;
  const rowH = 128;
  const paperTop = 104;
  const headerH = 250;
  const teethH = 38;
  const paperH = headerH + rows.length * rowH + 40;
  const H = paperTop + paperH + teethH + 110;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Clean white outer canvas
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Crimson printer slot bar
  const slotX = 56;
  const slotW = W - 112;
  const slotGrad = ctx.createLinearGradient(0, 82, 0, 114);
  slotGrad.addColorStop(0, "#FF1A1A");
  slotGrad.addColorStop(1, "#C41212");
  ctx.fillStyle = slotGrad;
  ctx.beginPath();
  ctx.roundRect(slotX, 82, slotW, 32, 16);
  ctx.fill();

  // Paper body with zigzag bottom edge
  const px = 76;
  const pw = W - 152;
  const teethCount = 10;
  const toothW = pw / teethCount;

  ctx.save();
  ctx.fillStyle = "#E8EAED";
  ctx.beginPath();
  ctx.moveTo(px, paperTop);
  ctx.lineTo(px + pw, paperTop);
  ctx.lineTo(px + pw, paperTop + paperH);
  for (let i = teethCount; i > 0; i--) {
    const rightX = px + i * toothW;
    const midX = rightX - toothW / 2;
    const leftX = rightX - toothW;
    ctx.quadraticCurveTo(
      rightX - toothW * 0.25,
      paperTop + paperH + teethH,
      midX,
      paperTop + paperH + teethH,
    );
    ctx.quadraticCurveTo(
      leftX + toothW * 0.25,
      paperTop + paperH + teethH,
      leftX,
      paperTop + paperH,
    );
  }
  ctx.closePath();
  ctx.fill();

  // Top inner shadow under slot
  const shadowGrad = ctx.createLinearGradient(0, paperTop, 0, paperTop + 26);
  shadowGrad.addColorStop(0, "rgba(0,0,0,0.14)");
  shadowGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shadowGrad;
  ctx.fillRect(px, paperTop, pw, 26);
  ctx.restore();

  // FLOW logo top-left
  const logoImg = await loadImage("/assets/flow-symbol.png");
  if (logoImg) {
    ctx.drawImage(logoImg, px + 44, paperTop + 42, 34, 34);
  }
  ctx.fillStyle = "#0B0C0E";
  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.textAlign = "left";
  ctx.fillText("FLOW", px + 88, paperTop + 69);

  // Top-right colored status pill
  const pillText = fields.statusLabel.toUpperCase();
  ctx.font = '700 18px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  const pillTextW = ctx.measureText(pillText).width;
  const pillW = pillTextW + 32;
  const pillH = 34;
  const pillX = px + pw - 44 - pillW;
  const pillY = paperTop + 42;
  ctx.fillStyle = fields.statusColors.bgHex;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 17);
  ctx.fill();
  ctx.fillStyle = fields.statusColors.textHex;
  ctx.textAlign = "center";
  ctx.fillText(pillText, pillX + pillW / 2, pillY + 23);

  // Centered Hero Amount
  ctx.fillStyle = fields.isIncoming ? "#059669" : "#0B0C0E";
  ctx.font = '700 54px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText(fields.formattedAmount, W / 2, paperTop + 178);

  // Centered Date
  ctx.fillStyle = "#5F636A";
  ctx.font = '500 23px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.fillText(fields.formattedDate, W / 2, paperTop + 220);

  // Dashed rows
  let y = paperTop + headerH + 36;
  ctx.textAlign = "left";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    ctx.fillStyle = "#6B6F76";
    ctx.font = '500 23px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
    ctx.fillText(row.label, px + 44, y);

    ctx.fillStyle =
      row.label === "Status" ? fields.statusColors.textHex : "#111214";
    ctx.font = '600 27px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
    const val = row.value.length > 44 ? `${row.value.slice(0, 41)}...` : row.value;
    ctx.fillText(val, px + 44, y + 40);

    if (i < rows.length - 1) {
      ctx.save();
      ctx.strokeStyle = "#C6C9CE";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(px + 44, y + 76);
      ctx.lineTo(px + pw - 44, y + 76);
      ctx.stroke();
      ctx.restore();
    }
    y += rowH;
  }

  // Footer
  ctx.fillStyle = "#8C9099";
  ctx.font = '500 19px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("flow.devhub.forum · Transaction Receipt", W / 2, H - 36);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function TransactionReceiptModal({
  activity,
  onClose,
}: {
  activity: SerializedWalletActivityRecord | null;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!activity) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activity, onClose]);

  if (!mounted || !activity) return null;

  const fields = resolveReceiptFields(activity);

  async function handleShareImage() {
    if (!activity) return;
    setSharingImage(true);
    try {
      const blob = await renderReceiptPngBlob(activity);
      if (!blob) return;
      const filename = `flow-receipt-${activity.txHash.slice(0, 10)}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          title: `FLOW Receipt · ${fields.formattedAmount}`,
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch {
      // user cancelled share sheet
    } finally {
      setSharingImage(false);
    }
  }

  function handleSharePdf() {
    if (!activity) return;
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    const rowsHtml = [
      { label: "Type", value: fields.typeLabel },
      { label: fields.counterpartyLabel, value: fields.counterpartyValue },
      {
        label: "Amount",
        value: `${fields.formattedAmount} (${fields.networkName})`,
      },
      ...(fields.memo ? [{ label: "Memo", value: fields.memo }] : []),
      { label: "Status", value: fields.statusLabel },
      { label: "Reference", value: truncateMiddle(activity.txHash, 14, 10) },
    ]
      .map(
        (r, idx, arr) => `
      <div style="padding:14px 0;${idx < arr.length - 1 ? "border-bottom:1.5px dashed #c6c9ce;" : ""}">
        <div style="font-size:12px;color:#6b6f76;margin-bottom:4px;">${escapeHtml(r.label)}</div>
        <div style="font-size:15px;font-weight:600;color:#0b0c0e;word-break:break-word;">${escapeHtml(r.value)}</div>
      </div>`,
      )
      .join("");

    const win = window.open("", "_blank", "width=480,height=720");
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>FLOW Receipt · ${escapeHtml(fields.formattedAmount)}</title>
  <style>
    @page { size: auto; margin: 16mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; background:#fff; margin:0; padding:24px; display:flex; justify-content:center; }
    .wrap { width: 380px; }
    .slot { height: 14px; border-radius: 999px; background: linear-gradient(180deg,#FF1A1A,#C41212); }
    .paper { margin: -4px 12px 0; background:#EBEDF0; padding:24px 24px 28px; border-radius:0 0 12px 12px; }
    .brand-row { display:flex; align-items:center; justify-content:space-between; }
    .brand { font-size:16px; font-weight:700; color:#0b0c0e; letter-spacing:-0.02em; }
    .pill { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:3px 9px; border-radius:999px; background:${fields.statusColors.bgHex}; color:${fields.statusColors.textHex}; }
    .hero { text-align:center; margin:20px 0 22px; }
    .amt { font-size:30px; font-weight:700; color:${fields.isIncoming ? "#059669" : "#0b0c0e"}; letter-spacing:-0.02em; }
    .date { font-size:12px; color:#5f636a; margin-top:4px; }
    .foot { text-align:center; font-size:11px; color:#8c9099; margin-top:18px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="slot"></div>
    <div class="paper">
      <div class="brand-row">
        <div class="brand">FLOW</div>
        <span class="pill">${escapeHtml(fields.statusLabel)}</span>
      </div>
      <div class="hero">
        <div class="amt">${escapeHtml(fields.formattedAmount)}</div>
        <div class="date">${escapeHtml(fields.formattedDate)}</div>
      </div>
      ${rowsHtml}
    </div>
    <div class="foot">flow.devhub.forum · Transaction Receipt</div>
  </div>
  <script>window.onload = () => { window.print(); };</script>
</body>
</html>`);
    win.document.close();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transaction receipt"
      className="fixed inset-0 z-[9999] overflow-y-auto bg-white/95 dark:bg-[#0B0C0E]/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] flex flex-col min-h-full justify-between py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Back Button */}
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs font-medium text-neutral-400">
            Transaction receipt
          </span>
          <div className="w-10" />
        </div>

        {/* Thermal Paper Receipt Card */}
        <div className="my-auto py-2">
          {/* Top Crimson Printer Slot Bar */}
          <div className="h-3.5 w-full rounded-full bg-gradient-to-b from-[#FF1A1A] to-[#C81414] shadow-sm" />

          {/* Paper Sheet */}
          <div className="mx-2.5 -mt-1.5 relative">
            <div className="bg-[#E9EBEE] dark:bg-[#1B1C20] px-6 pt-5 pb-6 shadow-[inset_0_10px_14px_-8px_rgba(0,0,0,0.18)]">
              {/* Brand */}
              <div className="flex items-center justify-between">
                <FlowLogo className="h-5 w-auto" />
                <span
                  className={`text-[10.5px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${fields.statusColors.pillClass}`}
                >
                  {fields.statusLabel}
                </span>
              </div>

              {/* Hero Amount & Date */}
              <div className="mt-6 mb-7 text-center">
                <p
                  className={`text-[28px] sm:text-[30px] font-bold tracking-tight tabular-nums leading-tight ${
                    fields.isIncoming
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-neutral-950 dark:text-white"
                  }`}
                >
                  {fields.formattedAmount}
                </p>
                <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {fields.formattedDate}
                </p>
              </div>

              {/* Dashed Detail Rows */}
              <div className="divide-y divide-dashed divide-neutral-300 dark:divide-white/[0.12]">
                <div className="py-3.5">
                  <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    Type
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-white">
                    {fields.typeLabel}
                  </p>
                </div>

                <div className="py-3.5">
                  <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    {fields.counterpartyLabel}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-white break-all">
                    {fields.counterpartyValue}
                  </p>
                </div>

                <div className="py-3.5">
                  <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                    Amount
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-white tabular-nums">
                    {fields.formattedAmount}{" "}
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 font-normal">
                      · {fields.networkName}
                    </span>
                  </p>
                </div>

                {fields.memo && (
                  <div className="py-3.5">
                    <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Memo
                    </p>
                    <p className="mt-1 text-sm font-medium text-neutral-950 dark:text-white break-words">
                      {fields.memo}
                    </p>
                  </div>
                )}

                <div className="py-3.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Reference
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(activity.txHash)
                          .then(() => {
                            setCopiedHash(true);
                            window.setTimeout(() => setCopiedHash(false), 1800);
                          });
                      }}
                      className="mt-1 text-xs font-mono text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      {copiedHash
                        ? "Copied hash"
                        : truncateMiddle(activity.txHash, 10, 8)}
                    </button>
                  </div>
                  {fields.hasExplorerLink && (
                    <a
                      href={activity.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[#FF1A1A] hover:underline shrink-0"
                    >
                      Explorer ↗
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Scalloped / Zigzag Torn Paper Bottom Edge */}
            <svg
              viewBox="0 0 360 22"
              preserveAspectRatio="none"
              className="w-full h-[20px] block text-[#E9EBEE] dark:text-[#1B1C20] drop-shadow-[0_6px_10px_rgba(0,0,0,0.06)]"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M0,0 L360,0 L360,6 Q348,22 336,6 Q324,22 312,6 Q300,22 288,6 Q276,22 264,6 Q252,22 240,6 Q228,22 216,6 Q204,22 192,6 Q180,22 168,6 Q156,22 144,6 Q132,22 120,6 Q108,22 96,6 Q84,22 72,6 Q60,22 48,6 Q36,22 24,6 Q12,22 0,6 Z"
              />
            </svg>
          </div>
        </div>

        {/* Bottom Share Actions (Matches Reference) */}
        <div className="grid grid-cols-2 gap-3 pt-6 pb-2">
          <button
            type="button"
            disabled={sharingImage}
            onClick={() => void handleShareImage()}
            className="h-12 rounded-2xl border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141518] text-sm font-medium text-neutral-950 dark:text-white hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
          >
            {sharingImage ? "Preparing…" : "Share as image"}
          </button>
          <button
            type="button"
            onClick={handleSharePdf}
            className="h-12 rounded-2xl border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141518] text-sm font-medium text-neutral-950 dark:text-white hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            Share as PDF
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
