"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AgentBrandIcon,
  AllAssistantsCluster,
  AntigravityIcon,
  ClaudeIcon,
  CodexIcon,
  CursorIcon,
  GrokIcon,
  inferAgentBrand,
  type AgentBrandId,
} from "./agent-icons.tsx";
import { FlowLogo } from "./flow-logo.tsx";
import { triggerHaptic } from "./haptics.ts";
import {
  ALL_MCP_NETWORKS,
  buildMcpClientConfigs,
  formatUsdCentsLabel,
  type McpNetworkKey,
} from "../domain/mcp-agents.ts";
import type { SerializedMcpAgentKey } from "../server/mcp-agent-keys-service.ts";

interface McpAgentsSectionProps {
  readonly accountId: string | null;
  readonly appBaseUrl: string;
  readonly initialKeys: readonly SerializedMcpAgentKey[];
  readonly showIssuedPasses?: boolean;
}

const NETWORK_SHORT: Record<McpNetworkKey, string> = {
  "near-mainnet": "NEAR",
  "solana-mainnet": "Solana",
  "base-mainnet": "Base",
  "ethereum-mainnet": "Ethereum",
};

type ClientTab = "url" | "claude" | "codex" | "antigravity" | "cursor";

const ASSISTANT_PRESETS: ReadonlyArray<{
  readonly id: AgentBrandId;
  readonly label: string;
  readonly defaultTab: ClientTab;
}> = [
  { id: "all", label: "All assistants", defaultTab: "url" },
  { id: "claude", label: "Claude", defaultTab: "claude" },
  { id: "codex", label: "Codex", defaultTab: "codex" },
  { id: "antigravity", label: "Antigravity", defaultTab: "antigravity" },
  { id: "grok", label: "Grok", defaultTab: "url" },
  { id: "cursor", label: "Cursor", defaultTab: "cursor" },
];

interface FormState {
  name: string;
  brand: AgentBrandId;
  defaultTab: ClientTab;
  canSend: boolean;
  maxTotalUsd: string;
  maxPerTxUsd: string;
  maxDailyUsd: string;
  canConvert: boolean;
  canCreatePaymentLinks: boolean;
  allowedNetworks: McpNetworkKey[];
  allowedRecipientsText: string;
  expiresInDays: string;
}

const DEFAULT_FORM: FormState = {
  name: "All assistants",
  brand: "all",
  defaultTab: "url",
  canSend: true,
  maxTotalUsd: "50",
  maxPerTxUsd: "10",
  maxDailyUsd: "25",
  canConvert: true,
  canCreatePaymentLinks: false,
  allowedNetworks: [...ALL_MCP_NETWORKS],
  allowedRecipientsText: "",
  expiresInDays: "",
};

function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  fallbackCopy(text);
  return Promise.resolve();
}

function fallbackCopy(text: string) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  } catch {
    // ignore
  }
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Not used yet";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatCompactUsdInput(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return "$0";
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function renderPresetIcon(id: AgentBrandId) {
  switch (id) {
    case "claude":
      return <ClaudeIcon size={26} />;
    case "codex":
      return <CodexIcon size={26} />;
    case "antigravity":
      return <AntigravityIcon size={26} />;
    case "grok":
      return <GrokIcon size={26} />;
    case "cursor":
      return <CursorIcon size={26} />;
    case "all":
    default:
      return (
        <span
          className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-950"
          aria-hidden="true"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="7" r="2.2" />
            <circle cx="7" cy="16.5" r="2.2" />
            <circle cx="17" cy="16.5" r="2.2" />
          </svg>
        </span>
      );
  }
}

function ReceiptBottomEdge() {
  return (
    <svg
      viewBox="0 0 360 20"
      preserveAspectRatio="none"
      className="w-full h-[18px] block text-[#ECEEF1] dark:text-[#1A1B1F]"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M0,0 L360,0 L360,5 Q348,20 336,5 Q324,20 312,5 Q300,20 288,5 Q276,20 264,5 Q252,20 240,5 Q228,20 216,5 Q204,20 192,5 Q180,20 168,5 Q156,20 144,5 Q132,20 120,5 Q108,20 96,5 Q84,20 72,5 Q60,20 48,5 Q36,20 24,5 Q12,20 0,5 Z"
      />
    </svg>
  );
}

