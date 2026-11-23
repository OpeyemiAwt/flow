"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { triggerHaptic } from "./haptics.ts";
import {
  MotionNumber,
  MotionReveal,
  SegmentedTabPill,
} from "./motion.tsx";
import {
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconNearIntents,
  IconPlus,
  IconSwap,
} from "./icons.tsx";
import {
  EARN_DEPOSIT_FEE_BPS,
  EARN_DEPOSIT_FEE_LABEL,
} from "../domain/platform-fees.ts";
import type { CatalogTokenDeployment } from "../domain/supported-assets-catalog.ts";
import type { NavTabId } from "./floating-nav.tsx";
import { PaymentTimelineTracker } from "./payment-timeline-tracker.tsx";
import type { ToastVariant } from "./toast-provider.tsx";

export interface EarnViewProps {
  accountId: string;
  heldAssets: ReadonlyArray<{
    deployment: CatalogTokenDeployment;
    displayBalance: string;
    usdValue: string;
  }>;
  hideBalance?: boolean;
  nearPriceUsd?: number;
  onNavigateToTab: (tab: NavTabId) => void;
  onSelectConvert: (sourceDeploymentId?: string, destDeploymentId?: string) => void;
  onSelectDeposit: (deploymentId?: string) => void;
  onSyncPortfolio?: () => void;
  onSettled?: () => void;
  pushToast: (toast: {
    title: string;
    description?: string;
    variant?: ToastVariant;
    durationMs?: number;
  }) => void;
}

interface ProtocolEarnConfig {
  id: string;
  name: string;
  protocolKey: string;
  apy: number;
  apyLabel: string;
  type: "LIQUID_STAKING" | "MONEY_MARKET";
  assetSymbol: string;
  subtext?: string;
  description: string;
  contractId: string;
  explorerUrl: string;
  accentColor: string;
}

const EARN_GAS_RESERVE_NEAR = 0.12;
const BURROW_FIRST_DEPOSIT_RESERVE_NEAR = 0.37;

function formatEarnErrorMessage(
  data: unknown,
  fallback: string,
  protocolKey?: string,
): string {
  const payload =
    data && typeof data === "object"
      ? (data as { error?: unknown; message?: unknown })
      : null;
  const rawError = payload?.error;
  const code =
    typeof rawError === "string"
      ? rawError
      : rawError && typeof rawError === "object" && "code" in rawError
        ? String((rawError as { code?: unknown }).code || "")
        : "";
  const nestedMessage =
    rawError && typeof rawError === "object" && "message" in rawError
      ? String((rawError as { message?: unknown }).message || "")
      : "";
  const directMessage =
    typeof payload?.message === "string" ? payload.message : "";

  switch (code) {
    case "INSUFFICIENT_SPENDABLE_BALANCE":
      return protocolKey === "burrow"
        ? "Insufficient USDC on NEAR Mainnet. Burrow deposits require USDC on NEAR (not Base/Ethereum)."
        : "Insufficient NEAR balance after reserving 0.12 NEAR for gas and storage.";
    case "INSUFFICIENT_GAS_BALANCE":
      return protocolKey === "burrow"
        ? "Insufficient NEAR for gas and Burrow storage deposit (requires 0.37 NEAR on first deposit, or 0.12 NEAR thereafter)."
        : "Insufficient NEAR for network gas and storage (requires at least 0.12 NEAR).";
    case "BALANCE_REFRESH_REQUIRED":
      return "Your NEAR wallet balance is still syncing or unavailable. Please refresh your portfolio and try again.";
    case "INSUFFICIENT_PROTOCOL_POSITION":
      return "Requested withdrawal exceeds your active protocol position.";
    case "LINEAR_INSTANT_UNSTAKE_UNAVAILABLE":
      return "LiNEAR only supports Standard (~48h) unstaking on-chain.";
    case "UNSTAKED_COOLDOWN_NOT_READY":
      return "Your unstaked NEAR is still in the ~48h cooldown period.";
    case "PAYMENT_EXECUTION_DISABLED":
      return "On-chain Earn execution is currently disabled in this environment.";
    case "ACTIVE_MAINNET_WALLET_REQUIRED":
      return "An active NEAR Mainnet wallet is required to use Earn.";
    case "INVALID_AMOUNT":
      return "Please enter a valid positive amount.";
    case "AUTH_REQUIRED":
      return "Your session expired. Please sign in again.";
    default:
      return nestedMessage || directMessage || code || fallback;
  }
}

