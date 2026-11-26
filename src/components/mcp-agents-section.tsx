"use client";

import { useCallback, useMemo, useState } from "react";
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
}

const NETWORK_SHORT: Record<McpNetworkKey, string> = {
  "near-mainnet": "NEAR",
  "solana-mainnet": "Solana",
  "base-mainnet": "Base",
  "ethereum-mainnet": "Ethereum",
};

type ClientTab = "url" | "claude" | "codex" | "antigravity" | "cursor";

const ASSISTANT_CATALOG: ReadonlyArray<{
  readonly id: Exclude<AgentBrandId, "all">;
  readonly name: string;
  readonly subtitle: string;
  readonly defaultTab: ClientTab;
}> = [
  {
    id: "claude",
    name: "Claude",
    subtitle: "Claude Desktop & Claude Code",
    defaultTab: "claude",
  },
  {
    id: "codex",
    name: "Codex",
    subtitle: "OpenAI Codex & ChatGPT MCP",
    defaultTab: "codex",
  },
  {
    id: "antigravity",
    name: "Antigravity",
    subtitle: "Google Antigravity agent",
    defaultTab: "antigravity",
  },
  {
    id: "grok",
    name: "Grok",
    subtitle: "Grok bot & remote MCP URL",
    defaultTab: "url",
  },
  {
    id: "cursor",
    name: "Cursor",
    subtitle: "Cursor MCP editor agent",
    defaultTab: "cursor",
  },
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

function renderBrandIcon(id: Exclude<AgentBrandId, "all">) {
  switch (id) {
    case "claude":
      return <ClaudeIcon size={34} />;
    case "codex":
      return <CodexIcon size={34} />;
    case "antigravity":
      return <AntigravityIcon size={34} />;
    case "grok":
      return <GrokIcon size={34} />;
    case "cursor":
      return <CursorIcon size={34} />;
  }
}

export function McpAgentsSection({
  accountId,
  appBaseUrl,
  initialKeys,
}: McpAgentsSectionProps) {
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

  const mcpEndpointUrl = `${appBaseUrl.replace(/\/+$/, "")}/api/mcp`;

  const triggerCopy = useCallback((id: string, value: string) => {
    triggerHaptic("light");
    void copyToClipboard(value);
    setCopiedId(id);
    window.setTimeout(() => {
      setCopiedId((cur) => (cur === id ? null : cur));
    }, 1800);
  }, []);

  const openIssueModal = (opts?: {
    name?: string;
    brand?: AgentBrandId;
    defaultTab?: ClientTab;
  }) => {
    triggerHaptic("light");
    setEditingKey(null);
    setForm({
      ...DEFAULT_FORM,
      name: opts?.name ?? "All assistants",
      brand: opts?.brand ?? "all",
      defaultTab: opts?.defaultTab ?? "url",
    });
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
        "Set a total spend cap above $0 to enable sending, or turn off Send for read-only access.",
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

  return (
    <div className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800 bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-sm space-y-5">
      {/* Small, calm header matching Settings */}
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-neutral-950 dark:text-white">
          AI Agents &amp; MCP
        </h2>
        <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
          Let Claude, Codex, Antigravity, Grok, or any MCP assistant check
          balances, send direct or cross-chain NEAR Intents payments, and swap
          within your USD spend limit. Revocable any time.
        </p>
      </div>

      {/* Primary "All assistants" row matching reference design */}
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
          onClick={() =>
            openIssueModal({
              name: "All assistants",
              brand: "all",
              defaultTab: "url",
            })
          }
          className="shrink-0 rounded-full border border-neutral-200/90 dark:border-white/[0.14] bg-white dark:bg-[#1A1A1A] hover:bg-neutral-50 dark:hover:bg-white/[0.08] px-4 py-2 text-xs font-medium text-neutral-900 dark:text-white transition-colors disabled:opacity-40 cursor-pointer"
        >
          Issue pass
        </button>
      </div>

      {/* Individual Assistant Rows with real agent logos */}
      <div className="rounded-2xl border border-neutral-100 dark:border-neutral-800/90 divide-y divide-neutral-100 dark:divide-neutral-800/80">
        {ASSISTANT_CATALOG.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {renderBrandIcon(agent.id)}
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-neutral-950 dark:text-white truncate">
                  {agent.name}
                </p>
                <p className="text-[11.5px] text-neutral-500 dark:text-neutral-400 truncate">
                  {agent.subtitle}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={!accountId}
              onClick={() =>
                openIssueModal({
                  name: agent.name,
                  brand: agent.id,
                  defaultTab: agent.defaultTab,
                })
              }
              className="shrink-0 rounded-full border border-neutral-200/90 dark:border-white/[0.12] bg-white dark:bg-[#191919] hover:bg-neutral-50 dark:hover:bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-neutral-800 dark:text-neutral-200 transition-colors disabled:opacity-40 cursor-pointer"
            >
              Issue pass
            </button>
          </div>
        ))}
      </div>

      {/* Quiet MCP endpoint line (zero pills) */}
      <div className="flex items-center justify-between gap-3 pt-1 text-xs">
        <div className="min-w-0 flex items-center gap-2">
          <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
            Endpoint
          </span>
          <span className="font-mono text-[11.5px] text-neutral-700 dark:text-neutral-300 truncate">
            {mcpEndpointUrl}
          </span>
        </div>
        <button
          type="button"
          onClick={() => triggerCopy("mcp-endpoint", mcpEndpointUrl)}
          className="shrink-0 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
        >
          {copiedId === "mcp-endpoint" ? "Copied" : "Copy"}
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

      {/* Issued Passes List */}
      {keys.length > 0 && (
        <div className="pt-4 border-t border-neutral-100 dark:border-neutral-800 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
              Issued passes ({keys.length})
            </p>
          </div>

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
                          <span className="font-mono">{k.tokenPrefix}…</span> ·{" "}
                          {scopeParts.join(" · ")} · {netSummary}
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

                  {/* Minimal Spend Bar (plain text, zero pills) */}
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
        </div>
      )}

      {/* ================================================================= */}
      {/* ISSUE / EDIT PASS MODAL                                           */}
      {/* ================================================================= */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
          onClick={() => !submitting && setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-neutral-200/80 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <AgentBrandIcon brand={form.brand} size={34} />
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-neutral-950 dark:text-white truncate">
                    {editingKey ? "Edit pass limits" : "Issue assistant pass"}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Choose how much this agent can move from your wallet.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !submitting && setModalOpen(false)}
                aria-label="Close"
                className="h-7 w-7 rounded-full text-neutral-400 hover:text-neutral-800 dark:hover:text-white flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Pass name
                </label>
                <input
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
                  placeholder="e.g. Claude, Codex, All assistants"
                  className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3.5 py-2.5 text-sm text-neutral-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-neutral-900/15 dark:focus:ring-white/20"
                />
              </div>

              {/* Send Allowance */}
              <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-neutral-950 dark:text-white">
                      Allow sending assets
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Direct transfers ($0 gas on NEAR) and cross-chain NEAR
                      Intents sends.
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
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                        form.canSend ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {form.canSend && (
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
                        Total cap ($)
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3 py-2 text-xs font-mono font-medium text-neutral-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
                        Max / tx ($)
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3 py-2 text-xs font-mono font-medium text-neutral-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-500 dark:text-neutral-400 mb-1">
                        24h cap ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Optional"
                        value={form.maxDailyUsd}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            maxDailyUsd: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-[#FAF8F5] dark:bg-white/[0.04] px-3 py-2 text-xs font-mono font-medium text-neutral-950 dark:text-white placeholder:font-sans placeholder:text-neutral-400"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Separate Convert & Payment Link Toggles */}
              <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] divide-y divide-neutral-100 dark:divide-white/[0.06]">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <p className="text-xs font-medium text-neutral-950 dark:text-white">
                      Allow convert &amp; bridge
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Swap inside your own wallet. Separate from Send cap.
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
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                        form.canConvert ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 p-3.5">
                  <div>
                    <p className="text-xs font-medium text-neutral-950 dark:text-white">
                      Allow creating payment links
                    </p>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Generate shareable 0% FLOW checkout links.
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
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition ${
                        form.canCreatePaymentLinks
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Clean checkbox grid for allowed networks (no pills) */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Allowed networks
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_MCP_NETWORKS.map((net) => {
                    const checked = form.allowedNetworks.includes(net);
                    return (
                      <label
                        key={net}
                        className="flex items-center gap-2 rounded-xl border border-neutral-200/80 dark:border-white/[0.08] px-3 py-2 text-xs text-neutral-800 dark:text-neutral-200 cursor-pointer"
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

              {/* Optional recipient allowlist & expiry */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-medium text-neutral-500 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                >
                  {showAdvanced ? "Hide" : "Add"} recipient allowlist or expiry
                </button>
                {showAdvanced && (
                  <div className="mt-2.5 space-y-2.5 rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] p-3.5 border border-neutral-200/60 dark:border-white/[0.07]">
                    <div>
                      <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
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
                        className="w-full rounded-xl border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141414] px-3 py-2 text-xs text-neutral-950 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-neutral-600 dark:text-neutral-400 mb-1">
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
                  className="text-xs text-[#FF1A1A] dark:text-red-400"
                >
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setModalOpen(false)}
                  className="rounded-full px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-5 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer"
                >
                  {submitting
                    ? "Saving..."
                    : editingKey
                      ? "Save changes"
                      : "Issue pass"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* ONE-TIME PASS CREDENTIALS MODAL                                   */}
      {/* ================================================================= */}
      {createdSecret && secretConfigs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl border border-neutral-200/80 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto space-y-4">
            <div className="flex items-center gap-3">
              <AgentBrandIcon
                brand={inferAgentBrand(createdSecret.key.name)}
                size={36}
              />
              <div>
                <h3 className="text-[15px] font-semibold text-neutral-950 dark:text-white">
                  {createdSecret.key.name} pass issued
                </h3>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Save this link or token now. It is only shown once.
                </p>
              </div>
            </div>

            {/* Clean Underline Tabs (no pills) */}
            <div className="flex items-center gap-4 border-b border-neutral-100 dark:border-white/[0.08] overflow-x-auto text-xs">
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
                      : "border-transparent text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {clientTab === "url" ? (
              <div className="space-y-3">
                <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/70 dark:border-white/[0.08] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-neutral-500">
                      Single-paste MCP URL
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        triggerCopy("secret-url", secretConfigs.tokenizedUrl)
                      }
                      className="text-xs font-medium text-neutral-900 dark:text-white hover:underline cursor-pointer"
                    >
                      {copiedId === "secret-url" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="font-mono text-[11.5px] break-all text-neutral-900 dark:text-neutral-100 select-all">
                    {secretConfigs.tokenizedUrl}
                  </p>
                </div>

                <div className="rounded-2xl bg-[#FAF8F5] dark:bg-white/[0.04] border border-neutral-200/70 dark:border-white/[0.08] p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-neutral-500">
                      Bearer token (for {secretConfigs.endpointUrl})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        triggerCopy("secret-token", createdSecret.rawToken)
                      }
                      className="text-xs font-medium text-neutral-900 dark:text-white hover:underline cursor-pointer"
                    >
                      {copiedId === "secret-token" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="font-mono text-[11.5px] break-all text-neutral-900 dark:text-neutral-100 select-all">
                    {createdSecret.rawToken}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-neutral-950 text-neutral-100 p-4 space-y-2">
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
                    className="text-xs font-medium text-white hover:underline cursor-pointer"
                  >
                    {copiedId === `snippet-${clientTab}` ? "Copied" : "Copy"}
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

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setCreatedSecret(null)}
                className="rounded-full bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 px-5 py-2 text-xs font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
