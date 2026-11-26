"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { triggerHaptic } from "../../../components/haptics.ts";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import {
  ALL_MCP_NETWORKS,
  buildMcpClientConfigs,
  formatUsdCentsLabel,
  type McpNetworkKey,
} from "../../../domain/mcp-agents.ts";
import type { SerializedMcpAgentKey } from "../../../server/mcp-agent-keys-service.ts";

interface AgentsViewProps {
  readonly accountId: string | null;
  readonly flowId: string | null;
  readonly appBaseUrl: string;
  readonly initialKeys: readonly SerializedMcpAgentKey[];
  readonly userEmail: string;
  readonly userName?: string | null;
  readonly userAvatarUrl?: string | null;
  readonly profileId?: string;
}

const NETWORK_LABELS: Record<McpNetworkKey, { label: string; short: string }> = {
  "near-mainnet": { label: "NEAR ($0 gas)", short: "NEAR" },
  "solana-mainnet": { label: "Solana", short: "Solana" },
  "base-mainnet": { label: "Base", short: "Base" },
  "ethereum-mainnet": { label: "Ethereum", short: "Ethereum" },
};

const QUICK_NAMES = ["Claude Desktop", "Codex", "Antigravity", "Grok Bot"] as const;

type ClientTab = "url" | "claude" | "codex" | "antigravity" | "cursor";