export function McpAgentsSection({
  accountId,
  appBaseUrl,
  initialKeys,
  showIssuedPasses = true,
}: McpAgentsSectionProps) {
  const [mounted, setMounted] = useState(false);
  const [keys, setKeys] = useState<SerializedMcpAgentKey[]>([...initialKeys]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<SerializedMcpAgentKey | null>(
    null,
  );
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [createdSecret, setCreatedSecret] = useState<{
    key: SerializedMcpAgentKey;
    rawToken: string;
  } | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>("url");

  useEffect(() => {
    setMounted(true);
  }, []);

  const anyModalOpen = modalOpen || Boolean(createdSecret);

  useEffect(() => {
    if (!anyModalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) {
        if (modalOpen) setModalOpen(false);
        else if (createdSecret) setCreatedSecret(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anyModalOpen, createdSecret, modalOpen, submitting]);

  const triggerCopy = useCallback((id: string, value: string) => {
    triggerHaptic("light");
    void copyToClipboard(value);
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1800);
  }, []);

  const openIssueModal = () => {
    triggerHaptic("light");
    setEditingKey(null);
    setForm({ ...DEFAULT_FORM });
    setFormError(null);
    setShowAdvanced(false);
    setModalOpen(true);
  };

  const openEditModal = (k: SerializedMcpAgentKey) => {
    triggerHaptic("light");
    setEditingKey(k);
    setForm({
      name: k.name,
      brand: inferAgentBrand(k.name),
      defaultTab: "url",
      canSend: k.canSend,
      maxTotalUsd: String(k.maxTotalUsd),
      maxPerTxUsd: String(k.maxPerTxUsd),
      maxDailyUsd: k.maxDailyUsd !== null ? String(k.maxDailyUsd) : "",
      canConvert: k.canConvert,
      canCreatePaymentLinks: k.canCreatePaymentLinks,
      allowedNetworks: [...k.allowedNetworks],
      allowedRecipientsText: k.allowedRecipients.join(", "),
      expiresInDays: "",
    });
    setFormError(null);
    setShowAdvanced(k.allowedRecipients.length > 0);
    setModalOpen(true);
  };

  const toggleNetwork = (net: McpNetworkKey) => {
    setForm((prev) => {
      const exists = prev.allowedNetworks.includes(net);
      if (exists && prev.allowedNetworks.length === 1) return prev;
      return {
        ...prev,
        allowedNetworks: exists
          ? prev.allowedNetworks.filter((n) => n !== net)
          : [...prev.allowedNetworks, net],
      };
    });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId) return;
    setFormError(null);

    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setFormError("Enter a name for this assistant pass.");
      return;
    }

    const totalNum = form.canSend
      ? Number.parseFloat(form.maxTotalUsd || "0")
      : 0;
    const perTxNum = form.canSend
      ? Number.parseFloat(form.maxPerTxUsd || form.maxTotalUsd || "0")
      : 0;
    const dailyTrim = form.maxDailyUsd.trim();
    const dailyNum =
      form.canSend && dailyTrim !== "" ? Number.parseFloat(dailyTrim) : null;

    if (
      !Number.isFinite(totalNum) ||
      totalNum < 0 ||
      !Number.isFinite(perTxNum) ||
      perTxNum < 0 ||
      (dailyNum !== null && (!Number.isFinite(dailyNum) || dailyNum < 0))
    ) {
      setFormError("Spend limits must be valid USD amounts.");
      return;
    }

    if (form.canSend && totalNum <= 0) {
      setFormError(
        "Set a total spend cap above $0 to enable sending, or turn off Sending for read-only access.",
      );
      return;
    }

    const recipients = form.allowedRecipientsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const expTrim = form.expiresInDays.trim();
    const expiresInDays =
      expTrim !== "" ? Number.parseInt(expTrim, 10) : null;

    setSubmitting(true);
    try {
      if (editingKey) {
        const patchBody: Record<string, unknown> = {
          name: trimmedName,
          canSend: form.canSend,
          maxTotalUsd: totalNum,
          maxPerTxUsd: Math.min(perTxNum, totalNum),
          maxDailyUsd: dailyNum !== null ? Math.min(dailyNum, totalNum) : null,
          canConvert: form.canConvert,
          canCreatePaymentLinks: form.canCreatePaymentLinks,
          allowedNetworks: form.allowedNetworks,
          allowedRecipients: recipients,
        };
        if (expTrim !== "" && expiresInDays && expiresInDays > 0) {
          patchBody.expiresInDays = expiresInDays;
        }
        const res = await fetch(
          `/api/accounts/${accountId}/mcp-keys/${editingKey.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.key) {
          throw new Error(data?.detail || data?.error || "Update failed.");
        }
        setKeys((prev) =>
          prev.map((item) => (item.id === editingKey.id ? data.key : item)),
        );
        setModalOpen(false);
      } else {
        const res = await fetch(`/api/accounts/${accountId}/mcp-keys`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            canSend: form.canSend,
            maxTotalUsd: totalNum,
            maxPerTxUsd: Math.min(perTxNum, totalNum),
            maxDailyUsd: dailyNum !== null ? Math.min(dailyNum, totalNum) : null,
            canConvert: form.canConvert,
            canCreatePaymentLinks: form.canCreatePaymentLinks,
            allowedNetworks: form.allowedNetworks,
            allowedRecipients: recipients,
            expiresInDays:
              expiresInDays && Number.isFinite(expiresInDays) && expiresInDays > 0
                ? expiresInDays
                : null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.key || !data?.rawToken) {
          throw new Error(data?.detail || data?.error || "Could not issue pass.");
        }
        setKeys((prev) => [data.key as SerializedMcpAgentKey, ...prev]);
        setModalOpen(false);
        setClientTab(form.defaultTab);
        setCreatedSecret({
          key: data.key as SerializedMcpAgentKey,
          rawToken: data.rawToken as string,
        });
      }
      triggerHaptic("success");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not save pass settings.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    key: SerializedMcpAgentKey,
    nextStatus: "ACTIVE" | "PAUSED" | "REVOKED",
  ) => {
    if (!accountId) return;
    triggerHaptic("light");
    setBusyKeyId(key.id);
    setBannerError(null);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/mcp-keys/${key.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.key) {
        throw new Error(data?.detail || data?.error || "Status update failed.");
      }
      setKeys((prev) =>
        prev.map((item) => (item.id === key.id ? data.key : item)),
      );
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Could not update pass status.",
      );
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleDeleteKey = async (key: SerializedMcpAgentKey) => {
    if (!accountId) return;
    triggerHaptic("light");
    setBusyKeyId(key.id);
    setBannerError(null);
    try {
      const res = await fetch(
        `/api/accounts/${accountId}/mcp-keys/${key.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || data?.error || "Delete failed.");
      }
      setKeys((prev) => prev.filter((item) => item.id !== key.id));
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Could not delete pass.",
      );
    } finally {
      setBusyKeyId(null);
    }
  };

  const secretConfigs = useMemo(() => {
    if (!createdSecret) return null;
    return buildMcpClientConfigs({
      baseUrl: appBaseUrl,
      rawToken: createdSecret.rawToken,
    });
  }, [appBaseUrl, createdSecret]);

  const issueModalNode =
    mounted && modalOpen
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingKey ? "Edit assistant pass" : "Issue assistant pass"}
            className="fixed inset-0 z-[9999] overflow-y-auto bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            onClick={() => !submitting && setModalOpen(false)}
          >
            <div
              className="flow-anim-fade-up w-full max-w-[432px] my-auto py-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Crimson Thermal Printer Slot Bar */}
              <div className="h-3.5 w-full rounded-full bg-gradient-to-b from-[#FF2424] to-[#C41212] shadow-[0_6px_18px_rgba(255,26,26,0.28)]" />

              {/* Thermal Paper Sheet */}
              <div className="mx-2.5 -mt-1.5 relative drop-shadow-[0_24px_48px_rgba(0,0,0,0.3)]">
                <div className="bg-[#ECEEF1] dark:bg-[#1A1B1F] text-neutral-950 dark:text-white px-5 sm:px-6 pt-5 pb-6 shadow-[inset_0_10px_14px_-8px_rgba(0,0,0,0.22)]">
                  {/* Top Brand Strip */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-dashed border-neutral-300 dark:border-white/[0.12]">
                    <FlowLogo className="h-[17px] w-auto" />
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                        {editingKey ? "Edit Pass" : "Assistant Pass"}
                      </span>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setModalOpen(false)}
                        aria-label="Close modal"
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Centered Pass Summary Hero */}
                  <div className="py-4 text-center border-b border-dashed border-neutral-300 dark:border-white/[0.12]">
                    <div className="flex justify-center">
                      <AgentBrandIcon brand={form.brand} size={38} />
                    </div>
                    <h3 className="mt-2.5 text-[17px] font-semibold tracking-[-0.015em] text-neutral-950 dark:text-white">
                      {editingKey ? "Update pass limits" : "Issue assistant pass"}
                    </h3>
                    <p className="mt-1 font-mono text-[11px] tracking-wide text-neutral-500 dark:text-neutral-400 tabular-nums">
                      {form.canSend
                        ? `CAP ${formatCompactUsdInput(form.maxTotalUsd)} · MAX ${formatCompactUsdInput(form.maxPerTxUsd)}/TX${
                            form.maxDailyUsd.trim()
                              ? ` · 24H ${formatCompactUsdInput(form.maxDailyUsd)}`
                              : ""
                          }`
                        : "READ-ONLY WALLET ACCESS"}
                    </p>
                  </div>

                  {/* Receipt Line Items Form */}
                  <form
                    onSubmit={handleSubmitForm}
                    className="divide-y divide-dashed divide-neutral-300 dark:divide-white/[0.12]"
                  >
                    {/* Pass Name + Compact Assistant Icon Selector */}
                    <div className="py-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor="mcp-pass-name"
                          className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400"
                        >
                          Pass for
                        </label>
                        <div className="flex items-center gap-1.5">
                          {ASSISTANT_PRESETS.map((preset) => {
                            const selected = form.brand === preset.id;
                            return (
                              <button
                                key={preset.id}
                                type="button"
                                title={preset.label}
                                aria-label={preset.label}
                                onClick={() =>
                                  setForm((prev) => ({
                                    ...prev,
                                    brand: preset.id,
                                    name: preset.label,
                                    defaultTab: preset.defaultTab,
                                  }))
                                }
                                className={`rounded-full p-0.5 transition-all cursor-pointer ${
                                  selected
                                    ? "ring-2 ring-neutral-950 dark:ring-white scale-105"
                                    : "opacity-55 hover:opacity-100"
                                }`}
                              >
                                {renderPresetIcon(preset.id)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <input
                        id="mcp-pass-name"
                        type="text"
                        value={form.name}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            name: e.target.value,
                            brand: inferAgentBrand(e.target.value),
                          }))
                        }
                        maxLength={80}
                        placeholder="All assistants, Claude, Codex..."
                        className="w-full rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] px-3.5 py-2 text-[13px] font-medium text-neutral-950 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                      />
                    </div>

                    {/* Sending Allowance */}
                    <div className="py-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-neutral-950 dark:text-white">
                            Allow sending assets
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            Direct ($0 gas on NEAR) &amp; cross-chain NEAR Intents
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.canSend}
                          aria-label="Allow sending assets"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              canSend: !prev.canSend,
                              maxTotalUsd:
                                !prev.canSend && Number(prev.maxTotalUsd) <= 0
                                  ? "50"
                                  : prev.maxTotalUsd,
                              maxPerTxUsd:
                                !prev.canSend && Number(prev.maxPerTxUsd) <= 0
                                  ? "10"
                                  : prev.maxPerTxUsd,
                            }))
                          }
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            form.canSend
                              ? "bg-[#FF1A1A]"
                              : "bg-neutral-300 dark:bg-neutral-700"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                              form.canSend ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {form.canSend && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400 mb-1">
                              Total cap
                            </label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.maxTotalUsd}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    maxTotalUsd: e.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] pl-6 pr-2.5 py-2 text-xs font-mono font-semibold tabular-nums text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400 mb-1">
                              Max / tx
                            </label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={form.maxPerTxUsd}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    maxPerTxUsd: e.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] pl-6 pr-2.5 py-2 text-xs font-mono font-semibold tabular-nums text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold uppercase tracking-[0.06em] text-neutral-500 dark:text-neutral-400 mb-1">
                              24h cap
                            </label>
                            <div className="relative">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-neutral-400">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="None"
                                value={form.maxDailyUsd}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    maxDailyUsd: e.target.value,
                                  }))
                                }
                                className="w-full rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] pl-6 pr-2.5 py-2 text-xs font-mono font-semibold tabular-nums text-neutral-950 dark:text-white placeholder:font-sans placeholder:font-normal placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Additional Capabilities */}
                    <div className="py-3.5 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-neutral-950 dark:text-white">
                            Convert &amp; bridge
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            Swap inside your own wallet
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.canConvert}
                          aria-label="Convert and bridge"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              canConvert: !prev.canConvert,
                            }))
                          }
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            form.canConvert
                              ? "bg-[#FF1A1A]"
                              : "bg-neutral-300 dark:bg-neutral-700"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                              form.canConvert
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-semibold text-neutral-950 dark:text-white">
                            Payment links
                          </p>
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            Generate 0% FLOW checkout links
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={form.canCreatePaymentLinks}
                          aria-label="Payment links"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              canCreatePaymentLinks:
                                !prev.canCreatePaymentLinks,
                            }))
                          }
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                            form.canCreatePaymentLinks
                              ? "bg-[#FF1A1A]"
                              : "bg-neutral-300 dark:bg-neutral-700"
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                              form.canCreatePaymentLinks
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Allowed Networks */}
                    <div className="py-3.5 space-y-2">
                      <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 dark:text-neutral-400">
                        Allowed networks
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        {ALL_MCP_NETWORKS.map((net) => {
                          const checked = form.allowedNetworks.includes(net);
                          return (
                            <label
                              key={net}
                              className="flex items-center gap-2 rounded-xl border border-neutral-300/75 dark:border-white/[0.09] bg-white/70 dark:bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleNetwork(net)}
                                className="accent-neutral-950 dark:accent-white"
                              />
                              <span>{NETWORK_SHORT[net]}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Optional Allowlist & Expiry */}
                    <div className="py-3">
                      <button
                        type="button"
                        onClick={() => setShowAdvanced((v) => !v)}
                        className="text-[11.5px] font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        {showAdvanced ? "− Hide" : "+ Add"} recipient allowlist
                        or expiry
                      </button>
                      {showAdvanced && (
                        <div className="mt-2.5 space-y-2.5">
                          <div>
                            <label className="block text-[10.5px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                              Allowed recipients (optional, comma-separated)
                            </label>
                            <input
                              type="text"
                              value={form.allowedRecipientsText}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  allowedRecipientsText: e.target.value,
                                }))
                              }
                              placeholder="alex@flow, treasury.near"
                              className="w-full rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] px-3 py-2 text-xs text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10.5px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
                              Expiration
                            </label>
                            <select
                              value={form.expiresInDays}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  expiresInDays: e.target.value,
                                }))
                              }
                              className="w-full rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] px-3 py-2 text-xs text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-900 dark:focus:border-white"
                            >
                              <option value="">Never expires</option>
                              <option value="7">7 days</option>
                              <option value="30">30 days</option>
                              <option value="90">90 days</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Submit Footer Inside Thermal Paper */}
                    <div className="pt-4 space-y-2">
                      {formError && (
                        <p
                          role="alert"
                          className="text-center text-xs font-medium text-[#FF1A1A] dark:text-red-400 pb-1"
                        >
                          {formError}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full h-11 rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 text-[13px] font-semibold tracking-[-0.01em] hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 cursor-pointer shadow-xs"
                      >
                        {submitting
                          ? "Issuing..."
                          : editingKey
                            ? "Save pass changes"
                            : "Issue pass"}
                      </button>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => setModalOpen(false)}
                        className="w-full py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                      >
                        Cancel
                      </button>
                      <p className="pt-1 text-center font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                        flow.devhub.forum · revocable anytime
                      </p>
                    </div>
                  </form>
                </div>

                {/* Scalloped Torn Paper Bottom Edge */}
                <ReceiptBottomEdge />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const secretModalNode =
    mounted && createdSecret && secretConfigs
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Assistant pass issued"
            className="fixed inset-0 z-[9999] overflow-y-auto bg-black/45 dark:bg-black/65 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
            onClick={() => setCreatedSecret(null)}
          >
            <div
              className="flow-anim-fade-up w-full max-w-[468px] my-auto py-2"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Crimson Thermal Printer Slot Bar */}
              <div className="h-3.5 w-full rounded-full bg-gradient-to-b from-[#FF2424] to-[#C41212] shadow-[0_6px_18px_rgba(255,26,26,0.28)]" />

              {/* Thermal Paper Sheet */}
              <div className="mx-2.5 -mt-1.5 relative drop-shadow-[0_24px_48px_rgba(0,0,0,0.3)]">
                <div className="bg-[#ECEEF1] dark:bg-[#1A1B1F] text-neutral-950 dark:text-white px-5 sm:px-6 pt-5 pb-6 shadow-[inset_0_10px_14px_-8px_rgba(0,0,0,0.22)]">
                  {/* Top Brand Strip */}
                  <div className="flex items-center justify-between pb-3.5 border-b border-dashed border-neutral-300 dark:border-white/[0.12]">
                    <FlowLogo className="h-[17px] w-auto" />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-400">
                      Pass Issued
                    </span>
                  </div>

                  {/* Hero */}
                  <div className="py-4 text-center border-b border-dashed border-neutral-300 dark:border-white/[0.12]">
                    <div className="flex justify-center">
                      <AgentBrandIcon
                        brand={inferAgentBrand(createdSecret.key.name)}
                        size={38}
                      />
                    </div>
                    <h3 className="mt-2.5 text-[17px] font-semibold tracking-[-0.015em] text-neutral-950 dark:text-white">
                      {createdSecret.key.name}
                    </h3>
                    <p className="mt-1 font-mono text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                      {createdSecret.key.canSend &&
                      createdSecret.key.maxTotalUsdCents > 0
                        ? `CAP ${formatUsdCentsLabel(createdSecret.key.maxTotalUsdCents)} · MAX ${formatUsdCentsLabel(createdSecret.key.maxPerTxUsdCents)}/TX`
                        : "READ-ONLY"}
                    </p>
                    <p className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                      Save this pass now. Shown once for security.
                    </p>
                  </div>

                  {/* Clean Underline Tabs */}
                  <div className="pt-3.5 flex items-center gap-4 border-b border-dashed border-neutral-300 dark:border-white/[0.12] overflow-x-auto text-xs">
                    {(
                      [
                        { id: "url", label: "Direct URL" },
                        { id: "claude", label: "Claude" },
                        { id: "codex", label: "Codex" },
                        { id: "antigravity", label: "Antigravity" },
                        { id: "cursor", label: "Cursor" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setClientTab(tab.id)}
                        className={`pb-2.5 font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer ${
                          clientTab === tab.id
                            ? "border-neutral-950 dark:border-white text-neutral-950 dark:text-white"
                            : "border-transparent text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Credentials Body */}
                  <div className="py-4">
                    {clientTab === "url" ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
                              Single-paste MCP URL
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                triggerCopy(
                                  "secret-url",
                                  secretConfigs.tokenizedUrl,
                                )
                              }
                              className="text-xs font-semibold text-neutral-950 dark:text-white hover:underline cursor-pointer"
                            >
                              {copiedId === "secret-url" ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <p className="font-mono text-[11px] break-all text-neutral-900 dark:text-neutral-100 select-all">
                            {secretConfigs.tokenizedUrl}
                          </p>
                        </div>

                        <div className="rounded-xl border border-neutral-300/80 dark:border-white/[0.1] bg-white/85 dark:bg-white/[0.05] p-3.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-neutral-500">
                              Bearer token
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                triggerCopy(
                                  "secret-token",
                                  createdSecret.rawToken,
                                )
                              }
                              className="text-xs font-semibold text-neutral-950 dark:text-white hover:underline cursor-pointer"
                            >
                              {copiedId === "secret-token" ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <p className="font-mono text-[11px] break-all text-neutral-900 dark:text-neutral-100 select-all">
                            {createdSecret.rawToken}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-neutral-950 text-neutral-100 p-4 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-neutral-400">
                            {clientTab === "claude"
                              ? "Claude Desktop / Claude Code"
                              : clientTab === "codex"
                                ? "~/.codex/config.toml"
                                : clientTab === "antigravity"
                                  ? "Antigravity mcp_config.json"
                                  : "Cursor .cursor/mcp.json"}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const snippet =
                                clientTab === "claude"
                                  ? secretConfigs.claudeJson
                                  : clientTab === "codex"
                                    ? secretConfigs.codexToml
                                    : clientTab === "antigravity"
                                      ? secretConfigs.antigravityJson
                                      : secretConfigs.cursorJson;
                              triggerCopy(`snippet-${clientTab}`, snippet);
                            }}
                            className="text-xs font-semibold text-white hover:underline cursor-pointer"
                          >
                            {copiedId === `snippet-${clientTab}`
                              ? "Copied"
                              : "Copy"}
                          </button>
                        </div>
                        <pre className="text-[11px] font-mono overflow-x-auto leading-relaxed text-emerald-300">
                          {clientTab === "claude"
                            ? secretConfigs.claudeJson
                            : clientTab === "codex"
                              ? secretConfigs.codexToml
                              : clientTab === "antigravity"
                                ? secretConfigs.antigravityJson
                                : secretConfigs.cursorJson}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Done Action */}
                  <div className="pt-3 border-t border-dashed border-neutral-300 dark:border-white/[0.12] space-y-2">
                    <button
                      type="button"
                      onClick={() => setCreatedSecret(null)}
                      className="w-full h-11 rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 text-[13px] font-semibold tracking-[-0.01em] hover:opacity-90 cursor-pointer shadow-xs"
                    >
                      Done
                    </button>
                    <p className="pt-1 text-center font-mono text-[10px] text-neutral-400 dark:text-neutral-500">
                      flow.devhub.forum · MCP Agent Pass
                    </p>
                  </div>
                </div>

                {/* Scalloped Torn Paper Bottom Edge */}
                <ReceiptBottomEdge />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm space-y-5">
      {/* Small, calm header matching Settings */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-tight text-neutral-950 dark:text-white">
            AI Agents &amp; MCP
          </h2>
          {!showIssuedPasses && (
            <Link
              href="/agents"
              className="shrink-0 text-xs font-medium text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
            >
              {keys.length > 0
                ? `Issued passes (${keys.length}) →`
                : "Manage passes →"}
            </Link>
          )}
        </div>
        <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          Let Claude, Codex, Antigravity, Grok, or any MCP assistant check
          balances, send direct or cross-chain NEAR Intents payments, and swap
          within your USD spend limit. Revocable any time.
        </p>
      </div>

      {/* Single "All assistants" row matching reference design */}
      <div className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.09] bg-[#FAF8F5]/60 dark:bg-white/[0.03] px-4 py-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <AllAssistantsCluster />
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-950 dark:text-white truncate">
              All assistants
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              One pass for every assistant without its own
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={!accountId}
          onClick={openIssueModal}
          className="shrink-0 rounded-full border border-neutral-200/90 dark:border-white/[0.14] bg-white dark:bg-[#1A1A1A] hover:bg-neutral-50 dark:hover:bg-white/[0.08] px-4 py-2 text-xs font-medium text-neutral-900 dark:text-white transition-colors disabled:opacity-40 cursor-pointer"
        >
          Issue pass
        </button>
      </div>

      {bannerError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-[#FF1A1A] dark:text-red-400"
        >
          {bannerError}
        </p>
      )}

      {/* Issued Passes List (shown only on the dedicated /agents MCP page) */}
      {showIssuedPasses && (
        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Issued passes ({keys.length})
            </p>
          </div>

          {keys.length === 0 ? (
            <p className="py-2 text-xs text-neutral-500 dark:text-neutral-400">
              No passes issued yet. Click Issue pass above to connect an AI
              assistant.
            </p>
          ) : (
            <div className="space-y-3">
            {keys.map((k) => {
              const effectiveStatus = k.isExpired ? "EXPIRED" : k.status;
              const spendPct =
                k.maxTotalUsdCents > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (k.spentTotalUsdCents / k.maxTotalUsdCents) * 100,
                      ),
                    )
                  : 0;
              const isBusy = busyKeyId === k.id;
              const brand = inferAgentBrand(k.name);

              const scopeParts: string[] = [];
              if (k.canSend && k.maxTotalUsdCents > 0) {
                scopeParts.push(
                  `Send (up to ${formatUsdCentsLabel(k.maxPerTxUsdCents)}/tx)`,
                );
              } else {
                scopeParts.push("Read-only");
              }
              if (k.canConvert) scopeParts.push("Convert");
              if (k.canCreatePaymentLinks) scopeParts.push("Payment links");
              const netSummary = k.allowedNetworks
                .map((n) => NETWORK_SHORT[n] ?? n)
                .join(", ");

              return (
                <div
                  key={k.id}
                  className="rounded-2xl border border-neutral-100 dark:border-neutral-800/90 bg-[#FAF8F5]/45 dark:bg-white/[0.02] p-4 space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <AgentBrandIcon brand={brand} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-neutral-950 dark:text-white truncate">
                            {k.name}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 shrink-0">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                effectiveStatus === "ACTIVE"
                                  ? "bg-emerald-500"
                                  : effectiveStatus === "PAUSED"
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                              }`}
                            />
                            {effectiveStatus === "ACTIVE"
                              ? "Active"
                              : effectiveStatus === "PAUSED"
                                ? "Paused"
                                : effectiveStatus === "EXPIRED"
                                  ? "Expired"
                                  : "Revoked"}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                          <span className="font-mono">{k.tokenPrefix}...</span>{" "}
                          · {scopeParts.join(" · ")} · {netSummary}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs shrink-0 pl-11 sm:pl-0">
                      {k.status !== "REVOKED" && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => openEditModal(k)}
                            className="font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleStatusChange(
                                k,
                                k.status === "ACTIVE" ? "PAUSED" : "ACTIVE",
                              )
                            }
                            className="font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                          >
                            {k.status === "ACTIVE" ? "Pause" : "Resume"}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleStatusChange(k, "REVOKED")
                            }
                            className="font-medium text-red-600 dark:text-red-400 hover:underline cursor-pointer"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleDeleteKey(k)}
                        className="font-medium text-neutral-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Minimal Spend Bar */}
                  {k.canSend && k.maxTotalUsdCents > 0 && (
                    <div className="space-y-1.5 pl-0 sm:pl-11">
                      <div className="flex items-center justify-between text-[11.5px] tabular-nums">
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {formatUsdCentsLabel(k.spentTotalUsdCents)} of{" "}
                          {formatUsdCentsLabel(k.maxTotalUsdCents)} spent
                          {k.maxDailyUsdCents !== null
                            ? ` · 24h: ${formatUsdCentsLabel(k.spent24hUsdCents)} / ${formatUsdCentsLabel(k.maxDailyUsdCents)}`
                            : ""}
                        </span>
                        <span className="text-neutral-400 dark:text-neutral-500">
                          {k.totalCalls} calls · {formatRelative(k.lastUsedAt)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-neutral-200/80 dark:bg-white/[0.08] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            spendPct >= 90
                              ? "bg-[#FF1A1A]"
                              : spendPct >= 65
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                          style={{ width: `${spendPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {k.recentEvents.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800/80 pl-0 sm:pl-11 space-y-1">
                      {k.recentEvents.slice(0, 4).map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between gap-3 text-[11.5px] text-neutral-600 dark:text-neutral-400"
                        >
                          <span className="truncate font-mono">
                            {ev.operation === "SEND" ? "Sent" : "Converted"}{" "}
                            {ev.sourceDisplayAmount} {ev.sourceAssetSymbol}
                            {ev.operation === "CONVERT"
                              ? ` -> ${ev.destinationAssetSymbol}`
                              : ev.recipientLabel
                                ? ` -> ${ev.recipientLabel}`
                                : ""}
                          </span>
                          <span className="shrink-0 tabular-nums text-neutral-500">
                            {formatUsdCentsLabel(ev.usdCents)}
                            {ev.transferStatus
                              ? ` · ${ev.transferStatus.toLowerCase()}`
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {issueModalNode}
      {secretModalNode}
    </div>
  );
}
