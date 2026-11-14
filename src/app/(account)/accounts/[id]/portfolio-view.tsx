"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FloatingNav,
  type NavTabId,
} from "../../../../components/floating-nav.tsx";
import { NotificationsDrawer } from "../../../../components/notifications-drawer.tsx";
import { FlowAIAssistantDrawer } from "../../../../components/flow-ai-assistant-drawer.tsx";
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
  MAINNET_SUPPORTED_DEPLOYMENTS,
  validateEcosystemAddress,
  type CatalogTokenDeployment,
} from "../../../../domain/supported-assets-catalog.ts";
import { CombinedAssetNetworkPicker } from "../../../../components/combined-asset-network-picker.tsx";
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
import { FreshProof, describe, send } from "../../../controls.tsx";

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

function ledgerMovementLabel(
  movements: LedgerMovement[] | null,
  direction: "inflow" | "outflow" | "net",
) {
  if (movements === null) return "Unavailable";
  const labels: string[] = [];
  for (const row of movements) {
    const deployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
      (asset) =>
        asset.id === row.assetId &&
        asset.networkKey === row.network &&
        asset.decimals === row.decimals,
    );
    if (!deployment) return "Unavailable";
    const amount =
      direction === "net"
        ? BigInt(row.inflow) - BigInt(row.outflow)
        : BigInt(row[direction]);
    if (amount !== 0n)
      labels.push(
        formatAtomicToDisplay(amount, row.decimals) +
          " " +
          deployment.symbol +
          " (" +
          deployment.networkName +
          ")",
      );
  }
  return labels.join(", ") || "No posted movement";
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
  } = input;
  const sourceDeployment = source?.deployment;
  const amountAtomic = sourceDeployment
    ? positiveQuoteAmount(displayAmount, sourceDeployment.decimals)
    : null;
  const balance = source?.balanceRecord;
  const body =
    active &&
    sourceDeployment &&
    balance?.syncStatus === "SYNCED" &&
    amountAtomic &&
    BigInt(amountAtomic) <= BigInt(balance.atomicBalance) &&
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
  const preview = useQuotePreview<OneClickPreview>(
    body
      ? JSON.stringify([
          accountId,
          body,
          recipient,
          refund,
          balance?.atomicBalance,
        ])
      : null,
  );
  const review = () => {
    if (!body) return;
    void preview.load(async (signal) => {
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
  };
  return { ...preview, review, canReview: Boolean(body) };
}

function OutgoingQuoteDetails({
  preview,
  symbol,
}: {
  preview: ReturnType<typeof useOutgoingPreview>;
  symbol: string;
}) {
  const { quote, loading, error } = preview;
  return (
    <div
      className="rounded-2xl border border-neutral-200/60 dark:border-white/[0.08] bg-neutral-50/60 dark:bg-white/[0.03] p-4 text-left"
      role="status"
    >
      {quote ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">
              Estimated to receive
            </p>
            <p className="mt-1 font-bold text-neutral-950 dark:text-white">
              {quote.recipientDisplayAmount} {symbol}
            </p>
            {quote.minimumRecipientDisplayAmount && (
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                Quoted minimum {quote.minimumRecipientDisplayAmount} {symbol}
              </p>
            )}
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">
              Provider fees
            </p>
            <p className="mt-1 text-neutral-900 dark:text-neutral-200">
              {quote.fees.description}
            </p>
          </div>
          <div>
            <p className="text-neutral-500 dark:text-neutral-400">
              Exchange rate
            </p>
            <p className="mt-1 font-semibold text-neutral-950 dark:text-white">
              {quote.rateDescription}
            </p>
            {quote.estimatedTimeSeconds !== null && (
              <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                Provider estimate {quote.estimatedTimeSeconds} seconds
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-600 dark:text-neutral-400">
          <p>{loading ? "Checking route…" : "Quote unavailable"}</p>
          {error && <p>{error}</p>}
        </div>
      )}
    </div>
  );
}

export function PortfolioView({
  accountId,
  initialPortfolio,
  account,
  initialView = "dashboard",
  userEmail,
  profileId,
  executionDisabled = false,
}: {
  accountId: string;
  initialPortfolio: SerializedAccountPortfolio;
  account?: WorkspaceAccountSummary;
  allAccounts?: ReadonlyArray<WorkspaceAccountSummary>;
  initialView?: WorkspaceTab;
  userEmail?: string;
  profileId?: string;
  executionDisabled?: boolean;
}) {
  const [portfolio, setPortfolio] =
    useState<SerializedAccountPortfolio>(initialPortfolio);
  const [activeTab, setActiveTab] = useState<NavTabId>(initialView);
  const isBusiness = account?.kind === "BUSINESS";
  const canManageTeam = isBusiness && account?.role !== "MEMBER";
  const [refreshing, setRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(
    initialPortfolio.cooldownRemainingSeconds ?? 0,
  );
  const [message, setMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Modals and Drawers
  const [isHeldAssetsOpen, setIsHeldAssetsOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

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
  const [sendMode, setSendMode] = useState<"SEND" | "CONVERT">("SEND");
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

  // Outgoing execution (Send & Convert) + Add Money + Payment Links management state
  const [outgoingProofOpenFor, setOutgoingProofOpenFor] = useState<
    "SEND" | "CONVERT" | null
  >(null);
  const [outgoingExecuting, setOutgoingExecuting] = useState(false);
  const [outgoingError, setOutgoingError] = useState<string | null>(null);
  const [outgoingIdempotencyKey, setOutgoingIdempotencyKey] = useState<string>(
    () => crypto.randomUUID(),
  );
  const [activeOutgoingTransfer, setActiveOutgoingTransfer] =
    useState<SerializedOutgoingTransfer | null>(null);

  const [addMoneyIntent, setAddMoneyIntent] =
    useState<SerializedAddMoneyIntent | null>(null);
  const [addMoneyCommitting, setAddMoneyCommitting] = useState(false);
  const [addMoneyError, setAddMoneyError] = useState<string | null>(null);
  const [addMoneySecondsRemaining, setAddMoneySecondsRemaining] =
    useState<number>(0);

  const [paymentLinksModalFilter, setPaymentLinksModalFilter] = useState<
    "ACTIVE" | "PAST" | null
  >(null);
  const [togglingPaymentRequestId, setTogglingPaymentRequestId] = useState<
    string | null
  >(null);

  // Add Money state (Matches media_1794490079680_0a50f095.jpg)
  const [depositMode, setDepositMode] = useState<"DIRECT" | "DEPOSIT">(
    "DIRECT",
  );
  const [depositDeployment, setDepositDeployment] =
    useState<CatalogTokenDeployment>(
      MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === "base-mainnet:USDC") ??
        MAINNET_SUPPORTED_DEPLOYMENTS[0]!,
    );
  const [tokenPrices, setTokenPrices] = useState<Record<string, number>>({});
  const [ledgerMovements, setLedgerMovements] = useState<
    LedgerMovement[] | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const prices: Record<string, number> = {};
      try {
        const response = await fetch(
          "/api/tokens/discovery?capability=CAN_HOLD_IN_FLOW",
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        const data = response.ok
          ? ((await response.json()) as { tokens: DiscoveredToken[] })
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
      } catch {}
      if (!controller.signal.aborted) setTokenPrices(prices);
    };
    void load();
    const timer = window.setInterval(() => void load(), 120_000);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "dashboard") return;
    const controller = new AbortController();
    fetch("/api/accounts/" + accountId + "/ledger/summary", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Ledger unavailable");
        return (await response.json()) as { movements: LedgerMovement[] };
      })
      .then(({ movements }) => {
        if (!controller.signal.aborted) setLedgerMovements(movements);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLedgerMovements(null);
      });
    return () => controller.abort();
  }, [accountId, activeTab]);

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
        row.eventIndex,
        row.direction,
        row.assetSymbol,
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

  const sendAddressValidation = useMemo(() => {
    return validateEcosystemAddress(
      sendDestDeployment.ecosystem,
      sendRecipientAddress,
    );
  }, [sendDestDeployment.ecosystem, sendRecipientAddress]);

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
          cents === null ? "Price unavailable" : formatUsdCents(cents);
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

  const convertDestDeployment = useMemo(() => {
    return (
      MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) => d.id === convertDestDeploymentId,
      ) ?? MAINNET_SUPPORTED_DEPLOYMENTS[3]! // near-mainnet:NEAR
    );
  }, [convertDestDeploymentId]);

  const convertDestAddress =
    getMainnetWalletAddress(wallet, convertDestDeployment.networkKey) ?? "";

  const sendPreview = useOutgoingPreview({
    active: activeTab === "send" && sendMode === "SEND",
    accountId,
    operation: "SEND",
    source: sendSource,
    destination: sendDestDeployment,
    displayAmount: sendAmount,
    recipient: sendAddressValidation.valid ? sendRecipientAddress.trim() : "",
    refund: sendSource
      ? (getMainnetWalletAddress(wallet, sendSource.deployment.networkKey) ??
        "")
      : "",
  });
  const convertPreview = useOutgoingPreview({
    active: activeTab === "send" && sendMode === "CONVERT",
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
      return "Balance unavailable";
    }
    let total = 0n;
    for (const item of heldAssets) {
      const cents = item.balanceRecord
        ? holdingUsdCents(item.balanceRecord, tokenPrices[item.deployment.id])
        : null;
      if (cents === null) return "Price unavailable";
      total += cents;
    }
    return formatUsdCents(total);
  }, [heldAssets, portfolio.wallet, portfolio.balances, tokenPrices]);

  // Carousel banners content
  const carouselSlides = [
    {
      title: "Move and receive money across chains",
      description:
        "Explore cross-chain assets and review quotes through NEAR Intents.",
      badge: "NEAR Intents Powered",
    },
    {
      title: "Multi-chain guest checkout",
      description:
        "Get paid in what you want while others pay with what they have.",
      badge: "One-Click Settlement",
    },
    {
      title: "Institutional multi-chain security",
      description:
        "Isolated MPC key generation with non-custodial cryptographic verification.",
      badge: "OutLayer Protocol",
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

  // Poll activities
  useEffect(() => {
    let active = true;
    send<ActivityFeedResponse>(
      `/api/accounts/${accountId}/activities?limit=50`,
      {},
      "GET",
    )
      .then((res) => {
        if (active) setActivities(res.activities);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [accountId, activeTab]);

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
  // on "Balance unavailable".
  useEffect(() => {
    if (
      portfolio.wallet?.status !== "ACTIVE" ||
      portfolio.wallet.environment !== "mainnet" ||
      totalBalanceUsd !== "Balance unavailable" ||
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
    portfolio.wallet?.status,
    portfolio.wallet?.environment,
    portfolio.cooldownRemainingSeconds,
    totalBalanceUsd,
  ]);

  // Poll balances every 10s
  useEffect(() => {
    let active = true;
    const poll = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      )
        return;
      send<SerializedAccountPortfolio>(
        `/api/accounts/${accountId}/portfolio`,
        {},
        "GET",
      )
        .then((res) => {
          if (active) setPortfolio(res);
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [accountId]);

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
            : "Activity sync queued. New entries appear after worker verification.",
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
        },
        "POST",
      );
      setPaymentRequests((prev) => [created, ...prev]);
      setPrSuccessUrl(created.shareUrl);
      setMessage(`Payment link created: ${created.shareUrl}`);
    } catch (err) {
      setMessage(describe(err));
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
  ]);

  const handleReviewCrossChainQuote = () => {
    if (!addMoneyBody || !crossChainSourceToken) return;
    void loadCrossChainQuote(async (signal) => {
      const quote = await fetchAccountPreview(accountId, addMoneyBody, signal);
      if (
        quote.identity.operationId !== "ADD_MONEY:" + accountId ||
        quote.identity.originAsset !== crossChainSourceToken.assetId ||
        quote.identity.sourceNetwork !== crossChainSourceToken.networkKey ||
        quote.destinationDeploymentId !== "near-mainnet:NEAR" ||
        quote.identity.swapType !== "EXACT_INPUT" ||
        quote.identity.destinationNetwork !== "near-mainnet" ||
        quote.identity.amountAtomic !== crossChainAmountAtomic ||
        quote.identity.recipient !== nearAddr ||
        quote.identity.refundTo !== crossChainRefundAddress.trim()
      ) {
        throw new Error("The quote did not match the selected deposit route.");
      }
      return { quote, expiresAt: quote.identity.expiresAt };
    });
  };

  useEffect(() => {
    if (
      !activeOutgoingTransfer ||
      ["SETTLED", "FAILED", "REFUNDED", "UNKNOWN_AMBIGUOUS"].includes(
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
            void send<SerializedAccountPortfolio>(
              `/api/accounts/${accountId}/portfolio`,
              {},
              "GET",
            )
              .then((p) => setPortfolio(p))
              .catch(() => {});
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [accountId, activeOutgoingTransfer]);

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
            void send<SerializedAccountPortfolio>(
              `/api/accounts/${accountId}/portfolio`,
              {},
              "GET",
            )
              .then((p) => setPortfolio(p))
              .catch(() => {});
          }
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [accountId, addMoneyIntent]);

  const executeAuthorizedTransfer = async (kind: "SEND" | "CONVERT") => {
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
              idempotencyKey: outgoingIdempotencyKey,
            }
          : {
              sourceDeploymentId: convertSource?.deployment.id,
              destinationDeploymentId: convertDestDeployment.id,
              sourceDisplayAmount: convertAmount,
              idempotencyKey: outgoingIdempotencyKey,
            };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": outgoingIdempotencyKey,
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
            ? "Outgoing execution is currently paused while final release checks finish."
            : msg,
        );
      }
      setActiveOutgoingTransfer(data.transfer);
      setOutgoingProofOpenFor(null);
      setOutgoingIdempotencyKey(crypto.randomUUID());
    } catch (error) {
      setOutgoingError(describe(error));
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
    } catch (error) {
      setMessage(describe(error));
    } finally {
      setTogglingPaymentRequestId(null);
    }
  };

  const renderOutgoingStatusCard = (kind: "SEND" | "CONVERT") => {
    if (!activeOutgoingTransfer || activeOutgoingTransfer.jobKind !== kind) {
      return null;
    }
    const isDone = activeOutgoingTransfer.status === "SETTLED";
    const isBad = ["FAILED", "REFUNDED", "UNKNOWN_AMBIGUOUS"].includes(
      activeOutgoingTransfer.status,
    );
    return (
      <div
        className={`mt-4 rounded-2xl border p-4 space-y-2 text-xs ${
          isDone
            ? "border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/70 dark:bg-emerald-950/30"
            : isBad
              ? "border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30"
              : "border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/25"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-bold text-neutral-950 dark:text-white">
            {kind === "SEND" ? "Transfer Receipt" : "Conversion Receipt"} ·{" "}
            {activeOutgoingTransfer.publicId}
          </span>
          <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {activeOutgoingTransfer.status}
          </span>
        </div>
        <p className="text-neutral-700 dark:text-neutral-300">
          {activeOutgoingTransfer.sourceDisplayAmount}{" "}
          {activeOutgoingTransfer.sourceAssetSymbol} (
          {activeOutgoingTransfer.sourceNetwork}) →{" "}
          {activeOutgoingTransfer.quotedDestinationDisplayAmount ??
            activeOutgoingTransfer.sourceDisplayAmount}{" "}
          {activeOutgoingTransfer.destinationAssetSymbol} (
          {activeOutgoingTransfer.destinationNetwork})
        </p>
        {activeOutgoingTransfer.sourceTxHash && (
          <p className="font-mono text-[11px] break-all text-neutral-600 dark:text-neutral-400">
            Source tx: {activeOutgoingTransfer.sourceTxHash}
          </p>
        )}
        {activeOutgoingTransfer.destinationTxHash && (
          <p className="font-mono text-[11px] break-all text-neutral-600 dark:text-neutral-400">
            Destination tx: {activeOutgoingTransfer.destinationTxHash}
          </p>
        )}
        {activeOutgoingTransfer.errorMessage && (
          <p className="text-[#FF1A1A] font-medium">
            {activeOutgoingTransfer.errorMessage}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] dark:bg-[#0B0B0B] text-neutral-900 dark:text-neutral-100 transition-colors duration-200">
      {/* Floating Top Navigation */}
      <FloatingNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === "receive") setDepositMode("DIRECT");
          setActiveTab(tab);
        }}
        unreadCount={unreadNotifications}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenAssistant={() => setIsAssistantOpen(true)}
        userName={account?.name ?? "Personal"}
        profileId={profileId}
        userEmail={userEmail ?? "opeyemimosesawt@gmail.com"}
      />

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 sm:pt-12 pb-16">
        {/* Global Feedback Alert */}
        {message && (
          <div className="mb-6 p-4 rounded-2xl bg-neutral-900 dark:bg-[#1B1B1E] border border-transparent dark:border-white/10 text-white text-xs flex items-center justify-between shadow-lg animate-in fade-in">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="ml-4 text-neutral-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* ===================================================================
            TAB 1: HOME / DASHBOARD
           =================================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
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
                <span className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-neutral-950 dark:text-white select-none">
                  {hideBalance ? "$••••••" : totalBalanceUsd}
                </span>
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
                <span className="font-medium">P&L unavailable</span>
                <span aria-hidden="true" className="text-neutral-300 dark:text-neutral-700">
                  ·
                </span>
                <button
                  type="button"
                  data-testid="manage-assets-pill"
                  onClick={() => setIsHeldAssetsOpen(true)}
                  className="inline-flex items-center gap-1 font-semibold text-neutral-800 dark:text-neutral-200 hover:text-neutral-950 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <span>
                    {heldAssets.length} asset
                    {heldAssets.length === 1 ? "" : "s"} •{" "}
                    {hideBalance ? "$••••••" : totalBalanceUsd}
                  </span>
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
                    setDepositMode("DEPOSIT");
                    setActiveTab("receive");
                  }}
                  className="flow-liquid-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold cursor-pointer"
                >
                  <span className="text-base font-bold">+</span>
                  <span>Add Money</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("send")}
                  className="flow-liquid-btn inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold text-neutral-900 dark:text-white cursor-pointer"
                >
                  <span>↗</span>
                  <span>Send</span>
                </button>
              </div>
            </section>

            {/* Feature Carousel Banner */}
            <section
              aria-label="Platform highlights"
              className="relative overflow-hidden rounded-[28px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs"
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

              {heldAssets.length === 0 ? (
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
                        setActiveTab("receive");
                      }}
                      className="flow-liquid-btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      <IconPlus size={15} />
                      <span>Add Money</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("request")}
                      className="flow-liquid-btn inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white cursor-pointer"
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
                            : `${item.displayBalance} ${item.deployment.symbol}`}
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
                    onClick={() => setActiveTab("activity")}
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
                              "FLOW_CROSS_CHAIN_SETTLEMENT"
                                ? "Payment settled"
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
                              : `${act.direction === "OUTGOING" ? "−" : "+"}${act.displayAmount} ${act.assetSymbol}`}
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
                        : ledgerMovementLabel(ledgerMovements, "inflow")}
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
                        : ledgerMovementLabel(ledgerMovements, "outflow")}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 dark:border-white/[0.06] flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Net movement
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {hideBalance
                        ? "••••••"
                        : ledgerMovementLabel(ledgerMovements, "net")}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: SEND (Matches FLOW Send_ Solana to Base-6.png & media_1794481849794_6d251fd6.jpg & media_1794490079448_49cd9a38.jpg)
           =================================================================== */}
        {activeTab === "send" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                Send &amp; Convert
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                Review transfer and conversion quotes from NEAR Intents.
              </p>
              <div className="mt-2.5">
                <NearIntentsBadge />
              </div>
            </div>

            {/* Segmented Mode Switcher: Send vs Convert */}
            <div className="flow-nav-glass flex items-center gap-1 p-1 rounded-full w-fit">
              <button
                type="button"
                onClick={() => setSendMode("SEND")}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sendMode === "SEND"
                    ? "flow-nav-active-pill text-neutral-950"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                }`}
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => setSendMode("CONVERT")}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sendMode === "CONVERT"
                    ? "flow-nav-active-pill text-neutral-950"
                    : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                }`}
              >
                Convert
              </button>
            </div>

            <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-5">
              {sendMode === "SEND" ? (
                <>
                  {/* You Send Card */}
                  <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/50 dark:bg-[#1A1A1A] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        You send
                      </label>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <span>
                          Available:{" "}
                          {hideBalance
                            ? "••••••"
                            : (sendSourceBalance ?? "Unavailable")}{" "}
                          {sendSource?.deployment.symbol}
                        </span>
                        <button
                          type="button"
                          disabled={!sendSourceBalance}
                          onClick={() => setSendAmount(sendSourceBalance ?? "")}
                          className="text-xs font-bold text-neutral-950 dark:text-white hover:underline cursor-pointer"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <input
                        type="number"
                        step="any"
                        aria-label="Send amount"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        placeholder="1.00"
                        className="w-full text-2xl font-bold bg-transparent text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-hidden"
                      />
                      <div className="shrink-0 w-60">
                        <CombinedAssetNetworkPicker
                          options={heldAssets.map((asset) => asset.deployment)}
                          selectedId={sendSource?.deployment.id ?? ""}
                          onSelect={(dep) => setSendSourceDeploymentId(dep.id)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recipient Address */}
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
                          "Address on " + sendDestDeployment.networkName
                        }
                        className="w-full pl-4 pr-10 py-3 rounded-2xl text-xs bg-neutral-50/50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-white/[0.08] text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-500 font-mono focus:outline-hidden"
                      />
                      {sendRecipientAddress.trim().length > 0 &&
                        sendAddressValidation.valid && (
                          <span className="absolute right-3.5 text-emerald-500 font-bold text-sm">
                            ✓
                          </span>
                        )}
                    </div>
                    {sendRecipientAddress.trim().length > 0 ? (
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
                    ) : (
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        ⓘ This address will be checked against{" "}
                        {sendDestDeployment.networkName} (
                        {sendDestDeployment.symbol}) to ensure it&apos;s valid.
                      </p>
                    )}
                  </div>

                  {/* Recipient Receives */}
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

                  <OutgoingQuoteDetails
                    preview={sendPreview}
                    symbol={sendDestDeployment.symbol}
                  />

                  {/* Action Buttons */}
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={sendPreview.review}
                      disabled={!sendPreview.canReview || sendPreview.loading}
                      className="flow-liquid-btn w-full py-3.5 rounded-full text-xs font-bold text-neutral-900 dark:text-neutral-100 disabled:opacity-40 cursor-pointer"
                    >
                      {sendPreview.loading
                        ? "Fetching NEAR Intents Quote..."
                        : "Review Quote"}
                    </button>

                    <button
                      type="button"
                      disabled={
                        executionDisabled ||
                        outgoingExecuting ||
                        !sendSource ||
                        !sendAddressValidation.valid ||
                        !positiveQuoteAmount(
                          sendAmount,
                          sendSource.deployment.decimals,
                        )
                      }
                      onClick={() => {
                        setOutgoingError(null);
                        setOutgoingIdempotencyKey(crypto.randomUUID());
                        setOutgoingProofOpenFor("SEND");
                      }}
                      className="flow-liquid-btn-primary w-full py-4 rounded-full text-sm font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {executionDisabled
                        ? "Outgoing Execution Disabled (Preview Only)"
                        : outgoingExecuting
                          ? "Authorizing Send…"
                          : "Send Now"}
                    </button>
                  </div>

                  {outgoingError && outgoingProofOpenFor !== "CONVERT" && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-[#FF1A1A] dark:text-red-400"
                    >
                      {outgoingError}
                    </p>
                  )}

                  {outgoingProofOpenFor === "SEND" && (
                    <div className="mt-3">
                      <FreshProof
                        purpose="transfer-authorize"
                        target={accountId}
                        onConfirm={() => executeAuthorizedTransfer("SEND")}
                        onCancel={() => setOutgoingProofOpenFor(null)}
                      >
                        Verify your identity to authorize sending{" "}
                        {sendAmount || "0"} {sendSource?.deployment.symbol} to{" "}
                        {truncateMiddle(sendRecipientAddress, 8, 6)}.
                      </FreshProof>
                    </div>
                  )}

                  {renderOutgoingStatusCard("SEND")}
                </>
              ) : (
                <>
                  {/* CONVERT MODE (Priority 3) */}
                  <div className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-neutral-50/50 dark:bg-[#1A1A1A] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                        You convert
                      </label>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <span>
                          Available:{" "}
                          {hideBalance
                            ? "••••••"
                            : (convertSourceBalance ?? "Unavailable")}{" "}
                          {convertSource?.deployment.symbol}
                        </span>
                        <button
                          type="button"
                          disabled={!convertSourceBalance}
                          onClick={() =>
                            setConvertAmount(convertSourceBalance ?? "")
                          }
                          className="text-xs font-bold text-neutral-950 dark:text-white hover:underline cursor-pointer"
                        >
                          Max
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <input
                        type="number"
                        step="any"
                        aria-label="Convert amount"
                        value={convertAmount}
                        onChange={(e) => setConvertAmount(e.target.value)}
                        placeholder="1.00"
                        className="w-full text-2xl font-bold bg-transparent text-neutral-950 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:outline-hidden"
                      />
                      <div className="shrink-0">
                        <select
                          value={convertSource?.deployment.id ?? ""}
                          onChange={(e) =>
                            setConvertSourceDeploymentId(e.target.value)
                          }
                          className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white dark:bg-[#141414] border border-neutral-200 dark:border-white/[0.1] text-neutral-900 dark:text-white focus:outline-hidden shadow-2xs cursor-pointer"
                        >
                          {heldAssets.map((h) => (
                            <option
                              key={h.deployment.id}
                              value={h.deployment.id}
                            >
                              {h.deployment.symbol} ({h.deployment.networkName})
                              — {hideBalance ? "••••••" : h.displayBalance}
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
                      selectedId={convertDestDeploymentId}
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

                  {/* Action Buttons for Convert */}
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={convertPreview.review}
                      disabled={
                        !convertPreview.canReview || convertPreview.loading
                      }
                      className="flow-liquid-btn w-full py-3.5 rounded-full text-xs font-bold text-neutral-900 dark:text-neutral-100 disabled:opacity-40 cursor-pointer"
                    >
                      {convertPreview.loading
                        ? "Calculating Convert Quote..."
                        : "Review Quote"}
                    </button>

                    <button
                      type="button"
                      disabled={
                        executionDisabled ||
                        outgoingExecuting ||
                        !convertSource ||
                        convertSource.deployment.id ===
                          convertDestDeployment.id ||
                        !positiveQuoteAmount(
                          convertAmount,
                          convertSource.deployment.decimals,
                        )
                      }
                      onClick={() => {
                        setOutgoingError(null);
                        setOutgoingIdempotencyKey(crypto.randomUUID());
                        setOutgoingProofOpenFor("CONVERT");
                      }}
                      className="flow-liquid-btn-primary w-full py-4 rounded-full text-sm font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {executionDisabled
                        ? "Swap Execution Disabled (Preview Only)"
                        : outgoingExecuting
                          ? "Authorizing Conversion…"
                          : "Convert Now"}
                    </button>
                  </div>

                  {outgoingError && outgoingProofOpenFor !== "SEND" && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-[#FF1A1A] dark:text-red-400"
                    >
                      {outgoingError}
                    </p>
                  )}

                  {outgoingProofOpenFor === "CONVERT" && (
                    <div className="mt-3">
                      <FreshProof
                        purpose="transfer-authorize"
                        target={accountId}
                        onConfirm={() => executeAuthorizedTransfer("CONVERT")}
                        onCancel={() => setOutgoingProofOpenFor(null)}
                      >
                        Verify your identity to convert {convertAmount || "0"}{" "}
                        {convertSource?.deployment.symbol} into{" "}
                        {convertDestDeployment.symbol} on{" "}
                        {convertDestDeployment.networkName}.
                      </FreshProof>
                    </div>
                  )}

                  {renderOutgoingStatusCard("CONVERT")}
                </>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 3: RECEIVE (Add Money - Matches media_1794481849681_4e42b25f.jpg)
           =================================================================== */}
        {activeTab === "receive" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                Receive
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                Bring supported assets from other chains directly into Flow.
              </p>
            </div>

            {/* Segmented Top Selector: Direct receive vs Deposit from another chain */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flow-nav-glass flex items-center gap-1 p-1 rounded-full w-fit">
                <button
                  type="button"
                  onClick={() => setDepositMode("DIRECT")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    depositMode === "DIRECT"
                      ? "flow-nav-active-pill text-neutral-950"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                  }`}
                >
                  Direct receive
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMode("DEPOSIT")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    depositMode === "DEPOSIT"
                      ? "flow-nav-active-pill text-neutral-950"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                  }`}
                >
                  Deposit from another chain
                </button>
              </div>

              <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">
                🔗 Connect a wallet (coming later)
              </span>
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
                    ⓘ Minimums depend on selected asset and route.
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

                  <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/40 text-left text-[11px] text-amber-900 dark:text-amber-200 leading-relaxed">
                    ⚠️ Send only <strong>{depositDeployment.symbol}</strong> on{" "}
                    <strong>{depositDeployment.networkName}</strong> to this
                    address. Sending any other asset or from another network may
                    result in loss.
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
                      <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        Select ▾
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
                      value={crossChainDepositAmount}
                      onChange={(e) =>
                        setCrossChainDepositAmount(e.target.value)
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
                        <span className="absolute right-3.5 text-emerald-500 font-bold text-sm">
                          ✓
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
                    ⓘ Minimums depend on selected asset and route.
                  </div>
                </div>

                {/* Right Column: Dry Quote & Commitment Card */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-white/[0.06]">
                    <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                      Cross-chain deposit quote
                    </h3>
                    <NearIntentsBadge />
                  </div>

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
                          Quoted minimum
                        </dt>
                        <dd className="min-w-0 text-right font-semibold text-neutral-950 dark:text-white">
                          <span className="break-all">
                            {crossChainQuote.minimumRecipientDisplayAmount}
                          </span>{" "}
                          <span className="whitespace-nowrap">NEAR</span>
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">
                        Solver / network fee
                      </dt>
                      <dd className="text-right font-semibold text-neutral-950 dark:text-white">
                        {crossChainQuote?.fees.description ?? "Unavailable"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        Est. Arrival
                      </dt>
                      <dd className="font-semibold text-neutral-950 dark:text-white">
                        {crossChainQuote?.estimatedTimeSeconds == null
                          ? "—"
                          : crossChainQuote.estimatedTimeSeconds + "s"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-neutral-100 dark:border-white/[0.06] pt-3">
                      <dt className="text-neutral-500 dark:text-neutral-400">
                        Route
                      </dt>
                      <dd className="text-right font-semibold text-neutral-950 dark:text-white">
                        {crossChainQuote
                          ? "1Click Cross-Chain Solver"
                          : crossChainQuoteLoading
                            ? "Checking route…"
                            : addMoneyRouteUnavailable ||
                                crossChainQuoteError === "Route unavailable"
                              ? "Route unavailable"
                              : crossChainQuoteError
                                ? "Quote unavailable"
                                : addMoneyKey
                                  ? "Click Review Deposit Quote"
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
                    onClick={handleReviewCrossChainQuote}
                    disabled={!addMoneyKey || crossChainQuoteLoading}
                    className="flow-liquid-btn w-full py-3 rounded-full text-xs font-bold text-neutral-900 dark:text-neutral-100 disabled:opacity-40 cursor-pointer"
                  >
                    {crossChainQuoteLoading
                      ? "Fetching dry quote…"
                      : "Review Deposit Quote"}
                  </button>

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
                              ? "Cross-chain Add Money execution is paused while live release checks finish."
                              : msg,
                          );
                        }
                        setAddMoneyIntent(data.intent);
                      } catch (err) {
                        setAddMoneyError(describe(err));
                      } finally {
                        setAddMoneyCommitting(false);
                      }
                    }}
                    className="flow-liquid-btn-primary w-full py-3.5 rounded-full text-xs font-bold disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {executionDisabled
                      ? "Continue to Deposit (Execution Disabled)"
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

                  {addMoneyIntent && (
                    <div className="mt-2 rounded-2xl border border-neutral-200 dark:border-white/[0.08] bg-neutral-50/70 dark:bg-[#1A1A1A] p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-950 dark:text-white">
                          Deposit {addMoneyIntent.quotedSourceDisplayAmount}{" "}
                          {addMoneyIntent.sourceAssetSymbol}
                        </span>
                        <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
                          {addMoneyIntent.status}
                        </span>
                      </div>

                      {addMoneyIntent.depositAddress &&
                        addMoneyIntent.status === "DEPOSIT_COMMITTED" && (
                          <>
                            <div className="flex justify-center py-2">
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
                                  className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline"
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
                                    className="shrink-0 font-sans font-semibold text-[#FF1A1A] hover:underline"
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

                      {addMoneyIntent.destinationTxHash && (
                        <p className="font-mono text-[11px] break-all text-emerald-700 dark:text-emerald-400">
                          NEAR settlement tx: {addMoneyIntent.destinationTxHash}
                        </p>
                      )}
                      {addMoneyIntent.settlementError && (
                        <p className="text-[#FF1A1A] font-medium">
                          {addMoneyIntent.settlementError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            TAB 4: REQUEST PAYMENT (Matches media_1794481849816_2576ee33.jpg)
           =================================================================== */}
        {activeTab === "request" && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950 dark:text-white">
                Request Payment
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
                Create shareable checkout links with 1Click route previews.
              </p>
            </div>

            {/* Create Payment Link Form */}
            <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-5">
              <h2 className="text-base font-bold text-neutral-950 dark:text-white">
                Create a payment link
              </h2>

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
                      onChange={(e) => setPrAmount(e.target.value)}
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

              <div>
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
                  Settles directly to your {prDestinationDeployment.networkName}{" "}
                  wallet:{" "}
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">
                    {truncateMiddle(prRecipientAddress, 8, 6)}
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  ⓘ Payer source options (tokens and networks) are chosen later
                  at guest checkout.
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
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="truncate">
                    <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                      Payment Link Ready!
                    </p>
                    <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
                      {prSuccessUrl}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyText("prCreated", prSuccessUrl)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors cursor-pointer"
                  >
                    {copiedKey === "prCreated" ? "Copied!" : "Copy Link"}
                  </button>
                </div>
              )}
            </div>

            {/* 2-Column Links: Active Links vs Past Links */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Active Links */}
              <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                      Active Links
                    </h3>
                    <span className="text-xs font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
                      {
                        paymentRequests.filter((r) => r.status === "ACTIVE")
                          .length
                      }
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentLinksModalFilter("ACTIVE")}
                    className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    View all →
                  </button>
                </div>

                <div className="space-y-3">
                  {paymentRequests.filter((r) => r.status === "ACTIVE").length >
                  0 ? (
                    paymentRequests
                      .filter((r) => r.status === "ACTIVE")
                      .map((req) => (
                        <div
                          key={req.id}
                          className="p-3.5 rounded-2xl border border-neutral-200/70 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-[#1A1A1A] flex flex-col gap-2.5"
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
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/50 dark:border-white/[0.06]">
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
                            <button
                              type="button"
                              disabled={togglingPaymentRequestId === req.id}
                              onClick={() =>
                                void handleTogglePaymentRequestStatus(
                                  req,
                                  "DISABLED",
                                )
                              }
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white ml-auto disabled:opacity-40 cursor-pointer"
                            >
                              {togglingPaymentRequestId === req.id
                                ? "Updating…"
                                : "Pause"}
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
                      No active payment links.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Past Links */}
              <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                      Past Links
                    </h3>
                    <span className="text-xs font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
                      {
                        paymentRequests.filter((r) => r.status !== "ACTIVE")
                          .length
                      }
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPaymentLinksModalFilter("PAST")}
                    className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
                  >
                    View all →
                  </button>
                </div>

                <div className="space-y-3">
                  {paymentRequests.filter((r) => r.status !== "ACTIVE").length >
                  0 ? (
                    paymentRequests
                      .filter((r) => r.status !== "ACTIVE")
                      .map((req) => (
                        <div
                          key={req.id}
                          className="p-3.5 rounded-2xl border border-neutral-200/70 dark:border-white/[0.06] bg-neutral-50/50 dark:bg-[#1A1A1A] flex flex-col gap-2.5"
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
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-400 shrink-0">
                              <span className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
                              {req.status === "COMPLETED"
                                ? "Completed"
                                : req.status === "DISABLED"
                                  ? "Paused"
                                  : "Expired"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/50 dark:border-white/[0.06]">
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
                            {req.status === "DISABLED" && (
                              <button
                                type="button"
                                disabled={togglingPaymentRequestId === req.id}
                                onClick={() =>
                                  void handleTogglePaymentRequestStatus(
                                    req,
                                    "ACTIVE",
                                  )
                                }
                                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#FF1A1A] hover:underline ml-auto disabled:opacity-40 cursor-pointer"
                              >
                                {togglingPaymentRequestId === req.id
                                  ? "Updating…"
                                  : "Resume"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="py-6 text-center text-xs text-neutral-400 dark:text-neutral-500">
                      No past payment links.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: ACTIVITY
           =================================================================== */}
        {activeTab === "activity" && (
          <div className="max-w-4xl mx-auto space-y-6">
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
            <div className="flow-nav-glass flex items-center gap-1 p-1 rounded-full w-fit">
              {(["ALL", "INCOMING", "OUTGOING"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActivityFilter(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    activityFilter === cat
                      ? "flow-nav-active-pill text-neutral-950"
                      : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                  }`}
                >
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

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
                              ? "Controlled Rehearsal"
                              : act.activityType ===
                                  "FLOW_CROSS_CHAIN_SETTLEMENT"
                                ? "Payment Settled"
                                : act.activityType}
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
                            : `${act.direction === "INCOMING" ? "+" : "-"}${act.displayAmount}`}{" "}
                          {act.assetSymbol}
                        </div>
                        <a
                          href={act.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-neutral-400 dark:text-neutral-500 hover:text-neutral-950 dark:hover:text-white"
                        >
                          View tx ↗
                        </a>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400 dark:text-neutral-500">
                  No activity found for this account.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Held Assets Modal */}
      <AssetsHeldModal
        isOpen={isHeldAssetsOpen}
        onClose={() => setIsHeldAssetsOpen(false)}
        heldAssets={heldAssets}
        totalBalanceUsd={totalBalanceUsd}
        hideBalance={hideBalance}
        onSelectAction={(action, deployment) => {
          setIsHeldAssetsOpen(false);
          if (action === "receive") {
            setDepositDeployment(deployment);
            setDepositMode("DIRECT");
            setActiveTab("receive");
          }
          if (action === "send") {
            setSendSourceDeploymentId(deployment.id);
            setActiveTab("send");
          }
          if (action === "swap_near") {
            setConvertSourceDeploymentId(deployment.id);
            setConvertDestDeploymentId("near-mainnet:NEAR");
            setSendMode("CONVERT");
            setActiveTab("send");
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
      />

      {/* Flow AI Assistant Drawer */}
      <FlowAIAssistantDrawer
        isOpen={isAssistantOpen}
        onClose={() => setIsAssistantOpen(false)}
        accountId={accountId}
        onNavigateToTab={(tab) => {
          setIsAssistantOpen(false);
          setActiveTab(tab);
        }}
        onCreatePaymentLinkDraft={(draft) => {
          if (draft.title) setPrTitle(draft.title);
          if (draft.amount) setPrAmount(draft.amount);
          if (draft.network || draft.assetSymbol) {
            const dep = MAINNET_SUPPORTED_DEPLOYMENTS.find(
              (d) =>
                (!draft.network ||
                  canonicalizeNetworkId(d.networkKey) ===
                    canonicalizeNetworkId(draft.network)) &&
                (!draft.assetSymbol ||
                  d.symbol.toUpperCase() === draft.assetSymbol.toUpperCase()),
            );
            if (dep) setPrDestinationDeployment(dep);
          }
          setIsAssistantOpen(false);
          setActiveTab("request");
        }}
      />

      {/* Unified Asset Selector Modal for Cross-Chain Deposit */}
      <UnifiedAssetSelectorModal
        isOpen={isCrossChainTokenSelectorOpen}
        onClose={() => setIsCrossChainTokenSelectorOpen(false)}
        filterCapability="DISCOVERABLE_BY_PROVIDER"
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
