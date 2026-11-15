"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { FlowLogo } from "../../../components/flow-logo.tsx";
import { triggerHaptic } from "../../../components/haptics.ts";
import { useTranslation } from "../../../components/language-provider.tsx";
import { MotionNumber, MotionReveal } from "../../../components/motion.tsx";
import { UserAvatar } from "../../../components/user-avatar.tsx";
import type { UserInsightsSnapshot } from "../../../server/insights-service.ts";

interface InsightsViewProps {
  initialInsights: UserInsightsSnapshot;
  primaryAccountId: string | null;
  userEmail: string;
  userName?: string | null;
  userAvatarUrl?: string | null;
  profileId?: string;
}

type TimeframeFilter = "ALL" | "12M" | "6M" | "3M";
type ChartMode = "FLOW" | "NET";

interface MonthlyPoint {
  readonly monthKey: string;
  readonly shortLabel: string;
  readonly fullLabel: string;
  readonly inflowUsd: number;
  readonly outflowUsd: number;
  readonly netUsd: number;
  readonly cumulativeNetUsd: number;
  readonly inflowTx: number;
  readonly outflowTx: number;
}

function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatCompactUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatMonthKey(
  monthKey: string,
  style: "short" | "long" = "short",
): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  const dt = new Date(Date.UTC(y, m - 1, 1));
  return dt.toLocaleDateString("en-US", {
    month: style === "short" ? "short" : "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildMonthSequence(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    const now = new Date();
    return [
      `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    ];
  }
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth();
  const out: string[] = [];
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m >= 12) {
      m = 0;
      y += 1;
    }
    if (out.length > 120) break;
  }
  return out;
}

function formatNetworkLabel(network: string): string {
  switch (network.toLowerCase()) {
    case "ethereum-mainnet":
      return "Ethereum";
    case "base-mainnet":
      return "Base";
    case "solana-mainnet":
      return "Solana";
    case "near-mainnet":
      return "NEAR";
    default:
      return network;
  }
}

export function InsightsView({
  initialInsights,
  primaryAccountId,
  userEmail,
  userName,
  userAvatarUrl,
  profileId,
}: InsightsViewProps) {
  const { t } = useTranslation();
  const [insights, setInsights] = useState(initialInsights);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<string>("ALL");
  const [timeframe, setTimeframe] = useState<TimeframeFilter>("ALL");
  const [assetFilter, setAssetFilter] = useState<string>("ALL");
  const [networkFilter, setNetworkFilter] = useState<string>("ALL");
  const [chartMode, setChartMode] = useState<ChartMode>("FLOW");

  const [hoveredMonthKey, setHoveredMonthKey] = useState<string | null>(null);
  const [pinnedMonthKey, setPinnedMonthKey] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    triggerHaptic("light");
    setRefreshing(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/insights", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.insights) {
        throw new Error("Could not refresh insights.");
      }
      setInsights(data.insights);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : "Could not refresh insights.",
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  const availableAssets = useMemo(() => {
    const set = new Set<string>();
    for (const h of insights.holdings) set.add(h.assetSymbol);
    for (const b of insights.buckets) set.add(b.assetSymbol);
    return Array.from(set).sort();
  }, [insights]);

  const availableNetworks = useMemo(() => {
    const set = new Set<string>();
    for (const h of insights.holdings) set.add(h.network);
    for (const b of insights.buckets) set.add(b.network);
    return Array.from(set).sort();
  }, [insights]);

  const filteredBalanceUsd = useMemo(() => {
    let total = 0;
    for (const h of insights.holdings) {
      if (accountFilter !== "ALL" && h.accountId !== accountFilter) continue;
      if (assetFilter !== "ALL" && h.assetSymbol !== assetFilter) continue;
      if (networkFilter !== "ALL" && h.network !== networkFilter) continue;
      total += h.usdValue;
    }
    return Math.round(total * 100) / 100;
  }, [insights.holdings, accountFilter, assetFilter, networkFilter]);

  const filteredBuckets = useMemo(() => {
    return insights.buckets.filter((b) => {
      if (accountFilter !== "ALL" && b.accountId !== accountFilter) return false;
      if (assetFilter !== "ALL" && b.assetSymbol !== assetFilter) return false;
      if (networkFilter !== "ALL" && b.network !== networkFilter) return false;
      return true;
    });
  }, [insights.buckets, accountFilter, assetFilter, networkFilter]);

  const allMonths = useMemo(() => {
    let startIso = insights.accountOpenedAt;
    if (accountFilter !== "ALL") {
      const acct = insights.accounts.find((a) => a.id === accountFilter);
      if (acct) startIso = acct.createdAt;
    }
    for (const b of filteredBuckets) {
      const candidate = `${b.monthKey}-01T00:00:00.000Z`;
      if (Date.parse(candidate) < Date.parse(startIso)) {
        startIso = candidate;
      }
    }
    return buildMonthSequence(startIso, insights.asOf);
  }, [
    insights.accountOpenedAt,
    insights.accounts,
    insights.asOf,
    accountFilter,
    filteredBuckets,
  ]);

  const visibleMonthKeys = useMemo(() => {
    if (timeframe === "ALL") return allMonths;
    const limit = timeframe === "12M" ? 12 : timeframe === "6M" ? 6 : 3;
    return allMonths.slice(-limit);
  }, [allMonths, timeframe]);

  const monthlySeries = useMemo<MonthlyPoint[]>(() => {
    const byMonth = new Map<
      string,
      { inflowUsd: number; outflowUsd: number; inflowTx: number; outflowTx: number }
    >();

    for (const b of filteredBuckets) {
      const entry = byMonth.get(b.monthKey) ?? {
        inflowUsd: 0,
        outflowUsd: 0,
        inflowTx: 0,
        outflowTx: 0,
      };
      if (b.direction === "IN") {
        entry.inflowUsd += b.usdValue;
        entry.inflowTx += b.txCount;
      } else {
        entry.outflowUsd += b.usdValue;
        entry.outflowTx += b.txCount;
      }
      byMonth.set(b.monthKey, entry);
    }

    let runningNet = 0;
    return visibleMonthKeys.map((key) => {
      const entry = byMonth.get(key) ?? {
        inflowUsd: 0,
        outflowUsd: 0,
        inflowTx: 0,
        outflowTx: 0,
      };
      const inflowUsd = Math.round(entry.inflowUsd * 100) / 100;
      const outflowUsd = Math.round(entry.outflowUsd * 100) / 100;
      const netUsd = Math.round((inflowUsd - outflowUsd) * 100) / 100;
      runningNet = Math.round((runningNet + netUsd) * 100) / 100;
      return {
        monthKey: key,
        shortLabel: formatMonthKey(key, "short"),
        fullLabel: formatMonthKey(key, "long"),
        inflowUsd,
        outflowUsd,
        netUsd,
        cumulativeNetUsd: runningNet,
        inflowTx: entry.inflowTx,
        outflowTx: entry.outflowTx,
      };
    });
  }, [filteredBuckets, visibleMonthKeys]);

  const summary = useMemo(() => {
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalInTx = 0;
    let totalOutTx = 0;
    let peakInflow: MonthlyPoint | null = null;
    let peakOutflow: MonthlyPoint | null = null;

    for (const m of monthlySeries) {
      totalInflow += m.inflowUsd;
      totalOutflow += m.outflowUsd;
      totalInTx += m.inflowTx;
      totalOutTx += m.outflowTx;
      if (m.inflowUsd > 0 && (!peakInflow || m.inflowUsd > peakInflow.inflowUsd)) {
        peakInflow = m;
      }
      if (
        m.outflowUsd > 0 &&
        (!peakOutflow || m.outflowUsd > peakOutflow.outflowUsd)
      ) {
        peakOutflow = m;
      }
    }

    return {
      totalInflow: Math.round(totalInflow * 100) / 100,
      totalOutflow: Math.round(totalOutflow * 100) / 100,
      netFlow: Math.round((totalInflow - totalOutflow) * 100) / 100,
      totalInTx,
      totalOutTx,
      peakInflow,
      peakOutflow,
    };
  }, [monthlySeries]);

  const activeMonthKey =
    hoveredMonthKey ??
    pinnedMonthKey ??
    monthlySeries[monthlySeries.length - 1]?.monthKey ??
    null;

  const activePoint = useMemo(
    () => monthlySeries.find((m) => m.monthKey === activeMonthKey) ?? null,
    [monthlySeries, activeMonthKey],
  );

  const selectedMonthBreakdown = useMemo(() => {
    const key = pinnedMonthKey ?? activeMonthKey;
    if (!key) return [];
    const map = new Map<
      string,
      {
        assetSymbol: string;
        network: string;
        inflowUsd: number;
        outflowUsd: number;
        txCount: number;
      }
    >();
    for (const b of filteredBuckets) {
      if (b.monthKey !== key) continue;
      const k = `${b.assetSymbol}::${b.network}`;
      const row = map.get(k) ?? {
        assetSymbol: b.assetSymbol,
        network: b.network,
        inflowUsd: 0,
        outflowUsd: 0,
        txCount: 0,
      };
      if (b.direction === "IN") row.inflowUsd += b.usdValue;
      else row.outflowUsd += b.usdValue;
      row.txCount += b.txCount;
      map.set(k, row);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.inflowUsd + b.outflowUsd - (a.inflowUsd + a.outflowUsd),
    );
  }, [filteredBuckets, pinnedMonthKey, activeMonthKey]);

  // SVG chart geometry
  const svgWidth = 860;
  const svgHeight = 320;
  const padLeft = 64;
  const padRight = 24;
  const padTop = 26;
  const padBottom = 42;
  const plotW = svgWidth - padLeft - padRight;
  const plotH = svgHeight - padTop - padBottom;

  const chartGeometry = useMemo(() => {
    const count = Math.max(1, monthlySeries.length);
    const stepX = plotW / count;

    if (chartMode === "FLOW") {
      const maxVal = Math.max(
        10,
        ...monthlySeries.map((m) => Math.max(m.inflowUsd, m.outflowUsd)),
      );
      const niceMax = Math.ceil(maxVal * 1.15);
      const yFor = (v: number) => padTop + plotH - (v / niceMax) * plotH;
      const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
        value: niceMax * t,
        y: yFor(niceMax * t),
      }));

      const points = monthlySeries.map((m, i) => {
        const cx = padLeft + i * stepX + stepX / 2;
        const barW = Math.min(24, Math.max(6, stepX * 0.26));
        const inY = yFor(m.inflowUsd);
        const outY = yFor(m.outflowUsd);
        const zeroY = yFor(0);
        return {
          ...m,
          cx,
          barW,
          inX: cx - barW - 2,
          outX: cx + 2,
          inY,
          inH: Math.max(m.inflowUsd > 0 ? 3 : 0, zeroY - inY),
          outY,
          outH: Math.max(m.outflowUsd > 0 ? 3 : 0, zeroY - outY),
          netY: yFor(Math.max(0, m.netUsd)),
        };
      });

      return { ticks, points, zeroY: yFor(0), minVal: 0, maxVal: niceMax };
    }

    // NET mode
    const vals = monthlySeries.flatMap((m) => [m.netUsd, m.cumulativeNetUsd, 0]);
    const rawMax = Math.max(10, ...vals);
    const rawMin = Math.min(0, ...vals);
    const span = Math.max(10, rawMax - rawMin);
    const padMax = rawMax + span * 0.12;
    const padMin = rawMin < 0 ? rawMin - span * 0.12 : 0;
    const totalSpan = Math.max(10, padMax - padMin);

    const yFor = (v: number) =>
      padTop + plotH - ((v - padMin) / totalSpan) * plotH;

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const val = padMin + totalSpan * t;
      return { value: val, y: yFor(val) };
    });

    const points = monthlySeries.map((m, i) => {
      const cx = padLeft + i * stepX + stepX / 2;
      return {
        ...m,
        cx,
        barW: 0,
        inX: cx,
        outX: cx,
        inY: yFor(m.netUsd),
        inH: 0,
        outY: yFor(m.cumulativeNetUsd),
        outH: 0,
        netY: yFor(m.netUsd),
        cumY: yFor(m.cumulativeNetUsd),
      };
    });

    return { ticks, points, zeroY: yFor(0), minVal: padMin, maxVal: padMax };
  }, [monthlySeries, chartMode, plotW, plotH]);

  const netLinePath = useMemo(() => {
    if (chartGeometry.points.length === 0) return "";
    return chartGeometry.points
      .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.cx.toFixed(1)} ${p.netY.toFixed(1)}`)
      .join(" ");
  }, [chartGeometry.points]);

  const netAreaPath = useMemo(() => {
    const first = chartGeometry.points[0];
    const last = chartGeometry.points[chartGeometry.points.length - 1];
    if (!first || !last) return "";
    return `${netLinePath} L ${last.cx.toFixed(1)} ${chartGeometry.zeroY.toFixed(1)} L ${first.cx.toFixed(1)} ${chartGeometry.zeroY.toFixed(1)} Z`;
  }, [netLinePath, chartGeometry.points, chartGeometry.zeroY]);

  const cumLinePath = useMemo(() => {
    if (chartMode !== "NET" || chartGeometry.points.length === 0) return "";
    return chartGeometry.points
      .map(
        (p, idx) =>
          `${idx === 0 ? "M" : "L"} ${p.cx.toFixed(1)} ${("cumY" in p ? (p as { cumY: number }).cumY : p.netY).toFixed(1)}`,
      )
      .join(" ");
  }, [chartMode, chartGeometry.points]);

  const openedFormatted = new Date(insights.accountOpenedAt).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );
  const recentFormatted = new Date(insights.asOf).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const backHref = primaryAccountId
    ? `/accounts/${primaryAccountId}`
    : "/accounts";

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-50">
      <header className="sticky top-0 z-30 border-b border-neutral-200/70 dark:border-white/[0.08] bg-[#FAF8F5]/90 dark:bg-[#0B0B0B]/90 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white transition-colors"
            >
              <FlowLogo className="h-5 w-auto" />
            </Link>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-sm font-semibold tracking-tight">
              {t.navInsights}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] transition-colors"
            >
              {t.backToWallet}
            </Link>
            <UserAvatar
              name={userName || userEmail}
              email={userEmail}
              fallbackImage={userAvatarUrl}
              profileId={profileId}
              size={34}
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
        <MotionReveal>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400">
                {t.insightsEyebrow}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                {t.insightsTitle}
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
                {t.insightsSubtitlePrefix}{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {openedFormatted}
                </span>{" "}
                {t.insightsSubtitleTo}{" "}
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {recentFormatted}
                </span>
                .
              </p>
            </div>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="self-start sm:self-auto px-4 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 hover:opacity-90 disabled:opacity-50 transition-all"
            >
              {refreshing ? t.refreshing : t.refresh}
            </button>
          </div>
        </MotionReveal>

        {errorMessage && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {/* Interactive Filter Bar */}
        <MotionReveal delayMs={30}>
          <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-4 flex flex-wrap items-center justify-between gap-3">
            {/* Timeframe Pills */}
            <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-white/[0.05] p-1 rounded-full">
              {(["ALL", "12M", "6M", "3M"] as TimeframeFilter[]).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setTimeframe(tf);
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    timeframe === tf
                      ? "bg-white dark:bg-neutral-900 text-neutral-950 dark:text-white shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                  }`}
                >
                  {tf === "ALL" ? t.allTime : tf}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {insights.accounts.length > 1 && (
                <select
                  aria-label="Filter by account"
                  value={accountFilter}
                  onChange={(e) => {
                    triggerHaptic("light");
                    setAccountFilter(e.target.value);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/[0.06] border border-transparent hover:border-neutral-300 dark:hover:border-white/20 outline-none"
                >
                  <option value="ALL">{t.allAccounts}</option>
                  {insights.accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Filter by asset"
                value={assetFilter}
                onChange={(e) => {
                  triggerHaptic("light");
                  setAssetFilter(e.target.value);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/[0.06] border border-transparent hover:border-neutral-300 dark:hover:border-white/20 outline-none"
              >
                <option value="ALL">{t.allAssets}</option>
                {availableAssets.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filter by network"
                value={networkFilter}
                onChange={(e) => {
                  triggerHaptic("light");
                  setNetworkFilter(e.target.value);
                }}
                className="px-3 py-1.5 rounded-full text-xs font-semibold bg-neutral-100 dark:bg-white/[0.06] border border-transparent hover:border-neutral-300 dark:hover:border-white/20 outline-none"
              >
                <option value="ALL">{t.allNetworks}</option>
                {availableNetworks.map((net) => (
                  <option key={net} value={net}>
                    {formatNetworkLabel(net)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </MotionReveal>

        {/* Top 3 Core Financial Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MotionReveal delayMs={50}>
            <div className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                {t.insightsTotalIn}
              </p>
              <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400">
                <MotionNumber value={summary.totalInflow} format={formatUsd} />
              </div>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {summary.totalInTx.toLocaleString("en-US")} incoming{" "}
                {summary.totalInTx === 1 ? "transaction" : "transactions"}
              </p>
            </div>
          </MotionReveal>

          <MotionReveal delayMs={80}>
            <div className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                {t.insightsTotalOut}
              </p>
              <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-rose-600 dark:text-rose-400">
                <MotionNumber value={summary.totalOutflow} format={formatUsd} />
              </div>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {summary.totalOutTx.toLocaleString("en-US")} outgoing{" "}
                {summary.totalOutTx === 1 ? "transaction" : "transactions"}
              </p>
            </div>
          </MotionReveal>

          <MotionReveal delayMs={110}>
            <div className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                {t.insightsCurrentBalance}
              </p>
              <div className="mt-3 text-3xl font-bold tracking-tight tabular-nums">
                <MotionNumber value={filteredBalanceUsd} format={formatUsd} />
              </div>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {t.insightsNetPeriodFlow}{" "}
                <span
                  className={
                    summary.netFlow >= 0
                      ? "font-semibold text-emerald-600 dark:text-emerald-400"
                      : "font-semibold text-rose-600 dark:text-rose-400"
                  }
                >
                  {summary.netFlow >= 0 ? "+" : ""}
                  {formatUsd(summary.netFlow)}
                </span>
              </p>
            </div>
          </MotionReveal>
        </div>

        {/* Peak Inflow & Outflow Month Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MotionReveal delayMs={130}>
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06] p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                  {t.insightsHighestInMonth}
                </p>
                <div className="mt-2 text-2xl font-bold tracking-tight">
                  {summary.peakInflow ? summary.peakInflow.fullLabel : t.insightsNoInflowsYet}
                </div>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {summary.peakInflow
                    ? `${summary.peakInflow.inflowTx} tx`
                    : t.insightsPeakInHint}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {summary.peakInflow ? formatUsd(summary.peakInflow.inflowUsd) : "$0.00"}
                </div>
              </div>
            </div>
          </MotionReveal>

          <MotionReveal delayMs={150}>
            <div className="rounded-3xl border border-rose-500/20 bg-rose-500/[0.04] dark:bg-rose-500/[0.06] p-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700 dark:text-rose-300">
                  {t.insightsHighestOutMonth}
                </p>
                <div className="mt-2 text-2xl font-bold tracking-tight">
                  {summary.peakOutflow ? summary.peakOutflow.fullLabel : t.insightsNoOutflowsYet}
                </div>
                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                  {summary.peakOutflow
                    ? `${summary.peakOutflow.outflowTx} tx`
                    : t.insightsPeakOutHint}
                </p>
              </div>
              <div className="text-right">
                <div className="text-xl sm:text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                  {summary.peakOutflow ? formatUsd(summary.peakOutflow.outflowUsd) : "$0.00"}
                </div>
              </div>
            </div>
          </MotionReveal>
        </div>

        {/* Immersive Interactive Monthly Graph */}
        <MotionReveal delayMs={180}>
          <div className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold tracking-tight">
                  {t.insightsChartTitle}
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  {t.insightsChartSubtitle}
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-neutral-100 dark:bg-white/[0.05] p-1 rounded-full self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setChartMode("FLOW");
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    chartMode === "FLOW"
                      ? "bg-white dark:bg-neutral-900 text-neutral-950 dark:text-white shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400"
                  }`}
                >
                  {t.insightsModeFlow}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    setChartMode("NET");
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    chartMode === "NET"
                      ? "bg-white dark:bg-neutral-900 text-neutral-950 dark:text-white shadow-sm"
                      : "text-neutral-600 dark:text-neutral-400"
                  }`}
                >
                  {t.insightsModeNet}
                </button>
              </div>
            </div>

            {/* Active Month Live Readout Banner */}
            {activePoint && (
              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/[0.07] bg-neutral-50/90 dark:bg-white/[0.02] px-4 py-3 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-bold">{activePoint.fullLabel}</span>
                  {summary.peakInflow?.monthKey === activePoint.monthKey && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                      Peak Inflow
                    </span>
                  )}
                  {summary.peakOutflow?.monthKey === activePoint.monthKey && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                      Peak Outflow
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-5 text-xs">
                  <div>
                    <span className="text-neutral-500 dark:text-neutral-400">In: </span>
                    <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatUsd(activePoint.inflowUsd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 dark:text-neutral-400">Out: </span>
                    <span className="font-bold tabular-nums text-rose-600 dark:text-rose-400">
                      {formatUsd(activePoint.outflowUsd)}
                    </span>
                  </div>
                  <div>
                    <span className="text-neutral-500 dark:text-neutral-400">Net: </span>
                    <span
                      className={`font-bold tabular-nums ${
                        activePoint.netUsd >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {activePoint.netUsd >= 0 ? "+" : ""}
                      {formatUsd(activePoint.netUsd)}
                    </span>
                  </div>
                  {chartMode === "NET" && (
                    <div>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        Cumulative:{" "}
                      </span>
                      <span className="font-bold tabular-nums text-sky-600 dark:text-sky-400">
                        {formatUsd(activePoint.cumulativeNetUsd)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Interactive SVG Chart */}
            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full min-w-[540px] h-auto select-none overflow-visible"
                role="img"
                aria-label="Interactive monthly inflow and outflow chart"
                onMouseLeave={() => setHoveredMonthKey(null)}
              >
                <defs>
                  <linearGradient id="flowInGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#059669" stopOpacity="0.45" />
                  </linearGradient>
                  <linearGradient id="flowOutGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#e11d48" stopOpacity="0.45" />
                  </linearGradient>
                  <linearGradient id="netAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* Horizontal Gridlines & Y Labels */}
                {chartGeometry.ticks.map((tick, idx) => (
                  <g key={idx}>
                    <line
                      x1={padLeft}
                      y1={tick.y}
                      x2={svgWidth - padRight}
                      y2={tick.y}
                      stroke="currentColor"
                      strokeOpacity={0.08}
                      strokeDasharray={idx === 0 ? undefined : "4 4"}
                    />
                    <text
                      x={padLeft - 10}
                      y={tick.y + 4}
                      textAnchor="end"
                      className="fill-neutral-400 dark:fill-neutral-500 text-[10px] font-medium tabular-nums"
                    >
                      {formatCompactUsd(tick.value)}
                    </text>
                  </g>
                ))}

                {/* Zero Baseline in NET mode */}
                {chartMode === "NET" && (
                  <line
                    x1={padLeft}
                    y1={chartGeometry.zeroY}
                    x2={svgWidth - padRight}
                    y2={chartGeometry.zeroY}
                    stroke="currentColor"
                    strokeOpacity={0.22}
                  />
                )}

                {/* NET Mode Area & Splines */}
                {chartMode === "NET" && chartGeometry.points.length > 0 && (
                  <>
                    <path d={netAreaPath} fill="url(#netAreaGrad)" />
                    <path
                      d={netLinePath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d={cumLinePath}
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="2"
                      strokeDasharray="5 4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </>
                )}

                {/* Month Columns */}
                {chartGeometry.points.map((pt, idx) => {
                  const isActive = pt.monthKey === activeMonthKey;
                  const colW = plotW / Math.max(1, chartGeometry.points.length);
                  const showLabel =
                    chartGeometry.points.length <= 12 ||
                    idx % Math.ceil(chartGeometry.points.length / 10) === 0 ||
                    idx === chartGeometry.points.length - 1;

                  return (
                    <g
                      key={pt.monthKey}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredMonthKey(pt.monthKey)}
                      onClick={() => {
                        triggerHaptic("light");
                        setPinnedMonthKey((prev) =>
                          prev === pt.monthKey ? null : pt.monthKey,
                        );
                      }}
                    >
                      {/* Hover/Active Highlight Band */}
                      <rect
                        x={pt.cx - colW / 2}
                        y={padTop}
                        width={colW}
                        height={plotH}
                        rx={8}
                        fill="currentColor"
                        fillOpacity={isActive ? 0.05 : 0}
                      />

                      {chartMode === "FLOW" ? (
                        <>
                          {/* Inflow Bar */}
                          {pt.inH > 0 && (
                            <rect
                              x={pt.inX}
                              y={pt.inY}
                              width={pt.barW}
                              height={pt.inH}
                              rx={4}
                              fill="url(#flowInGrad)"
                              opacity={
                                activeMonthKey && !isActive ? 0.55 : 1
                              }
                            />
                          )}
                          {/* Outflow Bar */}
                          {pt.outH > 0 && (
                            <rect
                              x={pt.outX}
                              y={pt.outY}
                              width={pt.barW}
                              height={pt.outH}
                              rx={4}
                              fill="url(#flowOutGrad)"
                              opacity={
                                activeMonthKey && !isActive ? 0.55 : 1
                              }
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <circle
                            cx={pt.cx}
                            cy={pt.netY}
                            r={isActive ? 5.5 : 3.5}
                            fill="#10b981"
                            stroke="white"
                            strokeWidth={isActive ? 2 : 1.5}
                          />
                          <circle
                            cx={pt.cx}
                            cy={("cumY" in pt ? (pt as { cumY: number }).cumY : pt.netY)}
                            r={isActive ? 4.5 : 2.5}
                            fill="#0ea5e9"
                          />
                        </>
                      )}

                      {/* X-Axis Month Label */}
                      {showLabel && (
                        <text
                          x={pt.cx}
                          y={svgHeight - 14}
                          textAnchor="middle"
                          className={`text-[10px] font-medium transition-colors ${
                            isActive
                              ? "fill-neutral-950 dark:fill-white font-bold"
                              : "fill-neutral-400 dark:fill-neutral-500"
                          }`}
                        >
                          {pt.shortLabel}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Chart Legend */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-neutral-200/60 dark:border-white/[0.06] text-xs text-neutral-500 dark:text-neutral-400">
              <div className="flex items-center gap-4">
                {chartMode === "FLOW" ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                      Inflow (USD)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
                      Outflow (USD)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      Monthly Net
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                      Cumulative Net
                    </span>
                  </>
                )}
              </div>

              {pinnedMonthKey && (
                <button
                  type="button"
                  onClick={() => setPinnedMonthKey(null)}
                  className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:underline"
                >
                  Clear pinned month ({formatMonthKey(pinnedMonthKey, "short")})
                </button>
              )}
            </div>

            {/* Selected Month Asset & Network Breakdown */}
            {activePoint && (
              <div className="pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400 mb-2.5">
                  {activePoint.fullLabel} Asset Breakdown
                </p>
                {selectedMonthBreakdown.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    No settled mainnet inflows or outflows recorded in{" "}
                    {activePoint.fullLabel}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {selectedMonthBreakdown.map((item) => (
                      <div
                        key={`${item.assetSymbol}-${item.network}`}
                        className="rounded-2xl border border-neutral-200/70 dark:border-white/[0.07] bg-neutral-50/70 dark:bg-white/[0.02] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="font-bold">{item.assetSymbol}</div>
                          <div className="text-neutral-500 dark:text-neutral-400">
                            {formatNetworkLabel(item.network)} · {item.txCount} tx
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          {item.inflowUsd > 0 && (
                            <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                              +{formatUsd(item.inflowUsd)}
                            </div>
                          )}
                          {item.outflowUsd > 0 && (
                            <div className="font-semibold text-rose-600 dark:text-rose-400">
                              -{formatUsd(item.outflowUsd)}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </MotionReveal>

        {/* Monthly History Table */}
        <MotionReveal delayMs={200}>
          <div className="rounded-3xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] p-5 sm:p-6">
            <h2 className="text-base font-bold tracking-tight mb-4">
              {t.insightsTableTitle}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-neutral-200/70 dark:border-white/[0.08] text-neutral-500 dark:text-neutral-400 text-xs uppercase tracking-wider">
                    <th className="py-2.5 pr-4 font-semibold">{t.insightsColMonth}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">{t.insightsColInflow}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">{t.insightsColOutflow}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">{t.insightsColNet}</th>
                    <th className="py-2.5 pl-3 font-semibold text-right">{t.insightsColTx}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/50 dark:divide-white/[0.05]">
                  {[...monthlySeries].reverse().map((m) => (
                    <tr
                      key={m.monthKey}
                      onClick={() => {
                        triggerHaptic("light");
                        setPinnedMonthKey(m.monthKey);
                      }}
                      className={`cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.03] ${
                        activeMonthKey === m.monthKey
                          ? "bg-neutral-50/90 dark:bg-white/[0.04]"
                          : ""
                      }`}
                    >
                      <td className="py-3 pr-4 font-semibold">
                        <div className="flex items-center gap-2">
                          <span>{m.fullLabel}</span>
                          {summary.peakInflow?.monthKey === m.monthKey && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                              Peak In
                            </span>
                          )}
                          {summary.peakOutflow?.monthKey === m.monthKey && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300">
                              Peak Out
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {formatUsd(m.inflowUsd)}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-medium text-rose-600 dark:text-rose-400">
                        {formatUsd(m.outflowUsd)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right tabular-nums font-semibold ${
                          m.netUsd >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }`}
                      >
                        {m.netUsd >= 0 ? "+" : ""}
                        {formatUsd(m.netUsd)}
                      </td>
                      <td className="py-3 pl-3 text-right tabular-nums text-neutral-500 dark:text-neutral-400">
                        {m.inflowTx + m.outflowTx}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </MotionReveal>
      </main>
    </div>
  );
}
