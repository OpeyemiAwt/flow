"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicPaymentRequest } from "../../../domain/payment-requests.ts";
import type {
  IndicativeQuote,
  PaymentDepositInstructions,
} from "../../../domain/quote-discovery.ts";
import { FlowLogo } from "../../../components/flow-logo.tsx";
import { PaymentTimelineTracker } from "../../../components/payment-timeline-tracker.tsx";
import { QrCode } from "../../../components/qr-code.tsx";
import {
  AssetAvatar,
  ChainBadge,
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconWallet,
} from "../../../components/icons.tsx";
import { UnifiedAssetSelectorModal } from "../../../components/unified-asset-selector-modal.tsx";
import type { DiscoveredToken } from "../../../server/providers/near-intents-discovery.ts";
import { CombinedAssetNetworkPicker } from "../../../components/combined-asset-network-picker.tsx";
import { useQuotePreview } from "../../../components/use-quote-preview.ts";
import { parseDisplayToAtomic } from "../../../domain/atomic-amounts.ts";
import { getExplorerUrl } from "../../../domain/activities.ts";
import {
  supportsQuoteAddress,
  validateQuoteAddress,
} from "../../../domain/quote-addresses.ts";

function formatNetworkDisplay(network: string | null | undefined): string {
  const norm = (network ?? "").toLowerCase().trim();
  if (norm.startsWith("near")) {
    return norm.includes("testnet") ? "NEAR Testnet" : "NEAR Mainnet";
  }
  if (norm.startsWith("solana")) {
    return norm.includes("devnet") ? "Solana Devnet" : "Solana Mainnet";
  }
  if (norm.startsWith("base")) {
    return norm.includes("sepolia") ? "Base Sepolia" : "Base Mainnet";
  }
  if (norm.startsWith("ethereum")) {
    return norm.includes("sepolia") ? "Ethereum Sepolia" : "Ethereum Mainnet";
  }
  return network || "Supported Network";
}
import {
  MAINNET_SUPPORTED_DEPLOYMENTS,
  isSamePaymentDeployment,
  type CatalogTokenDeployment,
} from "../../../domain/supported-assets-catalog.ts";

interface CheckoutViewProps {
  request: PublicPaymentRequest;
  executionDisabled?: boolean;
}

type PayerMode = "WALLET" | "EXCHANGE";

type SourceAssetSelection = CatalogTokenDeployment | DiscoveredToken;

