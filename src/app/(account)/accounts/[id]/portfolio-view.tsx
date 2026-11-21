"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FloatingNav,
  type NavTabId,
} from "../../../../components/floating-nav.tsx";
import { NotificationsDrawer } from "../../../../components/notifications-drawer.tsx";
import { FlowIdClaimModal } from "../../../../components/flow-id-claim-modal.tsx";
import { isFlowIdInput } from "../../../../domain/flow-id.ts";
import { useToast } from "../../../../components/toast-provider.tsx";
import { useTranslation } from "../../../../components/language-provider.tsx";
import { TabContentSkeleton } from "../../../../components/page-skeletons.tsx";
import { PaymentTimelineTracker } from "../../../../components/payment-timeline-tracker.tsx";
import { SlideToPay } from "../../../../components/slide-to-pay.tsx";
import {
  AssetsHeldModal,
  type HeldAssetItem,
} from "../../../../components/assets-held-modal.tsx";
import {
  BALANCE_VISIBILITY_EVENT,
  readBalanceHidden,
  writeBalanceHidden,
} from "../../../../components/profile-preferences.ts";
import { UnifiedAssetSelectorModal } from "../../../../components/unified-asset-selector-modal.tsx";
import type { DiscoveredToken } from "../../../../server/providers/near-intents-discovery.ts";
import { QrCode } from "../../../../components/qr-code.tsx";
import {
  AssetAvatar,
  ChainBadge,
  IconCheck,
  IconCopy,
  IconLink,
  IconPlus,
  IconRefresh,
  IconSearch,
  NearIntentsBadge,
} from "../../../../components/icons.tsx";
import {
  canonicalizeNetworkId,
  checkNetworkGasBalance,
  computeMaxSendableAtomic,
  MAINNET_SUPPORTED_DEPLOYMENTS,
  validateEcosystemAddress,
  type CatalogTokenDeployment,
} from "../../../../domain/supported-assets-catalog.ts";
import { CombinedAssetNetworkPicker } from "../../../../components/combined-asset-network-picker.tsx";
import { triggerHaptic } from "../../../../components/haptics.ts";
import {
  MotionNumber,
  MotionTabPanel,
  SegmentedTabPill,
} from "../../../../components/motion.tsx";
import { EarnView } from "../../../../components/earn-view.tsx";
import {
  getMainnetWalletAddress,
  isBalanceMatchingDeployment,
  type SerializedAccountPortfolio,
  type SerializedWalletBalanceRecord,
} from "../../../../domain/portfolio.ts";
import type {
  ActivityFeedResponse,
  SerializedWalletActivityRecord,
} from "../../../../domain/activities.ts";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../../../../domain/atomic-amounts.ts";
import {
  supportsQuoteAddress,
  validateQuoteAddress,
} from "../../../../domain/quote-addresses.ts";
import { useQuotePreview } from "../../../../components/use-quote-preview.ts";
import type { OneClickPreview } from "../../../../server/providers/one-click-preview.ts";
import type { SerializedPaymentRequest } from "../../../../domain/payment-requests.ts";
import { describe, send } from "../../../controls.tsx";

interface SerializedOutgoingTransfer {
  readonly id: string;
  readonly publicId: string;
  readonly jobKind: "SEND" | "CONVERT";
  readonly sourceNetwork: string;
  readonly sourceAssetSymbol: string;
  readonly sourceDisplayAmount: string;
  readonly recipientAddress: string;
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

interface SerializedAddMoneyIntent {
  readonly id: string;
  readonly publicId: string;
  readonly sourceNetwork: string;
  readonly sourceAssetSymbol: string;
  readonly quotedSourceDisplayAmount: string;
  readonly destinationNetwork: string;
  readonly destinationAssetSymbol: string;
  readonly quotedDestinationDisplayAmount: string;
  readonly destinationAddress: string;
  readonly depositAddress: string | null;
  readonly depositMemo: string | null;
  readonly depositDeadline: string | null;
  readonly sourceTxHash: string | null;
  readonly destinationTxHash: string | null;
  readonly status: string;
  readonly settlementError: string | null;
  readonly settledAt: string | null;
}

export type WorkspaceTab = NavTabId;

export interface WorkspaceAccountSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: "PERSONAL" | "BUSINESS";
  readonly role: "OWNER" | "ADMIN" | "MEMBER";
  readonly walletStatus:
    | "provisioning"
    | "active"
    | "setup_failed"
    | "frozen"
    | "recovery_pending"
    | "setup_pending";
}

function truncateMiddle(value: string, start = 6, end = 4): string {
  if (!value || value.length <= start + end + 3) return value || "";
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Recently";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

interface LedgerMovement {
  assetId: string;
  network: string;
  decimals: number;
  inflow: string;
  outflow: string;
}

function formatUsdCents(cents: bigint): string {
  return (
    "$" +
    (cents / 100n).toLocaleString("en-US") +
    "." +
    (cents % 100n).toString().padStart(2, "0")
  );
}

function holdingUsdCents(
  balance: SerializedWalletBalanceRecord,
  price: number | undefined,
) {
  if (!price || !Number.isFinite(price) || price <= 0 || price >= 1e21)
    return null;
  const priceAtomic = parseDisplayToAtomic(price.toFixed(12), 12);
  const divisor = 10n ** BigInt(balance.networkAsset.decimals + 10);
  return (BigInt(balance.atomicBalance) * priceAtomic + divisor / 2n) / divisor;
}

function atomicAmountToUsdCents(
  atomic: bigint,
  decimals: number,
  price: number | undefined,
): bigint | null {
  if (!price || !Number.isFinite(price) || price <= 0 || price >= 1e21) {
    return null;
  }
  const absAtomic = atomic < 0n ? -atomic : atomic;
  const priceAtomic = parseDisplayToAtomic(price.toFixed(12), 12);
  const divisor = 10n ** BigInt(decimals + 10);
  const cents = (absAtomic * priceAtomic + divisor / 2n) / divisor;
  return atomic < 0n ? -cents : cents;
}

function formatSignedUsdCents(
  cents: bigint,
  direction: "inflow" | "outflow" | "net",
): string {
  if (cents === 0n) return "$0.00";
  const absLabel = formatUsdCents(cents < 0n ? -cents : cents);
  if (direction === "net") return cents < 0n ? `-${absLabel}` : `+${absLabel}`;
  return absLabel;
}

function ledgerMovementLabel(
  movements: LedgerMovement[] | null,
  direction: "inflow" | "outflow" | "net",
  tokenPrices: Record<string, number>,
  activities: SerializedWalletActivityRecord[],
) {
  let totalUsdCents = 0n;
  let hasPriceForAny = false;
  let hasMovement = false;
  const labels: string[] = [];

  for (const row of movements ?? []) {
    const deployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (asset) =>
        asset.id === row.assetId &&
        asset.networkKey === row.network &&
        asset.decimals === row.decimals,
    );
    if (!deployment) continue;
    const amount =
      direction === "net"
        ? BigInt(row.inflow) - BigInt(row.outflow)
        : BigInt(row[direction]);
    if (amount === 0n) continue;
    hasMovement = true;
    const cents = atomicAmountToUsdCents(
      amount,
      row.decimals,
      tokenPrices[deployment.id],
    );
    if (cents !== null) {
      hasPriceForAny = true;
      totalUsdCents += cents;
    }
    labels.push(
      formatAtomicToDisplay(amount, row.decimals) +
        " " +
        deployment.symbol +
        " (" +
        deployment.networkName +
        ")",
    );
  }

  if (!hasMovement) {
    for (const act of activities) {
      if (act.finality !== "CONFIRMED" && act.finality !== "FINALIZED") {
        continue;
      }
      if (act.direction !== "INCOMING" && act.direction !== "OUTGOING") {
        continue;
      }
      const raw = BigInt(act.atomicAmount || "0");
      if (raw <= 0n) continue;
      if (direction === "inflow" && act.direction !== "INCOMING") continue;
      if (direction === "outflow" && act.direction !== "OUTGOING") continue;
      const signed =
        direction === "net" && act.direction === "OUTGOING" ? -raw : raw;
      const deployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (asset) =>
          asset.networkKey === act.chainId &&
          asset.symbol.toUpperCase() === act.assetSymbol.toUpperCase(),
      );
      if (!deployment) continue;
      hasMovement = true;
      const cents = atomicAmountToUsdCents(
        signed,
        act.decimals,
        tokenPrices[deployment.id],
      );
      if (cents !== null) {
        hasPriceForAny = true;
        totalUsdCents += cents;
      }
      labels.push(
        formatAtomicToDisplay(signed, act.decimals) +
          " " +
          deployment.symbol +
          " (" +
          deployment.networkName +
          ")",
      );
    }
  }

  if (hasPriceForAny) return formatSignedUsdCents(totalUsdCents, direction);
  if (hasMovement) return labels.join(", ");
  if (movements === null && activities.length === 0) return "$0.00";
  return "$0.00";
}

async function fetchVerifiedAddMoneyPreview(params: {
  accountId: string;
  body: string;
  originAsset: string;
  sourceNetwork: string;
  amountAtomic: string;
  recipient: string;
  refundTo: string;
  signal: AbortSignal;
}) {
  const quote = await fetchAccountPreview(params.accountId, params.body, params.signal);
  if (
    quote.identity.operationId !== "ADD_MONEY:" + params.accountId ||
    quote.identity.originAsset !== params.originAsset ||
    quote.identity.sourceNetwork !== params.sourceNetwork ||
    quote.destinationDeploymentId !== "near-mainnet:NEAR" ||
    quote.identity.swapType !== "EXACT_INPUT" ||
    quote.identity.destinationNetwork !== "near-mainnet" ||
    quote.identity.amountAtomic !== params.amountAtomic ||
    quote.identity.recipient !== params.recipient ||
    quote.identity.refundTo !== params.refundTo
  ) {
    throw new Error("The quote did not match the selected deposit route.");
  }
  return { quote, expiresAt: quote.identity.expiresAt };
}

function formatApproxDisplay(
  raw: string | null | undefined,
  maxDecimals = 6,
): string {
  if (!raw) return "0";
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0" || /^[-+]?0(\.0+)?$/.test(trimmed)) {
    return "0";
  }
  const sign = trimmed.startsWith("-") ? "-" : "";
  const unsigned = trimmed.replace(/^[-+]/, "");
  const dotIdx = unsigned.indexOf(".");
  if (dotIdx === -1) return `${sign}${unsigned}`;
  const intPart = unsigned.slice(0, dotIdx) || "0";
  const fracRaw = unsigned.slice(dotIdx + 1).replace(/0+$/, "");
  if (!fracRaw) return `${sign}${intPart}`;
  if (fracRaw.length <= maxDecimals) {
    return `${sign}${intPart}.${fracRaw}`;
  }
  const sliced = fracRaw.slice(0, maxDecimals).replace(/0+$/, "");
  if (intPart !== "0" || sliced.length > 0) {
    return `~${sign}${intPart}${sliced ? `.${sliced}` : ""}`;
  }
  return `<${sign}0.${"0".repeat(Math.max(0, maxDecimals - 1))}1`;
}

function sanitizeNonNegativeDecimal(raw: string): string {
  const cleaned = raw.replace(/[-+eE]/g, "");
  const numeric = Number(cleaned);
  if (cleaned !== "" && !Number.isNaN(numeric) && numeric < 0) return "0";
  return cleaned;
}

function blockNegativeKey(e: React.KeyboardEvent<HTMLInputElement>) {
  if (e.key === "-" || e.key === "e" || e.key === "E") {
    e.preventDefault();
  }
}

function positiveQuoteAmount(value: string, decimals: number): string | null {
  try {
    const atomic = parseDisplayToAtomic(value, decimals);
    return atomic > 0n ? atomic.toString() : null;
  } catch {
    return null;
  }
}

async function fetchAccountPreview(
  accountId: string,
  body: string,
  signal: AbortSignal,
) {
  const requestVersion = crypto.randomUUID();
  const response = await fetch("/api/accounts/" + accountId + "/send/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...JSON.parse(body), requestVersion }),
    signal,
    cache: "no-store",
  });
  const data = (await response.json()) as {
    quote?: OneClickPreview;
    requestVersion?: string;
    routeStatus?: string;
    error?: string;
  };
  if (!response.ok || !data.quote || data.quote.canExecute !== false) {
    throw new Error(
      data.routeStatus === "UNSUPPORTED_PAIR"
        ? "Route unavailable"
        : (data.error ?? "The selected route could not be quoted."),
    );
  }
  if (data.requestVersion !== requestVersion) {
    throw new Error("The quote did not match this request.");
  }
  return data.quote;
}