interface FormState {
  name: string;
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
  name: "",
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
    return navigator.clipboard.writeText(text).catch(() => {
      fallbackCopy(text);
    });
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
  if (!iso) return "Never used";
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

function formatDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function AgentsView({
  accountId,
  flowId,
  appBaseUrl,
  initialKeys,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: AgentsViewProps) {
  const [keys, setKeys] = useState<SerializedMcpAgentKey[]>([...initialKeys]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  // Create / Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<SerializedMcpAgentKey | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Newly created secret credentials modal
  const [createdSecret, setCreatedSecret] = useState<{
    key: SerializedMcpAgentKey;
    rawToken: string;
  } | null>(null);
  const [clientTab, setClientTab] = useState<ClientTab>("url");

  const mcpEndpointUrl = `${appBaseUrl}/api/mcp`;

  const triggerCopy = useCallback((id: string, value: string) => {
    triggerHaptic("light");
    void copyToClipboard(value);
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1800);
  }, []);

  const refreshKeys = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/accounts/${accountId}/mcp-keys`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.keys)) {
        setKeys(data.keys as SerializedMcpAgentKey[]);
      }
    } catch {
      // ignore
    }
  }, [accountId]);

  const openCreateModal = () => {
    triggerHaptic("light");
    setEditingKey(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setShowAdvanced(false);
    setModalOpen(true);
  };

  const openEditModal = (k: SerializedMcpAgentKey) => {
    triggerHaptic("light");
    setEditingKey(k);
    setForm({
      name: k.name,
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

  const applyPreset = (preset: "readonly" | "everyday" | "power") => {
    triggerHaptic("light");
    if (preset === "readonly") {
      setForm((prev) => ({
        ...prev,
        canSend: false,
        maxTotalUsd: "0",
        maxPerTxUsd: "0",
        maxDailyUsd: "",
        canConvert: false,
        canCreatePaymentLinks: false,
      }));
    } else if (preset === "everyday") {
      setForm((prev) => ({
        ...prev,
        canSend: true,
        maxTotalUsd: "50",
        maxPerTxUsd: "10",
        maxDailyUsd: "25",
        canConvert: true,
        canCreatePaymentLinks: true,
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        canSend: true,
        maxTotalUsd: "250",
        maxPerTxUsd: "50",
        maxDailyUsd: "100",
        canConvert: true,
        canCreatePaymentLinks: true,
      }));
    }
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
      setFormError("Give this AI agent connection a name.");
      return;
    }

    const totalNum = form.canSend ? Number.parseFloat(form.maxTotalUsd || "0") : 0;
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
      setFormError("Spend limits must be valid non-negative USD numbers.");
      return;
    }

    if (form.canSend && totalNum <= 0) {
      setFormError(
        "Set a Total Spend Cap above $0 to allow sending, or turn off Send for Read-Only mode.",
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
          throw new Error(data?.detail || data?.error || "Failed to update agent link.");
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
          throw new Error(data?.detail || data?.error || "Failed to create MCP link.");
        }
        setKeys((prev) => [data.key as SerializedMcpAgentKey, ...prev]);
        setModalOpen(false);
        setClientTab("url");
        setCreatedSecret({
          key: data.key as SerializedMcpAgentKey,
          rawToken: data.rawToken as string,
        });
      }
      triggerHaptic("success");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not save agent configuration.",
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
      const res = await fetch(`/api/accounts/${accountId}/mcp-keys/${key.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.key) {
        throw new Error(data?.detail || data?.error || "Failed to update status.");
      }
      setKeys((prev) =>
        prev.map((item) => (item.id === key.id ? data.key : item)),
      );
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to update key status.",
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
      const res = await fetch(`/api/accounts/${accountId}/mcp-keys/${key.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || data?.error || "Failed to delete agent link.");
      }
      setKeys((prev) => prev.filter((item) => item.id !== key.id));
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : "Failed to delete agent link.",
      );
    } finally {
      setBusyKeyId(null);
    }
  };

  const activeCount = useMemo(
    () => keys.filter((k) => k.status === "ACTIVE" && !k.isExpired).length,
    [keys],
  );

  const secretConfigs = useMemo(() => {
    if (!createdSecret) return null;
    return buildMcpClientConfigs({
      baseUrl: appBaseUrl,
      rawToken: createdSecret.rawToken,
    });
  }, [appBaseUrl, createdSecret]);

  const backHref = accountId ? "/app" : "/accounts";

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold tracking-tight text-neutral-950 dark:text-white">
              AI Agents (MCP)
            </span>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live MCP Server
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={backHref}
              aria-label="Back to Wallet"
              title="Back to Wallet"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-neutral-800 dark:text-neutral-100 transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </Link>
            <Link href="/security" aria-label="Settings">
              <UserAvatar
                name={userName || userEmail}
                email={userEmail}
                fallbackImage={userAvatarUrl}
                profileId={profileId}
                size={30}
              />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        {/* Hero Card */}
        <section className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
            <div className="space-y-2.5 max-w-xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF1A1A]">
                Model Context Protocol
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-950 dark:text-white">
                Connect AI agents to your FLOW wallet
              </h1>
              <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Create a scoped MCP link for{" "}
                <strong className="font-semibold text-neutral-900 dark:text-neutral-100">
                  Claude, Codex, Antigravity, Grok, Cursor
                </strong>
                , or any AI agent. Agents can check balances, send direct or
                cross-chain NEAR Intents payments, and swap inside your wallet,
                bounded strictly by the USD spend limit you set.
              </p>
            </div>

            <button
              type="button"
              disabled={!accountId}
              onClick={openCreateModal}
              className="shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-5 py-3 text-sm font-semibold shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create MCP Link</span>
            </button>
          </div>

          {/* Endpoint + Stats Bar */}
          <div className="mt-6 pt-5 border-t border-neutral-100 dark:border-white/[0.07] grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/60 dark:border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  MCP Server Endpoint (Streamable HTTP)
                </p>
                <p className="mt-0.5 font-mono text-xs sm:text-[13px] font-semibold text-neutral-900 dark:text-white truncate">
                  {mcpEndpointUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => triggerCopy("base-endpoint", mcpEndpointUrl)}
                className="shrink-0 rounded-full border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                {copiedId === "base-endpoint" ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/60 dark:border-white/[0.07] px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Active Agents
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-neutral-950 dark:text-white">
                  {activeCount}{" "}
                  <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {flowId ? `· ${flowId}` : ""}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshKeys()}
                aria-label="Refresh agent connections"
                title="Refresh"
                className="h-8 w-8 rounded-full border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#1A1A1A] flex items-center justify-center text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
            </div>
          </div>

          {/* Supported Capabilities Chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
            <span className="rounded-full bg-neutral-100 dark:bg-white/[0.06] px-2.5 py-1">
              Direct Sends ($0 Gas on NEAR)
            </span>
            <span className="rounded-full bg-neutral-100 dark:bg-white/[0.06] px-2.5 py-1">
              Cross-Chain via NEAR Intents
            </span>
            <span className="rounded-full bg-neutral-100 dark:bg-white/[0.06] px-2.5 py-1">
              Atomic USD Spend Caps
            </span>
            <span className="rounded-full bg-neutral-100 dark:bg-white/[0.06] px-2.5 py-1">
              Instant Kill Switch
            </span>
          </div>
        </section>

        {bannerError && (
          <div
            role="alert"
            className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs font-medium text-[#FF1A1A] dark:text-red-400"
          >
            {bannerError}
          </div>
        )}

        {/* Agent Keys List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display text-base font-bold text-neutral-950 dark:text-white">
              Your Agent Connections
            </h2>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
              {keys.length} {keys.length === 1 ? "link" : "links"}
            </span>
          </div>

          {keys.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-neutral-300/80 dark:border-white/[0.12] bg-white/70 dark:bg-[#141414]/70 p-10 text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-neutral-100 dark:bg-white/[0.06] flex items-center justify-center text-neutral-600 dark:text-neutral-300">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              </div>
              <p className="font-display text-base font-semibold text-neutral-950 dark:text-white">
                No AI agents connected yet
              </p>
              <p className="text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 max-w-md mx-auto">
                Create an MCP link with a custom USD allowance to let Claude,
                Codex, Antigravity, or Grok pay addresses, send to @flow IDs, or
                bridge via NEAR Intents.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  disabled={!accountId}
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-5 py-2.5 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Create your first MCP link
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
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

                return (
                  <div
                    key={k.id}
                    className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 sm:p-6 shadow-sm space-y-4"
                  >
                    {/* Top Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-base font-bold text-neutral-950 dark:text-white truncate">
                            {k.name}
                          </h3>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                              effectiveStatus === "ACTIVE"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : effectiveStatus === "PAUSED"
                                  ? "bg-amber-500/12 text-amber-700 dark:text-amber-400"
                                  : "bg-red-500/10 text-red-700 dark:text-red-400"
                            }`}
                          >
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
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-neutral-500 dark:text-neutral-400">
                          <span className="font-mono">{k.tokenPrefix}••••</span>
                          <span>·</span>
                          <span>
                            {k.totalCalls.toLocaleString()} calls
                          </span>
                          <span>·</span>
                          <span>{formatRelative(k.lastUsedAt)}</span>
                          {k.expiresAt && (
                            <>
                              <span>·</span>
                              <span>Expires {formatDate(k.expiresAt)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {k.status !== "REVOKED" && (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openEditModal(k)}
                              className="rounded-full border border-neutral-200 dark:border-white/[0.12] px-3.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              Edit limits
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
                              className="rounded-full border border-neutral-200 dark:border-white/[0.12] px-3.5 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
                            >
                              {k.status === "ACTIVE" ? "Pause" : "Resume"}
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleStatusChange(k, "REVOKED")}
                              className="rounded-full border border-red-200 dark:border-red-900/40 bg-red-50/70 dark:bg-red-950/20 px-3.5 py-1.5 text-xs font-semibold text-[#FF1A1A] dark:text-red-400 hover:bg-red-100/70 transition-colors cursor-pointer"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDeleteKey(k)}
                          aria-label="Delete agent link"
                          title="Delete"
                          className="h-8 w-8 rounded-full border border-neutral-200 dark:border-white/[0.12] flex items-center justify-center text-neutral-500 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.1"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Spend Allowance Meter */}
                    {k.canSend && k.maxTotalUsdCents > 0 ? (
                      <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/60 dark:border-white/[0.06] p-4 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                            Send Spend Allowance
                          </span>
                          <span className="font-mono font-bold tabular-nums text-neutral-950 dark:text-white">
                            {formatUsdCentsLabel(k.spentTotalUsdCents)}{" "}
                            <span className="font-normal text-neutral-500">
                              / {formatUsdCentsLabel(k.maxTotalUsdCents)} used
                            </span>
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-neutral-200/80 dark:bg-white/[0.08] overflow-hidden">
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
                          <span>
                            Remaining:{" "}
                            <strong className="text-neutral-900 dark:text-neutral-100">
                              {formatUsdCentsLabel(k.remainingTotalUsdCents)}
                            </strong>
                          </span>
                          <span>
                            Max / tx:{" "}
                            <strong className="text-neutral-900 dark:text-neutral-100">
                              {formatUsdCentsLabel(k.maxPerTxUsdCents)}
                            </strong>
                          </span>
                          {k.maxDailyUsdCents !== null && (
                            <span>
                              24h:{" "}
                              <strong className="text-neutral-900 dark:text-neutral-100">
                                {formatUsdCentsLabel(k.spent24hUsdCents)} /{" "}
                                {formatUsdCentsLabel(k.maxDailyUsdCents)}
                              </strong>
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/60 dark:border-white/[0.06] px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400">
                        External Send disabled (Read-Only spend cap: $0.00).
                      </div>
                    )}

                    {/* Permission & Network Pills */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      <span className="rounded-full bg-neutral-100 dark:bg-white/[0.07] text-neutral-700 dark:text-neutral-300 px-2.5 py-1">
                        Read Balances
                      </span>
                      {k.canSend && k.maxTotalUsdCents > 0 && (
                        <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2.5 py-1">
                          Send (Direct + NEAR Intents)
                        </span>
                      )}
                      {k.canConvert && (
                        <span className="rounded-full bg-sky-500/10 text-sky-700 dark:text-sky-400 px-2.5 py-1">
                          Convert / Bridge (Own Wallet)
                        </span>
                      )}
                      {k.canCreatePaymentLinks && (
                        <span className="rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 px-2.5 py-1">
                          Payment Links
                        </span>
                      )}
                      <span className="text-neutral-300 dark:text-neutral-700">
                        |
                      </span>
                      {k.allowedNetworks.map((net) => (
                        <span
                          key={net}
                          className="rounded-full border border-neutral-200/80 dark:border-white/[0.1] px-2.5 py-0.5 text-[10.5px] font-medium text-neutral-600 dark:text-neutral-400"
                        >
                          {NETWORK_LABELS[net]?.short ?? net}
                        </span>
                      ))}
                      {k.allowedRecipients.length > 0 && (
                        <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 text-[10.5px]">
                          {k.allowedRecipients.length} allowed{" "}
                          {k.allowedRecipients.length === 1
                            ? "recipient"
                            : "recipients"}
                        </span>
                      )}
                    </div>

                    {/* Recent Agent Spend Activity */}
                    {k.recentEvents.length > 0 && (
                      <div className="pt-3 border-t border-neutral-100 dark:border-white/[0.06] space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                          Recent Agent Actions
                        </p>
                        <div className="space-y-1.5">
                          {k.recentEvents.slice(0, 5).map((ev) => (
                            <div
                              key={ev.id}
                              className="flex items-center justify-between gap-3 text-xs py-1"
                            >
                              <div className="min-w-0 flex items-center gap-2">
                                <span
                                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                                    ev.operation === "SEND"
                                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-950"
                                      : "bg-sky-500/15 text-sky-700 dark:text-sky-400"
                                  }`}
                                >
                                  {ev.operation}
                                </span>
                                <span className="font-mono font-semibold text-neutral-900 dark:text-white truncate">
                                  {ev.sourceDisplayAmount} {ev.sourceAssetSymbol}
                                  {ev.operation === "CONVERT"
                                    ? ` -> ${ev.destinationAssetSymbol}`
                                    : ev.recipientLabel
                                      ? ` -> ${ev.recipientLabel}`
                                      : ""}
                                </span>
                              </div>
                              <div className="shrink-0 flex items-center gap-2.5 text-[11px] tabular-nums">
                                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                                  {formatUsdCentsLabel(ev.usdCents)}
                                </span>
                                {ev.transferStatus && (
                                  <span
                                    className={`font-semibold ${
                                      ev.transferStatus === "SETTLED"
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : ev.transferStatus === "FAILED" ||
                                            ev.transferStatus === "REFUNDED"
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-amber-600 dark:text-amber-400"
                                    }`}
                                  >
                                    {ev.transferStatus}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ================================================================= */}
      {/* CREATE / EDIT MCP AGENT LINK MODAL                                */}
      {/* ================================================================= */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => !submitting && setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-neutral-200/80 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-xl font-bold text-neutral-950 dark:text-white">
                  {editingKey ? "Edit Agent Limits" : "Create MCP Agent Link"}
                </h2>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Choose exactly how much this AI agent can move from your FLOW
                  wallet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setModalOpen(false)}
                aria-label="Close"
                className="h-8 w-8 rounded-full bg-neutral-100 dark:bg-white/[0.08] flex items-center justify-center text-neutral-600 dark:text-neutral-300 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-5">
              {/* Agent Name */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g. Claude Desktop, Codex, Antigravity"
                  maxLength={80}
                  className="w-full rounded-2xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-4 py-3 text-sm text-neutral-950 dark:text-white placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#FF1A1A]/30"
                />
                {!editingKey && (
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_NAMES.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({ ...prev, name: preset }))
                        }
                        className="rounded-full bg-neutral-100 dark:bg-white/[0.07] hover:bg-neutral-200/80 dark:hover:bg-white/[0.12] px-2.5 py-1 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Allowance Presets */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Quick Spend Presets
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset("readonly")}
                    className="rounded-2xl border border-neutral-200 dark:border-white/[0.1] bg-[#FAF8F5] dark:bg-white/[0.04] p-2.5 text-left hover:border-neutral-400 dark:hover:border-white/30 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      Read-Only
                    </p>
                    <p className="text-[10.5px] text-neutral-500">$0 spend</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("everyday")}
                    className="rounded-2xl border border-neutral-200 dark:border-white/[0.1] bg-[#FAF8F5] dark:bg-white/[0.04] p-2.5 text-left hover:border-neutral-400 dark:hover:border-white/30 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      Everyday
                    </p>
                    <p className="text-[10.5px] text-neutral-500">
                      $50 cap · $10/tx
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset("power")}
                    className="rounded-2xl border border-neutral-200 dark:border-white/[0.1] bg-[#FAF8F5] dark:bg-white/[0.04] p-2.5 text-left hover:border-neutral-400 dark:hover:border-white/30 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      Power
                    </p>
                    <p className="text-[10.5px] text-neutral-500">
                      $250 cap · $50/tx
                    </p>
                  </button>
                </div>
              </div>

              {/* Send Permission + USD Caps */}
              <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      Allow Sending Assets
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Direct transfers ($0 gas on NEAR) &amp; cross-chain sends
                      via NEAR Intents.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.canSend}
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
                        : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                        form.canSend ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {form.canSend && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                        Total Spend Cap ($)
                      </label>
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3 py-2 text-sm font-mono font-semibold text-neutral-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                        Max Per Send ($)
                      </label>
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3 py-2 text-sm font-mono font-semibold text-neutral-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 mb-1">
                        24h Limit ($ opt.)
                      </label>
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3 py-2 text-sm font-mono font-semibold text-neutral-950 dark:text-white placeholder:font-sans placeholder:font-normal placeholder:text-neutral-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Separate Convert / Bridge & Payment Links Toggles */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] p-4">
                  <div>
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      Allow Convert &amp; Bridge (Own Wallet)
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Swap or bridge between your own chains via NEAR Intents.
                      Does not consume your external Send cap.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.canConvert}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        canConvert: !prev.canConvert,
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      form.canConvert
                        ? "bg-[#FF1A1A]"
                        : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                        form.canConvert ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] p-4">
                  <div>
                    <p className="text-xs font-bold text-neutral-950 dark:text-white">
                      Allow Creating Payment Links
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Let the agent generate shareable 0% FLOW checkout links.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form.canCreatePaymentLinks}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        canCreatePaymentLinks: !prev.canCreatePaymentLinks,
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      form.canCreatePaymentLinks
                        ? "bg-[#FF1A1A]"
                        : "bg-neutral-200 dark:bg-neutral-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                        form.canCreatePaymentLinks
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Allowed Chains */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                  Allowed Chains
                </span>
                <div className="flex flex-wrap gap-2">
                  {ALL_MCP_NETWORKS.map((net) => {
                    const active = form.allowedNetworks.includes(net);
                    return (
                      <button
                        key={net}
                        type="button"
                        onClick={() => toggleNetwork(net)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                          active
                            ? "bg-neutral-950 text-white dark:bg-white dark:text-neutral-950"
                            : "border border-neutral-200 dark:border-white/[0.12] text-neutral-600 dark:text-neutral-400"
                        }`}
                      >
                        {NETWORK_LABELS[net].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional Advanced Controls */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                >
                  {showAdvanced ? "− Hide" : "+ Add"} recipient allowlist or
                  expiry
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-3 rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] p-4 border border-neutral-200/60 dark:border-white/[0.07]">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Allowed Recipients (optional, comma-separated)
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
                        placeholder="alex@flow, treasury.near (blank = any valid recipient)"
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141414] px-3 py-2 text-xs text-neutral-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141414] px-3 py-2 text-xs text-neutral-950 dark:text-white"
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

              {formError && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-3.5 py-2.5 text-xs font-medium text-[#FF1A1A] dark:text-red-400"
                >
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setModalOpen(false)}
                  className="rounded-full px-4 py-2.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-6 py-2.5 text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  {submitting
                    ? "Saving..."
                    : editingKey
                      ? "Save Changes"
                      : "Generate MCP Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ONE-TIME CREATED CREDENTIALS & CLIENT CONFIG MODAL                */}
      {/* ================================================================= */}
      {createdSecret && secretConfigs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-3xl border border-neutral-200/80 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-2xl my-auto max-h-[92vh] overflow-y-auto space-y-5">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                MCP Link Ready
              </span>
              <h2 className="mt-2 font-display text-xl font-bold text-neutral-950 dark:text-white">
                Connect {createdSecret.key.name}
              </h2>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 font-medium">
                Copy and save your link or token now. For your security, the
                secret token will not be shown again after you close this window.
              </p>
            </div>

            {/* Client Tabs */}
            <div className="flex flex-wrap gap-1.5 rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] p-1.5">
              {(
                [
                  { id: "url", label: "Direct URL / Grok" },
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
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                    clientTab === tab.id
                      ? "bg-white dark:bg-[#222222] text-neutral-950 dark:text-white shadow-xs"
                      : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {clientTab === "url" ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/70 dark:border-white/[0.08] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                      Single-Paste MCP URL (No headers needed)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        triggerCopy("secret-url", secretConfigs.tokenizedUrl)
                      }
                      className="rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-3 py-1 text-[11px] font-semibold cursor-pointer"
                    >
                      {copiedId === "secret-url" ? "Copied" : "Copy URL"}
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all text-neutral-900 dark:text-neutral-100 select-all">
                    {secretConfigs.tokenizedUrl}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/70 dark:border-white/[0.08] p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                      Bearer Token (for {secretConfigs.endpointUrl})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        triggerCopy("secret-token", createdSecret.rawToken)
                      }
                      className="rounded-full border border-neutral-300 dark:border-white/[0.15] px-3 py-1 text-[11px] font-semibold text-neutral-900 dark:text-white cursor-pointer"
                    >
                      {copiedId === "secret-token" ? "Copied" : "Copy Token"}
                    </button>
                  </div>
                  <p className="font-mono text-xs break-all text-neutral-900 dark:text-neutral-100 select-all">
                    {createdSecret.rawToken}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-neutral-950 text-neutral-100 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-neutral-400">
                    {clientTab === "claude"
                      ? "Claude Desktop / Claude Code MCP JSON"
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
                    className="rounded-full bg-white text-neutral-950 px-3 py-1 text-[11px] font-semibold cursor-pointer"
                  >
                    {copiedId === `snippet-${clientTab}` ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="text-[11.5px] font-mono overflow-x-auto leading-relaxed text-emerald-300">
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

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setCreatedSecret(null)}
                className="rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-6 py-2.5 text-xs font-semibold cursor-pointer"
              >
                I saved my link
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
