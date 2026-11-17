"use client";

import { useEffect, useRef, useState } from "react";
import { FlowMark } from "./flow-logo.tsx";

export interface TrackedTransfer {
  readonly id: string;
  readonly publicId: string;
  readonly jobKind: "SEND" | "CONVERT" | "CHECKOUT";
  readonly sourceNetwork: string;
  readonly sourceAssetSymbol: string;
  readonly sourceDisplayAmount: string;
  readonly destinationNetwork: string;
  readonly destinationAssetSymbol: string;
  readonly quotedDestinationDisplayAmount: string | null;
  readonly status: string;
  readonly sourceTxHash: string | null;
  readonly destinationTxHash: string | null;
  readonly errorMessage: string | null;
  readonly settledAt: string | null;
  readonly createdAt: string;
}

interface TimelineStep {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
}

const TIMELINE_STEPS: readonly TimelineStep[] = [
  { id: "initiated", label: "Payment initiated." },
  { id: "deposited", label: "Funds deposited." },
  { id: "executing", label: "Cross-chain execution underway." },
  { id: "settling", label: "Settlement processing." },
  { id: "completed", label: "Payment completed." },
];

function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function resolveStage(transfer: TrackedTransfer): {
  completedMax: number;
  activeIndex: number;
  isSettled: boolean;
  isIssue: boolean;
} {
  const status = transfer.status.toUpperCase();
  if (status === "SETTLED") {
    return {
      completedMax: 4,
      activeIndex: -1,
      isSettled: true,
      isIssue: false,
    };
  }
  if (
    status === "FAILED" ||
    status === "REFUNDED" ||
    status === "EXCEPTION_REFUND_REQUIRED" ||
    status === "UNKNOWN_AMBIGUOUS" ||
    status === "RECONCILIATION_REQUIRED"
  ) {
    const reached = transfer.destinationTxHash
      ? 3
      : transfer.sourceTxHash
        ? 1
        : 0;
    return {
      completedMax: reached,
      activeIndex: reached + 1,
      isSettled: false,
      isIssue: true,
    };
  }
  if (status === "SETTLING" || status === "CONFIRMING") {
    return { completedMax: 3, activeIndex: 4, isSettled: false, isIssue: false };
  }
  if (status === "SUBMITTED" || status === "PROCESSING" || status === "DETECTED") {
    return { completedMax: 2, activeIndex: 3, isSettled: false, isIssue: false };
  }
  if (
    status === "DEPOSIT_CONFIRMED" ||
    status === "SIGNING_IN_PROGRESS" ||
    Boolean(transfer.sourceTxHash)
  ) {
    return { completedMax: 1, activeIndex: 2, isSettled: false, isIssue: false };
  }
  return { completedMax: 0, activeIndex: 1, isSettled: false, isIssue: false };
}

function buildIssueExplanation(transfer: TrackedTransfer): {
  headline: string;
  whatHappened: string;
  fundsStatus: string;
} {
  const status = transfer.status.toUpperCase();
  if (status === "REFUNDED" || status === "EXCEPTION_REFUND_REQUIRED") {
    return {
      headline: "Payment could not complete — funds refunded.",
      whatHappened:
        transfer.errorMessage ||
        "The cross-chain route expired or slipped outside its quote window before final delivery.",
      fundsStatus:
        "Your funds are automatically returned to the refund/sender wallet.",
    };
  }
  if (status === "UNKNOWN_AMBIGUOUS" || status === "RECONCILIATION_REQUIRED") {
    return {
      headline: "Confirming final network status.",
      whatHappened:
        transfer.errorMessage ||
        "The source network response timed out while broadcasting or confirming.",
      fundsStatus:
        "Your funds are safe and tracked. We are verifying whether the transaction finalized or will be refunded automatically.",
    };
  }
  if (transfer.sourceTxHash) {
    return {
      headline: "Cross-chain execution failed.",
      whatHappened:
        transfer.errorMessage ||
        "The settlement route encountered an execution error after deposit.",
      fundsStatus:
        "Any unfulfilled funds are automatically routed back to your FLOW wallet.",
    };
  }
  return {
    headline: "Payment failed before funds left your wallet.",
    whatHappened:
      transfer.errorMessage ||
      "The transaction could not be submitted to the network.",
    fundsStatus:
      "No funds were deducted. Your FLOW wallet balance remains intact.",
  };
}