export function CheckoutView({
  request,
  executionDisabled = false,
}: CheckoutViewProps) {
  const stableChoices = useMemo(
    () =>
      MAINNET_SUPPORTED_DEPLOYMENTS.filter(
        (deployment) =>
          deployment.kind === "STABLECOIN" &&
          request.eligibleSourceRoutes.some(
            (route) => route.id === deployment.id,
          ),
      ),
    [request.eligibleSourceRoutes],
  );
  const initialStable =
    stableChoices.find((route) => route.id === request.destinationAssetId) ??
    stableChoices[0];
  const [selectedSource, setSelectedSource] =
    useState<SourceAssetSelection | null>(initialStable ?? null);
  const [payerMode, setPayerMode] = useState<PayerMode>("WALLET");
  const [payTab, setPayTab] = useState<"STABLES" | "ANY_TOKEN">("STABLES");
  const selectedEcosystem = selectedSource?.ecosystem;
  const [customAmount, setCustomAmount] = useState("");
  const [refundAddress, setRefundAddress] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAnyTokenModalOpen, setIsAnyTokenModalOpen] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const isExpired =
    request.status === "EXPIRED" || request.isExpired || deadlinePassed;
  const isReadOnly =
    isExpired || request.status !== "ACTIVE" || !request.recipientAddress;
  useEffect(() => {
    if (!request.expiresAt) return;
    const deadline = Date.parse(request.expiresAt);
    if (!Number.isFinite(deadline)) return;
    let timer: number;
    const check = () => {
      const delay = deadline - Date.now();
      if (delay <= 0) setDeadlinePassed(true);
      else timer = window.setTimeout(check, Math.min(delay, 2_147_483_647));
    };
    timer = window.setTimeout(check, 0);
    return () => window.clearTimeout(timer);
  }, [request.expiresAt]);

  // Deposit Instructions & Settlement Lifecycle State
  const [instructions, setInstructions] =
    useState<PaymentDepositInstructions | null>(request.activeAttempt ?? null);
  const [attemptInitiatedAt] = useState<string>(() => new Date().toISOString());
  const attemptStorageKey = `flow-checkout-attempt:${request.publicId}`;

  // Persist active deposit attempt across reloads & restore on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (instructions?.attemptPublicId) {
      try {
        window.localStorage.setItem(
          attemptStorageKey,
          instructions.attemptPublicId,
        );
      } catch {
        // ignore storage errors
      }
      const url = new URL(window.location.href);
      if (url.searchParams.get("attempt") !== instructions.attemptPublicId) {
        url.searchParams.set("attempt", instructions.attemptPublicId);
        window.history.replaceState(null, "", url.toString());
      }
      return;
    }
  }, [attemptStorageKey, instructions?.attemptPublicId]);

  useEffect(() => {
    if (typeof window === "undefined" || instructions || isReadOnly) return;
    let savedAttemptId: string | null = null;
    try {
      savedAttemptId = window.localStorage.getItem(attemptStorageKey);
    } catch {
      savedAttemptId = null;
    }
    if (!savedAttemptId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/pay/${request.publicId}/attempt/${savedAttemptId}`,
          { cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const latest = (await res.json()) as PaymentDepositInstructions;
        const isStillRelevant =
          latest.status === "DETECTED" ||
          latest.status === "SETTLING" ||
          latest.status === "SETTLED" ||
          latest.status === "EXCEPTION_REFUND_REQUIRED" ||
          latest.status === "RECONCILIATION_REQUIRED" ||
          Boolean(latest.sourceTxHash) ||
          (latest.status === "DEPOSIT_COMMITTED" &&
            Date.parse(latest.depositDeadline) > Date.now());
        if (isStillRelevant && !cancelled) {
          setInstructions(latest);
        }
      } catch {
        // ignore restore errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptStorageKey, instructions, isReadOnly, request.publicId]);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [directVisible, setDirectVisible] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);
  const [depositSecondsRemaining, setDepositSecondsRemaining] =
    useState<number>(900);

  // Copy Feedback State
  const [copiedRecipientAddress, setCopiedRecipientAddress] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(request.shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyRecipientAddress = () => {
    if (!request.recipientAddress) {
      console.warn(
        `[FLOW Reconciliation] Recipient address is unavailable for payment request ${request.publicId}`,
      );
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(request.recipientAddress);
      setCopiedRecipientAddress(true);
      setTimeout(() => setCopiedRecipientAddress(false), 2000);
    }
  };

  const handleCopyAmount = () => {
    if (
      !canShowDeposit ||
      Date.parse(instructions?.depositDeadline ?? "") <= Date.now()
    )
      return;
    const amt = instructions?.requiredDisplayAmount;
    if (amt && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(amt);
      setCopiedAmount(true);
      setTimeout(() => setCopiedAmount(false), 2000);
    }
  };

  const selectSource = (source: SourceAssetSelection | null) => {
    if (source?.networkKey !== selectedSource?.networkKey) setRefundAddress("");
    setSelectedSource(source);
  };
  const handleSelectEcosystem = (ecosystem: "evm" | "solana" | "near") => {
    const first = stableChoices.find(
      (source) => source.ecosystem === ecosystem,
    );
    if (first && selectedSource?.ecosystem !== ecosystem) selectSource(first);
  };

  const isFundedOrProcessing =
    instructions !== null &&
    (instructions.status === "DETECTED" ||
      instructions.status === "SETTLING" ||
      instructions.status === "SETTLED" ||
      Boolean(instructions.sourceTxHash));

  const isUnderReview =
    instructions !== null && instructions.status === "RECONCILIATION_REQUIRED";

  const isRefundRequiredState =
    instructions !== null &&
    instructions.status === "EXCEPTION_REFUND_REQUIRED";

  const isFailedState =
    instructions !== null && instructions.status === "FAILED";

  // An attempt is ONLY expired if it is strictly awaiting deposit (unfunded)
  // and its deposit deadline has elapsed, or if the server explicitly marked it EXPIRED.
  const isDepositExpired =
    instructions !== null &&
    !isFundedOrProcessing &&
    !isUnderReview &&
    !isRefundRequiredState &&
    !isFailedState &&
    Boolean(
      instructions.depositDeadline || instructions.status === "EXPIRED",
    ) &&
    (isReadOnly ||
      depositSecondsRemaining <= 0 ||
      instructions.status === "EXPIRED");

  const canShowDeposit =
    instructions?.status === "DEPOSIT_COMMITTED" &&
    Boolean(instructions.depositAddress && instructions.depositDeadline) &&
    !isFundedOrProcessing &&
    !isDepositExpired &&
    !isReadOnly;

  const [confirmLeaveModal, setConfirmLeaveModal] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const executeBackToPaymentSelection = () => {
    setConfirmLeaveModal(null);
    try {
      window.localStorage.removeItem(attemptStorageKey);
      const url = new URL(window.location.href);
      if (url.searchParams.has("attempt")) {
        url.searchParams.delete("attempt");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // ignore
    }
    setInstructions(null);
    setRefreshTrigger((n) => n + 1);
  };

  // Stage B Navigation: Return safely to Payment Selection
  const handleBackToPaymentSelection = () => {
    if (isReadOnly) return;
    if (isFundedOrProcessing) {
      setConfirmLeaveModal({
        title: "Settlement in progress",
        message:
          "A deposit has already been detected or is currently settling. Navigating away will not cancel settlement. Return to payment selection anyway?",
      });
      return;
    }
    if (isUnderReview) {
      setConfirmLeaveModal({
        title: "Payment under review",
        message:
          "This payment attempt is currently under review. Navigating away will not cancel review. Return to payment selection anyway?",
      });
      return;
    }
    if (
      depositSecondsRemaining > 0 &&
      instructions &&
      instructions.status !== "EXPIRED" &&
      instructions.status !== "FAILED"
    ) {
      setConfirmLeaveModal({
        title: "Leave active payment instructions?",
        message:
          "Payment instructions are currently active. Returning to payment selection will not cancel your pending deposit address. Return anyway?",
      });
      return;
    }
    executeBackToPaymentSelection();
  };

  // Stage B Regeneration: Recheck state and generate fresh quote
  const handleGenerateNewQuote = async () => {
    if (!instructions || isReadOnly) return;
    if (isFundedOrProcessing || isUnderReview) return;
    try {
      const res = await fetch(
        `/api/pay/${request.publicId}/attempt/${instructions.attemptPublicId}`,
      );
      if (res.ok) {
        const latest = (await res.json()) as PaymentDepositInstructions;
        if (
          latest.status === "SETTLING" ||
          latest.status === "SETTLED" ||
          latest.status === "DETECTED" ||
          latest.status === "EXCEPTION_REFUND_REQUIRED" ||
          latest.status === "RECONCILIATION_REQUIRED" ||
          Boolean(latest.sourceTxHash)
        ) {
          setInstructions(latest);
          return;
        }
      }
    } catch {
      // Network failure, safe to fall back to resetting
    }
    try {
      window.localStorage.removeItem(attemptStorageKey);
      const url = new URL(window.location.href);
      if (url.searchParams.has("attempt")) {
        url.searchParams.delete("attempt");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // ignore
    }
    setInstructions(null);
    setRefreshTrigger((n) => n + 1);
  };

  const destination = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (asset) =>
      asset.id === request.destinationAssetId &&
      asset.networkKey === request.destinationNetwork &&
      asset.decimals === request.destinationDecimals,
  );
  const isDirect = Boolean(
    selectedSource &&
    destination &&
    isSamePaymentDeployment(selectedSource, destination),
  );
  const isCrossChain = Boolean(selectedSource && !isDirect);
  const sourceAddressSupported = Boolean(
    selectedSource && supportsQuoteAddress(selectedSource),
  );
  const isRefundRequired = payerMode === "EXCHANGE" || isCrossChain;
  const trimmedRefund = refundAddress.trim();
  const refundValidationMessage = (() => {
    if (!selectedSource || (!isRefundRequired && !trimmedRefund)) return null;
    if (
      request.recipientAddress &&
      (request.recipientAddress === trimmedRefund ||
        (trimmedRefund.startsWith("0x") &&
          request.recipientAddress.toLowerCase() ===
            trimmedRefund.toLowerCase()))
    )
      return "Enter a payer-controlled address distinct from the recipient.";
    return validateQuoteAddress(selectedSource, trimmedRefund).reason ?? null;
  })();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  let amountAtomic = request.requestedAtomicAmount;
  if (request.amountMode === "OPTIONAL") {
    try {
      amountAtomic = selectedSource
        ? parseDisplayToAtomic(customAmount, selectedSource.decimals).toString()
        : null;
    } catch {
      amountAtomic = null;
    }
  }
  const quoteBody =
    selectedSource &&
    JSON.stringify({
      sourceDeploymentId: selectedSource.id,
      payerMode,
      refundAddress: trimmedRefund || undefined,
      customSourceDisplayAmount:
        request.amountMode === "OPTIONAL" ? customAmount : undefined,
    });
  const quoteKey =
    !instructions &&
    !isReadOnly &&
    isCrossChain &&
    !refundValidationMessage &&
    amountAtomic &&
    amountAtomic !== "0" &&
    quoteBody
      ? JSON.stringify([
          request.publicId,
          request.destinationAssetId,
          request.destinationNetwork,
          request.recipientAddress,
          amountAtomic,
          quoteBody,
          refreshTrigger,
        ])
      : null;
  const {
    quote,
    error: quoteError,
    loading: loadingQuote,
    load,
  } = useQuotePreview<IndicativeQuote>(quoteKey);
  useEffect(() => {
    if (!quoteKey || !quoteBody) return;
    const timer = window.setTimeout(() => {
      void load(async (signal) => {
        const requestVersion = crypto.randomUUID();
        const response = await fetch(
          "/api/pay/" + request.publicId + "/quote",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...JSON.parse(quoteBody), requestVersion }),
            signal,
            cache: "no-store",
          },
        );
        const data = (await response.json()) as IndicativeQuote & {
          error?: string;
        };
        if (!response.ok || data.routeStatus !== "SUPPORTED_AND_QUOTABLE") {
          throw new Error(
            data.statusMessage ??
              data.error ??
              "The selected route could not be quoted.",
          );
        }
        const isMerchantFeeAbsorbed =
          request.amountMode === "FIXED" &&
          request.feePayer === "MERCHANT" &&
          data.identity?.swapType === "EXACT_INPUT";
        const expectedSwapType =
          request.amountMode === "FIXED" ? "EXACT_OUTPUT" : "EXACT_INPUT";
        if (
          data.requestVersion !== requestVersion ||
          data.payerMode !== payerMode ||
          typeof data.isExecutionDisabled !== "boolean" ||
          data.identity?.operationId !== request.publicId ||
          data.identity.sourceNetwork !== selectedSource?.networkKey ||
          data.identity.destinationNetwork !== request.destinationNetwork ||
          (!isMerchantFeeAbsorbed &&
            data.identity.swapType !== expectedSwapType) ||
          (selectedSource &&
            "assetId" in selectedSource &&
            data.identity.originAsset !== selectedSource.assetId) ||
          data.identity.recipient !== request.recipientAddress ||
          data.identity.refundTo !== trimmedRefund ||
          (!isMerchantFeeAbsorbed &&
            data.identity.amountAtomic !== amountAtomic) ||
          data.destinationAssetId !== request.destinationAssetId ||
          data.sourceAssetId !== selectedSource?.id
        )
          throw new Error("The quote did not match the selected route.");
        return { quote: data, expiresAt: data.identity.expiresAt };
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    amountAtomic,
    load,
    payerMode,
    quoteBody,
    quoteKey,
    request.amountMode,
    request.destinationAssetId,
    request.destinationNetwork,
    request.feePayer,
    request.publicId,
    request.recipientAddress,
    selectedSource,
    trimmedRefund,
  ]);

  const [quoteSecondsRemaining, setQuoteSecondsRemaining] = useState(0);
  const quoteDeadline = quote?.identity?.expiresAt;
  useEffect(() => {
    if (!quoteDeadline) return;
    const deadline = Date.parse(quoteDeadline);
    const update = () =>
      setQuoteSecondsRemaining(
        Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
      );
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [quoteDeadline]);

  const directDisplay =
    isDirect && payerMode === "WALLET" && amountAtomic && amountAtomic !== "0"
      ? request.amountMode === "FIXED"
        ? request.displayAmount
        : customAmount
      : null;
  const quotedSendAmount = quote?.sourceDisplayAmount ?? directDisplay;
  const displaySource =
    quotedSendAmount && selectedSource
      ? quotedSendAmount + " " + selectedSource.symbol
      : "—";
  const flowFee = quote?.fees.appFeeBps === 0 ? "0" : "Unavailable";
  const routeUnavailable = Boolean(
    selectedSource &&
    (!sourceAddressSupported ||
      quoteError === "Route unavailable" ||
      (isDirect && payerMode === "EXCHANGE")),
  );

  // Countdown timer for deposit deadline
  useEffect(() => {
    if (!instructions || !instructions.depositDeadline) return;
    const deadlineMs = new Date(instructions.depositDeadline).getTime();

    const updateTimer = () => {
      const remaining = Math.max(
        0,
        Math.floor((deadlineMs - Date.now()) / 1000),
      );
      setDepositSecondsRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [instructions]);

  // Status Polling when instructions are issued and not yet settled
  useEffect(() => {
    if (
      !instructions ||
      instructions.status === "SETTLED" ||
      instructions.status === "FAILED"
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/pay/${request.publicId}/attempt/${instructions.attemptPublicId}`,
        );
        if (res.ok) {
          const updated = (await res.json()) as PaymentDepositInstructions;
          setInstructions(updated);
        }
      } catch {
        // Handled silently
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [instructions, request.publicId]);

  const handleCopyDepositAddress = () => {
    if (
      canShowDeposit &&
      instructions &&
      Date.parse(instructions.depositDeadline) > Date.now() &&
      typeof navigator !== "undefined" &&
      navigator.clipboard
    ) {
      void navigator.clipboard.writeText(instructions.depositAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleCopyMemo = () => {
    if (
      canShowDeposit &&
      instructions?.depositMemo &&
      Date.parse(instructions.depositDeadline) > Date.now() &&
      typeof navigator !== "undefined" &&
      navigator.clipboard
    ) {
      void navigator.clipboard.writeText(instructions.depositMemo);
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    }
  };

  const isCompletedReceipt =
    instructions?.status === "SETTLED" &&
    Boolean(instructions.destinationTxHash);

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-950 dark:text-neutral-100 relative overflow-hidden transition-colors duration-200">
      {/* Top-Right & Bottom-Left Red Diagonal Wave Accents */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-10 right-0 w-[340px] sm:w-[500px] h-[200px] z-0 overflow-hidden"
      >
        <svg viewBox="0 0 500 200" fill="none" className="w-full h-full">
          <path
            d="M120 -20 C240 80, 360 20, 520 150 L520 -20 Z"
            fill="url(#payTopWave)"
          />
          <defs>
            <linearGradient id="payTopWave" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FF2E2E" />
              <stop offset="65%" stopColor="#CC0000" />
              <stop offset="100%" stopColor="#1A0000" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Top Navigation Bar */}
      <header className="relative z-10 mx-auto flex max-w-[1140px] items-center justify-between px-4 sm:px-8 pt-6 pb-4">
        <Link
          href="/"
          prefetch={false}
          className="inline-flex items-center gap-2.5"
        >
          <FlowLogo size={26} />
        </Link>

        <div className="flex items-center gap-2.5">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Secure Checkout
          </span>
          <button
            onClick={handleCopyLink}
            type="button"
            className="flow-liquid-btn flow-press inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-neutral-900 dark:text-white cursor-pointer"
          >
            {copiedLink ? (
              <>
                <IconCheck size={13} className="text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <IconCopy size={13} />
                Share Link
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flow-anim-fade-up relative z-10 mx-auto max-w-[1140px] px-4 sm:px-8 pt-4 pb-20 space-y-7">
        {/* Heading */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF1A1A]">
            {isCompletedReceipt ? "PAYMENT RECEIPT" : "FLOW CHECKOUT"}
          </p>
          <h1 className="mt-1 font-serif text-3xl sm:text-[44px] font-normal tracking-[-0.02em] text-neutral-950 dark:text-white leading-[1.08]">
            {isCompletedReceipt ? (
              "Payment Successful"
            ) : request.isDeleted ? (
              "Link deleted"
            ) : isReadOnly ? (
              request.title
            ) : (
              <>
                Complete your{" "}
                <span className="relative inline-block">
                  payment
                  <svg
                    viewBox="0 0 180 12"
                    fill="none"
                    className="absolute -bottom-1 left-0 w-full h-2.5"
                  >
                    <path
                      d="M3 9 C55 2, 125 2, 177 8"
                      stroke="#FF1A1A"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </>
            )}
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {isCompletedReceipt
              ? "Your payment has been verified on-chain and settled to the recipient."
              : request.isDeleted
                ? "This payment link has been deleted by its creator."
                : isReadOnly
                  ? "Review the payment request and any existing settlement."
                  : "Choose a source asset to check the available payment route."}
          </p>
          {request.maxPayments !== null &&
            !isCompletedReceipt &&
            !request.isDeleted && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-neutral-200/80 dark:border-white/[0.1] bg-white dark:bg-[#141414] px-3.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 shadow-2xs tabular-nums">
              <span
                className={`h-2 w-2 rounded-full ${
                  (request.remainingPayments ?? 0) === 0
                    ? "bg-neutral-400"
                    : "bg-emerald-500"
                }`}
                aria-hidden="true"
              />
              {(request.remainingPayments ?? 0) === 0 ? (
                <span>
                  All {request.maxPayments}{" "}
                  {request.maxPayments === 1 ? "spot" : "spots"} filled
                </span>
              ) : (
                <span>
                  {request.remainingPayments} of {request.maxPayments}{" "}
                  {request.maxPayments === 1 ? "spot" : "spots"} left ·{" "}
                  {request.paidCount} paid
                </span>
              )}
            </div>
          )}
        </div>

        {/* Expired Banner */}
        {isExpired && !isCompletedReceipt && (
          <div className="rounded-[20px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-[#FF1A1A] dark:text-red-400">
            <strong>Payment Request Expired:</strong> This payment request is
            past its expiration deadline and cannot accept new payments.
          </div>
        )}

        {/* ===================================================================
            COMPLETED RECEIPT VIEW
           =================================================================== */}
        {isCompletedReceipt ? (
          <div className="mx-auto max-w-2xl rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-10 shadow-md space-y-6">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#FF1A1A] text-white shadow-lg">
                <IconCheck size={30} />
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Paid &amp; Settled
              </span>
              <h2 className="font-serif text-3xl text-neutral-950 dark:text-white">
                Payment Completed!
              </h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Funds credited to{" "}
                <strong className="text-neutral-950 dark:text-white">
                  {request.recipientName}
                </strong>{" "}
                for{" "}
                <strong className="text-neutral-950 dark:text-white">
                  {request.title}
                </strong>
                .
              </p>
            </div>

            <div className="rounded-[20px] border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50 dark:bg-[#1A1A1A] p-5 space-y-3 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Recipient
                </span>
                <span className="font-bold text-neutral-950 dark:text-white">
                  {request.recipientName}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Recipient Address
                </span>
                {request.recipientAddress ? (
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-neutral-800 dark:text-neutral-200">
                      {`${request.recipientAddress.slice(0, 8)}...${request.recipientAddress.slice(-6)}`}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyRecipientAddress}
                      className="flow-liquid-btn inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200 cursor-pointer"
                      title="Copy recipient address"
                    >
                      {copiedRecipientAddress ? (
                        <>
                          <IconCheck size={11} className="text-emerald-500" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <IconCopy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <span className="font-mono text-neutral-400 dark:text-neutral-500 italic text-[11px]">
                    Address unavailable
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Settled Amount
                </span>
                <span className="font-display text-base font-bold text-neutral-950 dark:text-white">
                  {instructions?.destinationDisplayAmount ??
                    request.displayAmount ??
                    "1.00"}{" "}
                  {instructions?.destinationAssetSymbol ??
                    request.destinationAssetSymbol ??
                    "USDC"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Destination Network
                </span>
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {formatNetworkDisplay(request.destinationNetwork)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Payment Reference
                </span>
                <span className="font-mono text-neutral-800 dark:text-neutral-200">
                  {request.publicId}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Invoice Title
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {request.title}
                </span>
              </div>
              {request.description && (
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Description
                  </span>
                  <span className="text-neutral-800 dark:text-neutral-200 text-right max-w-xs truncate">
                    {request.description}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Settlement Time
                </span>
                <span className="font-mono text-neutral-800 dark:text-neutral-200 text-[11px]">
                  {instructions?.settledAt
                    ? new Date(instructions.settledAt).toUTCString()
                    : "Confirmed on-chain"}
                </span>
              </div>
              {instructions?.sourceTxHash && (
                <div className="flex justify-between items-center pt-2 border-t border-neutral-200 dark:border-white/[0.08]">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Source Transaction ({formatNetworkDisplay(instructions.sourceNetwork)})
                  </span>
                  <a
                    href={getExplorerUrl(
                      instructions.sourceNetwork,
                      instructions.sourceTxHash,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[#FF1A1A] hover:underline"
                  >
                    <span>
                      {instructions.sourceTxHash.slice(0, 8)}...
                      {instructions.sourceTxHash.slice(-6)}
                    </span>
                    <IconExternalLink size={12} />
                  </a>
                </div>
              )}
              {instructions?.destinationTxHash && (
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Settlement Transaction ({formatNetworkDisplay(request.destinationNetwork)})
                  </span>
                  <a
                    href={getExplorerUrl(
                      request.destinationNetwork,
                      instructions.destinationTxHash,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[#FF1A1A] hover:underline"
                  >
                    <span>
                      {instructions.destinationTxHash.slice(0, 8)}...
                      {instructions.destinationTxHash.slice(-6)}
                    </span>
                    <IconExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>

            <div className="pt-2">
              <Link
                href="/"
                prefetch={false}
                className="flow-liquid-btn flex items-center justify-center rounded-full py-3 text-xs font-semibold text-neutral-900 dark:text-white"
              >
                Return to Flow
              </Link>
            </div>
          </div>
        ) : isReadOnly && !instructions ? (
          <div className="mx-auto max-w-lg rounded-[28px] border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-8 text-center shadow-sm space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
              <IconAlertTriangle size={26} />
            </div>
            <h2 className="font-serif text-2xl text-neutral-950 dark:text-white">
              {request.isDeleted
                ? "Link deleted"
                : request.status === "DISABLED"
                  ? "This payment link is paused"
                  : request.status === "COMPLETED"
                    ? "Payment settled & link dormant"
                    : isExpired
                      ? "This payment link has expired"
                      : "Payment link unavailable"}
            </h2>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {request.isDeleted
                ? "This payment link has been deleted by its creator and can no longer accept payments."
                : request.status === "DISABLED"
                  ? "The recipient has temporarily paused this payment link. New quotes and deposits are disabled until it is resumed."
                  : request.status === "COMPLETED"
                    ? request.maxPayments !== null
                      ? `All ${request.maxPayments} payment ${request.maxPayments === 1 ? "spot has" : "spots have"} been filled and settled on-chain. This link is now closed.`
                      : "This payment request has already been paid and settled on-chain. The link is now expired and dormant."
                    : isExpired
                      ? "The payment window for this invoice has closed and it can no longer accept payments."
                      : "Quote unavailable. This payment request cannot accept payments."}
            </p>
            {!request.isDeleted && request.displayAmount && (
              <p className="pt-1 font-semibold text-neutral-950 dark:text-white">
                {request.displayAmount} {request.destinationAssetSymbol}
              </p>
            )}
            {!request.isDeleted && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {formatNetworkDisplay(request.destinationNetwork)}
              </p>
            )}
            <div className="pt-2">
              <Link
                href="/"
                prefetch={false}
                className="flow-liquid-btn inline-flex items-center justify-center rounded-full px-6 py-2.5 text-xs font-semibold text-neutral-900 dark:text-white"
              >
                Return to Flow
              </Link>
            </div>
          </div>
        ) : (
          /* ===================================================================
              MAIN 2-COLUMN CHECKOUT
             =================================================================== */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
            {/* LEFT 7 COLUMNS: Stage B Payment Instructions OR Stage A Payment Selection */}
            <div className="lg:col-span-7">
              {instructions ? (
                /* ============================================================
                   STAGE B: PAYMENT INSTRUCTIONS
                   ============================================================ */
                <div className="relative rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-8 shadow-sm space-y-6 overflow-hidden">
                  {/* Expired Overlay */}
                  {isDepositExpired && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[28px] bg-white/85 dark:bg-[#0B0B0B]/85 p-6 text-center backdrop-blur-xs">
                      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 shadow-xs">
                        <IconAlertTriangle size={24} />
                      </div>
                      <h3 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
                        Quote Expired
                      </h3>
                      <p className="mt-1.5 max-w-sm text-xs text-neutral-600 dark:text-neutral-400">
                        The deposit deadline for this payment has expired. Do
                        not send funds to the previous deposit address.
                      </p>
                      <button
                        type="button"
                        onClick={handleGenerateNewQuote}
                        disabled={isReadOnly}
                        className="mt-4 rounded-full bg-[#FF1A1A] px-6 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-[#E01515] transition-all cursor-pointer"
                      >
                        Generate New Quote
                      </button>
                    </div>
                  )}

                  {/* 1. Small Back button & Status */}
                  <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/[0.08] pb-4">
                    <button
                      type="button"
                      onClick={handleBackToPaymentSelection}
                      disabled={isReadOnly}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      <span aria-hidden="true">←</span>
                      <span>Back to Payment Selection</span>
                    </button>
                    <span
                      key={instructions.status}
                      className={`flow-anim-fade-up inline-flex items-center gap-1.5 text-[11px] font-semibold ${
                        isFundedOrProcessing
                          ? "text-blue-700 dark:text-blue-400"
                          : isUnderReview
                            ? "text-purple-700 dark:text-purple-400"
                            : instructions.status === "FAILED" ||
                                instructions.status ===
                                  "EXCEPTION_REFUND_REQUIRED" ||
                                isDepositExpired
                              ? "text-[#FF1A1A]"
                              : "text-amber-800 dark:text-amber-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isFundedOrProcessing
                            ? "bg-blue-600 animate-pulse"
                            : isUnderReview
                              ? "bg-purple-600 animate-pulse"
                              : instructions.status === "FAILED" ||
                                  instructions.status ===
                                    "EXCEPTION_REFUND_REQUIRED" ||
                                  isDepositExpired
                                ? "bg-[#FF1A1A]"
                                : "bg-amber-500 animate-pulse"
                        }`}
                      />
                      {isFundedOrProcessing
                        ? instructions.status === "DETECTED"
                          ? "DEPOSIT DETECTED"
                          : "PAYMENT PROCESSING"
                        : isUnderReview
                          ? "UNDER REVIEW"
                          : instructions.status === "EXCEPTION_REFUND_REQUIRED"
                            ? "REFUND REQUIRED"
                            : instructions.status === "FAILED"
                              ? "FAILED"
                              : isDepositExpired
                                ? "EXPIRED"
                                : "AWAITING DEPOSIT"}
                    </span>
                  </div>

                  {!isFundedOrProcessing && (
                    <>
                      {/* 2 & 3. Invoice/request name & Recipient info / Amount Due */}
                      <div>
                    <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Invoice:{" "}
                      <strong className="text-neutral-900 dark:text-white">
                        {request.title}
                      </strong>
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                      Recipient:{" "}
                      <strong className="text-neutral-950 dark:text-white">
                        {request.recipientName}
                      </strong>{" "}
                      • Due:{" "}
                      <strong className="text-neutral-950 dark:text-white">
                        {request.displayAmount} {request.destinationAssetSymbol}{" "}
                        on {request.destinationNetwork}
                      </strong>
                    </p>
                  </div>

                  {/* 4. Payment Instructions Heading */}
                  {canShowDeposit && (
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#FF1A1A]">
                        PAYMENT INSTRUCTIONS
                      </span>
                      <h2 className="font-serif text-2xl text-neutral-950 dark:text-white mt-0.5">
                        Send Exact Amount to Deposit Address
                      </h2>
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
                        Deposit the exact amount below from any wallet or
                        exchange. Flow automatically converts and settles to the
                        recipient.
                      </p>
                    </div>
                  )}

                  {/* Exception Refund Required Banner */}
                  {instructions.status === "EXCEPTION_REFUND_REQUIRED" && (
                    <div className="rounded-[14px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-[#FF1A1A] dark:text-red-400">
                      <strong>
                        Refund Required — Do Not Send Additional Funds:
                      </strong>{" "}
                      This attempt requires refund reconciliation. Check the
                      payment status for a confirmed refund.
                    </div>
                  )}

                  {/* 5-10. Deposit Instructions Card: QR, Amount, Network, Address, Memo, Countdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center rounded-[20px] border border-neutral-200 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A] p-5">
                    {canShowDeposit && (
                      <>
                        <div className="sm:col-span-5 flex flex-col items-center justify-center">
                          <div className="rounded-[16px] bg-white p-3 shadow-2xs border border-neutral-200/80">
                            <QrCode
                              value={
                                instructions.qrData ||
                                instructions.depositAddress
                              }
                              size={148}
                            />
                          </div>
                          <span className="mt-2 text-[10px] text-neutral-400 dark:text-neutral-500">
                            Scan with any wallet
                          </span>
                        </div>

                        <div className="sm:col-span-7 space-y-3.5 text-xs">
                          <div>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block">
                              Exact Amount to Send
                            </span>
                            <div className="flex items-center justify-between gap-2 mt-0.5">
                              <span className="font-display text-2xl font-bold text-neutral-950 dark:text-white">
                                {instructions.requiredDisplayAmount}{" "}
                                <span className="text-[#FF1A1A]">
                                  {instructions.sourceAssetSymbol}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyAmount}
                                disabled={isDepositExpired}
                                className="flow-liquid-btn rounded-full px-2.5 py-1 text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 disabled:opacity-40 cursor-pointer"
                              >
                                {copiedAmount ? "Copied" : "Copy Amount"}
                              </button>
                            </div>
                            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                              Source Network:{" "}
                              <strong className="text-neutral-900 dark:text-white">
                                {instructions.sourceNetwork}
                              </strong>
                            </p>
                          </div>

                          <div>
                            <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block mb-1">
                              Deposit Address
                            </span>
                            <div className="flex items-center justify-between gap-2 rounded-[12px] border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] px-3 py-2 font-mono text-[11px]">
                              <span className="truncate select-all text-neutral-900 dark:text-neutral-100">
                                {instructions.depositAddress}
                              </span>
                              <button
                                type="button"
                                onClick={handleCopyDepositAddress}
                                disabled={isDepositExpired}
                                className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline disabled:opacity-40 cursor-pointer"
                              >
                                {copiedAddress ? "Copied" : "Copy"}
                              </button>
                            </div>
                          </div>

                          {instructions.depositMemo && (
                            <div>
                              <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 block mb-1">
                                Required Memo / Tag
                              </span>
                              <div className="flex items-center justify-between gap-2 rounded-[12px] border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 font-mono text-[11px]">
                                <span className="truncate select-all text-amber-950 dark:text-amber-200">
                                  {instructions.depositMemo}
                                </span>
                                <button
                                  type="button"
                                  onClick={handleCopyMemo}
                                  disabled={isDepositExpired}
                                  className="shrink-0 font-sans font-semibold text-amber-900 dark:text-amber-300 hover:underline disabled:opacity-40 cursor-pointer"
                                >
                                  {copiedMemo ? "Copied" : "Copy"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-12 space-y-3.5 text-xs">
                      {isFundedOrProcessing ? (
                        <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80 dark:border-white/[0.08] text-[11px]">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            Payment Status:
                          </span>
                          <span className="font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-pulse" />
                            {instructions.status === "DETECTED"
                              ? "Deposit Detected — Verifying"
                              : "Payment Processing — Settling on-chain"}
                          </span>
                        </div>
                      ) : isUnderReview ? (
                        <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80 dark:border-white/[0.08] text-[11px]">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            Review Status:
                          </span>
                          <span className="font-semibold text-purple-700 dark:text-purple-400">
                            Payment Under Review
                          </span>
                        </div>
                      ) : canShowDeposit ? (
                        <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80 dark:border-white/[0.08] text-[11px]">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            Deposit Deadline:
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              depositSecondsRemaining <= 60
                                ? "text-[#FF1A1A]"
                                : "text-neutral-950 dark:text-white"
                            }`}
                          >
                            {Math.floor(depositSecondsRemaining / 60)}:
                            {(depositSecondsRemaining % 60)
                              .toString()
                              .padStart(2, "0")}{" "}
                            remaining
                          </span>
                        </div>
                      ) : null}

                      {instructions.status === "SETTLED" &&
                        instructions.sourceTxHash && (
                          <div className="flex items-center justify-between pt-1 border-t border-neutral-200/80 dark:border-white/[0.08] text-[11px]">
                            <span className="text-neutral-500 dark:text-neutral-400">
                              Source Transaction:
                            </span>
                            <span
                              className="font-mono text-neutral-800 dark:text-neutral-200 text-[10px] truncate max-w-[180px]"
                              title={instructions.sourceTxHash}
                            >
                              {instructions.sourceTxHash.slice(0, 8)}...
                              {instructions.sourceTxHash.slice(-6)}
                            </span>
                          </div>
                        )}

                      {(instructions.payerRefundAddress || refundAddress) && (
                        <div className="flex items-start justify-between gap-2 pt-2 border-t border-neutral-200/80 dark:border-white/[0.08] text-[11px]">
                          <span className="text-neutral-500 dark:text-neutral-400 shrink-0">
                            Refund destination:
                          </span>
                          <span
                            className="font-mono text-right truncate text-neutral-800 dark:text-neutral-200 max-w-[240px]"
                            title={
                              instructions.payerRefundAddress || refundAddress
                            }
                          >
                            {instructions.payerRefundAddress || refundAddress}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                    </>
                  )}

                  {/* Safety Instructions & Status Notices */}
                  {!isFundedOrProcessing && !isUnderReview && (
                    <div className="rounded-[16px] border border-red-200/80 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/30 p-4 text-xs text-neutral-800 dark:text-neutral-200 space-y-1.5">
                      <p className="font-bold text-[#FF1A1A]">
                        Safety Instructions
                      </p>
                      <p className="text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                        Send only{" "}
                        <strong>{instructions.sourceAssetSymbol}</strong> on{" "}
                        <strong>{instructions.sourceNetwork}</strong>. Other
                        assets or networks cannot be recovered.
                      </p>
                      <p className="text-[11px] leading-relaxed text-neutral-700 dark:text-neutral-300">
                        This deposit address is valid for{" "}
                        <strong>
                          {Math.floor(depositSecondsRemaining / 60)}m{" "}
                          {depositSecondsRemaining % 60}s
                        </strong>
                        . Do not send funds after expiration.
                      </p>
                    </div>
                  )}

                  {instructions.status === "EXCEPTION_REFUND_REQUIRED" && (
                    <div className="rounded-[14px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3.5 text-xs text-[#FF1A1A] dark:text-red-400 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <IconAlertTriangle
                          size={14}
                          className="shrink-0 text-[#FF1A1A]"
                        />
                        <span>Refund Pending:</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-red-900 dark:text-red-300">
                        This attempt requires refund reconciliation. Check the
                        payment status for a confirmed refund.
                      </p>
                    </div>
                  )}

                  {isUnderReview && (
                    <div className="rounded-[14px] border border-purple-200 dark:border-purple-800/40 bg-purple-50 dark:bg-purple-950/30 p-3.5 text-xs text-purple-950 dark:text-purple-200 space-y-1">
                      <p className="font-semibold text-purple-900 dark:text-purple-300">
                        Payment Under Review:
                      </p>
                      <p className="text-[11px] leading-relaxed text-purple-900/80 dark:text-purple-200/80">
                        Your deposit was received and is currently undergoing
                        automated reconciliation. Do not initiate another
                        payment.
                      </p>
                    </div>
                  )}

                  {instructions.status === "EXPIRED" &&
                    !isFundedOrProcessing &&
                    !isUnderReview && (
                      <div className="space-y-2">
                        <div className="rounded-[14px] border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                          <strong>Deposit Window Expired:</strong> Do not send
                          funds to this expired deposit address.
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateNewQuote}
                          disabled={isReadOnly}
                          className="w-full rounded-full bg-[#FF1A1A] py-2.5 text-xs font-semibold text-white hover:bg-[#E01515] cursor-pointer"
                        >
                          Generate New Quote
                        </button>
                      </div>
                    )}

                  {instructions.status === "FAILED" &&
                    !isFundedOrProcessing &&
                    !isUnderReview && (
                      <div className="space-y-2">
                        <div className="rounded-[14px] border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 text-xs text-[#FF1A1A] dark:text-red-400">
                          <strong>Payment Failed:</strong> This payment attempt
                          could not be completed.
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateNewQuote}
                          disabled={isReadOnly}
                          className="w-full rounded-full bg-[#FF1A1A] py-2.5 text-xs font-semibold text-white hover:bg-[#E01515] cursor-pointer"
                        >
                          Generate New Quote
                        </button>
                      </div>
                    )}
                </div>
              ) : (
                /* ============================================================
                   STAGE A: PAYMENT SELECTION (Full Left Column)
                   ============================================================ */
                <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-8 shadow-xs space-y-6">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 mb-3">
                      Pay with
                    </h2>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPayTab("STABLES");
                          if (
                            !stableChoices.some(
                              (choice) => choice.id === selectedSource?.id,
                            )
                          )
                            selectSource(initialStable ?? null);
                        }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          payTab === "STABLES"
                            ? "flow-liquid-btn-primary"
                            : "flow-liquid-btn text-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="2" y="5" width="20" height="14" rx="2" />
                          <line x1="2" y1="10" x2="22" y2="10" />
                        </svg>
                        <span>Pay with stablecoins</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsAnyTokenModalOpen(true);
                        }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          payTab === "ANY_TOKEN"
                            ? "flow-liquid-btn-primary"
                            : "flow-liquid-btn text-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          className="text-amber-500 shrink-0"
                          aria-hidden="true"
                        >
                          <path d="M12 2l2.4 7.2L21.6 12l-7.2 2.4L12 21.6l-2.4-7.2L2.4 12l7.2-2.4z" />
                        </svg>
                        <span>Pay with any token</span>
                      </button>
                    </div>
                  </div>

                  {payTab === "STABLES" && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-100 dark:border-white/[0.06]">
                      <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                        Paying from:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectEcosystem("evm")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          selectedEcosystem === "evm"
                            ? "border-[#FF1A1A] bg-red-50 dark:bg-red-950/30 text-[#FF1A1A] shadow-2xs"
                            : "border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#1A1A1A] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <ChainBadge chainKey="ethereum-mainnet" size={14} />
                        <span>Ethereum &amp; Base</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectEcosystem("solana")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          selectedEcosystem === "solana"
                            ? "border-[#FF1A1A] bg-red-50 dark:bg-red-950/30 text-[#FF1A1A] shadow-2xs"
                            : "border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#1A1A1A] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <ChainBadge chainKey="solana-mainnet" size={14} />
                        <span>Solana</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelectEcosystem("near")}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          selectedEcosystem === "near"
                            ? "border-[#FF1A1A] bg-red-50 dark:bg-red-950/30 text-[#FF1A1A] shadow-2xs"
                            : "border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#1A1A1A] text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <ChainBadge chainKey="near-mainnet" size={14} />
                        <span>NEAR Protocol</span>
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {payTab === "STABLES" ? (
                      <CombinedAssetNetworkPicker
                        options={stableChoices.filter(
                          (option) => option.ecosystem === selectedEcosystem,
                        )}
                        selectedId={selectedSource?.id ?? ""}
                        onSelect={selectSource}
                        label="You pay with"
                        inline
                      />
                    ) : (
                      <div className="min-w-0">
                        <span className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                          You pay with
                        </span>
                        <button
                          type="button"
                          aria-label="Choose token and network"
                          onClick={() => setIsAnyTokenModalOpen(true)}
                          className="flex w-full items-center gap-3 rounded-2xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#1A1A1A] p-3 text-left text-xs font-bold text-neutral-950 dark:text-white hover:bg-neutral-50 dark:hover:bg-white/[0.06] cursor-pointer"
                        >
                          {selectedSource && (
                            <span className="relative shrink-0">
                              <AssetAvatar
                                symbol={selectedSource.symbol}
                                size={31}
                              />
                              <span className="absolute -right-1 -bottom-1 rounded-full bg-white dark:bg-[#141414] p-0.5">
                                <ChainBadge
                                  chainKey={selectedSource.networkKey}
                                  size={12}
                                />
                              </span>
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            {selectedSource?.symbol ??
                              "Choose token and network"}
                            {selectedSource && (
                              <span className="block truncate mt-0.5 font-normal text-neutral-500 dark:text-neutral-400">
                                on {selectedSource.networkName}
                              </span>
                            )}
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-neutral-500 dark:text-neutral-400 inline-flex items-center"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </span>
                        </button>
                      </div>
                    )}
                    <div>
                      <label
                        htmlFor="checkout-amount"
                        className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5"
                      >
                        {request.amountMode === "FIXED"
                          ? "You send (estimated)"
                          : "Amount to send"}
                      </label>
                      <div className="flex items-center justify-between p-3 rounded-2xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#1A1A1A] shadow-2xs">
                        <input
                          id="checkout-amount"
                          type="text"
                          inputMode="decimal"
                          value={
                            request.amountMode === "FIXED"
                              ? (quotedSendAmount ?? "")
                              : customAmount
                          }
                          onKeyDown={(event) => {
                            if (
                              event.key === "-" ||
                              event.key === "+" ||
                              event.key === "e" ||
                              event.key === "E"
                            ) {
                              event.preventDefault();
                            }
                          }}
                          onChange={(event) => {
                            const cleaned = event.target.value.replace(
                              /[-+eE]/g,
                              "",
                            );
                            const numeric = Number(cleaned);
                            setCustomAmount(
                              cleaned !== "" &&
                                !Number.isNaN(numeric) &&
                                numeric < 0
                                ? "0"
                                : cleaned,
                            );
                          }}
                          readOnly={request.amountMode === "FIXED"}
                          placeholder={
                            request.amountMode === "FIXED"
                              ? "—"
                              : "Enter amount"
                          }
                          className="w-full font-display text-xl font-bold text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden bg-transparent"
                        />
                        <span className="font-bold text-xs text-neutral-500 dark:text-neutral-400 pl-2">
                          {selectedSource?.symbol}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payer refund address */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <label
                        htmlFor="checkout-refund"
                        className="text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                      >
                        {payerMode === "EXCHANGE"
                          ? "Personal wallet refund address required for exchange withdrawals"
                          : "Payer refund address"}
                      </label>
                      <span
                        className="text-[11px] text-neutral-400 dark:text-neutral-500"
                        title="Personal wallet address used for refunds"
                      >
                        ⓘ
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        id="checkout-refund"
                        type="text"
                        value={refundAddress}
                        onChange={(e) => setRefundAddress(e.target.value)}
                        placeholder={
                          selectedSource
                            ? "Address on " + selectedSource.networkName
                            : "Choose a source network first"
                        }
                        className="w-full px-4 py-3 rounded-2xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#1A1A1A] text-xs font-mono text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden focus:border-neutral-900 dark:focus:border-white/30 shadow-2xs pr-10"
                      />
                      {refundAddress.trim().length > 0 &&
                        !refundValidationMessage && (
                          <span className="absolute right-3.5 flex items-center justify-center text-emerald-500">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                        )}
                    </div>
                    {refundValidationMessage && (
                      <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {refundValidationMessage}
                      </p>
                    )}
                  </div>

                  {/* Payment method selector: Wallet vs Exchange */}
                  <div className="space-y-2 pt-1 border-t border-neutral-100 dark:border-white/[0.06]">
                    <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      Payment method:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPayerMode("WALLET")}
                        className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          payerMode === "WALLET"
                            ? "flow-liquid-btn-primary"
                            : "flow-liquid-btn text-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        <IconWallet size={14} />
                        <span>Personal Wallet</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPayerMode("EXCHANGE")}
                        className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                          payerMode === "EXCHANGE"
                            ? "flow-liquid-btn-primary"
                            : "flow-liquid-btn text-neutral-700 dark:text-neutral-200"
                        }`}
                      >
                        <IconExternalLink size={14} />
                        <span>Exchange Withdrawal</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-neutral-200 dark:border-white/[0.08] bg-neutral-50/60 dark:bg-[#1A1A1A] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-neutral-900 dark:text-white">
                        Quote Summary
                      </h3>
                      {quote && (
                        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Live quote · {quoteSecondsRemaining}s
                        </span>
                      )}
                    </div>
                    <dl className="space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
                      <div className="flex justify-between gap-3">
                        <dt>
                          You send
                          {selectedSource &&
                            " (" +
                              selectedSource.symbol +
                              " on " +
                              selectedSource.networkName +
                              ")"}
                        </dt>
                        <dd className="min-w-0 break-all text-right font-semibold text-neutral-950 dark:text-white">
                          {displaySource}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt>Flow platform fee</dt>
                        <dd className="font-semibold text-neutral-950 dark:text-white">
                          {flowFee}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="shrink-0 max-w-[40%]">
                          Network &amp; route fee
                        </dt>
                        <dd className="text-right font-semibold text-neutral-950 dark:text-white">
                          {request.feePayer === "MERCHANT"
                            ? "Routing fee covered by recipient (deducted from settlement)."
                            : (quote?.fees.description ??
                              (directDisplay
                                ? "Network fee unavailable until broadcast."
                                : "Unavailable"))}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3 border-t border-neutral-200 dark:border-white/[0.08] pt-2">
                        <dt className="font-bold text-neutral-950 dark:text-white">
                          Total
                        </dt>
                        <dd className="min-w-0 break-all text-right font-semibold text-neutral-950 dark:text-white">
                          {displaySource}
                        </dd>
                      </div>
                    </dl>
                    {!quote && !directDisplay && (
                      <div
                        role="status"
                        className="text-xs text-neutral-600 dark:text-neutral-400"
                      >
                        <p>
                          {loadingQuote
                            ? "Checking route…"
                            : routeUnavailable
                              ? "Route unavailable"
                              : "Quote unavailable"}
                        </p>
                        {!loadingQuote && !routeUnavailable && (
                          <p>
                            {quoteError ??
                              refundValidationMessage ??
                              "Choose a source asset and enter the required details."}
                          </p>
                        )}
                        {quoteError === "The quote has expired." && (
                          <button
                            type="button"
                            onClick={() =>
                              setRefreshTrigger((value) => value + 1)
                            }
                            className="mt-1 font-semibold text-neutral-950 dark:text-white underline cursor-pointer"
                          >
                            Refresh quote
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT 5 COLUMNS */}
            <div className="lg:col-span-5 space-y-5">
              {!instructions ? (
                /* STATE A: Right Column Invoice Summary & Proceed Button */
                <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-5">
                  {/* Recipient Card */}
                  <div>
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block mb-2">
                      Recipient
                    </span>
                    <div className="flex items-center justify-between p-3.5 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A]">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-950/50 text-[#FF1A1A]">
                          <IconWallet size={18} />
                        </span>
                        <div className="min-w-0">
                          <h2 className="font-display font-bold text-xs text-neutral-950 dark:text-white truncate">
                            {request.title}
                          </h2>
                          <p className="font-sans text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                            {request.recipientName}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Verified
                      </span>
                    </div>
                  </div>

                  {/* Amount Due */}
                  <div>
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 block">
                      Amount due
                    </span>
                    <p className="mt-1 font-display text-3xl font-extrabold text-neutral-950 dark:text-white">
                      {request.displayAmount ??
                        quote?.destinationDisplayAmount ??
                        "—"}{" "}
                      {request.destinationAssetSymbol}
                    </p>
                  </div>

                  {/* Settlement (Recipient receives) */}
                  <div>
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block mb-1.5">
                      Recipient receives
                    </span>
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A]">
                      <AssetAvatar
                        symbol={request.destinationAssetSymbol}
                        size={24}
                      />
                      <span className="font-display font-bold text-xs text-neutral-950 dark:text-white">
                        {request.displayAmount} {request.destinationAssetSymbol}{" "}
                        on {request.destinationNetwork}
                      </span>
                    </div>
                  </div>

                  {/* Route */}
                  <div>
                    <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block mb-1.5">
                      Route
                    </span>
                    <div className="p-3.5 rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AssetAvatar
                            symbol={selectedSource?.symbol ?? ""}
                            size={22}
                          />
                          <span className="font-bold text-xs text-neutral-950 dark:text-white">
                            {selectedSource?.symbol}
                          </span>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {selectedSource?.networkName}
                          </span>
                        </div>
                        <span className="text-neutral-400 font-bold">
                          ······&gt;
                        </span>
                        <div className="flex items-center gap-2">
                          <AssetAvatar
                            symbol={request.destinationAssetSymbol}
                            size={22}
                          />
                          <span className="font-bold text-xs text-neutral-950 dark:text-white">
                            {request.destinationAssetSymbol}
                          </span>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {request.destinationNetwork}
                          </span>
                        </div>
                      </div>
                      <div className="pt-1 flex justify-center">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                          </svg>
                          <span>
                            {isDirect
                              ? "Direct route"
                              : quote
                                ? "NEAR Intents"
                                : "Route preview"}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* You'll send (exact) summary box */}
                  <div className="p-4 rounded-2xl bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-[1_1_12rem]">
                      <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 block">
                        You’ll send (estimated)
                      </span>
                      <p className="mt-0.5 break-all font-display text-2xl font-extrabold text-neutral-950 dark:text-white">
                        {quotedSendAmount ?? "—"}{" "}
                        <span className="inline-block text-sm font-bold text-neutral-700 dark:text-neutral-300">
                          {selectedSource?.symbol}
                        </span>
                      </p>
                    </div>
                    <div className="text-right text-xs space-y-1">
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400">
                          Flow fee {flowFee}
                        </span>
                      </div>
                      <div>
                        <span className="text-neutral-500 dark:text-neutral-400">
                          Recipient receives{" "}
                        </span>
                        <span className="font-bold text-neutral-950 dark:text-white">
                          {quote?.destinationDisplayAmount ??
                            request.displayAmount ??
                            "—"}{" "}
                          {request.destinationAssetSymbol}
                        </span>
                      </div>
                    </div>
                  </div>

                  {commitError && (
                    <div
                      role="alert"
                      className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs text-[#FF1A1A] dark:text-red-400"
                    >
                      {commitError}
                    </div>
                  )}

                  {directVisible && isDirect && payerMode === "WALLET" && (
                    <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-emerald-900 dark:text-emerald-300">
                          Direct {request.destinationAssetSymbol} Payment
                        </span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                          {request.destinationNetwork}
                        </span>
                      </div>
                      <div className="flex justify-center py-2">
                        <div className="p-2.5 bg-white rounded-2xl">
                          <QrCode
                            value={request.recipientAddress || ""}
                            size={140}
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-white dark:bg-[#141414] px-3 py-2 font-mono text-[11px]">
                        <span className="truncate select-all text-neutral-800 dark:text-neutral-200">
                          {request.recipientAddress}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyRecipientAddress}
                          className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline cursor-pointer"
                        >
                          {copiedRecipientAddress ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                        Send exactly {quotedSendAmount ?? "—"}{" "}
                        {selectedSource?.symbol} on {request.destinationNetwork}
                        . Deposits to this verified address settle directly into
                        the recipient’s wallet.
                      </p>
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={
                      Boolean(
                        executionDisabled ||
                        (quote && quote.isExecutionDisabled),
                      ) ||
                      committing ||
                      isReadOnly ||
                      (quoteSecondsRemaining <= 0 &&
                        !(
                          isDirect &&
                          payerMode === "WALLET" &&
                          Boolean(directDisplay)
                        )) ||
                      (!quote?.attemptPublicId &&
                        !(
                          isDirect &&
                          payerMode === "WALLET" &&
                          Boolean(directDisplay)
                        ))
                    }
                    onClick={async () => {
                      setCommitError(null);
                      if (isDirect && payerMode === "WALLET") {
                        setDirectVisible(true);
                        return;
                      }
                      if (!quote?.attemptPublicId) return;
                      setCommitting(true);
                      try {
                        const res = await fetch(
                          `/api/pay/${request.publicId}/commit`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              attemptPublicId: quote.attemptPublicId,
                              payerRefundAddress: trimmedRefund || undefined,
                            }),
                          },
                        );
                        const data = (await res.json().catch(() => ({}))) as
                          | PaymentDepositInstructions
                          | { error?: string; detail?: string };
                        if (!res.ok) {
                          const err = data as {
                            error?: string;
                            detail?: string;
                          };
                          const msg =
                            err.detail ||
                            err.error ||
                            "Failed to generate deposit instructions.";
                          setCommitError(
                            msg.includes("PAYMENT_EXECUTION_DISABLED")
                              ? "Payments are temporarily paused in preview mode."
                              : msg,
                          );
                          return;
                        }
                        setInstructions(data as PaymentDepositInstructions);
                      } catch {
                        setCommitError(
                          "Network error committing payment instructions. Please try again.",
                        );
                      } finally {
                        setCommitting(false);
                      }
                    }}
                    className="flow-liquid-btn-primary w-full py-4 rounded-full text-xs sm:text-sm font-semibold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {committing
                      ? "Generating Deposit Instructions…"
                      : executionDisabled || quote?.isExecutionDisabled
                        ? "Pay Now (Preview Only)"
                        : isDirect && payerMode === "WALLET"
                          ? "Show Direct Deposit Address"
                          : "Pay Now"}
                  </button>
                </div>
              ) : (
                /* STATE B: Live Payment Tracker (Right Column) */
                <div className="relative [&>div]:mt-0">
                  <PaymentTimelineTracker
                    transfer={{
                      id: instructions.attemptPublicId,
                      publicId: instructions.attemptPublicId,
                      jobKind: "CHECKOUT",
                      sourceNetwork: instructions.sourceNetwork,
                      sourceAssetSymbol: instructions.sourceAssetSymbol,
                      sourceDisplayAmount: instructions.requiredDisplayAmount,
                      destinationNetwork: instructions.destinationNetwork,
                      destinationAssetSymbol: instructions.destinationAssetSymbol,
                      quotedDestinationDisplayAmount:
                        instructions.destinationDisplayAmount,
                      status: instructions.status,
                      sourceTxHash: instructions.sourceTxHash,
                      destinationTxHash: instructions.destinationTxHash,
                      errorMessage: null,
                      settledAt: instructions.settledAt,
                      createdAt: attemptInitiatedAt,
                    }}
                  />
                </div>
              )}

              {/* Security & Settlement Highlights */}
              <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-sm space-y-4">
                <h3 className="font-serif text-lg text-neutral-950 dark:text-white">
                  How Flow settles your payment
                </h3>
                <ul className="space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/50 text-[11px] font-bold text-[#FF1A1A]">
                      1
                    </span>
                    <span>
                      <strong className="text-neutral-950 dark:text-white">
                        Pay with what you hold:
                      </strong>{" "}
                      Select a source asset and network to check the route.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/50 text-[11px] font-bold text-[#FF1A1A]">
                      2
                    </span>
                    <span>
                      <strong className="text-neutral-950 dark:text-white">
                        Automatic routing:
                      </strong>{" "}
                      Payments automatically convert and settle into{" "}
                      {request.destinationAssetSymbol} on{" "}
                      {formatNetworkDisplay(request.destinationNetwork)}.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/50 text-[11px] font-bold text-[#FF1A1A]">
                      3
                    </span>
                    <span>
                      <strong className="text-neutral-950 dark:text-white">
                        Verified on-chain proof:
                      </strong>{" "}
                      Every transfer is independently verified on-chain before
                      final settlement.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {confirmLeaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkout-confirm-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => setConfirmLeaveModal(null)}
        >
          <div
            className="flow-anim-fade-up w-full max-w-md rounded-[28px] border border-neutral-200/90 dark:border-white/[0.1] bg-white dark:bg-[#161618] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                <IconAlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h3
                  id="checkout-confirm-modal-title"
                  className="font-serif text-xl text-neutral-950 dark:text-white"
                >
                  {confirmLeaveModal.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                  {confirmLeaveModal.message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmLeaveModal(null)}
                className="flow-liquid-btn px-4 py-2.5 rounded-full text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer"
              >
                Stay here
              </button>
              <button
                type="button"
                onClick={executeBackToPaymentSelection}
                className="flow-liquid-btn-primary px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer"
              >
                Return anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Any Token Discovery Modal */}
      <UnifiedAssetSelectorModal
        isOpen={isAnyTokenModalOpen}
        onClose={() => setIsAnyTokenModalOpen(false)}
        darkTheme={false}
        title="Pay with any token"
        filterCapability="DISCOVERABLE_BY_PROVIDER"
        onSelectToken={(token: DiscoveredToken) => {
          selectSource(token);
          setPayTab("ANY_TOKEN");
          setIsAnyTokenModalOpen(false);
        }}
      />
    </div>
  );
}