function useOutgoingPreview(input: {
  active: boolean;
  accountId: string;
  operation: "SEND" | "CONVERT";
  source: HeldAssetItem | undefined;
  destination: CatalogTokenDeployment;
  displayAmount: string;
  recipient: string;
  refund: string;
  balances: readonly SerializedWalletBalanceRecord[];
}) {
  const {
    active,
    accountId,
    operation,
    source,
    destination,
    displayAmount,
    recipient,
    refund,
    balances,
  } = input;
  const sourceDeployment = source?.deployment;
  const amountAtomic = sourceDeployment
    ? positiveQuoteAmount(displayAmount, sourceDeployment.decimals)
    : null;
  const balance = source?.balanceRecord;
  const insufficientBalance = Boolean(
    amountAtomic &&
      (!balance || BigInt(amountAtomic) > BigInt(balance.atomicBalance)),
  );
  const nativeGasDeployment = sourceDeployment
    ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) =>
          d.networkKey === sourceDeployment.networkKey &&
          d.standard === "NATIVE",
      )
    : undefined;
  const nativeGasRecord = nativeGasDeployment
    ? balances.find(
        (record) =>
          record.networkAsset.isVerified &&
          record.networkAsset.status === "ACTIVE" &&
          isBalanceMatchingDeployment(record, nativeGasDeployment),
      )
    : undefined;
  const gasCheck =
    sourceDeployment && amountAtomic && !insufficientBalance
      ? checkNetworkGasBalance({
          networkKey: sourceDeployment.networkKey,
          sourceStandard: sourceDeployment.standard,
          requestedAmountAtomic: BigInt(amountAtomic),
          nativeBalanceAtomic: nativeGasRecord
            ? BigInt(nativeGasRecord.atomicBalance)
            : 0n,
        })
      : { ok: true as const };
  const insufficientGas = !gasCheck.ok;
  const samePair = Boolean(
    sourceDeployment && sourceDeployment.id === destination.id,
  );
  const unavailableReason = !sourceDeployment
    ? "Select an asset held in your wallet."
    : !amountAtomic
      ? "Enter an amount greater than 0."
      : insufficientBalance
        ? `Insufficient ${sourceDeployment.symbol} balance (available: ${balance ? formatApproxDisplay(balance.displayBalance) : "0"} ${sourceDeployment.symbol}).`
        : !gasCheck.ok
          ? gasCheck.reason
          : samePair
            ? "Source and destination assets are the same — select a different destination asset."
            : !recipient
              ? operation === "SEND"
                ? "Enter a valid recipient address to fetch a quote."
                : "Destination wallet address is unavailable."
              : !refund
                ? "Source refund address is unavailable."
                : null;
  const body =
    active &&
    sourceDeployment &&
    balance &&
    BigInt(balance.atomicBalance) > 0n &&
    amountAtomic &&
    BigInt(amountAtomic) <= BigInt(balance.atomicBalance) &&
    !insufficientGas &&
    sourceDeployment.id !== destination.id &&
    recipient &&
    refund
      ? JSON.stringify({
          operation,
          sourceDeploymentId: sourceDeployment.id,
          destinationDeploymentId: destination.id,
          sourceDisplayAmount: displayAmount,
          recipientAddress: operation === "SEND" ? recipient : undefined,
        })
      : null;
  const previewKey = body
    ? JSON.stringify([
        accountId,
        body,
        recipient,
        refund,
        balance?.atomicBalance,
      ])
    : null;
  const preview = useQuotePreview<OneClickPreview>(previewKey);
  const { load: loadPreview } = preview;
  const review = useCallback(() => {
    if (!body) return;
    void loadPreview(async (signal) => {
      const quote = await fetchAccountPreview(accountId, body, signal);
      if (
        quote.identity.operationId !== operation + ":" + accountId ||
        quote.sourceDeploymentId !== sourceDeployment?.id ||
        quote.destinationDeploymentId !== destination.id ||
        quote.identity.sourceNetwork !== sourceDeployment?.networkKey ||
        quote.identity.destinationNetwork !== destination.networkKey ||
        quote.identity.swapType !== "EXACT_INPUT" ||
        quote.identity.amountAtomic !== amountAtomic ||
        quote.identity.recipient !== recipient ||
        quote.identity.refundTo !== refund
      ) {
        throw new Error("The quote did not match the selected route.");
      }
      return { quote, expiresAt: quote.identity.expiresAt };
    });
  }, [
    accountId,
    amountAtomic,
    body,
    destination.id,
    destination.networkKey,
    loadPreview,
    operation,
    recipient,
    refund,
    sourceDeployment?.id,
    sourceDeployment?.networkKey,
  ]);
  useEffect(() => {
    if (!previewKey) return;
    const timer = window.setTimeout(() => {
      review();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [previewKey, review]);
  return {
    ...preview,
    review,
    canReview: Boolean(body),
    insufficientBalance,
    insufficientGas,
    samePair,
    unavailableReason,
  };
}

function OutgoingQuoteDetails({
  preview,
  symbol,
}: {
  preview: ReturnType<typeof useOutgoingPreview>;
  symbol: string;
}) {
  const { quote, loading, error, unavailableReason, canReview, review } = preview;
  return (
    <div
      className="rounded-2xl border border-neutral-200/60 dark:border-white/[0.08] bg-neutral-50/60 dark:bg-white/[0.03] px-4 py-3 text-left"
      role="status"
    >
      <div className="flex items-start justify-between gap-3">
        {quote ? (
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Est. receive
              </span>
              <span className="text-sm font-bold font-mono text-neutral-950 dark:text-white">
                {formatApproxDisplay(quote.recipientDisplayAmount)} {symbol}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="font-medium text-neutral-700 dark:text-neutral-300">
                {quote.rateDescription}
              </span>
              {quote.minimumRecipientDisplayAmount && (
                <span>
                  Min {formatApproxDisplay(quote.minimumRecipientDisplayAmount)} {symbol}
                </span>
              )}
              {quote.estimatedTimeSeconds !== null && (
                <span>~{quote.estimatedTimeSeconds}s</span>
              )}
            </div>
          </div>
        ) : (
          <div className="min-w-0 flex-1 text-xs text-neutral-600 dark:text-neutral-400">
            <p>
              {loading
                ? "Checking route…"
                : unavailableReason || "Quote unavailable"}
            </p>
            {!unavailableReason && error && (
              <p className="mt-1 text-[#FF1A1A] dark:text-red-400">{error}</p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={review}
          disabled={!canReview || loading}
          aria-label="Refresh quote"
          title="Refresh quote"
          className="shrink-0 p-2 rounded-full border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
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
            className={loading ? "animate-spin" : ""}
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function PortfolioView({
  accountId,
  initialPortfolio,
  account,
  initialView = "dashboard",
  userEmail,
  userAvatarUrl,
  initialDisplayName,
  profileId,
  executionDisabled = false,
}: {
  accountId: string;
  initialPortfolio: SerializedAccountPortfolio;
  account?: WorkspaceAccountSummary;
  allAccounts?: ReadonlyArray<WorkspaceAccountSummary>;
  initialView?: WorkspaceTab;
  userEmail?: string;
  userAvatarUrl?: string | null;
  initialDisplayName?: string | null;
  profileId?: string;
  executionDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const [portfolio, setPortfolio] =
    useState<SerializedAccountPortfolio>(initialPortfolio);
  const [activeTab, setActiveTab] = useState<NavTabId>(initialView);
  const [tabLoading, setTabLoading] = useState(false);
  const tabTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (tabTimerRef.current) {
        window.clearTimeout(tabTimerRef.current);
      }
    };
  }, []);

  const syncUrlParams = useCallback(
    (updates: Record<string, string | null>, pathnameOverride?: string) => {
      if (typeof window === "undefined") return;
      try {
        const url = new URL(window.location.href);
        if (pathnameOverride) {
          url.pathname = pathnameOverride;
        }
        for (const [k, v] of Object.entries(updates)) {
          if (v === null) url.searchParams.delete(k);
          else url.searchParams.set(k, v);
        }
        const nextQuery = url.searchParams.toString();
        const nextPath = `${url.pathname}${nextQuery ? `?${nextQuery}` : ""}${url.hash}`;
        window.history.replaceState(window.history.state, "", nextPath);
      } catch {
        // ignore
      }
    },
    [],
  );

  const changeTab = useCallback(
    (tab: NavTabId) => {
      if (tab !== activeTab) {
        if (tabTimerRef.current) {
          window.clearTimeout(tabTimerRef.current);
        }
        setTabLoading(true);
        tabTimerRef.current = window.setTimeout(() => {
          setTabLoading(false);
          tabTimerRef.current = null;
        }, 220);
      }
      setActiveTab(tab);
      if (tab === "receive") setReceiveHubOpen(true);
      if (tab === "send") setSendHubOpen(true);
      const nextPathname =
        tab === "dashboard" ? "/app" : `/app/${tab}`;
      syncUrlParams(
        {
          view: null,
          sendMode: null,
          depositMode: null,
        },
        nextPathname,
      );
    },
    [activeTab, syncUrlParams],
  );

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === "undefined") return;
      try {
        const pathMatch = window.location.pathname.match(/^\/app\/([^/]+)$/);
        const pathTab = pathMatch?.[1]?.toLowerCase();
        if (
          pathTab &&
          ["send", "convert", "receive", "request", "earn", "activity", "settings"].includes(
            pathTab,
          )
        ) {
          setActiveTab(pathTab as NavTabId);
          return;
        }
        const params = new URLSearchParams(window.location.search);
        const viewParam = params.get("view");
        if (
          viewParam &&
          ["dashboard", "send", "convert", "receive", "request", "earn", "activity", "settings"].includes(
            viewParam,
          )
        ) {
          setActiveTab(viewParam as NavTabId);
        } else {
          setActiveTab("dashboard");
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const isBusiness = account?.kind === "BUSINESS";
  const canManageTeam = isBusiness && account?.role !== "MEMBER";
  const [refreshing, setRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(
    initialPortfolio.cooldownRemainingSeconds ?? 0,
  );
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals and Drawers
  const router = useRouter();
  const [isHeldAssetsOpen, setIsHeldAssetsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { pushToast } = useToast();
  const setMessage = useCallback(
    (text: string) => {
      if (!text) return;
      const lower = text.toLowerCase();
      const isError =
        lower.includes("fail") ||
        lower.includes("error") ||
        lower.includes("unable") ||
        lower.includes("invalid") ||
        lower.includes("insufficient");
      pushToast({
        title: text,
        variant: isError ? "error" : "info",
        durationMs: 4500,
      });
    },
    [pushToast],
  );
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initialNotifPollDoneRef = useRef(false);

  useEffect(() => {
    initialNotifPollDoneRef.current = false;
    try {
      const saved = localStorage.getItem(`flow_toasted_notifs_${accountId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          seenNotifIdsRef.current = new Set(
            parsed.filter((v): v is string => typeof v === "string"),
          );
          return;
        }
      }
    } catch {}
    seenNotifIdsRef.current = new Set();
  }, [accountId]);

  // Live notification polling & pop-up toasts
  const pollNotifications = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/accounts/${encodeURIComponent(accountId)}/notifications`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications?: Array<{
          id: string;
          title: string;
          description?: string;
          message?: string;
          isRead: boolean;
        }>;
        unreadCount?: number;
      };
      const list = data.notifications ?? [];
      const unread =
        typeof data.unreadCount === "number"
          ? data.unreadCount
          : list.filter((n) => !n.isRead).length;
      setUnreadNotifications(unread);

      const isInitial = !initialNotifPollDoneRef.current;
      initialNotifPollDoneRef.current = true;
      let added = false;

      for (const item of list) {
        if (!seenNotifIdsRef.current.has(item.id)) {
          seenNotifIdsRef.current.add(item.id);
          added = true;
          if (!isInitial && !item.isRead) {
            pushToast({
              id: `notif_${item.id}`,
              title: item.title,
              description: item.description ?? item.message,
              variant: "info",
              durationMs: 6500,
            });
          }
        }
      }

      if (added) {
        try {
          localStorage.setItem(
            `flow_toasted_notifs_${accountId}`,
            JSON.stringify([...seenNotifIdsRef.current].slice(-100)),
          );
        } catch {}
      }
    } catch {
      // Non-fatal background notification poll
    }
  }, [accountId, pushToast]);

  useEffect(() => {
    void pollNotifications();
    const timer = setInterval(() => void pollNotifications(), 3000);
    return () => {
      clearInterval(timer);
    };
  }, [pollNotifications]);

  // Hide balance toggle (synced & persisted across tabs and pages)
  const [hideBalance, setHideBalance] = useState(false);

  useEffect(() => {
    const sync = () => setHideBalance(readBalanceHidden());
    sync();
    window.addEventListener(BALANCE_VISIBILITY_EVENT, sync);
    return () => window.removeEventListener(BALANCE_VISIBILITY_EVENT, sync);
  }, []);

  const toggleBalanceVisibility = useCallback(() => {
    const next = !hideBalance;
    setHideBalance(next);
    writeBalanceHidden(next);
  }, [hideBalance]);

  // Carousel state (Matches FLOW Dashboard Overview-2.png)
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Send vs Convert state (Matches media_1794490079738_c27b1dd5.jpg)
  const [sendMode, setSendModeState] = useState<"SEND" | "CONVERT">("SEND");
  const [sendStep, setSendStep] = useState<1 | 2 | 3 | 4>(1);
  const [sendHubOpen, setSendHubOpen] = useState(true);
  const [receiveHubOpen, setReceiveHubOpen] = useState(true);
  const setSendMode = useCallback(
    (mode: "SEND" | "CONVERT") => {
      setSendModeState(mode);
      syncUrlParams({ sendMode: mode === "SEND" ? null : mode });
    },
    [syncUrlParams],
  );
  const [convertSourceDeploymentId, setConvertSourceDeploymentId] =
    useState<string>("base-mainnet:USDC");
  const [convertDestDeploymentId, setConvertDestDeploymentId] =
    useState<string>("near-mainnet:NEAR");
  const [convertAmount, setConvertAmount] = useState<string>("1.00");

  // Send state (Matches FLOW Send_ Solana to Base-6.png & media_1794481849794_6d251fd6.jpg)
  const [sendSourceDeploymentId, setSendSourceDeploymentId] =
    useState<string>("base-mainnet:USDC");
  const [sendDestDeploymentId, setSendDestDeploymentId] =
    useState<string>("solana-mainnet:SOL");
  const [sendAmount, setSendAmount] = useState<string>("");
  const [sendRecipientAddress, setSendRecipientAddress] = useState<string>("");
  const [isFlowIdModalOpen, setIsFlowIdModalOpen] = useState(false);
  const [flowIdResolution, setFlowIdResolution] = useState<{
    status: "idle" | "loading" | "resolved" | "error";
    accountId?: string;
    flowId?: string;
    accountName?: string;
    recipientAddress?: string;
    error?: string;
  }>({ status: "idle" });

  // Outgoing execution (Send & Convert) + Add Money + Payment Links management state
  const [outgoingExecuting, setOutgoingExecuting] = useState(false);
  const [outgoingError, setOutgoingError] = useState<string | null>(null);
  const [outgoingIdempotencyKey, setOutgoingIdempotencyKey] = useState<string>(
    () => crypto.randomUUID(),
  );
  const [activeOutgoingTransfer, setActiveOutgoingTransfer] =
    useState<SerializedOutgoingTransfer | null>(null);

  const [addMoneyIntent, setAddMoneyIntent] =
    useState<SerializedAddMoneyIntent | null>(null);
  const addMoneyStorageKey = `flow-add-money-intent:${accountId}`;
  const [addMoneyCommitting, setAddMoneyCommitting] = useState(false);
  const [addMoneyError, setAddMoneyError] = useState<string | null>(null);
  const [addMoneySecondsRemaining, setAddMoneySecondsRemaining] =
    useState<number>(0);

  const [paymentLinksModalFilter, setPaymentLinksModalFilter] = useState<
    "ACTIVE" | "PAST" | null
  >(null);
  const [requestView, setRequestView] = useState<"LIST" | "CREATE">("LIST");
  const [togglingPaymentRequestId, setTogglingPaymentRequestId] = useState<
    string | null
  >(null);
  const [deletingPaymentRequestId, setDeletingPaymentRequestId] = useState<
    string | null
  >(null);
  const [deleteLinkConfirmTarget, setDeleteLinkConfirmTarget] =
    useState<SerializedPaymentRequest | null>(null);

  // Add Money state (Matches media_1794490079680_0a50f095.jpg)
  const [depositMode, setDepositModeState] = useState<"DIRECT" | "DEPOSIT">(
    "DIRECT",
  );
  const setDepositMode = useCallback(
    (mode: "DIRECT" | "DEPOSIT") => {
      setDepositModeState(mode);
      syncUrlParams({ depositMode: mode === "DIRECT" ? null : mode });
    },
    [syncUrlParams],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const sm = params.get("sendMode");
      if (sm === "SEND" || sm === "CONVERT") {
        setSendModeState(sm);
      }
      const dm = params.get("depositMode");
      if (dm === "DIRECT" || dm === "DEPOSIT") {
        setDepositModeState(dm);
      }
    } catch {
      // ignore
    }
  }, []);
  const [depositDeployment, setDepositDeployment] =
    useState<CatalogTokenDeployment>(
      MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === "base-mainnet:USDC") ??
        MAINNET_SUPPORTED_DEPLOYMENTS[0]!,
    );
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [tokenChanges24h, setTokenChanges24h] = useState<Record<string, number>>({});
  const [linearLiveApy, setLinearLiveApy] = useState<number | null>(null);
  const [ledgerMovements, setLedgerMovements] = useState<
    LedgerMovement[] | null
  >(null);

  const refreshTokenPrices = useCallback(async (signal?: AbortSignal) => {
    const prices: Record<string, number> = {};
    try {
      const response = await fetch(
        "/api/tokens/discovery?capability=CAN_HOLD_IN_FLOW",
        {
          signal,
          cache: "no-store",
        },
      );
      const data = response.ok
        ? ((await response.json()) as {
            tokens: DiscoveredToken[];
            priceChanges24h?: Record<string, number>;
          })
        : null;
      const now = Date.now();
      for (const token of data?.tokens ?? []) {
        const updatedAt = Date.parse(token.priceUpdatedAt ?? "");
        if (
          typeof token.priceUsd === "number" &&
          token.priceUsd > 0 &&
          Number.isFinite(token.priceUsd) &&
          updatedAt <= now + 30_000 &&
          updatedAt >= now - 15 * 60_000
        ) {
          prices[token.id] = token.priceUsd;
        }
      }
      if (!signal?.aborted && data?.priceChanges24h) {
        setTokenChanges24h(data.priceChanges24h);
      }
    } catch {}
    if (!signal?.aborted) setTokenPrices(prices);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refreshTokenPrices(controller.signal);
    const timer = window.setInterval(
      () => void refreshTokenPrices(controller.signal),
      30_000,
    );
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [refreshTokenPrices]);

  const refreshLedgerMovements = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          "/api/accounts/" + accountId + "/ledger/summary",
          {
            signal,
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("Ledger unavailable");
        const { movements } = (await response.json()) as {
          movements: LedgerMovement[];
        };
        if (!signal?.aborted) setLedgerMovements(movements);
      } catch {
        if (!signal?.aborted) setLedgerMovements(null);
      }
    },
    [accountId],
  );

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    const controller = new AbortController();
    void refreshLedgerMovements(controller.signal);
    return () => controller.abort();
  }, [accountId, activeTab, refreshLedgerMovements]);

  // Cross-chain deposit into native NEAR state
  const [crossChainSourceToken, setCrossChainSourceToken] =
    useState<DiscoveredToken | null>(null);
  const [crossChainDepositAmount, setCrossChainDepositAmount] =
    useState<string>("10");
  const [crossChainRefundAddress, setCrossChainRefundAddress] =
    useState<string>("");
  const [isCrossChainTokenSelectorOpen, setIsCrossChainTokenSelectorOpen] =
    useState(false);

  // Payment Links state (Matches media_1794481849816_2576ee33.jpg)
  const [paymentRequests, setPaymentRequests] = useState<
    SerializedPaymentRequest[]
  >([]);
  const [prTitle, setPrTitle] = useState<string>("Project design deposit");
  const [prDescription, setPrDescription] = useState<string>("");
  const [prAmountMode, setPrAmountMode] = useState<"FIXED" | "OPTIONAL">(
    "FIXED",
  );
  const [prAmount, setPrAmount] = useState<string>("1.00");
  const [prMaxPaymentsMode, setPrMaxPaymentsMode] = useState<
    "UNLIMITED" | "LIMITED"
  >("UNLIMITED");
  const [prMaxPayments, setPrMaxPayments] = useState<string>("1");
  const [prDestinationDeployment, setPrDestinationDeployment] =
    useState<CatalogTokenDeployment>(
      MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === "base-mainnet:USDC") ??
        MAINNET_SUPPORTED_DEPLOYMENTS[0]!,
    );
  const [prCreating, setPrCreating] = useState<boolean>(false);
  const [prSuccessUrl, setPrSuccessUrl] = useState<string | null>(null);

  // Activity state
  const [activities, setActivities] = useState<
    SerializedWalletActivityRecord[]
  >([]);
  const displayActivities = useMemo(() => {
    const unique = new Map<string, SerializedWalletActivityRecord>();
    for (const row of activities) {
      const key = JSON.stringify([
        row.chainId,
        row.txHash,
        row.direction,
        row.assetSymbol,
        row.atomicAmount,
      ]);
      if (
        !unique.has(key) ||
        row.activityType === "FLOW_CROSS_CHAIN_SETTLEMENT"
      )
        unique.set(key, row);
    }
    return [...unique.values()];
  }, [activities]);
  const [activityFilter, setActivityFilter] = useState<
    "ALL" | "INCOMING" | "OUTGOING"
  >("ALL");
  const [activityLoading, setActivityLoading] = useState(false);

  // Derive provisioned wallet addresses
  const wallet = portfolio.wallet;
  const nearAddr = getMainnetWalletAddress(wallet, "near-mainnet") ?? "";
  const receiveOptions = MAINNET_SUPPORTED_DEPLOYMENTS.filter((deployment) =>
    getMainnetWalletAddress(wallet, deployment.networkKey),
  );
  const networkReceiveAssets = receiveOptions.filter(
    (deployment) =>
      canonicalizeNetworkId(deployment.networkKey) ===
      canonicalizeNetworkId(depositDeployment.networkKey),
  );
  const activeDepositAddress =
    getMainnetWalletAddress(wallet, depositDeployment.networkKey) ?? "";
  const prRecipientAddress =
    getMainnetWalletAddress(wallet, prDestinationDeployment.networkKey) ?? "";

  const sendDestDeployment = useMemo(() => {
    return (
      MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) => d.id === sendDestDeploymentId,
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[1]!
    );
  }, [sendDestDeploymentId]);

  const sendIsFlowId = isFlowIdInput(sendRecipientAddress);

  useEffect(() => {
    const trimmed = sendRecipientAddress.trim();
    if (!isFlowIdInput(trimmed)) {
      setFlowIdResolution({ status: "idle" });
      return;
    }
    let cancelled = false;
    setFlowIdResolution({ status: "loading" });
    const timer = window.setTimeout(() => {
      fetch(
        `/api/flow-id/resolve?flowId=${encodeURIComponent(trimmed)}&network=${encodeURIComponent(sendDestDeployment.networkKey)}`,
        { cache: "no-store" },
      )
        .then(async (res) => {
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            accountId?: string;
            flowId?: string;
            accountName?: string;
            recipientAddress?: string;
            error?: string;
          };
          if (cancelled) return;
          if (!res.ok || !data.ok || !data.recipientAddress) {
            setFlowIdResolution({
              status: "error",
              error:
                data.error ??
                `Could not resolve ${trimmed} for ${sendDestDeployment.networkName}.`,
            });
            return;
          }
          setFlowIdResolution({
            status: "resolved",
            accountId: data.accountId,
            flowId: data.flowId ?? trimmed,
            accountName: data.accountName,
            recipientAddress: data.recipientAddress,
          });
        })
        .catch(() => {
          if (!cancelled) {
            setFlowIdResolution({
              status: "error",
              error: "Unable to verify Flow ID right now.",
            });
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    sendRecipientAddress,
    sendDestDeployment.networkKey,
    sendDestDeployment.networkName,
  ]);

  const sendAddressValidation = useMemo(() => {
    const matchesOwnAddress = (candidate: string) => {
      const trimmedCandidate = candidate.trim();
      if (!trimmedCandidate || !wallet?.addresses?.length) return false;
      return wallet.addresses.some((entry) => {
        const own = entry.address.trim();
        return sendDestDeployment.ecosystem === "solana"
          ? own === trimmedCandidate
          : own.toLowerCase() === trimmedCandidate.toLowerCase();
      });
    };

    if (sendIsFlowId) {
      if (flowIdResolution.status === "resolved" && flowIdResolution.recipientAddress) {
        if (
          flowIdResolution.accountId === accountId ||
          matchesOwnAddress(flowIdResolution.recipientAddress)
        ) {
          return {
            valid: false as const,
            reason: "You cannot send assets to your own Flow ID.",
          };
        }
        return { valid: true as const };
      }
      if (flowIdResolution.status === "loading" || flowIdResolution.status === "idle") {
        return {
          valid: false as const,
          reason: "Verifying @flow ID and resolving destination address...",
        };
      }
      return {
        valid: false as const,
        reason: flowIdResolution.error ?? "Could not resolve @flow ID.",
      };
    }
    const baseValidation = validateEcosystemAddress(
      sendDestDeployment.ecosystem,
      sendRecipientAddress,
    );
    if (baseValidation.valid && matchesOwnAddress(sendRecipientAddress)) {
      return {
        valid: false as const,
        reason: "You cannot send assets to your own wallet address.",
      };
    }
    return baseValidation;
  }, [
    accountId,
    wallet?.addresses,
    sendIsFlowId,
    flowIdResolution,
    sendDestDeployment.ecosystem,
    sendRecipientAddress,
  ]);

  // Derive held assets with positive balance
  const heldAssets: HeldAssetItem[] = useMemo(() => {
    const items: HeldAssetItem[] = [];
    const balances = portfolio.balances;

    for (const d of MAINNET_SUPPORTED_DEPLOYMENTS) {
      const b = balances.find((bal) => isBalanceMatchingDeployment(bal, d));
      if (
        b &&
        b.networkAsset.isVerified &&
        b.networkAsset.status === "ACTIVE" &&
        BigInt(b.atomicBalance) > 0n
      ) {
        const disp = b.displayBalance;
        const cents = holdingUsdCents(b, tokenPrices[d.id]);
        const usdVal =
          cents === null ? "Syncing..." : formatUsdCents(cents);
        items.push({
          deployment: d,
          balanceRecord: b,
          displayBalance: disp,
          usdValue: usdVal,
        });
      }
    }

    return items;
  }, [portfolio.balances, tokenPrices]);

  const sendSource =
    heldAssets.find((item) => item.deployment.id === sendSourceDeploymentId) ??
    heldAssets[0];
  const convertSource =
    heldAssets.find(
      (item) => item.deployment.id === convertSourceDeploymentId,
    ) ?? heldAssets[0];
  const sendSourceBalance = sendSource?.displayBalance;
  const convertSourceBalance = convertSource?.displayBalance;

  const getMaxAmountForSource = (
    source: typeof sendSource,
  ): string => {
    if (!source?.displayBalance) return "";
    try {
      const atomic = parseDisplayToAtomic(
        source.displayBalance,
        source.deployment.decimals,
      );
      const maxAtomic = computeMaxSendableAtomic({
        networkKey: source.deployment.networkKey,
        sourceStandard: source.deployment.standard,
        balanceAtomic: atomic,
      });
      return formatAtomicToDisplay(maxAtomic, source.deployment.decimals);
    } catch {
      return source.displayBalance;
    }
  };

  const convertDestDeployment = useMemo(() => {
    const selected =
      MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) => d.id === convertDestDeploymentId,
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[3]!; // near-mainnet:NEAR
    if (convertSource && selected.id === convertSource.deployment.id) {
      return (
        MAINNET_SUPPORTED_DEPLOYMENTS.find(
          (d) => d.id !== convertSource.deployment.id,
        ) ?? selected
      );
    }
    return selected;
  }, [convertDestDeploymentId, convertSource]);

  const convertDestAddress =
    getMainnetWalletAddress(wallet, convertDestDeployment.networkKey) ?? "";

  const sendPreview = useOutgoingPreview({
    active: activeTab === "send",
    accountId,
    operation: "SEND",
    source: sendSource,
    destination: sendDestDeployment,
    displayAmount: sendAmount,
    recipient: sendAddressValidation.valid
      ? sendIsFlowId
        ? (flowIdResolution.recipientAddress ?? "")
        : sendRecipientAddress.trim()
      : "",
    refund: sendSource
      ? (getMainnetWalletAddress(wallet, sendSource.deployment.networkKey) ??
        "")
      : "",
    balances: portfolio.balances,
  });
  const convertPreview = useOutgoingPreview({
    active: activeTab === "convert",
    accountId,
    operation: "CONVERT",
    source: convertSource,
    destination: convertDestDeployment,
    displayAmount: convertAmount,
    recipient: convertDestAddress,
    refund: convertSource
      ? (getMainnetWalletAddress(wallet, convertSource.deployment.networkKey) ??
        "")
      : "",
    balances: portfolio.balances,
  });

  const crossChainRefundValidation = crossChainSourceToken
    ? validateQuoteAddress(crossChainSourceToken, crossChainRefundAddress)
    : { valid: false, reason: "Select a source asset." };
  const crossChainAmountAtomic = crossChainSourceToken
    ? positiveQuoteAmount(
        crossChainDepositAmount,
        crossChainSourceToken.decimals,
      )
    : null;
  const addMoneyRouteUnavailable = Boolean(
    crossChainSourceToken &&
    (crossChainSourceToken.networkKey === "near-mainnet" ||
      !supportsQuoteAddress(crossChainSourceToken)),
  );
  const addMoneyBody =
    crossChainSourceToken &&
    nearAddr &&
    crossChainAmountAtomic &&
    crossChainRefundValidation.valid &&
    crossChainSourceToken.networkKey !== "near-mainnet"
      ? JSON.stringify({
          operation: "ADD_MONEY",
          sourceDeploymentId: crossChainSourceToken.assetId,
          destinationDeploymentId: "near-mainnet:NEAR",
          sourceDisplayAmount: crossChainDepositAmount,
          refundAddress: crossChainRefundAddress.trim(),
        })
      : null;
  const addMoneyKey =
    activeTab === "receive" && depositMode === "DEPOSIT" && addMoneyBody
      ? JSON.stringify([accountId, nearAddr, addMoneyBody])
      : null;
  const {
    quote: crossChainQuote,
    error: crossChainQuoteError,
    loading: crossChainQuoteLoading,
    load: loadCrossChainQuote,
  } = useQuotePreview<OneClickPreview>(addMoneyKey);

  const hasBalanceSyncError = useMemo(
    () => portfolio.balances.some((balance) => balance.syncStatus === "ERROR"),
    [portfolio.balances],
  );

  const isInitialIndexing = useMemo(() => {
    if (!portfolio.wallet || portfolio.wallet.status !== "ACTIVE") return false;
    if (portfolio.wallet.environment !== "mainnet") return false;
    if (hasBalanceSyncError) return false;
    const provisioned = MAINNET_SUPPORTED_DEPLOYMENTS.filter((deployment) =>
      getMainnetWalletAddress(portfolio.wallet, deployment.networkKey),
    );
    if (provisioned.length === 0) return false;
    return provisioned.some(
      (deployment) =>
        !portfolio.balances.some(
          (balance) =>
            balance.syncStatus === "SYNCED" &&
            balance.networkAsset.isVerified &&
            balance.networkAsset.status === "ACTIVE" &&
            isBalanceMatchingDeployment(balance, deployment),
        ),
    );
  }, [hasBalanceSyncError, portfolio.wallet, portfolio.balances]);

  const totalBalanceUsd = useMemo(() => {
    const provisioned = MAINNET_SUPPORTED_DEPLOYMENTS.filter((deployment) =>
      getMainnetWalletAddress(portfolio.wallet, deployment.networkKey),
    );
    if (
      provisioned.length === 0 ||
      provisioned.some(
        (deployment) =>
          !portfolio.balances.some(
            (balance) =>
              balance.syncStatus === "SYNCED" &&
              balance.networkAsset.isVerified &&
              balance.networkAsset.status === "ACTIVE" &&
              isBalanceMatchingDeployment(balance, deployment),
          ),
      )
    ) {
      return isInitialIndexing ? null : "Balance unavailable";
    }
    let total = 0n;
    for (const item of heldAssets) {
      const cents = item.balanceRecord
        ? holdingUsdCents(item.balanceRecord, tokenPrices[item.deployment.id])
        : null;
      if (cents === null) return null;
      total += cents;
    }
    return formatUsdCents(total);
  }, [
    heldAssets,
    isInitialIndexing,
    portfolio.wallet,
    portfolio.balances,
    tokenPrices,
  ]);

  const portfolioPnl = useMemo(() => {
    if (totalBalanceUsd === null || totalBalanceUsd === "Balance unavailable") {
      return null;
    }
    const totalNum = parseFloat(totalBalanceUsd.replace(/[$,]/g, "")) || 0;
    if (totalNum <= 0 || heldAssets.length === 0) {
      return {
        amount: "$0.00",
        percent: "+0.00%",
        isPositive: true,
      };
    }

    let deltaAmount = 0;
    let baselineUsd = 0;

    for (const item of heldAssets) {
      const itemUsd = parseFloat(item.usdValue.replace(/[$,]/g, "")) || 0;
      if (itemUsd <= 0) continue;
      const sym = item.deployment.symbol.toUpperCase();
      const changePct =
        item.deployment.kind === "STABLECOIN"
          ? 0
          : tokenChanges24h[sym] ?? 0;
      const denom = 1 + changePct / 100;
      const prevUsd = denom > 0 ? itemUsd / denom : itemUsd;
      deltaAmount += itemUsd - prevUsd;
      baselineUsd += prevUsd;
    }

    const weightedPercent =
      baselineUsd > 0 ? (deltaAmount / baselineUsd) * 100 : 0;

    return {
      amount:
        deltaAmount >= 0
          ? `+$${deltaAmount.toFixed(2)}`
          : `-$${Math.abs(deltaAmount).toFixed(2)}`,
      percent:
        weightedPercent >= 0
          ? `+${weightedPercent.toFixed(2)}%`
          : `${weightedPercent.toFixed(2)}%`,
      isPositive: deltaAmount >= 0,
    };
  }, [totalBalanceUsd, heldAssets, tokenChanges24h]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/earn/apys", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok?: boolean;
          apys?: { linear?: number };
        };
        if (
          !controller.signal.aborted &&
          typeof data?.apys?.linear === "number" &&
          Number.isFinite(data.apys.linear)
        ) {
          setLinearLiveApy(data.apys.linear);
        }
      } catch {
        // Keep skeleton or retry on next visit
      }
    })();
    return () => controller.abort();
  }, []);

  // Carousel banners content
  const carouselSlides = [
    {
      title: (
        <>
          Earn{" "}
          {linearLiveApy !== null ? (
            `${linearLiveApy.toFixed(2)}%`
          ) : (
            <span
              aria-label="Loading live APY"
              className="inline-block h-5 w-16 rounded-full bg-neutral-200 dark:bg-white/10 animate-pulse align-middle"
            />
          )}{" "}
          APY on idle NEAR balances
        </>
      ),
      description:
        "Non-custodial liquid staking powered by LiNEAR Protocol. Auto-compounds with zero lockup.",
      badge: "FLOW Earn • NEAR Yield",
    },
    {
      title: "Move and receive money across chains",
      description:
        "Explore cross-chain assets and preview instant conversion rates.",
      badge: "Cross-Chain Routing",
    },
    {
      title: "Multi-chain guest checkout",
      description:
        "Get paid in what you want while others pay with what they have.",
      badge: "One-Click Settlement",
    },
    {
      title: "Enterprise multi-chain security",
      description:
        "Protected multi-network account keys with independent on-chain verification.",
      badge: "Multi-Chain Security",
    },
  ];

  const currentSlide = carouselSlides[carouselIndex] ?? carouselSlides[0]!;

  // Copy helper
  const copyText = useCallback((key: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  const refreshActivities = useCallback(async () => {
    try {
      const res = await send<ActivityFeedResponse>(
        `/api/accounts/${accountId}/activities?limit=50`,
        {},
        "GET",
      );
      setActivities(res.activities);
    } catch {}
  }, [accountId]);

  // Poll activities every 5s when tab is visible
  useEffect(() => {
    void refreshActivities();
    const timer = window.setInterval(() => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;
      void refreshActivities();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refreshActivities, activeTab]);

  // Poll payment requests
  useEffect(() => {
    let active = true;
    send<{ requests: SerializedPaymentRequest[] }>(
      `/api/accounts/${accountId}/payment-requests`,
      {},
      "GET",
    )
      .then((res) => {
        if (active) setPaymentRequests(res.requests);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accountId, activeTab]);

  const autoRefreshRequestedRef = useRef<string | null>(null);

  // Trigger one initial background balance sync when an active mainnet wallet
  // opens without synced balance rows yet so newly onboarded users do not stay
  // on initial loading skeletons.
  useEffect(() => {
    if (
      portfolio.wallet?.status !== "ACTIVE" ||
      portfolio.wallet.environment !== "mainnet" ||
      !isInitialIndexing ||
      (portfolio.cooldownRemainingSeconds ?? 0) > 0 ||
      autoRefreshRequestedRef.current === accountId
    ) {
      return;
    }
    autoRefreshRequestedRef.current = accountId;
    let active = true;
    send<SerializedAccountPortfolio>(
      `/api/accounts/${accountId}/portfolio/refresh`,
      {},
      "POST",
    )
      .then((updated) => {
        if (!active) return;
        setPortfolio(updated);
        if (updated.cooldownRemainingSeconds) {
          setCooldown(updated.cooldownRemainingSeconds);
        }
      })
      .catch(() => {
        // Silent background kickoff; user can always click Refresh manually.
      });
    return () => {
      active = false;
    };
  }, [
    accountId,
    isInitialIndexing,
    portfolio.wallet?.status,
    portfolio.wallet?.environment,
    portfolio.cooldownRemainingSeconds,
  ]);

  // Poll balances fast during initial indexing, then every 10s; trigger background chain sync every ~30s
  useEffect(() => {
    let active = true;
    let tickCount = 0;
    const triggerBackgroundSync = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;
      send<SerializedAccountPortfolio>(
        `/api/accounts/${accountId}/portfolio/refresh`,
        {},
        "POST",
      )
        .then((res) => {
          if (active) setPortfolio(res);
        })
        .catch(() => {});
    };
    const poll = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;
      tickCount += 1;
      send<SerializedAccountPortfolio>(
        `/api/accounts/${accountId}/portfolio`,
        {},
        "GET",
      )
        .then((res) => {
          if (active) setPortfolio(res);
        })
        .catch(() => {});
      if (!isInitialIndexing && tickCount % 4 === 0) {
        triggerBackgroundSync();
      }
    };
    if (!isInitialIndexing) {
      triggerBackgroundSync();
    }
    const interval = setInterval(poll, isInitialIndexing ? 1500 : 4000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accountId, isInitialIndexing]);

  // Handle manual balance refresh
  const handleRefresh = useCallback(async () => {
    if (refreshing || cooldown > 0) return;
    setRefreshing(true);
    setMessage("");
    try {
      const updated = await send<SerializedAccountPortfolio>(
        `/api/accounts/${accountId}/portfolio/refresh`,
        {},
        "POST",
      );
      setPortfolio(updated);
      setCooldown(updated.cooldownRemainingSeconds ?? 15);
      setMessage(
        updated.syncStatus === "complete"
          ? "Balances refreshed from verified network data."
          : "Balance refresh queued. Current balances remain unchanged until verified network data arrives.",
      );
    } catch (err) {
      setMessage(describe(err));
    } finally {
      setRefreshing(false);
    }
  }, [accountId, cooldown, refreshing]);

  // Sync on-chain activities
  const handleSyncActivities = useCallback(async () => {
    setActivityLoading(true);
    setMessage("");
    try {
      const res = await send<ActivityFeedResponse>(
        `/api/accounts/${accountId}/activities/sync`,
        {},
        "POST",
      );
      setActivities(res.activities);
      setMessage(
        res.syncStatus === "complete"
          ? "On-chain activity synchronized."
          : res.syncStatus === "unavailable"
            ? "Activity sync is unavailable until a wallet is ready."
            : "Activity sync started. New transactions will appear shortly.",
      );
    } catch (err) {
      setMessage(describe(err));
    } finally {
      setActivityLoading(false);
    }
  }, [accountId]);

  // Create payment request
  const handleCreatePaymentRequest = useCallback(async () => {
    if (!prTitle.trim()) {
      setMessage("Please enter a title for the payment link.");
      return;
    }
    let maxPaymentsPayload: number | null = null;
    if (prMaxPaymentsMode === "LIMITED") {
      const parsed = Number.parseInt(prMaxPayments.trim(), 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
        setMessage("Please enter a valid payer limit between 1 and 10,000.");
        return;
      }
      maxPaymentsPayload = parsed;
    }
    setPrCreating(true);
    setMessage("");
    setPrSuccessUrl(null);
    try {
      const created = await send<SerializedPaymentRequest>(
        `/api/accounts/${accountId}/payment-requests`,
        {
          title: prTitle.trim(),
          description: prDescription.trim() || null,
          destinationNetwork: prDestinationDeployment.networkKey,
          destinationAssetId: prDestinationDeployment.id,
          amountMode: prAmountMode,
          requestedAmount: prAmountMode === "FIXED" ? prAmount : null,
          expiresInHours: 168,
          maxPayments: maxPaymentsPayload,
        },
        "POST",
      );
      setPaymentRequests((prev) => [created, ...prev]);
      setPrSuccessUrl(created.shareUrl);
      setMessage(`Payment link created: ${created.shareUrl}`);
      pushToast({
        title: "Payment link created",
        description: created.shareUrl,
        variant: "success",
      });
    } catch (err) {
      const msg = describe(err);
      setMessage(msg);
      pushToast({
        title: "Could not create payment link",
        description: msg,
        variant: "error",
      });
    } finally {
      setPrCreating(false);
    }
  }, [
    accountId,
    prTitle,
    prDescription,
    prDestinationDeployment,
    prAmountMode,
    prAmount,
    prMaxPaymentsMode,
    prMaxPayments,
    pushToast,
  ]);

  const handleDeletePaymentRequest = useCallback(
    async (req: SerializedPaymentRequest) => {
      setDeletingPaymentRequestId(req.id);
      try {
        await send<{ deleted: boolean; id: string }>(
          `/api/accounts/${accountId}/payment-requests/${req.id}`,
          undefined,
          "DELETE",
        );
        setPaymentRequests((prev) => prev.filter((item) => item.id !== req.id));
        setDeleteLinkConfirmTarget(null);
        pushToast({
          title: "Payment link deleted",
          description: `"${req.title}" has been deleted.`,
          variant: "success",
        });
      } catch (err) {
        pushToast({
          title: "Could not delete payment link",
          description: describe(err),
          variant: "error",
        });
      } finally {
        setDeletingPaymentRequestId(null);
      }
    },
    [accountId, pushToast],
  );

  const handleReviewCrossChainQuote = () => {
    if (!addMoneyBody || !crossChainSourceToken || !crossChainAmountAtomic) return;
    const params = {
      accountId,
      body: addMoneyBody,
      originAsset: crossChainSourceToken.assetId,
      sourceNetwork: crossChainSourceToken.networkKey,
      amountAtomic: crossChainAmountAtomic,
      recipient: nearAddr,
      refundTo: crossChainRefundAddress.trim(),
    };
    void loadCrossChainQuote((signal) =>
      fetchVerifiedAddMoneyPreview({ ...params, signal }),
    );
  };

  useEffect(() => {
    if (!addMoneyKey || !addMoneyBody || !crossChainSourceToken || !crossChainAmountAtomic) {
      return;
    }
    const params = {
      accountId,
      body: addMoneyBody,
      originAsset: crossChainSourceToken.assetId,
      sourceNetwork: crossChainSourceToken.networkKey,
      amountAtomic: crossChainAmountAtomic,
      recipient: nearAddr,
      refundTo: crossChainRefundAddress.trim(),
    };
    const timer = window.setTimeout(() => {
      void loadCrossChainQuote((signal) =>
        fetchVerifiedAddMoneyPreview({ ...params, signal }),
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    accountId,
    addMoneyBody,
    addMoneyKey,
    crossChainAmountAtomic,
    crossChainRefundAddress,
    crossChainSourceToken,
    loadCrossChainQuote,
    nearAddr,
  ]);

  const triggerPostSettlementSync = useCallback(() => {
    void refreshTokenPrices();
    void refreshActivities();
    void refreshLedgerMovements();
    void pollNotifications();
    void send<SerializedAccountPortfolio>(
      `/api/accounts/${accountId}/portfolio/refresh`,
      {},
      "POST",
    )
      .then((p) => setPortfolio(p))
      .catch(() => {});
    window.setTimeout(() => {
      void send<SerializedAccountPortfolio>(
        `/api/accounts/${accountId}/portfolio`,
        {},
        "GET",
      )
        .then((p) => setPortfolio(p))
        .catch(() => {});
      void refreshActivities();
      void refreshLedgerMovements();
      void pollNotifications();
    }, 2500);
  }, [
    accountId,
    pollNotifications,
    refreshActivities,
    refreshLedgerMovements,
    refreshTokenPrices,
  ]);

  useEffect(() => {
    if (!activeOutgoingTransfer) return;
    if (activeOutgoingTransfer.status === "SETTLED") {
      const doneTimer = window.setTimeout(() => {
        setActiveOutgoingTransfer(null);
        setSendAmount("");
        setConvertAmount("");
      }, 2200);
      return () => window.clearTimeout(doneTimer);
    }
    if (
      ["FAILED", "REFUNDED", "EXCEPTION_REFUND_REQUIRED", "UNKNOWN_AMBIGUOUS"].includes(
        activeOutgoingTransfer.status,
      )
    ) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/accounts/${accountId}/transfers/${activeOutgoingTransfer.id}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          transfer?: SerializedOutgoingTransfer;
        };
        if (data.transfer) {
          setActiveOutgoingTransfer(data.transfer);
          if (data.transfer.status === "SETTLED") {
            triggerPostSettlementSync();
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [accountId, activeOutgoingTransfer, triggerPostSettlementSync]);

  useEffect(() => {
    if (!addMoneyIntent?.id) return;
    try {
      if (addMoneyIntent.status === "EXPIRED") {
        window.localStorage.removeItem(addMoneyStorageKey);
      } else {
        window.localStorage.setItem(addMoneyStorageKey, addMoneyIntent.id);
      }
    } catch {
      // Ignore storage errors
    }
  }, [addMoneyIntent?.id, addMoneyIntent?.status, addMoneyStorageKey]);

  useEffect(() => {
    let cancelled = false;
    let savedId: string | null = null;
    try {
      savedId = window.localStorage.getItem(addMoneyStorageKey);
    } catch {
      savedId = null;
    }
    if (!savedId) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/accounts/${accountId}/add-money/${savedId}`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (res.status === 404) {
            try {
              window.localStorage.removeItem(addMoneyStorageKey);
            } catch {
              // Ignore
            }
          }
          return;
        }
        const data = (await res.json()) as {
          intent?: SerializedAddMoneyIntent;
        };
        const intent = data.intent;
        if (!intent || cancelled) return;
        const isExpiredCommit =
          intent.status === "EXPIRED" ||
          (intent.status === "DEPOSIT_COMMITTED" &&
            intent.depositDeadline != null &&
            Date.parse(intent.depositDeadline) <= Date.now());
        if (isExpiredCommit) {
          try {
            window.localStorage.removeItem(addMoneyStorageKey);
          } catch {
            // Ignore
          }
          return;
        }
        setAddMoneyIntent(intent);
        if (
          intent.status === "DEPOSIT_COMMITTED" ||
          intent.status === "DETECTED" ||
          intent.status === "EXECUTING" ||
          intent.status === "PROCESSING"
        ) {
          setDepositMode("DEPOSIT");
        }
      } catch {
        // Ignore transient restore errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountId, addMoneyStorageKey]);

  useEffect(() => {
    if (!addMoneyIntent?.depositDeadline) return;
    const deadlineMs = Date.parse(addMoneyIntent.depositDeadline);
    const update = () =>
      setAddMoneySecondsRemaining(
        Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000)),
      );
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [addMoneyIntent?.depositDeadline]);

  useEffect(() => {
    if (
      !addMoneyIntent ||
      ["SETTLED", "FAILED", "REFUNDED", "EXPIRED"].includes(
        addMoneyIntent.status,
      )
    ) {
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/accounts/${accountId}/add-money/${addMoneyIntent.id}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          intent?: SerializedAddMoneyIntent;
        };
        if (data.intent) {
          setAddMoneyIntent(data.intent);
          if (data.intent.status === "SETTLED") {
            triggerPostSettlementSync();
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [accountId, addMoneyIntent]);

  const executeAuthorizedTransfer = async (
    kind: "SEND" | "CONVERT",
    idempotencyKeyOverride?: string,
  ) => {
    const idempotencyKey = idempotencyKeyOverride ?? outgoingIdempotencyKey;
    setOutgoingExecuting(true);
    setOutgoingError(null);
    try {
      const endpoint =
        kind === "SEND"
          ? `/api/accounts/${accountId}/send/execute`
          : `/api/accounts/${accountId}/convert/execute`;
      const payload =
        kind === "SEND"
          ? {
              sourceDeploymentId: sendSource?.deployment.id,
              destinationDeploymentId: sendDestDeployment.id,
              recipientAddress: sendRecipientAddress.trim(),
              sourceDisplayAmount: sendAmount,
              idempotencyKey,
            }
          : {
              sourceDeploymentId: convertSource?.deployment.id,
              destinationDeploymentId: convertDestDeployment.id,
              sourceDisplayAmount: convertAmount,
              idempotencyKey,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        transfer?: SerializedOutgoingTransfer;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !data.transfer) {
        const msg =
          data.detail || data.error || "Unable to submit outgoing transfer.";
        throw new Error(
          msg.includes("PAYMENT_EXECUTION_DISABLED")
            ? "Sending is temporarily paused in preview mode."
            : msg.includes("INSUFFICIENT_GAS_BALANCE")
              ? "Not enough native gas on the source network to broadcast this transaction."
              : msg,
        );
      }
      setActiveOutgoingTransfer(data.transfer);
      setOutgoingIdempotencyKey(crypto.randomUUID());
      pushToast({
        title: "Transfer submitted",
        description: `Transfer ${data.transfer.publicId ?? ""} is being processed.`,
        variant: "success",
      });
    } catch (error) {
      const msg = describe(error);
      setOutgoingError(msg);
      pushToast({
        title: "Transfer failed",
        description: msg,
        variant: "error",
      });
    } finally {
      setOutgoingExecuting(false);
    }
  };

  const handleTogglePaymentRequestStatus = async (
    req: SerializedPaymentRequest,
    nextStatus: "DISABLED" | "ACTIVE",
  ) => {
    setTogglingPaymentRequestId(req.id);
    try {
      const updated = await send<SerializedPaymentRequest>(
        `/api/accounts/${accountId}/payment-requests/${req.id}`,
        { status: nextStatus },
        "PATCH",
      );
      setPaymentRequests((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      pushToast({
        title:
          nextStatus === "DISABLED"
            ? "Payment link paused"
            : "Payment link resumed",
        description:
          nextStatus === "DISABLED"
            ? `${req.title} is now paused and won't accept payments.`
            : `${req.title} is active again.`,
        variant: nextStatus === "DISABLED" ? "warning" : "success",
      });
    } catch (error) {
      const msg = describe(error);
      setMessage(msg);
      pushToast({
        title: "Action failed",
        description: msg,
        variant: "error",
      });
    } finally {
      setTogglingPaymentRequestId(null);
    }
  };

  const renderOutgoingStatusCard = (kind: "SEND" | "CONVERT") => {
    if (!activeOutgoingTransfer || activeOutgoingTransfer.jobKind !== kind) {
      return null;
    }
    return <PaymentTimelineTracker transfer={activeOutgoingTransfer} />;
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      {/* Floating Top Navigation */}
      <FloatingNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "receive") setDepositMode("DIRECT");
          if (tab === "request") setRequestView("LIST");
          changeTab(tab);
        }}
        unreadCount={unreadNotifications}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenAssistant={() => router.push(`/assistant?account=${accountId}`)}
        userName={initialDisplayName?.trim() || userEmail || account?.name || "Personal"}
        userAvatarUrl={userAvatarUrl}
        profileId={profileId}
        userEmail={userEmail}
      />

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 sm:pt-12 pb-28 md:pb-16 overflow-x-hidden">
        {tabLoading ? (
          <TabContentSkeleton tab={activeTab} />
        ) : (
          <>
        {/* ===================================================================
            TAB 1: HOME / DASHBOARD
           =================================================================== */}
        {activeTab === "dashboard" && (
          <MotionTabPanel className="space-y-8">
            {canManageTeam && (
              <div className="flex justify-end">
                <Link
                  prefetch={false}
                  href={`/accounts/${accountId}/team`}
                  className="flow-liquid-btn inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-neutral-900 dark:text-white"
                >
                  Manage team
                </Link>
              </div>
            )}

            {/* Centered Hero Total Balance */}
            <section
              aria-label="Account balance overview"
              className="text-center pt-2 pb-2"
            >
              <div className="inline-flex items-center justify-center gap-3">
                {hideBalance ? (
                  <span className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-neutral-950 dark:text-white select-none">
                    $••••••
                  </span>
                ) : totalBalanceUsd === null ? (
                  <span
                    aria-label="Loading account balance"
                    className="inline-block h-12 sm:h-14 lg:h-16 w-48 sm:w-64 rounded-2xl bg-neutral-200/80 dark:bg-white/[0.08] animate-pulse"
                  />
                ) : (
                  <span className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-neutral-950 dark:text-white select-none">
                    {totalBalanceUsd.startsWith("$") &&
                    Number.isFinite(
                      Number(totalBalanceUsd.replace(/[$,]/g, "")),
                    ) ? (
                      <MotionNumber
                        value={Number(totalBalanceUsd.replace(/[$,]/g, ""))}
                        format={(n) =>
                          `$${n.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        }
                      />
                    ) : (
                      totalBalanceUsd
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={toggleBalanceVisibility}
                  aria-label={hideBalance ? "Show balance" : "Hide balance"}
                  className="flow-liquid-btn p-2.5 rounded-full text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white cursor-pointer"
                >
                  {hideBalance ? (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                  ) : (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Clean Sub-balance Meta & Refresh */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                {portfolioPnl ? (
                  <span
                    className={`inline-flex items-center gap-1 font-semibold ${
                      portfolioPnl.isPositive
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={portfolioPnl.isPositive ? "" : "rotate-180"}
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                    <span>
                      {portfolioPnl.amount} ({portfolioPnl.percent})
                    </span>
                  </span>
                ) : (
                  <span className="inline-block h-3.5 w-16 rounded-full bg-neutral-200/80 dark:bg-white/[0.08] animate-pulse" />
                )}
                <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">
                  ·
                </span>
                <button
                  type="button"
                  data-testid="manage-assets-pill"
                  onClick={() => setIsHeldAssetsOpen(true)}
                  className="inline-flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                >
                  {hideBalance ? (
                    <span>
                      {heldAssets.length} asset
                      {heldAssets.length === 1 ? "" : "s"} • $••••••
                    </span>
                  ) : totalBalanceUsd === null ? (
                    <span className="inline-block h-3.5 w-28 rounded-full bg-neutral-200/80 dark:bg-white/[0.08] animate-pulse" />
                  ) : (
                    <span>
                      {heldAssets.length} asset
                      {heldAssets.length === 1 ? "" : "s"} • {totalBalanceUsd}
                    </span>
                  )}
                  <span className="text-neutral-400">&gt;</span>
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || cooldown > 0}
                  aria-label="Refresh on-chain balance"
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <IconRefresh
                    size={14}
                    className={refreshing ? "animate-spin" : ""}
                  />
                </button>
              </div>

              {/* Primary Liquid Glass Action Buttons (+ Add Money, Send) */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("medium");
                    setDepositMode("DEPOSIT");
                    changeTab("receive");
                  }}
                  className="flow-liquid-btn-primary flow-press inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold cursor-pointer"
                >
                  <span className="text-base font-bold">+</span>
                  <span>{t.actionAddMoney}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic("light");
                    changeTab("send");
                  }}
                  className="flow-liquid-btn flow-press inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold text-neutral-900 dark:text-white cursor-pointer"
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
                    aria-hidden="true"
                  >
                    <path d="M7 17 17 7" />
                    <path d="M7 7h10v10" />
                  </svg>
                  <span>{t.actionSend}</span>
                </button>
              </div>
            </section>

            {/* Feature Carousel Banner */}
            <section
              aria-label="Platform highlights"
              className="flow-card-lift relative overflow-hidden rounded-[28px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF1A1A]">
                    {currentSlide.badge}
                  </p>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950 dark:text-white">
                    {currentSlide.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {currentSlide.description}
                  </p>
                </div>

                {/* Stacked Cards Illustration */}
                <div className="relative shrink-0 w-36 h-24 hidden sm:flex items-center justify-center">
                  <div className="absolute w-28 h-16 rounded-xl bg-gradient-to-tr from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 transform -rotate-6 shadow-sm border border-neutral-300/60 dark:border-white/10" />
                  <div className="absolute w-28 h-16 rounded-xl bg-gradient-to-tr from-neutral-800 to-neutral-950 text-white p-2.5 transform rotate-3 shadow-md flex flex-col justify-between border border-white/10">
                    <span className="text-[9px] font-mono tracking-wider text-neutral-400">
                      FLOW CARD
                    </span>
                  </div>
                </div>
              </div>

              {/* Dots and Navigation Arrows */}
              <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {carouselSlides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCarouselIndex(i)}
                      aria-label={`Slide ${i + 1}`}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        carouselIndex === i
                          ? "w-6 bg-neutral-950 dark:bg-white"
                          : "w-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-white/20 dark:hover:bg-white/35"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIndex((prev) =>
                        prev === 0 ? carouselSlides.length - 1 : prev - 1,
                      )
                    }
                    aria-label="Previous slide"
                    className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCarouselIndex((prev) =>
                        prev === carouselSlides.length - 1 ? 0 : prev + 1,
                      )
                    }
                    aria-label="Next slide"
                    className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    →
                  </button>
                </div>
              </div>
            </section>

            {/* Assets Held Card (Slim/Thin Rows + Empty Action CTAs) */}
            <section
              aria-label="Assets held"
              className="rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] px-5 py-4 shadow-xs space-y-2.5"
            >
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-white/[0.06]">
                <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                  Assets held
                </h3>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {heldAssets.length} asset
                  {heldAssets.length === 1 ? "" : "s"}
                </span>
              </div>

              {isInitialIndexing && heldAssets.length === 0 ? (
                <div className="space-y-2 py-2" aria-label="Loading assets">
                  {[0, 1, 2].map((row) => (
                    <div
                      key={row}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-neutral-50/70 dark:bg-white/[0.03] animate-pulse"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-neutral-200 dark:bg-white/10" />
                        <div className="space-y-1.5">
                          <div className="h-3 w-24 rounded bg-neutral-200 dark:bg-white/10" />
                          <div className="h-2.5 w-16 rounded bg-neutral-200/80 dark:bg-white/[0.07]" />
                        </div>
                      </div>
                      <div className="h-3 w-16 rounded bg-neutral-200 dark:bg-white/10" />
                    </div>
                  ))}
                </div>
              ) : heldAssets.length === 0 ? (
                <div className="flex min-h-[210px] flex-col items-center justify-center px-4 py-10 text-center sm:py-12 gap-5">
                  <p className="max-w-md text-sm text-neutral-500 dark:text-neutral-400">
                    No assets held yet. Deposit crypto or create a payment link
                    to receive funds.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDepositMode("DEPOSIT");
                        changeTab("receive");
                      }}
                      className="flow-liquid-btn-primary flow-press inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      <IconPlus size={15} />
                      <span>Add Money</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => changeTab("request")}
                      className="flow-liquid-btn flow-press inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white cursor-pointer"
                    >
                      <IconLink size={15} />
                      <span>Request</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {heldAssets.map((item) => (
                    <div
                      key={item.deployment.id}
                      onClick={() => setIsHeldAssetsOpen(true)}
                      className="flex items-center justify-between px-3 py-1.5 rounded-xl hover:bg-neutral-50/90 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="relative">
                          <AssetAvatar
                            symbol={item.deployment.symbol}
                            size={28}
                          />
                          <span className="absolute -bottom-0.5 -right-0.5">
                            <ChainBadge
                              chainKey={item.deployment.networkKey}
                              size={12}
                            />
                          </span>
                        </div>
                        <div className="leading-tight">
                          <div className="text-[13px] font-bold text-neutral-950 dark:text-white">
                            {item.deployment.symbol}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            {item.deployment.networkName}
                          </div>
                        </div>
                      </div>

                      <div className="text-right leading-tight">
                        <div className="text-[13px] font-bold font-mono text-neutral-950 dark:text-white">
                          {hideBalance
                            ? "••••••"
                            : `${formatApproxDisplay(item.displayBalance)} ${item.deployment.symbol}`}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {hideBalance ? "$••••••" : item.usdValue}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* 2-Column Bottom Grid: Recent Activity & Monthly Stats */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left: Recent Activity Card */}
              <section
                aria-label="Recent activity"
                className="md:col-span-7 rounded-[28px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-white/[0.06]">
                  <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                    Recent activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => changeTab("activity")}
                    className="text-xs font-semibold text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white cursor-pointer"
                  >
                    View all →
                  </button>
                </div>

                <div className="space-y-3">
                  {displayActivities.length > 0 ? (
                    displayActivities.slice(0, 3).map((act) => (
                      <div
                        key={act.id}
                        className="flex items-center justify-between p-2 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                            {act.direction === "OUTGOING" ? "↑" : "↓"}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-neutral-950 dark:text-white">
                              {act.activityType ===
                                "FLOW_CROSS_CHAIN_SETTLEMENT" &&
                              act.finality === "FINALIZED"
                                ? "Payment settled"
                                : act.activityType === "FLOW_PAYMENT"
                                  ? act.metadata?.executionStatus === "FAILED" ||
                                    act.metadata?.executionStatus === "REFUNDED" ||
                                    act.metadata?.executionStatus === "EXPIRED"
                                    ? "Payment failed"
                                    : act.finality === "PENDING"
                                      ? "Payment pending"
                                      : "Cross-chain payment"
                                  : act.direction === "OUTGOING"
                                    ? "Transfer sent"
                                    : "Transfer received"}
                            </div>
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              {formatTimestamp(
                                act.blockTimestamp || act.observedAt,
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {hideBalance
                              ? "••••••"
                              : `${act.direction === "OUTGOING" ? "−" : "+"}${formatApproxDisplay(act.displayAmount)} ${act.assetSymbol}`}
                          </span>
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                            {act.reorgStatus === "CANONICAL"
                              ? act.finality
                              : act.reorgStatus}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      No activity to display.
                    </p>
                  )}
                </div>
              </section>

              {/* Right: This Month Stat Card */}
              <section
                aria-label="Monthly statistics"
                className="md:col-span-5 rounded-[28px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-4"
              >
                <div className="pb-2 border-b border-neutral-100 dark:border-white/[0.06]">
                  <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                    This month
                  </h3>
                  <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Posted payment ledger · UTC
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xs font-bold">
                        ↓
                      </div>
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">
                        Inflow
                      </span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {hideBalance
                        ? "••••••"
                        : ledgerMovementLabel(
                            ledgerMovements,
                            "inflow",
                            tokenPrices,
                            displayActivities,
                          )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xs font-bold">
                        ↑
                      </div>
                      <span className="text-xs text-neutral-600 dark:text-neutral-400">
                        Outflow
                      </span>
                    </div>
                    <span className="text-sm font-bold text-neutral-950 dark:text-white">
                      {hideBalance
                        ? "••••••"
                        : ledgerMovementLabel(
                            ledgerMovements,
                            "outflow",
                            tokenPrices,
                            displayActivities,
                          )}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 dark:border-white/[0.06] flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Net movement
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {hideBalance
                        ? "••••••"
                        : ledgerMovementLabel(
                            ledgerMovements,
                            "net",
                            tokenPrices,
                            displayActivities,
                          )}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </MotionTabPanel>
        )}

        {/* ===================================================================
            TAB 2: SEND (Guided 4-Step Flow + Slide to Pay)
           =================================================================== */}
        {activeTab === "send" && (
          <MotionTabPanel className="max-w-3xl mx-auto space-y-6">
            {activeOutgoingTransfer &&
            activeOutgoingTransfer.jobKind === "SEND" ? (
              <div className="max-w-2xl mx-auto space-y-4">
                <PaymentTimelineTracker transfer={activeOutgoingTransfer} />
                {[
                  "FAILED",
                  "REFUNDED",
                  "EXCEPTION_REFUND_REQUIRED",
                  "UNKNOWN_AMBIGUOUS",
                ].includes(activeOutgoingTransfer.status) && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveOutgoingTransfer(null);
                      setSendStep(1);
                      setSendHubOpen(false);
                    }}
                    className="w-full py-3 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141414] text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Back to Send
                  </button>
                )}
              </div>
            ) : sendHubOpen ? (
              <div className="space-y-6">
                <div>
                  <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                    Send &amp; Transfer
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    Send assets to any wallet or <span className="font-mono">@flow</span> ID, or bridge between your own chains.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSendHubOpen(false);
                      setSendStep(1);
                    }}
                    className="group text-left rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 shadow-2xs hover:border-neutral-950/30 dark:hover:border-white/25 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.07] flex items-center justify-center text-neutral-900 dark:text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M7 17 17 7" />
                          <path d="M7 7h10v10" />
                        </svg>
                      </div>
                      <span className="text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors text-sm">
                        ›
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-950 dark:text-white">
                        Send to address or @flow ID
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Payments across NEAR, Solana, Base &amp; Ethereum.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => changeTab("convert")}
                    className="group text-left rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 shadow-2xs hover:border-neutral-950/30 dark:hover:border-white/25 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.07] flex items-center justify-center text-neutral-900 dark:text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="17 1 21 5 17 9" />
                          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                          <polyline points="7 23 3 19 7 15" />
                          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                      </div>
                      <span className="text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors text-sm">
                        ↗
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-950 dark:text-white">
                        Bridge &amp; Convert
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Swap or bridge assets directly between your own multi-chain balances.
                      </p>
                    </div>
                  </button>

                  <div
                    aria-disabled="true"
                    className="text-left rounded-[24px] border border-neutral-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-[#141414]/60 p-5 opacity-65 cursor-not-allowed flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.05] flex items-center justify-center text-neutral-500">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="9" />
                          <polyline points="12 7 12 12 15 15" />
                        </svg>
                      </div>
                      <span className="rounded-full bg-neutral-100 dark:bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
                        Coming soon
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                        Scheduled &amp; batch send
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Schedule recurring transfers or send to multiple recipients at once.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setSendHubOpen(true);
                      setSendStep(1);
                    }}
                    className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    ← Back to Send options
                  </button>
                  <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                    Send
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    Send any asset in your wallet to any supported address or{" "}
                    <span className="font-mono">@flow</span> ID.
                  </p>
                  <div className="mt-2.5">
                    <NearIntentsBadge />
                  </div>
                </div>

                {/* Step Progress Slide Bar */}
                <div
                  aria-label="Send progress"
                  className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-4 shadow-2xs space-y-3"
                >
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { step: 1 as const, label: "Your Asset" },
                      { step: 2 as const, label: "Recipient" },
                      { step: 3 as const, label: "Amount" },
                      { step: 4 as const, label: "Review & Pay" },
                    ].map((item) => {
                      const isCompleted = sendStep > item.step;
                      const isCurrent = sendStep === item.step;
                      const canJump = isCompleted;
                      return (
                        <button
                          key={item.step}
                          type="button"
                          disabled={!canJump}
                          onClick={() => {
                            if (canJump) setSendStep(item.step);
                          }}
                          className={`text-left space-y-1.5 ${
                            canJump ? "cursor-pointer" : "cursor-default"
                          }`}
                        >
                          <div className="h-1.5 w-full rounded-full bg-neutral-200 dark:bg-white/[0.08] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isCompleted
                                  ? "w-full bg-emerald-500"
                                  : isCurrent
                                    ? "w-1/2 bg-neutral-950 dark:bg-white"
                                    : "w-0"
                              }`}
                            />
                          </div>
                          <div className="flex items-center gap-1 text-[11px] font-semibold truncate">
                            <span
                              className={
                                isCompleted
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : isCurrent
                                    ? "text-neutral-950 dark:text-white"
                                    : "text-neutral-400 dark:text-neutral-500"
                              }
                            >
                              {item.step}. {item.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-5">
                  {/* STEP 1: Pick Your Asset */}
                  {sendStep === 1 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-neutral-950 dark:text-white">
                          1. Pick the asset you want to send
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          Choose which balance in your wallet will fund this payment.
                        </p>
                      </div>

                      {heldAssets.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-neutral-200 dark:border-white/[0.1] p-5 text-center space-y-2">
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            No available assets in your wallet yet.
                          </p>
                          <button
                            type="button"
                            onClick={() => changeTab("receive")}
                            className="flow-liquid-btn-primary px-4 py-2 rounded-full text-xs font-semibold cursor-pointer"
                          >
                            Add Money
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {heldAssets.map((asset) => {
                            const selected =
                              sendSource?.deployment.id === asset.deployment.id;
                            return (
                              <button
                                key={asset.deployment.id}
                                type="button"
                                onClick={() =>
                                  setSendSourceDeploymentId(asset.deployment.id)
                                }
                                className={`w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                  selected
                                    ? "border-neutral-950 dark:border-white bg-neutral-50 dark:bg-white/[0.06] shadow-2xs"
                                    : "border-neutral-200/80 dark:border-white/[0.08] hover:bg-neutral-50/70 dark:hover:bg-white/[0.03]"
                                }`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <AssetAvatar
                                    symbol={asset.deployment.symbol}
                                    size={34}
                                  />
                                  <div className="min-w-0">
                                    <div className="text-sm font-bold text-neutral-950 dark:text-white truncate">
                                      {asset.deployment.symbol}
                                    </div>
                                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                      {asset.deployment.networkName}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="text-sm font-mono font-semibold text-neutral-950 dark:text-white">
                                    {hideBalance
                                      ? "••••••"
                                      : formatApproxDisplay(asset.displayBalance)}
                                  </div>
                                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                                    {hideBalance ? "$••••••" : asset.usdValue}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={!sendSource}
                        onClick={() => setSendStep(2)}
                        className="flow-liquid-btn-primary w-full py-4 rounded-full text-sm font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                      >
                        Continue
                      </button>
                    </div>
                  )}

                  {/* STEP 2: Pick Recipient Receives Asset & Address */}
                  {sendStep === 2 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-neutral-950 dark:text-white">
                          2. What should the recipient receive?
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          Select the destination token &amp; network, then enter
                          their address or <span className="font-mono">@flow</span> ID.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          Recipient receives
                        </label>
                        <CombinedAssetNetworkPicker
                          ariaLabel={
                            "Recipient receives " +
                            sendDestDeployment.symbol +
                            " on " +
                            sendDestDeployment.networkName
                          }
                          selectedId={sendDestDeploymentId}
                          onSelect={(dep) => {
                            if (dep.networkKey !== sendDestDeployment.networkKey)
                              setSendRecipientAddress("");
                            setSendDestDeploymentId(dep.id);
                          }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="recipient-address-input"
                          className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                        >
                          Recipient {sendDestDeployment.networkName} address
                        </label>
                        <div className="relative flex items-center">
                          <input
                            id="recipient-address-input"
                            type="text"
                            value={sendRecipientAddress}
                            onChange={(e) =>
                              setSendRecipientAddress(e.target.value)
                            }
                            placeholder={
                              "Address on " +
                              sendDestDeployment.networkName +
                              " or name@flow"
                            }
                            className="w-full pl-4 pr-10 py-3 rounded-2xl text-xs bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 font-mono focus:outline-hidden"
                          />
                          {sendRecipientAddress.trim().length > 0 &&
                            sendAddressValidation.valid && (
                              <span className="absolute right-3.5 flex items-center justify-center text-emerald-500">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                            )}
                        </div>
                        {sendRecipientAddress.trim().length > 0 ? (
                          sendIsFlowId &&
                          sendAddressValidation.valid &&
                          flowIdResolution.recipientAddress ? (
                            <div className="mt-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs">
                              <div className="flex items-center justify-between gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                                <span>
                                  Active Flow ID: {flowIdResolution.flowId}
                                  {flowIdResolution.accountName
                                    ? ` (${flowIdResolution.accountName})`
                                    : ""}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider">
                                  {sendDestDeployment.symbol} · {sendDestDeployment.networkName}
                                </span>
                              </div>
                              <p className="mt-0.5 font-mono text-[11px] text-emerald-700/80 dark:text-emerald-300/80 truncate">
                                → {flowIdResolution.recipientAddress}
                              </p>
                            </div>
                          ) : (
                            <p
                              className={`mt-1 text-xs font-medium ${
                                sendAddressValidation.valid
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-[#FF1A1A]"
                              }`}
                            >
                              {sendAddressValidation.valid
                                ? `Valid ${sendDestDeployment.networkName} address format.`
                                : sendAddressValidation.reason}
                            </p>
                          )
                        ) : (
                          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            ⓘ Enter a {sendDestDeployment.networkName} ({sendDestDeployment.symbol}) address or a recipient&apos;s <span className="font-mono">@flow</span> ID.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setSendStep(1)}
                          className="flow-liquid-btn px-5 py-3.5 rounded-full text-xs font-bold text-neutral-900 dark:text-neutral-100 cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={!sendAddressValidation.valid}
                          onClick={() => setSendStep(3)}
                          className="flow-liquid-btn-primary flex-1 py-4 rounded-full text-sm font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        >
                          Continue
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3: Enter Amount */}
                  {sendStep === 3 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-neutral-950 dark:text-white">
                          3. Enter amount to send
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          Sending {sendSource?.deployment.symbol} ({sendSource?.deployment.networkName}) →{" "}
                          {sendDestDeployment.symbol} ({sendDestDeployment.networkName}).
                        </p>
                      </div>

                      <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/50 dark:bg-[#1A1A1A] p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                            You send
                          </label>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            <span>
                              Available:{" "}
                              {hideBalance
                                ? "••••••"
                                : sendSourceBalance
                                  ? formatApproxDisplay(sendSourceBalance)
                                  : "Unavailable"}{" "}
                              {sendSource?.deployment.symbol}
                            </span>
                            <button
                              type="button"
                              disabled={!sendSourceBalance}
                              onClick={() =>
                                setSendAmount(getMaxAmountForSource(sendSource))
                              }
                              className="text-xs font-bold text-neutral-950 dark:text-white hover:underline cursor-pointer"
                            >
                              Max
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            autoFocus
                            aria-label="Send amount"
                            value={sendAmount}
                            onKeyDown={blockNegativeKey}
                            onChange={(e) =>
                              setSendAmount(sanitizeNonNegativeDecimal(e.target.value))
                            }
                            placeholder="0.00"
                            className="min-w-0 flex-1 text-2xl font-bold bg-transparent text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-hidden font-mono"
                          />
                          <div className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.08] text-xs font-bold text-neutral-950 dark:text-white">
                            {sendSource && (
                              <AssetAvatar
                                symbol={sendSource.deployment.symbol}
                                size={18}
                              />
                            )}
                            <span>{sendSource?.deployment.symbol}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {[0.25, 0.5, 0.75, 1].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              disabled={!sendSourceBalance}
                              onClick={() => {
                                const maxNum =
                                  parseFloat(getMaxAmountForSource(sendSource)) || 0;
                                if (maxNum <= 0) return;
                                setSendAmount(
                                  pct === 1
                                    ? maxNum.toString()
                                    : (Math.floor(maxNum * pct * 1e6) / 1e6).toString(),
                                );
                              }}
                              className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-neutral-200/70 hover:bg-neutral-300/70 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-neutral-700 dark:text-neutral-300 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              {pct === 1 ? "Max" : `${pct * 100}%`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <OutgoingQuoteDetails
                        preview={sendPreview}
                        symbol={sendDestDeployment.symbol}
                      />

                      <div className="flex items-center gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setSendStep(2)}
                          className="flow-liquid-btn px-5 py-3.5 rounded-full text-xs font-bold text-neutral-900 dark:text-neutral-100 cursor-pointer"
                        >
                          Back
                        </button>
                        <button
                          type="button"
                          disabled={
                            !sendSource ||
                            sendPreview.insufficientBalance ||
                            sendPreview.insufficientGas ||
                            !positiveQuoteAmount(
                              sendAmount,
                              sendSource.deployment.decimals,
                            ) ||
                            (sendSource.deployment.id !== sendDestDeployment.id &&
                              (!sendPreview.quote || sendPreview.loading))
                          }
                          onClick={() => setSendStep(4)}
                          className="flow-liquid-btn-primary flex-1 py-4 rounded-full text-sm font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {sendPreview.loading ? "Updating quote…" : "Review Payment"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 4: Review & Slide to Pay */}
                  {sendStep === 4 && (
                    <div className="space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-neutral-950 dark:text-white">
                          4. Review &amp; Slide to Pay
                        </h2>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          Confirm the details below and slide to authorize this payment.
                        </p>
                      </div>

                      <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A] p-4 space-y-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            You send
                          </span>
                          <span className="font-mono font-bold text-neutral-950 dark:text-white">
                            {sendAmount} {sendSource?.deployment.symbol} ({sendSource?.deployment.networkName})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            Recipient receives
                          </span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {sendSource?.deployment.id === sendDestDeployment.id
                              ? sendAmount
                              : formatApproxDisplay(
                                  sendPreview.quote?.recipientDisplayAmount ??
                                    sendAmount,
                                )}{" "}
                            {sendDestDeployment.symbol} ({sendDestDeployment.networkName})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-neutral-500 dark:text-neutral-400">
                            Recipient
                          </span>
                          <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-200 truncate max-w-[65%]">
                            {sendIsFlowId && flowIdResolution.flowId
                              ? `${flowIdResolution.flowId} (${truncateMiddle(flowIdResolution.recipientAddress ?? "", 6, 4)})`
                              : truncateMiddle(sendRecipientAddress, 10, 8)}
                          </span>
                        </div>
                      </div>

                      <OutgoingQuoteDetails
                        preview={sendPreview}
                        symbol={sendDestDeployment.symbol}
                      />

                      <SlideToPay
                        label={
                          executionDisabled
                            ? "Sending Paused (Preview)"
                            : "Slide to Pay"
                        }
                        submittingLabel="Submitting payment…"
                        loading={outgoingExecuting}
                        disabled={
                          executionDisabled ||
                          outgoingExecuting ||
                          !sendSource ||
                          !sendAddressValidation.valid ||
                          sendPreview.insufficientBalance ||
                          sendPreview.insufficientGas ||
                          !positiveQuoteAmount(
                            sendAmount,
                            sendSource.deployment.decimals,
                          ) ||
                          (sendSource.deployment.id !== sendDestDeployment.id &&
                            (!sendPreview.quote || sendPreview.loading))
                        }
                        onConfirm={() => {
                          setOutgoingError(null);
                          const key = crypto.randomUUID();
                          setOutgoingIdempotencyKey(key);
                          void executeAuthorizedTransfer("SEND", key);
                        }}
                      />

                      <button
                        type="button"
                        disabled={outgoingExecuting}
                        onClick={() => setSendStep(3)}
                        className="w-full py-2 text-xs font-semibold text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                      >
                        ← Edit amount
                      </button>

                      {outgoingError && (
                        <p
                          role="alert"
                          className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-[#FF1A1A] dark:text-red-400"
                        >
                          {outgoingError}
                        </p>
                      )}

                      {renderOutgoingStatusCard("SEND")}
                    </div>
                  )}
                </div>
              </div>
            )}
          </MotionTabPanel>
        )}

        {/* ===================================================================
            TAB 2.5: CONVERT & BRIDGE (Separate Page at /app/convert)
           =================================================================== */}
        {activeTab === "convert" && (
          <MotionTabPanel className="max-w-2xl mx-auto space-y-6">
            {activeOutgoingTransfer &&
            activeOutgoingTransfer.jobKind === "CONVERT" ? (
              <div className="space-y-4">
                <PaymentTimelineTracker transfer={activeOutgoingTransfer} />
                {[
                  "FAILED",
                  "REFUNDED",
                  "EXCEPTION_REFUND_REQUIRED",
                  "UNKNOWN_AMBIGUOUS",
                ].includes(activeOutgoingTransfer.status) && (
                  <button
                    type="button"
                    onClick={() => setActiveOutgoingTransfer(null)}
                    className="w-full py-3 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141414] text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                  >
                    Back to Convert
                  </button>
                )}
              </div>
            ) : (
              <>
                <div>
                  <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                    Convert &amp; Bridge
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    Swap or bridge assets across NEAR, Solana, Base, and Ethereum
                    directly into your own wallet.
                  </p>
                  <div className="mt-2.5">
                    <NearIntentsBadge />
                  </div>
                </div>

                <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-5">
                  <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/50 dark:bg-[#1A1A1A] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        You convert
                      </label>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <span>
                          Available:{" "}
                          {hideBalance
                            ? "••••••"
                            : convertSourceBalance
                              ? formatApproxDisplay(convertSourceBalance)
                              : "Unavailable"}{" "}
                          {convertSource?.deployment.symbol}
                        </span>
                        <button
                          type="button"
                          disabled={!convertSourceBalance}
                          onClick={() =>
                            setConvertAmount(
                              getMaxAmountForSource(convertSource),
                            )
                          }
                          className="text-xs font-bold text-neutral-950 dark:text-white hover:underline cursor-pointer"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="number"
                        step="any"
                        min="0"
                        aria-label="Convert amount"
                        value={convertAmount}
                        onKeyDown={blockNegativeKey}
                        onChange={(e) =>
                          setConvertAmount(
                            sanitizeNonNegativeDecimal(e.target.value),
                          )
                        }
                        placeholder="1.00"
                        className="min-w-0 flex-1 text-2xl font-bold bg-transparent text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-hidden"
                      />
                      <div className="shrink-0 max-w-[55%]">
                        <select
                          value={convertSource?.deployment.id ?? ""}
                          onChange={(e) =>
                            setConvertSourceDeploymentId(e.target.value)
                          }
                          className="w-full max-w-full px-3 py-2.5 rounded-2xl text-xs font-bold bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.1] text-neutral-900 dark:text-white focus:outline-hidden shadow-2xs cursor-pointer truncate"
                        >
                          {heldAssets.map((h) => (
                            <option
                              key={h.deployment.id}
                              value={h.deployment.id}
                            >
                              {h.deployment.symbol} ({h.deployment.networkName})
                              {" - "}
                              {hideBalance
                                ? "••••••"
                                : formatApproxDisplay(h.displayBalance)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* You Receive (Convert Destination) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      You receive
                    </label>
                    <CombinedAssetNetworkPicker
                      selectedId={convertDestDeployment.id}
                      onSelect={(dep) => setConvertDestDeploymentId(dep.id)}
                    />
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 pt-1 font-mono">
                      ⓘ Auto-deposits into your registered{" "}
                      {convertDestDeployment.networkName} wallet:{" "}
                      <span className="font-bold text-neutral-800 dark:text-neutral-200">
                        {truncateMiddle(convertDestAddress, 8, 6) ||
                          "Wallet address unavailable"}
                      </span>
                    </p>
                  </div>

                  <OutgoingQuoteDetails
                    preview={convertPreview}
                    symbol={convertDestDeployment.symbol}
                  />

                  <div className="pt-2">
                    <SlideToPay
                      label={
                        executionDisabled
                          ? "Swap Paused (Preview)"
                          : "Slide to Convert"
                      }
                      submittingLabel="Converting…"
                      loading={outgoingExecuting}
                      disabled={
                        executionDisabled ||
                        outgoingExecuting ||
                        !convertSource ||
                        convertSource.deployment.id ===
                          convertDestDeployment.id ||
                        convertPreview.insufficientBalance ||
                        convertPreview.insufficientGas ||
                        !convertPreview.quote ||
                        convertPreview.loading ||
                        !positiveQuoteAmount(
                          convertAmount,
                          convertSource.deployment.decimals,
                        )
                      }
                      onConfirm={() => {
                        setOutgoingError(null);
                        const key = crypto.randomUUID();
                        setOutgoingIdempotencyKey(key);
                        void executeAuthorizedTransfer("CONVERT", key);
                      }}
                    />
                  </div>

                  {outgoingError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-[#FF1A1A] dark:text-red-400"
                    >
                      {outgoingError}
                    </p>
                  )}

                  {renderOutgoingStatusCard("CONVERT")}
                </div>
              </>
            )}
          </MotionTabPanel>
        )}

        {/* ===================================================================
            TAB 3: RECEIVE (Add Money - Matches media_1794481849681_4e42b25f.jpg)
           =================================================================== */}
        {activeTab === "receive" && (
          <MotionTabPanel className="max-w-4xl mx-auto space-y-6">
            {receiveHubOpen && !addMoneyIntent ? (
              <div className="space-y-6">
                <div>
                  <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                    Add money
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    Bring assets into FLOW directly, deposit from another chain, or bridge between your balances.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Direct Receive */}
                  <button
                    type="button"
                    onClick={() => {
                      setDepositMode("DIRECT");
                      setReceiveHubOpen(false);
                    }}
                    className="group text-left rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 shadow-2xs hover:border-neutral-950/30 dark:hover:border-white/25 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.07] flex items-center justify-center text-neutral-900 dark:text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="2" y="5" width="20" height="14" rx="3" />
                          <path d="M16 12h2" />
                        </svg>
                      </div>
                      <span className="text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors text-sm">
                        ›
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-950 dark:text-white">
                        Direct receive
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Copy your permanent NEAR, Solana, Base, or Ethereum address or scan QR.
                      </p>
                    </div>
                  </button>

                  {/* Deposit from another chain */}
                  <button
                    type="button"
                    onClick={() => {
                      setDepositMode("DEPOSIT");
                      setReceiveHubOpen(false);
                    }}
                    className="group text-left rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 shadow-2xs hover:border-neutral-950/30 dark:hover:border-white/25 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.07] flex items-center justify-center text-neutral-900 dark:text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                      </div>
                      <span className="text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors text-sm">
                        ›
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-950 dark:text-white">
                        Deposit from another chain
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        USDC, SOL, ETH and more from 39+ chains into native NEAR via NEAR Intents.
                      </p>
                    </div>
                  </button>

                  {/* Bridge & Convert */}
                  <button
                    type="button"
                    onClick={() => changeTab("convert")}
                    className="group text-left rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 shadow-2xs hover:border-neutral-950/30 dark:hover:border-white/25 hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.07] flex items-center justify-center text-neutral-900 dark:text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <polyline points="17 1 21 5 17 9" />
                          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                          <polyline points="7 23 3 19 7 15" />
                          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                        </svg>
                      </div>
                      <span className="text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors text-sm">
                        ↗
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-950 dark:text-white">
                        Bridge &amp; Convert
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Swap or bridge existing balances across NEAR, Solana, Base, and Ethereum.
                      </p>
                    </div>
                  </button>

                  {/* Connect a wallet (Coming soon) */}
                  <div
                    aria-disabled="true"
                    className="text-left rounded-[24px] border border-neutral-200/60 dark:border-white/[0.06] bg-white/60 dark:bg-[#141414]/60 p-5 opacity-65 cursor-not-allowed flex flex-col justify-between gap-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-white/[0.05] flex items-center justify-center text-neutral-500">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                        </svg>
                      </div>
                      <span className="rounded-full bg-neutral-100 dark:bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">
                        Coming soon
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                        Connect a wallet
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Deposit directly from MetaMask, Phantom, or an external NEAR wallet.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div>
                  {!addMoneyIntent && (
                    <button
                      type="button"
                      onClick={() => setReceiveHubOpen(true)}
                      className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors cursor-pointer"
                    >
                      ← Back to Add money
                    </button>
                  )}
                  <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                    {depositMode === "DIRECT" ? "Direct receive" : "Deposit from another chain"}
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                    Bring supported assets from other chains directly into Flow.
                  </p>
                </div>

                {/* Segmented Top Selector: Direct receive vs Deposit from another chain */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <SegmentedTabPill
                    tabs={[
                      { id: "DIRECT", label: "Direct receive" },
                      { id: "DEPOSIT", label: "Deposit from another chain" },
                    ] as const}
                    activeTab={depositMode}
                    onChange={setDepositMode}
                  />
                </div>

            {depositMode === "DIRECT" ? (
              /* 2-Column Direct Receive Layout */
              <div className="grid grid-cols-1 md:grid-cols-12 gap-7 items-start">
                {/* Left Column: Unified Picker + Dynamic Network Supported Assets */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
                      Select asset
                    </label>
                    <CombinedAssetNetworkPicker
                      options={receiveOptions}
                      selectedId={depositDeployment.id}
                      onSelect={(dep) => setDepositDeployment(dep)}
                    />
                  </div>

                  {/* Supported Assets populated dynamically from selected network */}
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-2.5">
                      Supported assets on {depositDeployment.networkName}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {networkReceiveAssets.map((dep) => {
                        const isSelected = depositDeployment.id === dep.id;
                        return (
                          <button
                            key={dep.id}
                            type="button"
                            onClick={() => setDepositDeployment(dep)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? "flow-liquid-btn-primary"
                                : "flow-liquid-btn text-neutral-700 dark:text-neutral-200"
                            }`}
                          >
                            <AssetAvatar symbol={dep.symbol} size={18} />
                            <span>{dep.symbol}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    ⓘ Minimum deposit: Any positive {depositDeployment.symbol}{" "}
                    transfer on {depositDeployment.networkName} (plus network
                    gas).
                  </div>
                </div>

                {/* Right Column: Permanent Deposit Address Card with QR Code */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs text-center space-y-4">
                  <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                    Receive {depositDeployment.symbol} on{" "}
                    {depositDeployment.networkName}
                  </h3>

                  <div className="flex justify-center py-2">
                    <div className="p-3 bg-white rounded-2xl shadow-xs border border-neutral-200/80 inline-block">
                      {activeDepositAddress ? (
                        <QrCode value={activeDepositAddress} size={160} />
                      ) : (
                        <p className="text-sm text-neutral-600">
                          Wallet address unavailable
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                      Your permanent deposit address
                    </span>
                    <div className="mt-1 font-mono text-xs font-bold text-neutral-950 dark:text-white break-all bg-neutral-50 dark:bg-[#1A1A1A] p-2.5 rounded-xl border border-neutral-200/80 dark:border-white/[0.08] flex items-center justify-between gap-2">
                      <span className="truncate">{activeDepositAddress}</span>
                      <button
                        type="button"
                        disabled={!activeDepositAddress}
                        onClick={() =>
                          copyText("depositAddr", activeDepositAddress)
                        }
                        aria-label="Copy deposit address"
                        className="shrink-0 p-1 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        {copiedKey === "depositAddr" ? (
                          <IconCheck size={14} className="text-emerald-500" />
                        ) : (
                          <IconCopy size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 text-left text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                      aria-hidden="true"
                    >
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <div>
                      Send only <strong>{depositDeployment.symbol}</strong> on{" "}
                      <strong>{depositDeployment.networkName}</strong> to this
                      address. Sending any other asset or from another network may
                      result in loss.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* 2-Column Deposit from Another Chain (Priority 1) */
              <div className="grid grid-cols-1 md:grid-cols-12 gap-7 items-start">
                {/* Left Column: Combined Asset Picker + Amount + Refund Address */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
                      Deposit source token &amp; network
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCrossChainTokenSelectorOpen(true)}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-neutral-200/90 dark:border-white/[0.08] bg-neutral-50/50 dark:bg-[#1A1A1A] hover:bg-neutral-100/70 dark:hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                    >
                      {crossChainSourceToken ? (
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <AssetAvatar
                              symbol={crossChainSourceToken.symbol}
                              size={32}
                            />
                            <span className="absolute -bottom-1 -right-1">
                              <ChainBadge
                                chainKey={crossChainSourceToken.networkKey}
                                size={14}
                              />
                            </span>
                          </div>
                          <div>
                            <div className="text-xs font-bold text-neutral-950 dark:text-white">
                              {crossChainSourceToken.name} (
                              {crossChainSourceToken.symbol})
                            </div>
                            <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                              on {crossChainSourceToken.networkName}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                          <IconSearch size={16} className="text-neutral-400" />
                          <span>
                            Select any asset &amp; chain (e.g. SOL, ETH,
                            AVAX)...
                          </span>
                        </div>
                      )}
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        <span>Select</span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                      Deposit amount
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={crossChainDepositAmount}
                      onKeyDown={blockNegativeKey}
                      onChange={(e) =>
                        setCrossChainDepositAmount(
                          sanitizeNonNegativeDecimal(e.target.value),
                        )
                      }
                      placeholder="10"
                      className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono font-bold bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        Payer refund address
                      </label>
                      <span className="text-[10px] text-neutral-400 dark:text-neutral-500 font-medium">
                        Required for cross-chain safety
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        value={crossChainRefundAddress}
                        onChange={(e) =>
                          setCrossChainRefundAddress(e.target.value)
                        }
                        placeholder={
                          crossChainSourceToken
                            ? `Address on ${crossChainSourceToken.networkName}`
                            : "Enter refund address"
                        }
                        className="w-full pl-4 pr-10 py-2.5 rounded-2xl text-xs bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 font-mono focus:outline-hidden"
                      />
                      {crossChainRefundValidation.valid && (
                        <span className="absolute right-3.5 flex items-center justify-center text-emerald-500">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                    </div>
                    {crossChainRefundAddress.trim().length > 0 && (
                      <p
                        className={`mt-1 text-[11px] font-medium ${
                          crossChainRefundValidation.valid
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-[#FF1A1A]"
                        }`}
                      >
                        {crossChainRefundValidation.reason}
                      </p>
                    )}
                  </div>

                  {/* Destination Info Box */}
                  <div className="p-3.5 rounded-2xl bg-neutral-50 dark:bg-[#1A1A1A] border border-neutral-200/80 dark:border-white/[0.08] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        Settles into native NEAR
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        NEAR Mainnet
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <ChainBadge chainKey="near-mainnet" size={20} />
                      <span className="font-mono text-xs font-bold text-neutral-950 dark:text-white truncate">
                        {truncateMiddle(nearAddr, 10, 8) ||
                          "NEAR wallet address unavailable"}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 dark:text-neutral-400 pt-0.5">
                      Directly arrives in your registered FLOW NEAR wallet.
                    </p>
                  </div>

                  <div className="pt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {crossChainQuote?.minimumRecipientDisplayAmount ? (
                      <>
                        ⓘ Minimum for{" "}
                        {crossChainSourceToken?.symbol ?? "selected token"} →
                        NEAR:{" "}
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                          {formatApproxDisplay(
                            crossChainQuote.minimumRecipientDisplayAmount,
                          )}{" "}
                          NEAR
                        </span>
                      </>
                    ) : (
                      <>
                        ⓘ Enter an amount to quote the live{" "}
                        {crossChainSourceToken?.symbol ?? "selected token"} →
                        NEAR minimum.
                      </>
                    )}
                  </div>
                </div>

                {/* Right Column: Dry Quote & Commitment Card (replaced by Deposit Card once generated) */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-white/[0.06]">
                    <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                      {addMoneyIntent
                        ? "Deposit instructions"
                        : "Cross-chain deposit quote"}
                    </h3>
                    <div className="flex items-center gap-2">
                      {!addMoneyIntent && (
                        <button
                          type="button"
                          onClick={handleReviewCrossChainQuote}
                          disabled={!addMoneyKey || crossChainQuoteLoading}
                          aria-label="Refresh quote"
                          title="Refresh quote"
                          className="p-2 rounded-full border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer"
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
                            className={crossChainQuoteLoading ? "animate-spin" : ""}
                            aria-hidden="true"
                          >
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        </button>
                      )}
                      <NearIntentsBadge />
                    </div>
                  </div>

                  {!addMoneyIntent ? (
                    <>
                      <dl className="space-y-3.5 py-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        You send
                      </dt>
                      <dd className="min-w-0 break-all text-right font-semibold text-neutral-950 dark:text-white">
                        {crossChainQuote
                          ? crossChainQuote.sourceDisplayAmount +
                            " " +
                            crossChainSourceToken?.symbol
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        Estimated native NEAR
                      </dt>
                      <dd className="min-w-0 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        {crossChainQuote ? (
                          <>
                            <span className="break-all">
                              {crossChainQuote.recipientDisplayAmount}
                            </span>{" "}
                            <span className="whitespace-nowrap">NEAR</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    {crossChainQuote?.minimumRecipientDisplayAmount && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-neutral-500 dark:text-neutral-400">
                          Min receive
                        </dt>
                        <dd className="min-w-0 text-right font-semibold text-neutral-950 dark:text-white">
                          <span className="break-all">
                            {formatApproxDisplay(crossChainQuote.minimumRecipientDisplayAmount)}
                          </span>{" "}
                          <span className="whitespace-nowrap">NEAR</span>
                        </dd>
                      </div>
                    )}
                    {crossChainQuote?.rateDescription && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-neutral-500 dark:text-neutral-400">
                          Rate
                        </dt>
                        <dd className="text-right font-semibold text-neutral-950 dark:text-white">
                          {crossChainQuote.rateDescription}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        Est. arrival
                      </dt>
                      <dd className="font-semibold text-neutral-950 dark:text-white">
                        {crossChainQuote?.estimatedTimeSeconds == null
                          ? "—"
                          : `~${crossChainQuote.estimatedTimeSeconds}s`}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-neutral-100 dark:border-white/[0.06] pt-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        Route
                      </dt>
                      <dd className="text-right font-semibold text-neutral-950 dark:text-white">
                        {crossChainQuote
                          ? "Instant Cross-Chain Route"
                          : crossChainQuoteLoading
                            ? "Checking route…"
                            : addMoneyRouteUnavailable ||
                                crossChainQuoteError === "Route unavailable"
                              ? "Route unavailable"
                              : crossChainQuoteError
                                ? "Quote unavailable"
                                : addMoneyKey
                                  ? "Preparing quote…"
                                  : "Enter amount & refund address"}
                      </dd>
                    </div>
                  </dl>
                  {crossChainQuoteError &&
                    crossChainQuoteError !== "Route unavailable" && (
                      <p
                        role="status"
                        className="text-xs text-neutral-600 dark:text-neutral-400"
                      >
                        {crossChainQuoteError}
                      </p>
                    )}

                  <button
                    type="button"
                    disabled={
                      executionDisabled ||
                      !addMoneyBody ||
                      addMoneyCommitting ||
                      addMoneyRouteUnavailable
                    }
                    onClick={async () => {
                      if (!crossChainSourceToken || !addMoneyBody) return;
                      setAddMoneyError(null);
                      setAddMoneyCommitting(true);
                      try {
                        const key = crypto.randomUUID();
                        const res = await fetch(
                          `/api/accounts/${accountId}/add-money`,
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              "Idempotency-Key": key,
                            },
                            body: JSON.stringify({
                              sourceDeploymentId: crossChainSourceToken.assetId,
                              sourceAmount: crossChainDepositAmount,
                              refundAddress: crossChainRefundAddress.trim(),
                              idempotencyKey: key,
                            }),
                          },
                        );
                        const data = (await res.json().catch(() => ({}))) as {
                          intent?: SerializedAddMoneyIntent;
                          error?: string;
                          detail?: string;
                        };
                        if (!res.ok || !data.intent) {
                          const msg =
                            data.detail ||
                            data.error ||
                            "Unable to generate deposit address.";
                          throw new Error(
                            msg.includes("PAYMENT_EXECUTION_DISABLED")
                              ? "Cross-chain deposits are temporarily paused in preview mode."
                              : msg,
                          );
                        }
                        setAddMoneyIntent(data.intent);
                        pushToast({
                          title: "Deposit quote ready",
                          description: "Send your deposit before the quote timer expires.",
                          variant: "success",
                        });
                      } catch (err) {
                        const msg = describe(err);
                        setAddMoneyError(msg);
                        pushToast({
                          title: "Deposit quote failed",
                          description: msg,
                          variant: "error",
                        });
                      } finally {
                        setAddMoneyCommitting(false);
                      }
                    }}
                    className="flow-liquid-btn-primary w-full py-3.5 rounded-full text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {executionDisabled
                      ? "Continue to Deposit (Preview Only)"
                      : addMoneyCommitting
                        ? "Generating Deposit Address…"
                        : "Continue to Deposit"}
                  </button>

                  {addMoneyError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-[#FF1A1A] dark:text-red-400"
                    >
                      {addMoneyError}
                    </p>
                  )}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-neutral-200 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A] p-4 space-y-3.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-neutral-950 dark:text-white">
                          Send exact amount
                        </span>
                        <span className="rounded-full bg-neutral-200/80 dark:bg-white/[0.08] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-200">
                          {addMoneyIntent.status.replace(/_/g, " ")}
                        </span>
                      </div>

                      {/* Copyable Amount to Pay */}
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block">
                          Amount to pay ({addMoneyIntent.sourceAssetSymbol})
                        </span>
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] px-3 py-2 font-mono text-xs font-bold">
                          <span className="truncate select-all text-neutral-950 dark:text-white">
                            {addMoneyIntent.quotedSourceDisplayAmount}{" "}
                            {addMoneyIntent.sourceAssetSymbol}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyText(
                                `am-amt-${addMoneyIntent.id}`,
                                addMoneyIntent.quotedSourceDisplayAmount,
                              )
                            }
                            className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline cursor-pointer"
                          >
                            {copiedKey === `am-amt-${addMoneyIntent.id}`
                              ? "Copied"
                              : "Copy"}
                          </button>
                        </div>
                      </div>

                      {addMoneyIntent.depositAddress &&
                        addMoneyIntent.status === "DEPOSIT_COMMITTED" && (
                          <>
                            <div className="flex justify-center py-1">
                              <div className="p-2.5 bg-white rounded-2xl">
                                <QrCode
                                  value={addMoneyIntent.depositAddress}
                                  size={136}
                                />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block">
                                Deposit Address ({addMoneyIntent.sourceNetwork})
                              </span>
                              <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] px-3 py-2 font-mono text-[11px]">
                                <span className="truncate select-all text-neutral-800 dark:text-neutral-200">
                                  {addMoneyIntent.depositAddress}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    copyText(
                                      `am-addr-${addMoneyIntent.id}`,
                                      addMoneyIntent.depositAddress ?? "",
                                    )
                                  }
                                  className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline cursor-pointer"
                                >
                                  {copiedKey === `am-addr-${addMoneyIntent.id}`
                                    ? "Copied"
                                    : "Copy"}
                                </button>
                              </div>
                            </div>
                            {addMoneyIntent.depositMemo && (
                              <div className="space-y-1">
                                <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 block">
                                  Required Memo
                                </span>
                                <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 dark:border-white/[0.08] bg-white dark:bg-[#141414] px-3 py-2 font-mono text-[11px]">
                                  <span className="truncate select-all text-neutral-800 dark:text-neutral-200">
                                    {addMoneyIntent.depositMemo}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      copyText(
                                        `am-memo-${addMoneyIntent.id}`,
                                        addMoneyIntent.depositMemo ?? "",
                                      )
                                    }
                                    className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline cursor-pointer"
                                  >
                                    {copiedKey ===
                                    `am-memo-${addMoneyIntent.id}`
                                      ? "Copied"
                                      : "Copy"}
                                  </button>
                                </div>
                              </div>
                            )}
                            <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                              Settles ~
                              {addMoneyIntent.quotedDestinationDisplayAmount}{" "}
                              NEAR to{" "}
                              {truncateMiddle(
                                addMoneyIntent.destinationAddress,
                                10,
                                6,
                              )}
                              .
                              {addMoneySecondsRemaining > 0 &&
                                ` Expires in ${Math.floor(addMoneySecondsRemaining / 60)}m ${addMoneySecondsRemaining % 60}s.`}
                            </p>
                          </>
                        )}

                      {addMoneyIntent.status === "SETTLED" &&
                        addMoneyIntent.destinationTxHash && (
                          <p className="font-mono text-[11px] break-all text-emerald-700 dark:text-emerald-400">
                            NEAR settlement tx: {addMoneyIntent.destinationTxHash}
                          </p>
                        )}
                      {addMoneyIntent.settlementError && (
                        <p className="text-[#FF1A1A] font-medium">
                          {addMoneyIntent.settlementError}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setAddMoneyIntent(null);
                          setAddMoneyError(null);
                          try {
                            window.localStorage.removeItem(addMoneyStorageKey);
                          } catch {}
                        }}
                        className="w-full py-2.5 rounded-full text-xs font-semibold border border-neutral-200 dark:border-white/[0.12] bg-white dark:bg-[#141414] text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                      >
                        {addMoneyIntent.status === "DEPOSIT_COMMITTED"
                          ? "Cancel / New Quote"
                          : "Start New Deposit"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
            </>
            )}
          </MotionTabPanel>
        )}

        {/* ===================================================================
            TAB 4: REQUEST PAYMENT (Matches media_1794481849816_2576ee33.jpg)
           =================================================================== */}
        {activeTab === "request" && (
          <MotionTabPanel className="max-w-4xl mx-auto space-y-6">
            {requestView === "LIST" ? (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    Requests
                  </p>
                  <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                    Ask to get paid
                  </h1>
                  <p className="max-w-xl text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    Send someone a FLOW link to pay you a fixed or open amount.
                    They can settle from NEAR, Solana, Base, or Ethereum and
                    funds arrive straight in your wallet.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    Your requests
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setPrSuccessUrl(null);
                      setRequestView("CREATE");
                    }}
                    className="flow-liquid-btn inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold text-neutral-950 dark:text-white shadow-xs cursor-pointer"
                  >
                    <span aria-hidden="true">+</span>
                    <span>New request</span>
                  </button>
                </div>

                <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-xs overflow-hidden">
                  {paymentRequests.length === 0 ? (
                    <div className="py-16 px-6 flex flex-col items-center justify-center text-center">
                      <div className="h-12 w-12 rounded-full bg-neutral-100 dark:bg-white/[0.06] flex items-center justify-center text-neutral-700 dark:text-neutral-200 mb-4">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.9"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <rect x="2" y="6" width="20" height="12" rx="2" />
                          <circle cx="12" cy="12" r="2.5" />
                          <path d="M12 2v4" />
                          <path d="m10 4 2 2 2-2" />
                        </svg>
                      </div>
                      <h3 className="text-base font-bold text-neutral-950 dark:text-white">
                        No requests yet
                      </h3>
                      <p className="mt-1.5 max-w-xs text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 leading-relaxed">
                        Create a request and share a FLOW pay link that anyone
                        can settle in a tap.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setPrSuccessUrl(null);
                          setRequestView("CREATE");
                        }}
                        className="mt-6 flow-liquid-btn-primary inline-flex items-center gap-1.5 px-6 py-3 rounded-full text-xs font-semibold cursor-pointer"
                      >
                        <span aria-hidden="true">+</span>
                        <span>New request</span>
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-neutral-100 dark:divide-white/[0.06]">
                      {paymentRequests.map((req) => {
                        const isActive = req.status === "ACTIVE";
                        const isPaused = req.status === "DISABLED";
                        return (
                          <div
                            key={req.id}
                            className="p-4 sm:px-6 sm:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50/70 dark:hover:bg-white/[0.02] transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="text-sm font-bold text-neutral-950 dark:text-white truncate">
                                  {req.title}
                                </span>
                                <span
                                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${
                                    isActive
                                      ? "text-emerald-700 dark:text-emerald-400"
                                      : "text-neutral-500 dark:text-neutral-400"
                                  }`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      isActive
                                        ? "bg-emerald-500"
                                        : "bg-neutral-400 dark:bg-neutral-500"
                                    }`}
                                  />
                                  {isActive
                                    ? "Active"
                                    : req.status === "COMPLETED"
                                      ? "Completed"
                                      : isPaused
                                        ? "Paused"
                                        : "Expired"}
                                </span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-neutral-500 dark:text-neutral-400">
                                <span>
                                  {req.amountMode === "FIXED"
                                    ? `${req.displayAmount} ${req.destinationAssetSymbol} • ${req.destinationNetwork}`
                                    : `Open amount • ${req.destinationNetwork}`}
                                </span>
                                <span aria-hidden="true">•</span>
                                {req.maxPayments !== null ? (
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                                      (req.remainingPayments ?? 0) === 0
                                        ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                                        : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-700 dark:text-neutral-200"
                                    }`}
                                  >
                                    {req.paidCount}/{req.maxPayments} paid ·{" "}
                                    {(req.remainingPayments ?? 0) === 0
                                      ? "Full"
                                      : `${req.remainingPayments} left`}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums bg-neutral-100 dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-300">
                                    {req.paidCount} paid · Unlimited
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                              <Link
                                href={`/pay/${req.publicId}`}
                                target="_blank"
                                className="flow-liquid-btn px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-800 dark:text-neutral-200"
                              >
                                View
                              </Link>
                              <button
                                type="button"
                                onClick={() => copyText(req.id, req.shareUrl)}
                                className="flow-liquid-btn px-3 py-1.5 rounded-full text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer"
                              >
                                {copiedKey === req.id ? "Copied!" : "Copy Link"}
                              </button>
                              {isActive && (
                                <button
                                  type="button"
                                  disabled={togglingPaymentRequestId === req.id}
                                  onClick={() =>
                                    void handleTogglePaymentRequestStatus(
                                      req,
                                      "DISABLED",
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-white/[0.1] text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/[0.06] disabled:opacity-40 transition-colors cursor-pointer"
                                >
                                  {togglingPaymentRequestId === req.id
                                    ? "Updating…"
                                    : "Pause"}
                                </button>
                              )}
                              {isPaused && (
                                <button
                                  type="button"
                                  disabled={togglingPaymentRequestId === req.id}
                                  onClick={() =>
                                    void handleTogglePaymentRequestStatus(
                                      req,
                                      "ACTIVE",
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors cursor-pointer"
                                >
                                  {togglingPaymentRequestId === req.id
                                    ? "Updating…"
                                    : "Resume"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={deletingPaymentRequestId === req.id}
                                onClick={() => setDeleteLinkConfirmTarget(req)}
                                className="px-3 py-1.5 rounded-full border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 transition-colors cursor-pointer"
                              >
                                {deletingPaymentRequestId === req.id
                                  ? "Deleting…"
                                  : "Delete"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setRequestView("LIST")}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                  >
                    <span aria-hidden="true">←</span>
                    <span>Back to requests</span>
                  </button>
                  <div>
                    <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                      New payment link
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                      Create a shareable FLOW link with live cross-chain
                      settlement to your wallet.
                    </p>
                  </div>
                </div>

                {/* Create Payment Link Form */}
                <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-8">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                        Title
                      </label>
                      <input
                        type="text"
                        value={prTitle}
                        onChange={(e) => setPrTitle(e.target.value)}
                        placeholder="e.g., Project design deposit"
                        className="w-full px-4 py-2.5 rounded-2xl text-xs bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-4">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                        Amount
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          disabled={prAmountMode === "OPTIONAL"}
                          value={prAmount}
                          onKeyDown={blockNegativeKey}
                          onChange={(e) =>
                            setPrAmount(sanitizeNonNegativeDecimal(e.target.value))
                          }
                          placeholder="0.00"
                          className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono font-bold bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden disabled:opacity-40"
                        />
                        <select
                          value={prAmountMode}
                          onChange={(e) =>
                            setPrAmountMode(e.target.value as "FIXED" | "OPTIONAL")
                          }
                          className="px-3 py-2 rounded-2xl text-xs font-semibold bg-neutral-100 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-900 dark:text-white focus:outline-hidden cursor-pointer"
                        >
                          <option value="FIXED">Fixed</option>
                          <option value="OPTIONAL">Open</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-7">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                        Description (Optional)
                      </label>
                      <input
                        type="text"
                        value={prDescription}
                        onChange={(e) => setPrDescription(e.target.value)}
                        placeholder="Add details for the payer (e.g., scope, timeline, invoice #)"
                        className="w-full px-4 py-2.5 rounded-2xl text-xs bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                        Max payers
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="10000"
                          disabled={prMaxPaymentsMode === "UNLIMITED"}
                          value={prMaxPaymentsMode === "UNLIMITED" ? "" : prMaxPayments}
                          onKeyDown={blockNegativeKey}
                          onChange={(e) =>
                            setPrMaxPayments(e.target.value.replace(/[^0-9]/g, ""))
                          }
                          placeholder={
                            prMaxPaymentsMode === "UNLIMITED" ? "∞" : "e.g. 5"
                          }
                          className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono font-bold bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-hidden disabled:opacity-40"
                        />
                        <select
                          value={prMaxPaymentsMode}
                          onChange={(e) =>
                            setPrMaxPaymentsMode(
                              e.target.value as "UNLIMITED" | "LIMITED",
                            )
                          }
                          className="px-3 py-2 rounded-2xl text-xs font-semibold bg-neutral-100 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-900 dark:text-white focus:outline-hidden cursor-pointer shrink-0"
                        >
                          <option value="UNLIMITED">Unlimited</option>
                          <option value="LIMITED">Limit</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Recipient Receives: Unified Picker */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      Recipient receives
                    </label>
                    <CombinedAssetNetworkPicker
                      selectedId={prDestinationDeployment.id}
                      onSelect={(dep) => setPrDestinationDeployment(dep)}
                    />
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                      Settles directly to your{" "}
                      {prDestinationDeployment.networkName} wallet:{" "}
                      <span className="font-bold text-neutral-800 dark:text-neutral-200">
                        {truncateMiddle(prRecipientAddress, 8, 6)}
                      </span>
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                      ⓘ Payer source options (tokens and networks) are chosen
                      later at guest checkout.
                    </p>

                    <button
                      type="button"
                      onClick={handleCreatePaymentRequest}
                      disabled={prCreating || !prTitle}
                      className="flow-liquid-btn-primary px-6 py-3 rounded-full text-xs font-semibold disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {prCreating ? "Creating Link..." : "Create Payment Link"}
                    </button>
                  </div>

                  {prSuccessUrl && (
                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
                      <div className="truncate">
                        <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                          Payment Link Ready!
                        </p>
                        <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                          {prSuccessUrl}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyText("prCreated", prSuccessUrl)}
                          className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                        >
                          {copiedKey === "prCreated" ? "Copied!" : "Copy Link"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRequestView("LIST")}
                          className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 transition-colors cursor-pointer"
                        >
                          View all
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </MotionTabPanel>
        )}

        {/* ===================================================================
            TAB 4.5: EARN (High-Yield NEAR Liquid Staking)
           =================================================================== */}
        {activeTab === "earn" && (
          <MotionTabPanel className="max-w-4xl mx-auto space-y-6">
            <EarnView
              accountId={accountId}
              heldAssets={heldAssets}
              hideBalance={hideBalance}
              nearPriceUsd={tokenPrices["near-mainnet:NEAR"] ?? 5.25}
              onSyncPortfolio={() => {
                void send<SerializedAccountPortfolio>(
                  `/api/accounts/${accountId}/portfolio/refresh`,
                  {},
                  "POST",
                )
                  .then((res) => setPortfolio(res))
                  .catch(() => {});
                void send<unknown>(
                  `/api/accounts/${accountId}/activities/sync`,
                  {},
                  "POST",
                )
                  .then(() => refreshActivities())
                  .catch(() => {});
              }}
              onNavigateToTab={changeTab}
              onSelectConvert={(sourceId, destId) => {
                if (sourceId) setConvertSourceDeploymentId(sourceId);
                if (destId) setConvertDestDeploymentId(destId);
                setSendMode("CONVERT");
                changeTab("convert");
              }}
              onSelectDeposit={(depId) => {
                const target = MAINNET_SUPPORTED_DEPLOYMENTS.find(
                  (d) => d.id === depId,
                );
                if (target) setDepositDeployment(target);
                setDepositMode("DIRECT");
                changeTab("receive");
                setReceiveHubOpen(false);
              }}
              pushToast={pushToast}
            />
          </MotionTabPanel>
        )}

        {/* ===================================================================
            TAB 5: ACTIVITY
           =================================================================== */}
        {activeTab === "activity" && (
          <MotionTabPanel className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                  Activity
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                  Real-time ledger events, cross-chain settlements, and
                  transfers
                </p>
              </div>

              <button
                type="button"
                onClick={handleSyncActivities}
                disabled={activityLoading}
                className="flow-liquid-btn-primary px-4 py-2 rounded-full text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
              >
                {activityLoading ? "Syncing..." : "Sync Activity"}
              </button>
            </div>

            {/* Filter Tabs */}
            <SegmentedTabPill
              tabs={[
                { id: "ALL", label: "All" },
                { id: "INCOMING", label: "Incoming" },
                { id: "OUTGOING", label: "Outgoing" },
              ] as const}
              activeTab={activityFilter}
              onChange={setActivityFilter}
            />

            {/* Activity List */}
            <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-3">
              {displayActivities.length > 0 ? (
                displayActivities
                  .filter((act) => {
                    if (activityFilter === "INCOMING")
                      return act.direction === "INCOMING";
                    if (activityFilter === "OUTGOING")
                      return act.direction === "OUTGOING";
                    return true;
                  })
                  .map((act) => (
                    <div
                      key={act.id}
                      className="p-3 rounded-2xl border border-neutral-100 dark:border-white/[0.06] hover:bg-neutral-50/60 dark:hover:bg-white/[0.03] transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            act.direction === "INCOMING"
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                              : "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {act.direction === "INCOMING" ? "↓" : "↑"}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-neutral-950 dark:text-white">
                            {act.activityType === "FLOW_PAYMENT"
                              ? act.metadata?.executionStatus === "FAILED" ||
                                act.metadata?.executionStatus === "REFUNDED" ||
                                act.metadata?.executionStatus === "EXPIRED"
                                ? "Payment Failed"
                                : act.finality === "PENDING"
                                  ? "Payment Pending"
                                  : "Cross-chain Payment"
                              : act.activityType ===
                                    "FLOW_CROSS_CHAIN_SETTLEMENT" &&
                                  act.finality === "FINALIZED"
                                ? "Payment Settled"
                                : act.activityType ===
                                    "FLOW_CROSS_CHAIN_SETTLEMENT"
                                  ? "Payment Pending"
                                  : act.direction === "OUTGOING"
                                    ? "Transfer Sent"
                                    : "Transfer Received"}
                          </div>
                          <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
                            {truncateMiddle(act.txHash, 10, 8)} •{" "}
                            {formatTimestamp(
                              act.blockTimestamp || act.observedAt,
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs font-bold tabular-nums ${
                            act.direction === "INCOMING"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-neutral-950 dark:text-white"
                          }`}
                        >
                          {hideBalance
                            ? "••••••"
                            : `${act.direction === "INCOMING" ? "+" : "-"}${formatApproxDisplay(act.displayAmount)}`}{" "}
                          {act.assetSymbol}
                        </div>
                        {act.finality === "FINALIZED" &&
                        !act.txHash.startsWith("snd_") &&
                        !act.txHash.startsWith("cnv_") &&
                        !act.txHash.startsWith("am_") ? (
                          <a
                            href={act.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-white"
                          >
                            View tx ↗
                          </a>
                        ) : (
                          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                            {act.metadata?.executionStatus === "FAILED" ||
                            act.metadata?.executionStatus === "REFUNDED" ||
                            act.metadata?.executionStatus === "EXPIRED"
                              ? "No tx hash"
                              : "Pending"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                  No activity found for this account.
                </div>
              )}
            </div>
          </MotionTabPanel>
        )}
          </>
        )}
      </main>

      {/* Delete Payment Link Confirmation Modal */}
      {deleteLinkConfirmTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-link-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          onClick={() => {
            if (!deletingPaymentRequestId) setDeleteLinkConfirmTarget(null);
          }}
        >
          <div
            className="flow-anim-fade-up w-full max-w-md rounded-[28px] border border-neutral-200/90 dark:border-white/[0.1] bg-white dark:bg-[#161618] p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3
                id="delete-link-modal-title"
                className="font-serif text-xl text-neutral-950 dark:text-white"
              >
                Delete payment link?
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                Are you sure you want to delete{" "}
                <strong className="text-neutral-900 dark:text-white">
                  &ldquo;{deleteLinkConfirmTarget.title}&rdquo;
                </strong>
                ? Anyone who opens this link will see that it has been deleted
                and can no longer pay with it.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={Boolean(deletingPaymentRequestId)}
                onClick={() => setDeleteLinkConfirmTarget(null)}
                className="flow-liquid-btn px-4 py-2.5 rounded-full text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingPaymentRequestId)}
                onClick={() =>
                  void handleDeletePaymentRequest(deleteLinkConfirmTarget)
                }
                className="px-5 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40"
              >
                {deletingPaymentRequestId ? "Deleting…" : "Delete link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Held Assets Modal */}
      <AssetsHeldModal
        isOpen={isHeldAssetsOpen}
        onClose={() => setIsHeldAssetsOpen(false)}
        heldAssets={heldAssets}
        totalBalanceUsd={totalBalanceUsd ?? "Syncing balances..."}
        hideBalance={hideBalance}
        onSelectAction={(action, deployment) => {
          setIsHeldAssetsOpen(false);
          if (action === "receive") {
            setDepositDeployment(deployment);
            setDepositMode("DIRECT");
            changeTab("receive");
          }
          if (action === "send") {
            setSendSourceDeploymentId(deployment.id);
            changeTab("send");
          }
          if (action === "swap_near") {
            setConvertSourceDeploymentId(deployment.id);
            setConvertDestDeploymentId("near-mainnet:NEAR");
            setSendMode("CONVERT");
            changeTab("convert");
          }
        }}
      />

      {/* Notifications Drawer */}
      <NotificationsDrawer
        profileId={profileId}
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        accountId={accountId}
        onUnreadCountChange={setUnreadNotifications}
        onClaimFlowId={() => setIsFlowIdModalOpen(true)}
      />

      <FlowIdClaimModal
        isOpen={isFlowIdModalOpen}
        onClose={() => setIsFlowIdModalOpen(false)}
        accountId={accountId}
        onClaimed={(claimedFlowId) => {
          setIsFlowIdModalOpen(false);
          setUnreadNotifications((count) => Math.max(0, count - 1));
          pushToast({
            title: `Your unique Flow ID ${claimedFlowId} is now active!`,
            variant: "success",
          });
        }}
      />

      {/* Unified Asset Selector Modal for Cross-Chain Deposit */}
      <UnifiedAssetSelectorModal
        isOpen={isCrossChainTokenSelectorOpen}
        onClose={() => setIsCrossChainTokenSelectorOpen(false)}
        filterCapability="DISCOVERABLE_BY_PROVIDER"
        excludeNearNative
        onSelectToken={(t) => {
          setIsCrossChainTokenSelectorOpen(false);
          if (t.networkKey !== crossChainSourceToken?.networkKey)
            setCrossChainRefundAddress("");
          setCrossChainSourceToken(t);
        }}
      />

      {/* Payment Links Directory Modal */}
      {paymentLinksModalFilter && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment links"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-xl rounded-[28px] border border-neutral-200 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 shadow-xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl text-neutral-950 dark:text-white">
                {paymentLinksModalFilter === "ACTIVE"
                  ? "Active Payment Links"
                  : "Past Payment Links"}
              </h2>
              <button
                type="button"
                onClick={() => setPaymentLinksModalFilter(null)}
                className="flow-liquid-btn rounded-full px-3 py-1 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto pr-1">
              {paymentRequests
                .filter((r) =>
                  paymentLinksModalFilter === "ACTIVE"
                    ? r.status === "ACTIVE"
                    : r.status !== "ACTIVE",
                )
                .map((req) => (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-2xl border border-neutral-200/70 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-[#1A1A1A] flex flex-col gap-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-neutral-950 dark:text-white">
                          {req.title}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {req.amountMode === "FIXED"
                            ? `${req.displayAmount} ${req.destinationAssetSymbol} • ${req.destinationNetwork}`
                            : `Open amount • ${req.destinationNetwork}`}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1.5 text-[11px] font-medium shrink-0 ${
                          req.status === "ACTIVE"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "text-neutral-600 dark:text-neutral-400"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            req.status === "ACTIVE"
                              ? "bg-emerald-500"
                              : "bg-neutral-400 dark:bg-neutral-500"
                          }`}
                        />
                        {req.status === "ACTIVE"
                          ? "Active"
                          : req.status === "DISABLED"
                            ? "Paused"
                            : req.status === "COMPLETED"
                              ? "Completed"
                              : "Expired"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/pay/${req.publicId}`}
                        target="_blank"
                        className="flow-liquid-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-800 dark:text-neutral-200"
                      >
                        View
                      </Link>
                      <button
                        type="button"
                        onClick={() => copyText(req.id, req.shareUrl)}
                        className="flow-liquid-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer"
                      >
                        {copiedKey === req.id ? "Copied!" : "Copy Link"}
                      </button>
                      {(req.status === "ACTIVE" ||
                        req.status === "DISABLED") && (
                        <button
                          type="button"
                          disabled={togglingPaymentRequestId === req.id}
                          onClick={() =>
                            void handleTogglePaymentRequestStatus(
                              req,
                              req.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                            )
                          }
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white ml-auto cursor-pointer"
                        >
                          {req.status === "ACTIVE" ? "Pause" : "Resume"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