function buildInitialStepTimes(transfer: TrackedTransfer): Record<number, string> {
  const map: Record<number, string> = {
    0: formatClockTime(transfer.createdAt),
  };
  if (transfer.settledAt) {
    map[4] = formatClockTime(transfer.settledAt);
  }
  return map;
}

export function PaymentTimelineTracker({
  transfer,
}: {
  transfer: TrackedTransfer;
}) {
  const { completedMax, activeIndex, isSettled, isIssue } =
    resolveStage(transfer);

  // Record the exact timestamp each milestone was first reached on this client
  const [stepTimes, setStepTimes] = useState<Record<number, string>>(() =>
    buildInitialStepTimes(transfer),
  );
  const prevTransferIdRef = useRef(transfer.id);

  useEffect(() => {
    if (prevTransferIdRef.current !== transfer.id) {
      prevTransferIdRef.current = transfer.id;
      setStepTimes(buildInitialStepTimes(transfer));
      return;
    }

    setStepTimes((prev) => {
      const next = { ...prev };
      let changed = false;
      const nowClock = new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      for (let idx = 0; idx <= completedMax; idx += 1) {
        if (!next[idx]) {
          next[idx] =
            idx === 0
              ? formatClockTime(transfer.createdAt) || nowClock
              : idx === 4 && transfer.settledAt
                ? formatClockTime(transfer.settledAt)
                : nowClock;
          changed = true;
        }
      }
      if (transfer.settledAt && !next[4]) {
        next[4] = formatClockTime(transfer.settledAt);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [transfer.id, transfer.createdAt, transfer.settledAt, completedMax]);

  const issue = isIssue ? buildIssueExplanation(transfer) : null;
  const visibleSteps = isIssue
    ? TIMELINE_STEPS.slice(0, Math.min(TIMELINE_STEPS.length, completedMax + 1))
    : TIMELINE_STEPS;

  return (
    <div className="flow-anim-fade-up mt-4 rounded-3xl border border-neutral-200/80 dark:border-white/[0.09] bg-[#1D1D1F] dark:bg-[#19191B] text-white p-5 sm:p-6 shadow-xl">
      {/* Compact Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 mb-5 border-b border-white/[0.08]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
            {transfer.jobKind === "CONVERT"
              ? "Live Conversion Tracker"
              : "Live Payment Tracker"}
          </p>
          <p className="text-sm font-semibold text-white mt-0.5 tabular-nums">
            {transfer.sourceDisplayAmount} {transfer.sourceAssetSymbol} →{" "}
            {transfer.quotedDestinationDisplayAmount ?? transfer.sourceDisplayAmount}{" "}
            {transfer.destinationAssetSymbol}
          </p>
        </div>
        <span className="font-mono text-[11px] text-neutral-400">
          {transfer.publicId}
        </span>
      </div>

      {/* Vertical Milestone Timeline */}
      <div className="relative space-y-6">
        {visibleSteps.map((step, idx) => {
          const isCompleted = idx <= completedMax;
          const isActive = !isSettled && !isIssue && idx === activeIndex;
          const isLast = idx === visibleSteps.length - 1 && !isIssue;
          const timestamp =
            stepTimes[idx] ||
            (isCompleted
              ? formatClockTime(
                  idx === 4 && transfer.settledAt
                    ? transfer.settledAt
                    : transfer.createdAt,
                )
              : "");

          const railFilled = idx < completedMax;
          const railAdvancing = !isIssue && idx === completedMax && !isSettled;

          return (
            <div key={step.id} className="relative flex items-start gap-4">
              {/* Vertical Connector Rail */}
              {!isLast && (
                <div
                  aria-hidden="true"
                  className="absolute left-[17px] top-9 bottom-[-24px] w-[2px] bg-white/10 overflow-hidden rounded-full"
                >
                  <div
                    className={`w-full transition-all duration-700 ease-out rounded-full ${
                      railFilled
                        ? "h-full bg-[#3EA63B]"
                        : railAdvancing
                          ? "h-1/2 bg-gradient-to-b from-[#3EA63B] to-emerald-400/20 animate-pulse"
                          : "h-0 bg-transparent"
                    }`}
                  />
                </div>
              )}

              {/* Milestone Node with FLOW Logo */}
              <div className="relative shrink-0 mt-0.5">
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full bg-[#3EA63B]/40 animate-ping"
                  />
                )}
                <div
                  className={`relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-500 ${
                    isCompleted
                      ? idx === visibleSteps.length - 1 && isSettled
                        ? "bg-[#3EA63B] shadow-[0_0_20px_rgba(62,166,59,0.45)] ring-4 ring-[#3EA63B]/20"
                        : "bg-white shadow-sm ring-4 ring-[#3EA63B]/40"
                      : isActive
                        ? "bg-[#2C2C2E] ring-2 ring-[#3EA63B] shadow-[0_0_16px_rgba(62,166,59,0.3)]"
                        : "bg-white/[0.06] ring-1 ring-white/15 opacity-55"
                  }`}
                >
                  <FlowMark
                    size={18}
                    variant={
                      isCompleted && !(idx === visibleSteps.length - 1 && isSettled)
                        ? "mono-black"
                        : "mono-white"
                    }
                    className={
                      isActive ? "animate-pulse" : ""
                    }
                  />
                </div>
              </div>

              {/* Step Copy + Timestamp */}
              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={`text-sm sm:text-[15px] font-semibold leading-snug transition-colors duration-300 ${
                    isCompleted || isActive
                      ? "text-white"
                      : "text-neutral-400"
                  }`}
                >
                  {step.label}
                </p>
                <p className="text-xs sm:text-[13px] text-neutral-400 tabular-nums mt-0.5">
                  {timestamp || (isActive ? "In progress..." : "Pending")}
                </p>
              </div>
            </div>
          );
        })}

        {/* Failure / Refund / Ambiguous Node */}
        {isIssue && issue && (
          <div className="relative flex items-start gap-4 flow-anim-fade-up">
            <div className="relative shrink-0 mt-0.5">
              <div
                className={`relative w-9 h-9 rounded-full flex items-center justify-center ring-4 ${
                  transfer.status.toUpperCase() === "UNKNOWN_AMBIGUOUS" ||
                  transfer.status.toUpperCase() === "RECONCILIATION_REQUIRED"
                    ? "bg-amber-500 ring-amber-500/25"
                    : "bg-[#FF1A1A] ring-[#FF1A1A]/25"
                }`}
              >
                <FlowMark size={18} variant="mono-white" />
              </div>
            </div>
            <div className="min-w-0 flex-1 rounded-2xl border border-red-500/25 bg-red-500/10 p-3.5 space-y-1.5">
              <p className="text-sm font-semibold text-white">
                {issue.headline}
              </p>
              <p className="text-xs text-neutral-200 leading-relaxed">
                <span className="font-semibold text-white">What happened: </span>
                {issue.whatHappened}
              </p>
              <p className="text-xs text-emerald-300 leading-relaxed">
                <span className="font-semibold">Your funds: </span>
                {issue.fundsStatus}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Compact On-Chain Hashes (shown only once settled) */}
      {isSettled && (transfer.sourceTxHash || transfer.destinationTxHash) && (
        <div className="mt-5 pt-4 border-t border-white/[0.08] space-y-1 text-[11px] text-neutral-400 font-mono">
          {transfer.sourceTxHash && (
            <p className="truncate">Source tx: {transfer.sourceTxHash}</p>
          )}
          {transfer.destinationTxHash && (
            <p className="truncate">Destination tx: {transfer.destinationTxHash}</p>
          )}
        </div>
      )}
    </div>
  );
}
