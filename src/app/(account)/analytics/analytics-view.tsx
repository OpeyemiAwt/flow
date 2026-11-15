"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FlowLogo } from "../../../components/flow-logo.tsx";
import { MotionNumber, MotionReveal } from "../../../components/motion.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import { triggerHaptic } from "../../../components/haptics.ts";

export interface AdminAnalyticsSnapshot {
  readonly totalUsers: number;
  readonly activeWallets: number;
  readonly totalAccounts: number;
  readonly movedInUsd: number;
  readonly movedOutUsd: number;
  readonly netFlowUsd: number;
  readonly asOf: string;
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
    ? `/accounts/${primaryAccountId}`
    : "/accounts";

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-[#050505] text-neutral-950 dark:text-neutral-50">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-white/80 dark:bg-black/70 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white transition-colors"
            >
              <FlowLogo className="h-5 w-auto" />
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-sm font-semibold tracking-tight">
              Analytics
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] transition-colors"
            >
              Back to Wallet
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-black text-[11px] font-semibold tracking-wide uppercase mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Platform Totals Only
            </div>
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

        <MotionReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
        </MotionReveal>

        <div className="text-xs text-neutral-400 dark:text-neutral-500">
          Last updated: {new Date(analytics.asOf).toLocaleString()}
        </div>
      </main>
    </div>
  );
}
