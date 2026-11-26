"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { MotionNumber, MotionReveal } from "../../../components/motion.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import { triggerHaptic } from "../../../components/haptics.ts";

export interface AdminGasSponsorSnapshot {
  readonly accountId: string;
  readonly balanceNear: number | null;
  readonly balanceUsd: number | null;
  readonly estimatedTxsRemaining: number | null;
  readonly status: "healthy" | "low" | "critical" | "unavailable";
}

export interface AdminAnalyticsSnapshot {
  readonly totalUsers: number;
  readonly activeWallets: number;
  readonly totalAccounts: number;
  readonly movedInUsd: number;
  readonly movedOutUsd: number;
  readonly netFlowUsd: number;
  readonly gasSponsor: AdminGasSponsorSnapshot;
  readonly asOf: string;
}

function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

interface AnalyticsViewProps {
  initialAnalytics: AdminAnalyticsSnapshot;
  primaryAccountId: string | null;
  userEmail: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  profileId?: string;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function AnalyticsView({
  initialAnalytics,
  primaryAccountId,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: AnalyticsViewProps) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedSponsor, setCopiedSponsor] = useState(false);

  const handleCopySponsor = useCallback(() => {
    const addr = analytics.gasSponsor?.accountId;
    if (!addr) return;
    triggerHaptic("light");
    const fallbackCopy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = addr;
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
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(addr).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
    setCopiedSponsor(true);
    window.setTimeout(() => setCopiedSponsor(false), 1800);
  }, [analytics.gasSponsor?.accountId]);

  const handleRefresh = useCallback(async () => {
    triggerHaptic("light");
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/analytics", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.analytics) {
        throw new Error("Could not refresh analytics.");
      }
      setAnalytics(data.analytics);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not refresh analytics.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  const backHref = primaryAccountId
    ? "/app"
    : "/accounts";

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-50">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center">
            <span className="text-base font-bold tracking-tight text-neutral-950 dark:text-white">
              Analytics
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
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </Link>
            <UserAvatar
              name={userName || userEmail}
              email={userEmail}
              fallbackImage={userAvatarUrl}
              profileId={profileId}
              size={30}
            />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <MotionReveal className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-neutral-500 dark:text-neutral-400 mb-2">
              Platform Totals Only
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              FLOW Analytics
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
              Aggregate user count and settled USD volume across all mainnet
              accounts. No personal user data is collected or shown here.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flow-press self-start sm:self-auto px-4 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 disabled:opacity-50 transition-all cursor-pointer"
          >
            {refreshing ? "Refreshing..." : "Refresh Totals"}
          </button>
        </MotionReveal>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        <MotionReveal className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-3xl bg-white dark:bg-[#111214] border border-neutral-200/70 dark:border-white/[0.08] p-6 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              People on FLOW
            </div>
            <div className="mt-3 text-4xl font-bold tracking-tight tabular-nums">
              <MotionNumber
                value={analytics.totalUsers}
                format={(n) => Math.round(n).toLocaleString("en-US")}
              />
            </div>
            <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              {analytics.activeWallets.toLocaleString("en-US")} active mainnet{" "}
              {analytics.activeWallets === 1 ? "wallet" : "wallets"} ·{" "}
              {analytics.totalAccounts.toLocaleString("en-US")}{" "}
              {analytics.totalAccounts === 1 ? "account" : "accounts"}
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#111214] border border-neutral-200/70 dark:border-white/[0.08] p-6 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Moved In (USD)
            </div>
            <div className="mt-3 text-4xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
              <MotionNumber
                value={analytics.movedInUsd}
                format={(n) => formatUsd(n)}
              />
            </div>
            <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Canonical inbound deposits across all accounts
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-[#111214] border border-neutral-200/70 dark:border-white/[0.08] p-6 shadow-xs">
            <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Moved Out (USD)
            </div>
            <div className="mt-3 text-4xl font-bold tracking-tight tabular-nums">
              <MotionNumber
                value={analytics.movedOutUsd}
                format={(n) => formatUsd(n)}
              />
            </div>
            <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Net flow:{" "}
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                {formatUsd(analytics.netFlowUsd)}
              </span>
            </div>
          </div>

          {/* Live NEAR Gas Sponsor Balance Box */}
          <div
            className={`rounded-3xl bg-white dark:bg-[#111214] border p-6 shadow-xs ${
              analytics.gasSponsor.status === "critical"
                ? "border-red-300 dark:border-red-500/40"
                : analytics.gasSponsor.status === "low"
                  ? "border-amber-300 dark:border-amber-500/35"
                  : "border-neutral-200/70 dark:border-white/[0.08]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                NEAR Gas Balance
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                <span
                  className={`h-2 w-2 rounded-full ${
                    analytics.gasSponsor.status === "healthy"
                      ? "bg-emerald-500"
                      : analytics.gasSponsor.status === "low"
                        ? "bg-amber-500"
                        : analytics.gasSponsor.status === "critical"
                          ? "bg-[#FF1A1A]"
                          : "bg-neutral-400"
                  }`}
                />
                <span
                  className={
                    analytics.gasSponsor.status === "healthy"
                      ? "text-emerald-700 dark:text-emerald-400"
                      : analytics.gasSponsor.status === "low"
                        ? "text-amber-700 dark:text-amber-400"
                        : analytics.gasSponsor.status === "critical"
                          ? "text-[#FF1A1A] dark:text-red-400"
                          : "text-neutral-500"
                  }
                >
                  {analytics.gasSponsor.status === "healthy"
                    ? "Live"
                    : analytics.gasSponsor.status === "low"
                      ? "Running low"
                      : analytics.gasSponsor.status === "critical"
                        ? "Top up now"
                        : "Unavailable"}
                </span>
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight tabular-nums">
                {analytics.gasSponsor.balanceNear !== null ? (
                  <MotionNumber
                    value={analytics.gasSponsor.balanceNear}
                    format={(n) => n.toFixed(4)}
                  />
                ) : (
                  "--"
                )}
              </span>
              <span className="text-base font-semibold text-neutral-500 dark:text-neutral-400">
                NEAR
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
              {analytics.gasSponsor.balanceUsd !== null && (
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  ~{formatUsd(analytics.gasSponsor.balanceUsd)} USD
                </span>
              )}
              {analytics.gasSponsor.estimatedTxsRemaining !== null && (
                <span>
                  · ~
                  {analytics.gasSponsor.estimatedTxsRemaining.toLocaleString(
                    "en-US",
                  )}{" "}
                  est. NEAR txs left
                </span>
              )}
            </div>

            <div className="mt-3 pt-3 border-t border-neutral-200/70 dark:border-white/[0.06] flex items-center justify-between gap-2 text-[11px]">
              <span className="font-mono text-neutral-500 dark:text-neutral-400 truncate">
                {truncateMiddle(analytics.gasSponsor.accountId, 10, 8)}
              </span>
              <button
                type="button"
                onClick={handleCopySponsor}
                className="inline-flex items-center gap-1 shrink-0 font-semibold text-neutral-800 dark:text-neutral-200 hover:text-[#FF1A1A] dark:hover:text-white transition-colors cursor-pointer"
              >
                {copiedSponsor ? (
                  <>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Copied
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                    <span>Copy top-up address</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </MotionReveal>

        <div className="text-xs text-neutral-400 dark:text-neutral-500">
          Last updated: {new Date(analytics.asOf).toLocaleString()}
        </div>
      </main>
    </div>
  );
}