const PROTOCOLS: ProtocolEarnConfig[] = [
  {
    id: "linear",
    name: "LiNEAR",
    protocolKey: "linear",
    apy: 6.26,
    apyLabel: "6.26% variable APY",
    type: "LIQUID_STAKING",
    assetSymbol: "NEAR",
    subtext: undefined,
    description:
      "Liquid staking on NEAR Protocol. Deposit NEAR to receive $LiNEAR and auto-compound staking rewards every 12-hour epoch with zero lockup.",
    contractId: "linear-protocol.near",
    explorerUrl: "https://nearblocks.io/address/linear-protocol.near",
    accentColor: "#00E599",
  },
  {
    id: "burrow",
    name: "Burrow Finance",
    protocolKey: "burrow",
    apy: 6.1,
    apyLabel: "6.1% variable APR",
    type: "MONEY_MARKET",
    assetSymbol: "USDC",
    subtext: "Includes NEAR rewards ⌄",
    description:
      "Decentralized liquidity market protocol on NEAR. Supply stablecoins or NEAR to earn lending yield plus native NEAR liquidity incentives.",
    contractId: "contract.main.burrow.near",
    explorerUrl: "https://nearblocks.io/address/contract.main.burrow.near",
    accentColor: "#0072CE",
  },
];

export function EarnView({
  accountId,
  heldAssets,
  hideBalance = false,
  nearPriceUsd = 5.25,
  onNavigateToTab,
  onSelectConvert,
  onSelectDeposit,
  onSyncPortfolio,
  onSettled,
  pushToast,
}: EarnViewProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Live APYs fetched from on-chain NEAR Mainnet protocol state
  const [liveApys, setLiveApys] = useState<{
    linear?: number;
    burrow?: number;
    source?: string;
  } | null>(null);
  const [apysLoaded, setApysLoaded] = useState(false);

  const protocols = useMemo<ProtocolEarnConfig[]>(() => {
    return PROTOCOLS.map((p) => {
      const liveVal =
        p.protocolKey === "linear" ? liveApys?.linear : liveApys?.burrow;
      if (typeof liveVal === "number" && Number.isFinite(liveVal) && liveVal > 0) {
        return {
          ...p,
          apy: liveVal,
          apyLabel:
            p.protocolKey === "linear"
              ? `${liveVal.toFixed(2)}% live APY`
              : `${liveVal.toFixed(2)}% live APR`,
        };
      }
      return p;
    });
  }, [liveApys]);

  // Modal State
  const [activeModalProtocol, setActiveModalProtocol] =
    useState<ProtocolEarnConfig | null>(null);
  const [modalAction, setModalAction] = useState<"DEPOSIT" | "WITHDRAW">("DEPOSIT");
  const [amountInput, setAmountInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unstakeType, setUnstakeType] = useState<"INSTANT" | "DELAYED">("DELAYED");
  const [linearUnstaked, setLinearUnstaked] = useState<{
    amount: number;
    display: string;
    canWithdraw: boolean;
  }>({ amount: 0, display: "0", canWithdraw: false });
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  const [activeEarnJobs, setActiveEarnJobs] = useState<
    Array<{
      publicId: string;
      status: string;
      providerDepositMemo: string | null;
      sourceDisplayAmount: string;
      sourceAssetSymbol: string;
      sourceTxHash: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      createdAt?: string;
    }>
  >([]);
  const [recentEarnJobs, setRecentEarnJobs] = useState<
    Array<{
      publicId: string;
      status: string;
      providerDepositMemo: string | null;
      sourceDisplayAmount: string;
      sourceAssetSymbol: string;
      sourceTxHash: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
      createdAt?: string;
    }>
  >([]);
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);
  const [trackedJobFallback, setTrackedJobFallback] = useState<{
    publicId: string;
    status: string;
    providerDepositMemo: string | null;
    sourceDisplayAmount: string;
    sourceAssetSymbol: string;
    sourceTxHash: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    createdAt?: string;
  } | null>(null);

  // Live on-chain protocol positions
  const [positions, setPositions] = useState<
    Record<
      string,
      {
        depositedAmount: number;
        depositedUsd: number;
        earnedYieldUsd: number;
        updatedAt: number;
      }
    >
  >({
    linear: { depositedAmount: 0, depositedUsd: 0, earnedYieldUsd: 0, updatedAt: Date.now() },
    burrow: { depositedAmount: 0, depositedUsd: 0, earnedYieldUsd: 0, updatedAt: Date.now() },
  });

  const fetchEarnPositions = useCallback(async () => {
    try {
      const res = await fetch(`/api/accounts/${accountId}/earn`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.ok || !data.positions) return;

      const linearNear = parseFloat(data.positions.linear?.nearDisplay ?? "0") || 0;
      const linearUnstakedDisplay = String(
        data.positions.linear?.unstakedNearDisplay ?? "0",
      );
      const linearUnstakedAmount = parseFloat(linearUnstakedDisplay) || 0;
      const linearCanWithdraw = Boolean(data.positions.linear?.canWithdraw);
      const burrowUsdc = parseFloat(data.positions.burrow?.usdcDisplay ?? "0") || 0;
      const now = Date.now();

      setLinearUnstaked({
        amount: linearUnstakedAmount,
        display: linearUnstakedDisplay,
        canWithdraw: linearCanWithdraw,
      });

      setPositions({
        linear: {
          depositedAmount: linearNear,
          depositedUsd: linearNear * nearPriceUsd,
          earnedYieldUsd: 0,
          updatedAt: now,
        },
        burrow: {
          depositedAmount: burrowUsdc,
          depositedUsd: burrowUsdc,
          earnedYieldUsd: 0,
          updatedAt: now,
        },
      });
      if (data.apys && typeof data.apys === "object") {
        setLiveApys({
          linear:
            typeof data.apys.linear === "number" ? data.apys.linear : undefined,
          burrow:
            typeof data.apys.burrow === "number" ? data.apys.burrow : undefined,
          source: typeof data.apys.source === "string" ? data.apys.source : undefined,
        });
      }
      setActiveEarnJobs(Array.isArray(data.activeJobs) ? data.activeJobs : []);
      setRecentEarnJobs(Array.isArray(data.recentJobs) ? data.recentJobs : []);
    } catch {
      // Keep last known on-chain snapshot on transient network hiccup
    } finally {
      setApysLoaded(true);
    }
  }, [accountId, nearPriceUsd]);

  useEffect(() => {
    void fetchEarnPositions();
  }, [fetchEarnPositions]);

  const trackedJob = useMemo(() => {
    if (!trackedJobId) return null;
    return (
      recentEarnJobs.find((j) => j.publicId === trackedJobId) ??
      activeEarnJobs.find((j) => j.publicId === trackedJobId) ??
      (trackedJobFallback?.publicId === trackedJobId ? trackedJobFallback : null)
    );
  }, [trackedJobId, recentEarnJobs, activeEarnJobs, trackedJobFallback]);

  const trackedJobIsTerminal =
    trackedJob?.status === "SETTLED" ||
    trackedJob?.status === "CONFIRMED" ||
    trackedJob?.status === "FAILED" ||
    trackedJob?.status === "REFUNDED" ||
    trackedJob?.status === "UNKNOWN_AMBIGUOUS";

  const lastSettledTrackedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      trackedJob?.publicId &&
      trackedJob.status === "SETTLED" &&
      lastSettledTrackedIdRef.current !== trackedJob.publicId
    ) {
      lastSettledTrackedIdRef.current = trackedJob.publicId;
      void fetchEarnPositions();
      onSyncPortfolio?.();
      const navTimer = setTimeout(() => {
        void fetchEarnPositions();
        onSettled?.();
      }, 1800);
      return () => clearTimeout(navTimer);
    }
  }, [
    trackedJob?.publicId,
    trackedJob?.status,
    fetchEarnPositions,
    onSyncPortfolio,
    onSettled,
  ]);

  useEffect(() => {
    if (activeEarnJobs.length === 0 && (!trackedJobId || trackedJobIsTerminal)) {
      return;
    }
    const timer = setInterval(() => {
      void fetchEarnPositions();
      onSyncPortfolio?.();
    }, 2500);
    return () => clearInterval(timer);
  }, [
    activeEarnJobs.length,
    trackedJobId,
    trackedJobIsTerminal,
    fetchEarnPositions,
    onSyncPortfolio,
  ]);

  // Live yield accrual ticker
  const [ticker, setTicker] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTicker((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Total Earning Balance ($ USD)
  const totalEarningUsd = useMemo(() => {
    let sum = 0;
    for (const p of protocols) {
      const pos = positions[p.protocolKey];
      if (pos && pos.depositedUsd > 0) {
        const elapsed = Math.max(0, (Date.now() - pos.updatedAt) / 1000);
        const perSecRate = p.apy / 100 / (365 * 86400);
        const yieldAccrued = pos.depositedUsd * perSecRate * elapsed;
        sum += pos.depositedUsd + pos.earnedYieldUsd + yieldAccrued;
      }
    }
    return sum;
  }, [positions, protocols, ticker]);

  // Available NEAR in wallet
  const nearAsset = useMemo(() => {
    return heldAssets.find(
      (a) => a.deployment.symbol === "NEAR" && a.deployment.ecosystem === "near",
    );
  }, [heldAssets]);

  const availableNearNum = useMemo(() => {
    if (!nearAsset) return 0;
    const clean = nearAsset.displayBalance.replace(/,/g, "");
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  }, [nearAsset]);

  // Available NEAR USDC in wallet for Burrow
  const availableStablesNum = useMemo(() => {
    const usdc = heldAssets.find(
      (a) =>
        a.deployment.id === "near-mainnet:USDC" ||
        (a.deployment.symbol === "USDC" && a.deployment.ecosystem === "near"),
    );
    return usdc ? parseFloat(usdc.displayBalance.replace(/,/g, "")) || 0 : 0;
  }, [heldAssets]);

  // Open Deposit Modal
  const openDepositModal = (protocol: ProtocolEarnConfig) => {
    triggerHaptic("light");
    setActiveModalProtocol(protocol);
    setModalAction("DEPOSIT");
    setAmountInput("");
  };

  // Open Withdraw Modal
  const openWithdrawModal = (protocol: ProtocolEarnConfig) => {
    triggerHaptic("light");
    setActiveModalProtocol(protocol);
    setModalAction("WITHDRAW");
    setAmountInput("");
  };

  // Execute Deposit
  const handleExecuteDeposit = async () => {
    if (!activeModalProtocol) return;
    const trimmed = amountInput.replace(/,/g, "").trim();
    const parsed = parseFloat(trimmed);

    if (isNaN(parsed) || parsed <= 0) {
      pushToast({
        title: "Enter an amount",
        description: `Please enter how much ${activeModalProtocol.assetSymbol} to deposit.`,
        variant: "error",
      });
      return;
    }

    const available =
      activeModalProtocol.assetSymbol === "NEAR"
        ? Math.max(0, Math.floor((availableNearNum - EARN_GAS_RESERVE_NEAR) * 1e6) / 1e6)
        : availableStablesNum;

    if (parsed > available) {
      pushToast({
        title: "Insufficient balance",
        description:
          activeModalProtocol.assetSymbol === "NEAR"
            ? `You can deposit up to ${available.toFixed(4)} NEAR (${EARN_GAS_RESERVE_NEAR.toFixed(2)} NEAR is reserved for gas).`
            : `You only have ${available.toFixed(4)} ${activeModalProtocol.assetSymbol} available on NEAR Mainnet.`,
        variant: "error",
      });
      return;
    }

    triggerHaptic("medium");
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/accounts/${accountId}/earn/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocol: activeModalProtocol.protocolKey,
          action: "DEPOSIT",
          displayAmount: trimmed,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          formatEarnErrorMessage(
            data,
            "Could not submit deposit transaction.",
            activeModalProtocol.protocolKey,
          ),
        );
      }

      const createdJob = data?.transfer ?? data?.job;
      if (createdJob?.publicId) {
        setTrackedJobFallback(createdJob);
        setTrackedJobId(createdJob.publicId);
      }
      await fetchEarnPositions();
      onSyncPortfolio?.();
      triggerHaptic("success");
      setActiveModalProtocol(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not complete deposit transaction.";
      pushToast({
        title: "Deposit Failed",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Execute Withdraw
  const handleExecuteWithdraw = async () => {
    if (!activeModalProtocol) return;
    const currentPos = positions[activeModalProtocol.protocolKey];
    if (!currentPos || currentPos.depositedAmount <= 0) return;

    const trimmed = amountInput.replace(/,/g, "").trim();
    const parsed = parseFloat(trimmed);
    if (isNaN(parsed) || parsed <= 0) {
      pushToast({
        title: "Enter an amount",
        description: `Please enter how much ${activeModalProtocol.assetSymbol} to withdraw.`,
        variant: "error",
      });
      return;
    }

    if (parsed > currentPos.depositedAmount * 1.0001) {
      pushToast({
        title: "Exceeds deposited balance",
        description: `You only have ${currentPos.depositedAmount.toFixed(4)} ${activeModalProtocol.assetSymbol} deposited.`,
        variant: "error",
      });
      return;
    }

    triggerHaptic("medium");
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/accounts/${accountId}/earn/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          protocol: activeModalProtocol.protocolKey,
          action: "WITHDRAW",
          unstakeType:
            activeModalProtocol.protocolKey === "linear" ? unstakeType : undefined,
          displayAmount: trimmed,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          formatEarnErrorMessage(
            data,
            "Could not submit withdrawal transaction.",
            activeModalProtocol.protocolKey,
          ),
        );
      }

      const createdJob = data?.transfer ?? data?.job;
      if (createdJob?.publicId) {
        setTrackedJobFallback(createdJob);
        setTrackedJobId(createdJob.publicId);
      }
      await fetchEarnPositions();
      onSyncPortfolio?.();
      triggerHaptic("success");
      setActiveModalProtocol(null);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not complete withdrawal transaction.";
      pushToast({
        title: "Withdrawal Failed",
        description: message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClaimLinearUnstaked = async () => {
    if (!linearUnstaked.canWithdraw || linearUnstaked.amount <= 0) return;
    triggerHaptic("medium");
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/earn/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol: "linear",
          action: "CLAIM",
          displayAmount: linearUnstaked.display || linearUnstaked.amount.toString(),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          formatEarnErrorMessage(
            data,
            "Could not claim unstaked NEAR.",
            "linear",
          ),
        );
      }
      const createdJob = data?.transfer ?? data?.job;
      if (createdJob?.publicId) {
        setTrackedJobFallback(createdJob);
        setTrackedJobId(createdJob.publicId);
      }
      await fetchEarnPositions();
      onSyncPortfolio?.();
      triggerHaptic("success");
    } catch (err: unknown) {
      pushToast({
        title: "Claim Failed",
        description:
          err instanceof Error ? err.message : "Could not claim unstaked NEAR.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Computed modal available balance (reserves 0.05 NEAR for gas on LiNEAR deposits)
  const modalAvailable = useMemo(() => {
    if (!activeModalProtocol) return 0;
    return activeModalProtocol.assetSymbol === "NEAR"
      ? Math.max(0, Math.floor((availableNearNum - EARN_GAS_RESERVE_NEAR) * 1e6) / 1e6)
      : availableStablesNum;
  }, [activeModalProtocol, availableNearNum, availableStablesNum]);

  // Max depositable principal after reserving the 0.3% platform fee from wallet balance
  const modalMaxDeposit = useMemo(() => {
    if (modalAvailable <= 0) return 0;
    const rawMax = (modalAvailable * (10_000 - EARN_DEPOSIT_FEE_BPS)) / 10_000;
    return Math.max(0, Math.floor(rawMax * 1e4) / 1e4);
  }, [modalAvailable]);

  // Projected return in modal
  const inputNum = parseFloat(amountInput.replace(/,/g, "")) || 0;
  const projectedYearlyYield = activeModalProtocol
    ? inputNum * (activeModalProtocol.apy / 100)
    : 0;

  return (
    <div className="max-w-md mx-auto py-6 sm:py-10 px-3 space-y-6">
      {/* -------------------------------------------------------------
          HERO EARNING DISPLAY (Exact match to screenshot)
         ------------------------------------------------------------- */}
      <MotionReveal
        immediate
        delayMs={0}
        className="flex flex-col items-center justify-center text-center space-y-2.5"
      >
        <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400 select-none">
          Earning
        </span>

        <h1 className="text-5xl sm:text-6xl font-medium tracking-tight text-neutral-950 dark:text-white font-sans select-none tabular-nums">
          {hideBalance ? (
            "$••••••"
          ) : (
            <MotionNumber
              value={totalEarningUsd}
              format={(n) =>
                `$${n.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}`
              }
            />
          )}
        </h1>

        {/* Pill Badge: dynamic max live APY */}
        <div className="pt-0.5">
          <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-neutral-200/50 dark:bg-neutral-800/60 text-xs text-neutral-600 dark:text-neutral-300 font-medium border border-neutral-300/40 dark:border-white/[0.06] select-none">
            <span className="inline-flex items-center gap-1">
              Up to{" "}
              {apysLoaded ? (
                <strong className="font-bold text-neutral-950 dark:text-white">
                  {Math.max(...protocols.map((p) => p.apy)).toFixed(2)}% APY
                </strong>
              ) : (
                <span
                  aria-label="Loading live APY"
                  className="inline-block h-3.5 w-16 rounded-full bg-neutral-300/80 dark:bg-white/15 animate-pulse"
                />
              )}{" "}
              on your dollars
            </span>
          </div>
        </div>
      </MotionReveal>

      {/* -------------------------------------------------------------
          MAIN PROTOCOLS CARD (Exact match to screenshot)
         ------------------------------------------------------------- */}
      <MotionReveal
        immediate
        delayMs={70}
        className="rounded-[28px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-sm overflow-hidden"
      >
        {protocols.map((protocol, index) => {
          const pos = positions[protocol.protocolKey] || {
            depositedAmount: 0,
            depositedUsd: 0,
            earnedYieldUsd: 0,
            updatedAt: Date.now(),
          };
          const isExpanded = !!expandedDetails[protocol.id];

          return (
            <div
              key={protocol.id}
              className="group transition-colors duration-200 hover:bg-neutral-50/50 dark:hover:bg-white/[0.015]"
            >
              {/* Divider between protocol rows */}
              {index > 0 && (
                <div className="border-t border-neutral-100 dark:border-white/[0.06]" />
              )}

              <div className="p-5 sm:p-6 space-y-4">
                {/* Protocol Header Row */}
                <div className="flex items-start justify-between gap-4">
                  {/* Left: Icon + Title + APY */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    {/* Protocol Logo Emblem */}
                    <div className="shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-105">
                      {protocol.id === "linear" ? (
                        /* LiNEAR Protocol Emblem - Teal/Cyan mark on dark circle */
                        <div className="h-11 w-11 rounded-full bg-black flex items-center justify-center shadow-xs">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 19L19 5M5 12L12 5M12 19L19 12"
                              stroke="#00E599"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      ) : (
                        /* Burrow Finance Emblem - Blue circular wave mark */
                        <div className="h-11 w-11 rounded-full bg-gradient-to-tr from-[#0055AA] to-[#0099FF] flex items-center justify-center shadow-xs">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M6 16C9 19 15 19 18 16M4 11C8 7 16 7 20 11"
                              stroke="white"
                              strokeWidth="2.8"
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-neutral-950 dark:text-white tracking-tight">
                        {protocol.name}
                      </h3>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                        {apysLoaded ? (
                          protocol.apyLabel
                        ) : (
                          <span
                            aria-label="Loading live rate"
                            className="inline-block h-3.5 w-24 rounded-full bg-neutral-200 dark:bg-white/10 animate-pulse align-middle mt-0.5"
                          />
                        )}
                      </p>

                      {/* Subtext e.g. "Includes NEAR rewards ⌄" */}
                      {protocol.subtext && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic("light");
                            setExpandedDetails((prev) => ({
                              ...prev,
                              [protocol.id]: !prev[protocol.id],
                            }));
                          }}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors cursor-pointer select-none"
                        >
                          <span>{protocol.subtext}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Deposited Amount */}
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold text-sm sm:text-base text-neutral-950 dark:text-white tabular-nums">
                      {hideBalance ? (
                        "$••••••"
                      ) : (
                        <MotionNumber
                          value={pos.depositedUsd}
                          format={(n) =>
                            `$${n.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          }
                        />
                      )}
                    </div>
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 font-medium">
                      Deposited
                    </div>
                  </div>
                </div>

                {/* Collapsible Info Drawer */}
                {isExpanded && (
                  <div className="flow-anim-fade-up p-3.5 rounded-2xl bg-neutral-50 dark:bg-white/[0.04] border border-neutral-100 dark:border-white/[0.06] text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed space-y-2">
                    <p>{protocol.description}</p>
                    <div className="flex items-center justify-between pt-1 border-t border-neutral-200/50 dark:border-white/[0.06] text-[11px]">
                      <span className="font-mono text-neutral-400">
                        Contract: {protocol.contractId}
                      </span>
                      <a
                        href={protocol.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#FF1A1A] font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <span>View Explorer</span>
                        <IconExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                )}

                {/* Bottom Action: + Deposit Button */}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => openDepositModal(protocol)}
                    className="flow-press inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.08] dark:hover:bg-white/[0.12] text-neutral-900 dark:text-white transition-all cursor-pointer shadow-2xs"
                  >
                    <IconPlus size={13} className="text-neutral-600 dark:text-neutral-400" />
                    <span>Deposit</span>
                  </button>

                  {pos.depositedAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => openWithdrawModal(protocol)}
                      className="flow-press inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] transition-all cursor-pointer"
                    >
                      <span>Withdraw</span>
                    </button>
                  )}

                  {protocol.id === "linear" && linearUnstaked.amount > 0 && (
                    linearUnstaked.canWithdraw ? (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void handleClaimLinearUnstaked()}
                        className="flow-press inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Claim {linearUnstaked.amount.toFixed(4)} NEAR
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-neutral-100 dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300">
                        Unstaking (~48h)
                      </span>
                    )
                  )}

                  {(() => {
                    const activeProtocolJob = activeEarnJobs.find((j) =>
                      j.providerDepositMemo?.startsWith(
                        `EARN:${protocol.protocolKey.toUpperCase()}:`,
                      ),
                    );
                    if (!activeProtocolJob) return null;
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setTrackedJobFallback(activeProtocolJob);
                          setTrackedJobId(activeProtocolJob.publicId);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        Confirming on NEAR
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </MotionReveal>

      {/* -------------------------------------------------------------
          CROSS-CHAIN YIELD ROUTING FOOTER (FLOW's Edge)
         ------------------------------------------------------------- */}
      <MotionReveal
        immediate
        delayMs={140}
        className="p-4 rounded-2xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/[0.06] flex items-center justify-between gap-3 text-xs text-neutral-600 dark:text-neutral-400"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-6 w-6 rounded-lg bg-[#FF1A1A] text-white flex items-center justify-center shrink-0">
            <IconNearIntents size={13} />
          </div>
          <span className="truncate">
            Have <strong>USDC</strong> or <strong>SOL</strong>? Swap &amp; Earn in 1 step.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            triggerHaptic("light");
            onSelectConvert(undefined, "near-mainnet:NEAR");
          }}
          className="flow-btn-grow-arrow text-xs font-semibold text-[#FF1A1A] hover:underline cursor-pointer shrink-0 inline-flex items-center gap-1"
        >
          <span>Swap now</span>
          <span className="flow-arrow-grow inline-block">→</span>
        </button>
      </MotionReveal>

      {/* -------------------------------------------------------------
          FULLSCREEN PORTALLED MODAL (Fixes the clipped backdrop bug!)
         ------------------------------------------------------------- */}
      {mounted &&
        activeModalProtocol &&
        createPortal(
          <div className="fixed inset-0 z-[9999] overflow-y-auto flex items-center justify-center p-4 sm:p-6">
            {/* Edge-to-edge backdrop covering entire screen */}
            <div
              className="flow-anim-backdrop fixed inset-0 bg-neutral-950/60 backdrop-blur-md transition-opacity"
              onClick={() => setActiveModalProtocol(null)}
            />

            {/* Modal Dialog Card */}
            <div className="flow-anim-fade-up relative w-full max-w-sm sm:max-w-md my-auto rounded-[32px] bg-white dark:bg-[#161618] border border-neutral-200/90 dark:border-white/10 shadow-2xl p-6 sm:p-7 space-y-5 z-10">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Emblem */}
                  <div className="h-9 w-9 rounded-full bg-black flex items-center justify-center shrink-0">
                    {activeModalProtocol.id === "linear" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M5 19L19 5M5 12L12 5M12 19L19 12"
                          stroke="#00E599"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6 16C9 19 15 19 18 16M4 11C8 7 16 7 20 11"
                          stroke="#0099FF"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-neutral-950 dark:text-white leading-tight">
                      {modalAction === "DEPOSIT" ? "Deposit to" : "Withdraw from"}{" "}
                      {activeModalProtocol.name}
                    </h3>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      Powered by NEAR Protocol
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModalProtocol(null)}
                  className="h-8 w-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Close dialog"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Current Yield Banner */}
              <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 text-xs">
                <span className="text-neutral-600 dark:text-neutral-400 font-medium">
                  Current Yield
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {activeModalProtocol.apyLabel}
                </span>
              </div>

              {/* Deposit / Withdraw Input Form */}
              <div className="space-y-4">
                {/* Unstake info if withdrawing from LiNEAR */}
                {modalAction === "WITHDRAW" &&
                  activeModalProtocol.protocolKey === "linear" && (
                    <div className="p-3 rounded-2xl bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200/70 dark:border-white/[0.08] text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                      <strong>Standard Unstake (~48h):</strong> LiNEAR unstaking
                      takes ~4 NEAR epochs (~48 hours) before your NEAR becomes
                      available to claim back to your wallet.
                    </div>
                  )}

                <div>
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {modalAction === "DEPOSIT" ? "Wallet Balance:" : "Deposited Balance:"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                        {modalAction === "DEPOSIT"
                          ? `${modalAvailable.toFixed(2)} ${activeModalProtocol.assetSymbol}`
                          : `${(positions[activeModalProtocol.protocolKey]?.depositedAmount || 0).toFixed(2)} ${activeModalProtocol.assetSymbol}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (modalAction === "DEPOSIT") {
                            setAmountInput(modalMaxDeposit.toString());
                          } else {
                            const maxVal =
                              positions[activeModalProtocol.protocolKey]?.depositedAmount || 0;
                            setAmountInput(maxVal.toString());
                          }
                        }}
                        className="text-[#FF1A1A] font-bold hover:underline cursor-pointer"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] px-4 py-3 focus-within:border-neutral-900 dark:focus-within:border-white/30 transition-colors">
                    <input
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={amountInput}
                      onChange={(e) => {
                        const normalized = e.target.value
                          .replace(/,/g, ".")
                          .replace(/[^0-9.]/g, "");
                        const dotIdx = normalized.indexOf(".");
                        const cleaned =
                          dotIdx === -1
                            ? normalized
                            : normalized.slice(0, dotIdx + 1) +
                              normalized.slice(dotIdx + 1).replace(/\./g, "");
                        setAmountInput(cleaned);
                      }}
                      placeholder="0.00"
                      className="w-full text-2xl font-bold bg-transparent text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-hidden font-mono"
                      autoFocus
                    />
                    <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 shrink-0 pl-3 border-l border-neutral-200 dark:border-white/10">
                      {activeModalProtocol.assetSymbol}
                    </span>
                  </div>

                  {/* Quick percentage chips */}
                  <div className="flex items-center gap-2 mt-2">
                    {[0.25, 0.5, 0.75, 1].map((pct) => {
                      const baseVal =
                        modalAction === "DEPOSIT"
                          ? modalMaxDeposit
                          : positions[activeModalProtocol.protocolKey]?.depositedAmount || 0;
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() =>
                            setAmountInput(
                              pct === 1
                                ? baseVal.toString()
                                : (Math.floor(baseVal * pct * 10000) / 10000).toString(),
                            )
                          }
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                        >
                          {pct === 1 ? "Max" : `${pct * 100}%`}
                        </button>
                      );
                    })}
                  </div>
                  {modalAction === "DEPOSIT" ? (
                    <div className="mt-3 space-y-2">
                      {(() => {
                        const parsed = Number.parseFloat(amountInput);
                        const hasAmt = Number.isFinite(parsed) && parsed > 0;
                        const grossVal = hasAmt
                          ? (parsed * 10_000) / (10_000 - EARN_DEPOSIT_FEE_BPS)
                          : 0;
                        const feeVal = hasAmt ? grossVal - parsed : 0;
                        const dp = 4;
                        return (
                          <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/[0.06] px-3 py-2 text-[11px] space-y-1">
                            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
                              <span>FLOW platform fee ({EARN_DEPOSIT_FEE_LABEL})</span>
                              <span className="font-mono font-medium text-neutral-700 dark:text-neutral-300">
                                {hasAmt
                                  ? `${feeVal.toFixed(dp)} ${activeModalProtocol.assetSymbol} · from balance`
                                  : `${EARN_DEPOSIT_FEE_LABEL} from balance`}
                              </span>
                            </div>
                            {hasAmt && (
                              <div className="flex items-center justify-between text-neutral-600 dark:text-neutral-300 font-medium">
                                <span>Total from balance</span>
                                <span className="font-mono font-semibold text-neutral-950 dark:text-white">
                                  {grossVal.toFixed(dp)} {activeModalProtocol.assetSymbol}
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {activeModalProtocol.protocolKey === "burrow"
                          ? `Uses USDC on NEAR Mainnet · Requires ${BURROW_FIRST_DEPOSIT_RESERVE_NEAR.toFixed(2)} NEAR minimum for first-time storage + gas (wallet: ${availableNearNum.toFixed(2)} NEAR).`
                          : `Minimum ${EARN_GAS_RESERVE_NEAR.toFixed(2)} NEAR is reserved for gas and storage (wallet: ${availableNearNum.toFixed(4)} NEAR).`}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/[0.06] px-3 py-2 text-[11px] flex items-center justify-between text-neutral-500 dark:text-neutral-400">
                      <span>FLOW withdrawal fee</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        0% (Free)
                      </span>
                    </div>
                  )}
                </div>

                {/* If zero balance: provide quick actions to deposit or swap */}
                {modalAction === "DEPOSIT" && modalAvailable === 0 && (
                  <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/[0.08] space-y-2.5">
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      You have <strong className="text-neutral-900 dark:text-white">0.00 {activeModalProtocol.assetSymbol}</strong> in your account. Deposit or swap to start earning:
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModalProtocol(null);
                          onSelectDeposit(
                            activeModalProtocol.assetSymbol === "NEAR"
                              ? "near-mainnet:NEAR"
                              : "near-mainnet:USDC",
                          );
                        }}
                        className="flow-liquid-btn-primary flow-press py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <IconPlus size={12} />
                        <span>Deposit {activeModalProtocol.assetSymbol}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModalProtocol(null);
                          onSelectConvert(undefined, "near-mainnet:NEAR");
                        }}
                        className="flow-liquid-btn flow-press py-2 rounded-xl text-xs font-semibold text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-white/10 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <IconSwap size={12} />
                        <span>Swap & Earn</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Projected annual returns if depositing */}
                {modalAction === "DEPOSIT" && inputNum > 0 && (
                  <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.04] border border-neutral-100 dark:border-white/[0.06] flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Est. Annual Return:</span>
                    <strong className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{projectedYearlyYield.toFixed(2)} {activeModalProtocol.assetSymbol} / yr
                    </strong>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="button"
                  disabled={
                    isSubmitting ||
                    (modalAction === "DEPOSIT" &&
                      (modalMaxDeposit <= 0 ||
                        inputNum > modalMaxDeposit ||
                        inputNum <= 0)) ||
                    (modalAction === "WITHDRAW" && inputNum <= 0)
                  }
                  onClick={() =>
                    void (modalAction === "DEPOSIT"
                      ? handleExecuteDeposit()
                      : handleExecuteWithdraw())
                  }
                  className="flow-liquid-btn-primary flow-press w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      <span>Processing {modalAction === "DEPOSIT" ? "Deposit" : "Withdrawal"}...</span>
                    </>
                  ) : modalAction === "DEPOSIT" && modalMaxDeposit <= 0 ? (
                    <span>Insufficient {activeModalProtocol.assetSymbol} Balance</span>
                  ) : modalAction === "DEPOSIT" && inputNum > modalMaxDeposit ? (
                    <span>Exceeds Available Balance (incl. {EARN_DEPOSIT_FEE_LABEL} fee)</span>
                  ) : (
                    <span>
                      Confirm {modalAction === "DEPOSIT" ? "Deposit" : "Withdrawal"}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* -------------------------------------------------------------
          LIVE EARN SETTLEMENT TRACKER MODAL
         ------------------------------------------------------------- */}
      {mounted &&
        trackedJob &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => {
                if (trackedJobIsTerminal) {
                  setTrackedJobId(null);
                  setTrackedJobFallback(null);
                }
              }}
            />

            <div className="relative z-10 w-full max-w-md space-y-3">
              <PaymentTimelineTracker
                transfer={{
                  id: trackedJob.publicId,
                  publicId: trackedJob.publicId,
                  jobKind: "SEND",
                  sourceNetwork: "near-mainnet",
                  sourceAssetSymbol: trackedJob.sourceAssetSymbol,
                  sourceDisplayAmount: trackedJob.sourceDisplayAmount,
                  destinationNetwork: "near-mainnet",
                  destinationAssetSymbol: trackedJob.providerDepositMemo?.includes(
                    ":LINEAR:",
                  )
                    ? "LiNEAR"
                    : "Burrow Finance",
                  quotedDestinationDisplayAmount: trackedJob.sourceDisplayAmount,
                  status: trackedJob.status,
                  sourceTxHash: trackedJob.sourceTxHash ?? null,
                  destinationTxHash: null,
                  errorMessage:
                    trackedJob.errorMessage ?? trackedJob.errorCode ?? null,
                  settledAt:
                    (trackedJob as { settledAt?: string | null }).settledAt ??
                    null,
                  createdAt:
                    trackedJob.createdAt ?? new Date().toISOString(),
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setTrackedJobId(null);
                  setTrackedJobFallback(null);
                }}
                className="w-full py-3 rounded-2xl text-xs font-semibold bg-[#1D1D1F] hover:bg-[#2A2A2D] border border-white/[0.1] text-white transition-colors cursor-pointer shadow-lg"
              >
                {trackedJobIsTerminal ? "Done" : "Hide (continues in background)"}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
