"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { UnifiedAssetSelectorModal } from "../../../../components/unified-asset-selector-modal.tsx";
import type { DiscoveredToken } from "../../../../server/providers/near-intents-discovery.ts";
import { QrCode } from "../../../../components/qr-code.tsx";
import {
  AssetAvatar,
  ChainBadge,
  IconCheck,
  IconCopy,
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
import { describe, send } from "../../../controls.tsx";

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
      className="rounded-2xl border border-neutral-200/60 bg-neutral-50/60 p-4 text-left"
      role="status"
    >
      {quote ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-neutral-500">Estimated to receive</p>
            <p className="mt-1 font-bold">
              {quote.recipientDisplayAmount} {symbol}
            </p>
            {quote.minimumRecipientDisplayAmount && (
              <p className="mt-1 text-neutral-600">
                Quoted minimum {quote.minimumRecipientDisplayAmount} {symbol}
              </p>
            )}
          </div>
          <div>
            <p className="text-neutral-500">Provider fees</p>
            <p className="mt-1">{quote.fees.description}</p>
          </div>
          <div>
            <p className="text-neutral-500">Exchange rate</p>
            <p className="mt-1 font-semibold">{quote.rateDescription}</p>
            {quote.estimatedTimeSeconds !== null && (
              <p className="mt-1 text-neutral-600">
                Provider estimate {quote.estimatedTimeSeconds} seconds
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-neutral-600">
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
}: {
  accountId: string;
  initialPortfolio: SerializedAccountPortfolio;
  account?: WorkspaceAccountSummary;
  allAccounts?: ReadonlyArray<WorkspaceAccountSummary>;
  initialView?: WorkspaceTab;
  userEmail?: string;
  profileId?: string;
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

  // Hide balance toggle
  const [hideBalance, setHideBalance] = useState(false);

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

  // Add Money state (Matches media_1794490079680_0a50f095.jpg)
  const [depositMode, setDepositMode] = useState<"DIRECT" | "DEPOSIT">(
    "DIRECT",
  );
  const [depositDeployment, setDepositDeployment] =
    useState<CatalogTokenDeployment>(
      MAINNET_SUPPORTED_DEPLOYMENTS.find((d) => d.id === "base-mainnet:USDC") ??
        MAINNET_SUPPORTED_DEPLOYMENTS[0]!,
    );
  const [isReceiveAssetSelectorOpen, setIsReceiveAssetSelectorOpen] =
    useState(false);
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

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-neutral-900 transition-colors duration-200">
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
      <main className="mx-auto max-w-6xl px-4 sm:px-6 pt-24 pb-16">
        {/* Global Feedback Alert */}
        {message && (
          <div className="mb-6 p-4 rounded-2xl bg-neutral-900 text-white text-xs flex items-center justify-between shadow-lg animate-in fade-in">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="ml-4 text-neutral-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* ===================================================================
            TAB 1: HOME / DASHBOARD (Matches FLOW Dashboard Overview-2.png)
           =================================================================== */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Dashboard Welcome Header & Security Badge */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1 pb-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#FF1A1A]">
                  {isBusiness ? "BUSINESS WORKSPACE" : "YOUR FLOW"}
                </p>
                <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-neutral-950">
                  Welcome back.
                </h1>
                <p className="text-xs text-neutral-500">
                  Move money, get paid, and manage your assets — all in one
                  place.{" "}
                  {account?.name && (
                    <span className="font-semibold text-neutral-900">
                      ({account.name} · {account.role.toLowerCase()})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canManageTeam && (
                  <Link
                    prefetch={false}
                    href={`/accounts/${accountId}/team`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-950 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 transition-colors"
                  >
                    Manage team
                  </Link>
                )}
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      (account?.walletStatus ?? "setup_pending") === "active" ||
                      portfolio.wallet
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`}
                  />
                  <span>
                    {(account?.walletStatus ?? "setup_pending") === "active" ||
                    portfolio.wallet
                      ? "Wallet provisioned (execution disabled)"
                      : "Wallet setup pending"}
                  </span>
                </span>
              </div>
            </div>

            {/* Centered Hero Total Balance */}
            <section
              aria-label="Account balance overview"
              className="text-center pt-2 pb-2"
            >
              <div className="inline-flex items-center justify-center gap-3">
                <span className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-neutral-950 select-none">
                  {hideBalance ? "$••••••" : totalBalanceUsd}
                </span>
                <button
                  type="button"
                  onClick={() => setHideBalance((prev) => !prev)}
                  aria-label={hideBalance ? "Show balance" : "Hide balance"}
                  className="p-2 rounded-full text-neutral-400 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
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

              {/* Sub-balance Badges & Holdings Pill */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  P&L unavailable
                </span>

                <button
                  type="button"
                  data-testid="manage-assets-pill"
                  onClick={() => setIsHeldAssetsOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white text-neutral-800 border border-neutral-200/80 shadow-2xs hover:border-neutral-300 transition-all hover:scale-[1.02]"
                >
                  <span>
                    {heldAssets.length} asset
                    {heldAssets.length === 1 ? "" : "s"} • {totalBalanceUsd}
                  </span>
                  <span className="text-neutral-400">&gt;</span>
                </button>

                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || cooldown > 0}
                  aria-label="Refresh on-chain balance"
                  className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-950 transition-colors disabled:opacity-40"
                >
                  <IconRefresh
                    size={14}
                    className={refreshing ? "animate-spin" : ""}
                  />
                </button>
              </div>

              {/* Primary Action Buttons (+ Add Money, Send) */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDepositMode("DEPOSIT");
                    setActiveTab("receive");
                  }}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold bg-neutral-950 text-white shadow-md hover:bg-neutral-800 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="text-base font-bold">+</span>
                  <span>Add Money</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("send")}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full text-sm font-semibold bg-white text-neutral-900 border border-neutral-200/90 shadow-xs hover:bg-neutral-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span>↗</span>
                  <span>Send</span>
                </button>
              </div>
            </section>

            {/* Feature Carousel Banner (Matches FLOW Dashboard Overview-2.png) */}
            <section
              aria-label="Platform highlights"
              className="relative overflow-hidden rounded-[28px] border border-neutral-200/80 bg-white p-6 sm:p-7 shadow-xs"
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-neutral-100 text-neutral-600">
                    {currentSlide.badge}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
                    {currentSlide.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
                    {currentSlide.description}
                  </p>
                </div>

                {/* Stacked Cards Illustration */}
                <div className="relative shrink-0 w-36 h-24 hidden sm:flex items-center justify-center">
                  <div className="absolute w-28 h-16 rounded-xl bg-gradient-to-tr from-neutral-200 to-neutral-300 transform -rotate-6 shadow-sm border border-neutral-300/60" />
                  <div className="absolute w-28 h-16 rounded-xl bg-gradient-to-tr from-neutral-800 to-neutral-950 text-white p-2.5 transform rotate-3 shadow-md flex flex-col justify-between">
                    <span className="text-[9px] font-mono tracking-wider text-neutral-400">
                      FLOW CARD
                    </span>
                  </div>
                </div>
              </div>

              {/* Dots and Navigation Arrows */}
              <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {carouselSlides.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCarouselIndex(i)}
                      aria-label={`Slide ${i + 1}`}
                      className={`h-2 rounded-full transition-all ${
                        carouselIndex === i
                          ? "w-6 bg-neutral-950"
                          : "w-2 bg-neutral-200 hover:bg-neutral-300"
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
                    className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
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
                    className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
                  >
                    →
                  </button>
                </div>
              </div>
            </section>

            {/* Assets Held Card (Matches FLOW Dashboard Overview-2.png) */}
            <section
              aria-label="Assets held"
              className="rounded-[28px] border border-neutral-200/80 bg-white p-6 shadow-xs space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <h3 className="text-sm font-bold text-neutral-950">
                  Assets held
                </h3>
                <span className="text-xs text-neutral-500">
                  {heldAssets.length} asset
                  {heldAssets.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="space-y-3">
                {heldAssets.map((item) => (
                  <div
                    key={item.deployment.id}
                    onClick={() => setIsHeldAssetsOpen(true)}
                    className="flex items-center justify-between p-3 rounded-2xl hover:bg-neutral-50/80 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <AssetAvatar
                          symbol={item.deployment.symbol}
                          size={36}
                        />
                        <span className="absolute -bottom-1 -right-1">
                          <ChainBadge
                            chainKey={item.deployment.networkKey}
                            size={14}
                          />
                        </span>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-neutral-950">
                          {item.deployment.symbol}
                        </div>
                        <div className="text-xs text-neutral-500">
                          on {item.deployment.networkName}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold text-neutral-950">
                        {item.displayBalance} {item.deployment.symbol}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {item.usdValue}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 2-Column Bottom Grid: Recent Activity & Monthly Stats */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left: Recent Activity Card */}
              <section
                aria-label="Recent activity"
                className="md:col-span-7 rounded-[28px] border border-neutral-200/80 bg-white p-6 shadow-xs space-y-4"
              >
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                  <h3 className="text-sm font-bold text-neutral-950">
                    Recent activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("activity")}
                    className="text-xs font-semibold text-neutral-600 hover:text-neutral-950"
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
                          <div className="h-9 w-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                            {act.direction === "OUTGOING" ? "↑" : "↓"}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-neutral-950">
                              {act.activityType ===
                              "FLOW_CROSS_CHAIN_SETTLEMENT"
                                ? "Payment settled"
                                : act.direction === "OUTGOING"
                                  ? "Transfer sent"
                                  : "Transfer received"}
                            </div>
                            <div className="text-[10px] text-neutral-500">
                              {formatTimestamp(
                                act.blockTimestamp || act.observedAt,
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-bold text-emerald-600">
                            {act.direction === "OUTGOING" ? "−" : "+"}
                            {act.displayAmount} {act.assetSymbol}
                          </span>
                          <div className="text-[10px] text-emerald-700 font-semibold">
                            {act.reorgStatus === "CANONICAL"
                              ? act.finality
                              : act.reorgStatus}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-neutral-600">
                      No activity to display.
                    </p>
                  )}
                </div>
              </section>

              {/* Right: This Month Stat Card */}
              <section
                aria-label="Monthly statistics"
                className="md:col-span-5 rounded-[28px] border border-neutral-200/80 bg-white p-6 shadow-xs space-y-4"
              >
                <div className="pb-2 border-b border-neutral-100">
                  <h3 className="text-sm font-bold text-neutral-950">
                    This month
                  </h3>
                  <p className="mt-1 text-[11px] text-neutral-500">
                    Posted payment ledger · UTC
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                        ↓
                      </div>
                      <span className="text-xs text-neutral-600">Inflow</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600">
                      {ledgerMovementLabel(ledgerMovements, "inflow")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-xs font-bold">
                        ↑
                      </div>
                      <span className="text-xs text-neutral-600">Outflow</span>
                    </div>
                    <span className="text-sm font-bold text-neutral-950">
                      {ledgerMovementLabel(ledgerMovements, "outflow")}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-neutral-100 flex items-center justify-between">
                    <span className="text-xs font-medium text-neutral-500">
                      Net movement
                    </span>
                    <span className="text-sm font-bold text-emerald-600">
                      {ledgerMovementLabel(ledgerMovements, "net")}
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
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950">
                Send &amp; Convert
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600">
                Review transfer and conversion quotes from NEAR Intents.
              </p>
              <div className="mt-2.5">
                <NearIntentsBadge />
              </div>
            </div>

            {/* Segmented Mode Switcher: Send vs Convert (Priority 3) */}
            <div className="flex items-center gap-1.5 p-1 rounded-full bg-neutral-100 border border-neutral-200/60 w-fit">
              <button
                type="button"
                onClick={() => setSendMode("SEND")}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sendMode === "SEND"
                    ? "bg-neutral-950 text-white shadow-xs"
                    : "text-neutral-600 hover:text-neutral-950"
                }`}
              >
                Send
              </button>
              <button
                type="button"
                onClick={() => setSendMode("CONVERT")}
                className={`px-5 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  sendMode === "CONVERT"
                    ? "bg-neutral-950 text-white shadow-xs"
                    : "text-neutral-600 hover:text-neutral-950"
                }`}
              >
                Convert
              </button>
            </div>

            <div className="rounded-[28px] border border-neutral-200/90 bg-white p-6 sm:p-7 shadow-xs space-y-5">
              {sendMode === "SEND" ? (
                <>
                  {/* You Send Card */}
                  <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-800">
                        You send
                      </label>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <span>
                          Available: {sendSourceBalance ?? "Unavailable"}{" "}
                          {sendSource?.deployment.symbol}
                        </span>
                        <button
                          type="button"
                          disabled={!sendSourceBalance}
                          onClick={() => setSendAmount(sendSourceBalance ?? "")}
                          className="text-xs font-bold text-neutral-950 hover:underline cursor-pointer"
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
                        className="w-full text-2xl font-bold bg-transparent text-neutral-950 focus:outline-hidden"
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
                      className="block text-xs font-semibold text-neutral-800"
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
                        className="w-full pl-4 pr-10 py-3 rounded-2xl text-xs bg-neutral-50/50 border border-neutral-200 text-neutral-950 font-mono focus:outline-hidden"
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
                            ? "text-emerald-600"
                            : "text-[#FF1A1A]"
                        }`}
                      >
                        {sendAddressValidation.valid
                          ? `Valid ${sendDestDeployment.networkName} address format.`
                          : sendAddressValidation.reason}
                      </p>
                    ) : (
                      <p className="text-[11px] text-neutral-500">
                        ⓘ This address will be checked against{" "}
                        {sendDestDeployment.networkName} (
                        {sendDestDeployment.symbol}) to ensure it&apos;s valid.
                      </p>
                    )}
                  </div>

                  {/* Recipient Receives */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-800">
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
                      className="w-full py-4 rounded-full text-sm font-bold bg-neutral-950 text-white shadow-md hover:bg-neutral-800 transition-all hover:scale-[1.005] active:scale-[0.995] disabled:opacity-40 cursor-pointer"
                    >
                      {sendPreview.loading
                        ? "Fetching NEAR Intents Quote..."
                        : "Review Quote"}
                    </button>

                    <button
                      type="button"
                      disabled
                      className="w-full py-3 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 cursor-not-allowed"
                    >
                      Outgoing Execution Disabled (Safety Gate Active)
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* CONVERT MODE (Priority 3) */}
                  <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-800">
                        You convert
                      </label>
                      <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                        <span>
                          Available: {convertSourceBalance ?? "Unavailable"}{" "}
                          {convertSource?.deployment.symbol}
                        </span>
                        <button
                          type="button"
                          disabled={!convertSourceBalance}
                          onClick={() =>
                            setConvertAmount(convertSourceBalance ?? "")
                          }
                          className="text-xs font-bold text-neutral-950 hover:underline cursor-pointer"
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
                        className="w-full text-2xl font-bold bg-transparent text-neutral-950 focus:outline-hidden"
                      />
                      <div className="shrink-0">
                        <select
                          value={convertSource?.deployment.id ?? ""}
                          onChange={(e) =>
                            setConvertSourceDeploymentId(e.target.value)
                          }
                          className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-white border border-neutral-200 text-neutral-900 focus:outline-hidden shadow-2xs cursor-pointer"
                        >
                          {heldAssets.map((h) => (
                            <option
                              key={h.deployment.id}
                              value={h.deployment.id}
                            >
                              {h.deployment.symbol} ({h.deployment.networkName})
                              — {h.displayBalance}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* You Receive (Convert Destination) */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-neutral-800">
                      You receive
                    </label>
                    <CombinedAssetNetworkPicker
                      selectedId={convertDestDeploymentId}
                      onSelect={(dep) => setConvertDestDeploymentId(dep.id)}
                    />
                    <p className="text-[11px] text-neutral-500 pt-1 font-mono">
                      ⓘ Auto-deposits into your registered{" "}
                      {convertDestDeployment.networkName} wallet:{" "}
                      <span className="font-bold text-neutral-800">
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
                      className="w-full py-4 rounded-full text-sm font-bold bg-neutral-950 text-white shadow-md hover:bg-neutral-800 transition-all hover:scale-[1.005] active:scale-[0.995] disabled:opacity-40 cursor-pointer"
                    >
                      {convertPreview.loading
                        ? "Calculating Convert Quote..."
                        : "Review Quote"}
                    </button>

                    <button
                      type="button"
                      disabled
                      className="w-full py-3 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-colors"
                    >
                      Swap Execution Disabled (Safety Gate Active)
                    </button>
                  </div>
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
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950">
                Receive
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600">
                Bring supported assets from other chains directly into Flow.
              </p>
            </div>

            {/* Segmented Top Selector: Direct receive vs Deposit from another chain */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 p-1 rounded-full bg-neutral-100 border border-neutral-200/60 w-fit">
                <button
                  type="button"
                  onClick={() => setDepositMode("DIRECT")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    depositMode === "DIRECT"
                      ? "bg-neutral-950 text-white shadow-xs"
                      : "text-neutral-600 hover:text-neutral-950"
                  }`}
                >
                  Direct receive
                </button>
                <button
                  type="button"
                  onClick={() => setDepositMode("DEPOSIT")}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    depositMode === "DEPOSIT"
                      ? "bg-neutral-950 text-white shadow-xs"
                      : "text-neutral-600 hover:text-neutral-950"
                  }`}
                >
                  Deposit from another chain
                </button>
              </div>

              <span className="text-xs font-medium text-neutral-400">
                🔗 Connect a wallet (coming later)
              </span>
            </div>

            {depositMode === "DIRECT" ? (
              /* 2-Column Direct Receive Layout (Matches media_1794490079680_0a50f095.jpg) */
              <div className="grid grid-cols-1 md:grid-cols-12 gap-7 items-start">
                {/* Left Column: Unified Picker + Supported Assets Row */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-2">
                      Select asset
                    </label>
                    <CombinedAssetNetworkPicker
                      options={receiveOptions}
                      selectedId={depositDeployment.id}
                      onSelect={(dep) => setDepositDeployment(dep)}
                    />
                  </div>

                  {/* Supported Assets Row of Pills */}
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-neutral-800 mb-2.5">
                      Supported assets
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { sym: "USDC", net: "base-mainnet", label: "USDC" },
                        { sym: "USDT", net: "ethereum-mainnet", label: "USDT" },
                        { sym: "ETH", net: "ethereum-mainnet", label: "ETH" },
                      ].map((pill) => {
                        const dep = receiveOptions.find(
                          (d) =>
                            d.symbol === pill.sym && d.networkKey === pill.net,
                        );
                        if (!dep) return null;
                        const isSelected = depositDeployment.id === dep.id;
                        return (
                          <button
                            key={pill.sym + pill.net}
                            type="button"
                            onClick={() => {
                              if (dep) setDepositDeployment(dep);
                            }}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? "border-neutral-950 bg-neutral-100 text-neutral-950 shadow-2xs"
                                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                            }`}
                          >
                            <AssetAvatar symbol={pill.sym} size={18} />
                            <span>{pill.label}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setIsReceiveAssetSelectorOpen(true)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-600 hover:border-neutral-400 hover:text-neutral-950 transition-colors cursor-pointer"
                      >
                        <span>+</span>
                        <span>More</span>
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 text-[11px] text-neutral-500">
                    ⓘ Minimums depend on selected asset and route.
                  </div>
                </div>

                {/* Right Column: Permanent Deposit Address Card with QR Code */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs text-center space-y-4">
                  <h3 className="text-sm font-bold text-neutral-950">
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
                    <span className="text-[11px] font-semibold text-neutral-500">
                      Your permanent deposit address
                    </span>
                    <div className="mt-1 font-mono text-xs font-bold text-neutral-950 break-all bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/80 flex items-center justify-between gap-2">
                      <span className="truncate">{activeDepositAddress}</span>
                      <button
                        type="button"
                        disabled={!activeDepositAddress}
                        onClick={() =>
                          copyText("depositAddr", activeDepositAddress)
                        }
                        aria-label="Copy deposit address"
                        className="shrink-0 p-1 rounded-lg text-neutral-500 hover:text-neutral-950 hover:bg-neutral-200 transition-colors cursor-pointer"
                      >
                        {copiedKey === "depositAddr" ? (
                          <IconCheck size={14} className="text-emerald-600" />
                        ) : (
                          <IconCopy size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/70 text-left text-[11px] text-amber-900 leading-relaxed">
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
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-2">
                      Deposit source token &amp; network
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsCrossChainTokenSelectorOpen(true)}
                      className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-neutral-200/90 bg-neutral-50/50 hover:bg-neutral-100/70 transition-colors cursor-pointer text-left"
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
                            <div className="text-xs font-bold text-neutral-950">
                              {crossChainSourceToken.name} (
                              {crossChainSourceToken.symbol})
                            </div>
                            <div className="text-[11px] text-neutral-500">
                              on {crossChainSourceToken.networkName}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium">
                          <IconSearch size={16} className="text-neutral-400" />
                          <span>
                            Select any asset &amp; chain (e.g. SOL, ETH,
                            AVAX)...
                          </span>
                        </div>
                      )}
                      <span className="text-xs font-semibold text-neutral-500">
                        Select ▾
                      </span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
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
                      className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono font-bold bg-neutral-50/50 border border-neutral-200 text-neutral-950 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-neutral-800">
                        Payer refund address
                      </label>
                      <span className="text-[10px] text-neutral-400 font-medium">
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
                        className="w-full pl-4 pr-10 py-2.5 rounded-2xl text-xs bg-neutral-50/50 border border-neutral-200 text-neutral-950 font-mono focus:outline-hidden"
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
                            ? "text-emerald-600"
                            : "text-[#FF1A1A]"
                        }`}
                      >
                        {crossChainRefundValidation.reason}
                      </p>
                    )}
                  </div>

                  {/* Destination Info Box */}
                  <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-800">
                        Settles into native NEAR
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                        NEAR Mainnet
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <ChainBadge chainKey="near-mainnet" size={20} />
                      <span className="font-mono text-xs font-bold text-neutral-950 truncate">
                        {truncateMiddle(nearAddr, 10, 8) ||
                          "NEAR wallet address unavailable"}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 pt-0.5">
                      Directly arrives in your registered FLOW NEAR wallet.
                    </p>
                  </div>

                  <div className="pt-1 text-[11px] text-neutral-500">
                    ⓘ Minimums depend on selected asset and route.
                  </div>
                </div>

                {/* Right Column: Dry Quote & Commitment Card */}
                <div className="md:col-span-6 rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <h3 className="text-sm font-bold text-neutral-950">
                      Cross-chain deposit quote
                    </h3>
                    <NearIntentsBadge />
                  </div>

                  <dl className="space-y-3.5 py-1 text-xs">
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500">You send</dt>
                      <dd className="min-w-0 break-all text-right font-semibold">
                        {crossChainQuote
                          ? crossChainQuote.sourceDisplayAmount +
                            " " +
                            crossChainSourceToken?.symbol
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500">
                        Estimated native NEAR
                      </dt>
                      <dd className="min-w-0 text-right font-semibold text-emerald-700">
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
                        <dt className="text-neutral-500">Quoted minimum</dt>
                        <dd className="min-w-0 text-right font-semibold">
                          <span className="break-all">
                            {crossChainQuote.minimumRecipientDisplayAmount}
                          </span>{" "}
                          <span className="whitespace-nowrap">NEAR</span>
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4">
                      <dt className="shrink-0 text-neutral-500">
                        Solver / network fee
                      </dt>
                      <dd className="text-right font-semibold">
                        {crossChainQuote?.fees.description ?? "Unavailable"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-neutral-500">Est. Arrival</dt>
                      <dd className="font-semibold">
                        {crossChainQuote?.estimatedTimeSeconds == null
                          ? "—"
                          : crossChainQuote.estimatedTimeSeconds + "s"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-neutral-100 pt-3">
                      <dt className="text-neutral-500">Route</dt>
                      <dd className="text-right font-semibold">
                        {crossChainQuote
                          ? "1Click Cross-Chain Solver"
                          : crossChainQuoteLoading
                            ? "Checking route…"
                            : addMoneyRouteUnavailable ||
                                crossChainQuoteError === "Route unavailable"
                              ? "Route unavailable"
                              : "Quote unavailable"}
                      </dd>
                    </div>
                  </dl>
                  {crossChainQuoteError &&
                    crossChainQuoteError !== "Route unavailable" && (
                      <p role="status" className="text-xs text-neutral-600">
                        {crossChainQuoteError}
                      </p>
                    )}

                  <button
                    type="button"
                    onClick={handleReviewCrossChainQuote}
                    disabled={!addMoneyKey || crossChainQuoteLoading}
                    className="w-full py-3.5 rounded-full text-xs font-bold bg-neutral-950 text-white shadow-md hover:bg-neutral-800 transition-all disabled:opacity-40 cursor-pointer"
                  >
                    {crossChainQuoteLoading
                      ? "Fetching dry quote…"
                      : "Review Deposit Quote"}
                  </button>
                  <p className="text-xs text-neutral-600">
                    Deposit execution is disabled.
                  </p>
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
              <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950">
                Request Payment
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-600">
                Create shareable checkout links with 1Click route previews.
              </p>
            </div>

            {/* Create Payment Link Form */}
            <div className="rounded-[28px] border border-neutral-200/90 bg-white p-6 sm:p-7 shadow-xs space-y-5">
              <h2 className="text-base font-bold text-neutral-950">
                Create a payment link
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-8">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Title
                  </label>
                  <input
                    type="text"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="e.g., Project design deposit"
                    className="w-full px-4 py-2.5 rounded-2xl text-xs bg-neutral-50/50 border border-neutral-200 text-neutral-950 focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-4">
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
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
                      className="w-full px-4 py-2.5 rounded-2xl text-xs font-mono font-bold bg-neutral-50/50 border border-neutral-200 text-neutral-950 focus:outline-hidden disabled:opacity-40"
                    />
                    <select
                      value={prAmountMode}
                      onChange={(e) =>
                        setPrAmountMode(e.target.value as "FIXED" | "OPTIONAL")
                      }
                      className="px-3 py-2 rounded-2xl text-xs font-semibold bg-neutral-100 border border-neutral-200 text-neutral-900 focus:outline-hidden cursor-pointer"
                    >
                      <option value="FIXED">Fixed</option>
                      <option value="OPTIONAL">Open</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={prDescription}
                  onChange={(e) => setPrDescription(e.target.value)}
                  placeholder="Add details for the payer (e.g., scope, timeline, invoice #)"
                  className="w-full px-4 py-2.5 rounded-2xl text-xs bg-neutral-50/50 border border-neutral-200 text-neutral-950 focus:outline-hidden"
                />
              </div>

              {/* Recipient Receives: Unified Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-neutral-800">
                  Recipient receives
                </label>
                <CombinedAssetNetworkPicker
                  selectedId={prDestinationDeployment.id}
                  onSelect={(dep) => setPrDestinationDeployment(dep)}
                />
                <p className="text-[11px] text-neutral-500 font-mono">
                  Settles directly to your {prDestinationDeployment.networkName}{" "}
                  wallet:{" "}
                  <span className="font-bold text-neutral-800">
                    {truncateMiddle(prRecipientAddress, 8, 6)}
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                <p className="text-[11px] text-neutral-500">
                  ⓘ Payer source options (tokens and networks) are chosen later
                  at guest checkout.
                </p>

                <button
                  type="button"
                  onClick={handleCreatePaymentRequest}
                  disabled={prCreating || !prTitle}
                  className="px-6 py-3 rounded-full text-xs font-semibold bg-neutral-950 text-white shadow-xs hover:bg-neutral-800 transition-all disabled:opacity-40 cursor-pointer shrink-0"
                >
                  {prCreating ? "Creating Link..." : "Create Payment Link"}
                </button>
              </div>

              {prSuccessUrl && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 animate-in fade-in">
                  <div className="truncate">
                    <p className="text-xs font-bold text-emerald-800">
                      Payment Link Ready!
                    </p>
                    <p className="text-[11px] font-mono text-emerald-600 truncate mt-0.5">
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

            {/* 2-Column Links: Active Links vs Past Links (Matches media_1794481849816_2576ee33.jpg) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Active Links */}
              <div className="rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-950">
                      Active Links
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600">
                      {
                        paymentRequests.filter((r) => r.status === "ACTIVE")
                          .length
                      }
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-neutral-600 hover:text-neutral-950"
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
                          className="p-3.5 rounded-2xl border border-neutral-200/70 bg-neutral-50/50 flex flex-col gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-neutral-950">
                                {req.title}
                              </div>
                              <div className="text-[11px] text-neutral-500">
                                {req.amountMode === "FIXED"
                                  ? `${req.displayAmount} ${req.destinationAssetSymbol} • ${req.destinationNetwork}`
                                  : `Open amount • ${req.destinationNetwork}`}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                              ● Active
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/50">
                            <Link
                              href={`/pay/${req.publicId}`}
                              target="_blank"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-neutral-200 text-neutral-800 hover:bg-neutral-100"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              onClick={() => copyText(req.id, req.shareUrl)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-neutral-200 text-neutral-800 hover:bg-neutral-100 cursor-pointer"
                            >
                              {copiedKey === req.id ? "Copied!" : "Copy Link"}
                            </button>
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-neutral-500 hover:text-neutral-950 ml-auto"
                            >
                              Pause
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="py-6 text-center text-xs text-neutral-400">
                      No active payment links.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Past Links */}
              <div className="rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-950">
                      Past Links
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-600">
                      {
                        paymentRequests.filter((r) => r.status !== "ACTIVE")
                          .length
                      }
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-neutral-600 hover:text-neutral-950"
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
                          className="p-3.5 rounded-2xl border border-neutral-200/70 bg-neutral-50/50 flex flex-col gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-neutral-950">
                                {req.title}
                              </div>
                              <div className="text-[11px] text-neutral-500">
                                {req.amountMode === "FIXED"
                                  ? `${req.displayAmount} ${req.destinationAssetSymbol} • ${req.destinationNetwork}`
                                  : `Open amount • ${req.destinationNetwork}`}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-neutral-200 text-neutral-700">
                              ●{" "}
                              {req.status === "COMPLETED"
                                ? "Completed"
                                : "Expired"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pt-1 border-t border-neutral-200/50">
                            <Link
                              href={`/pay/${req.publicId}`}
                              target="_blank"
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-neutral-200 text-neutral-800 hover:bg-neutral-100"
                            >
                              View
                            </Link>
                            <button
                              type="button"
                              onClick={() => copyText(req.id, req.shareUrl)}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-neutral-200 text-neutral-800 hover:bg-neutral-100 cursor-pointer"
                            >
                              {copiedKey === req.id ? "Copied!" : "Copy Link"}
                            </button>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="py-6 text-center text-xs text-neutral-400">
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
                <h1 className="font-serif text-3xl sm:text-4xl font-normal tracking-tight text-neutral-950">
                  Activity
                </h1>
                <p className="mt-1 text-xs sm:text-sm text-neutral-600">
                  Real-time ledger events, cross-chain settlements, and
                  transfers
                </p>
              </div>

              <button
                type="button"
                onClick={handleSyncActivities}
                disabled={activityLoading}
                className="px-4 py-2 rounded-full text-xs font-semibold bg-neutral-950 text-white hover:bg-neutral-800 transition-colors shrink-0"
              >
                {activityLoading ? "Syncing..." : "Sync Activity"}
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2">
              {(["ALL", "INCOMING", "OUTGOING"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActivityFilter(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    activityFilter === cat
                      ? "bg-neutral-950 text-white shadow-2xs"
                      : "bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200/80"
                  }`}
                >
                  {cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              ))}
            </div>

            {/* Activity List */}
            <div className="rounded-[28px] border border-neutral-200/90 bg-white p-6 shadow-xs space-y-3">
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
                      className="p-3 rounded-2xl border border-neutral-100 hover:bg-neutral-50/60 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs ${
                            act.direction === "INCOMING"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-rose-50 text-rose-600"
                          }`}
                        >
                          {act.direction === "INCOMING" ? "↓" : "↑"}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-neutral-950">
                            {act.activityType === "FLOW_PAYMENT"
                              ? "Controlled Rehearsal"
                              : act.activityType ===
                                  "FLOW_CROSS_CHAIN_SETTLEMENT"
                                ? "Payment Settled"
                                : act.activityType}
                          </div>
                          <div className="text-[10px] text-neutral-500 font-mono">
                            {truncateMiddle(act.txHash, 10, 8)} •{" "}
                            {formatTimestamp(
                              act.blockTimestamp || act.observedAt,
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs font-bold ${
                            act.direction === "INCOMING"
                              ? "text-emerald-600"
                              : "text-neutral-950"
                          }`}
                        >
                          {act.direction === "INCOMING" ? "+" : "-"}
                          {act.displayAmount} {act.assetSymbol}
                        </div>
                        <a
                          href={act.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-neutral-400 hover:text-neutral-950"
                        >
                          View tx ↗
                        </a>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400">
                  No activity found for this account.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Held Assets Modal (ChatGPT Image Nov 12, 2026, 05_23_23 AM-2.png) */}
      <AssetsHeldModal
        isOpen={isHeldAssetsOpen}
        onClose={() => setIsHeldAssetsOpen(false)}
        heldAssets={heldAssets}
        totalBalanceUsd={totalBalanceUsd}
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

      {/* Unified Asset Selector Modal for Direct Receive */}
      <UnifiedAssetSelectorModal
        isOpen={isReceiveAssetSelectorOpen}
        onClose={() => setIsReceiveAssetSelectorOpen(false)}
        filterCapability="CAN_RECEIVE_TO"
        selectableIds={receiveOptions.map((deployment) => deployment.id)}
        onSelectToken={(t) => {
          setIsReceiveAssetSelectorOpen(false);
          const match = receiveOptions.find((d) => d.id === t.id);
          if (match) {
            setDepositDeployment(match);
          }
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
    </div>
  );
}
