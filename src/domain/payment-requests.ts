import { randomBytes } from "node:crypto";
import { formatAtomicToDisplay } from "./atomic-amounts.ts";
import { isFinancialExecutionDisabled } from "./execution-flag.ts";
import type { PaymentDepositInstructions } from "./quote-discovery.ts";
import {
  CURATED_SUPPORTED_DEPLOYMENTS,
  type CatalogTokenDeployment,
  type EcosystemFamily,
} from "./supported-assets-catalog.ts";

export type PaymentAmountMode = "FIXED" | "OPTIONAL";
export type PaymentFeePayer = "PAYER" | "MERCHANT";
export type PaymentRequestStatus =
  "ACTIVE" | "DISABLED" | "EXPIRED" | "COMPLETED";

export interface PaymentRequestRecord {
  readonly id: string;
  readonly accountId: string;
  readonly publicId: string;
  readonly title: string;
  readonly description: string | null;
  readonly destinationNetwork: string;
  readonly destinationAssetId: string;
  readonly destinationAssetSymbol: string;
  readonly destinationDecimals: number;
  readonly amountMode: PaymentAmountMode;
  readonly requestedAtomicAmount: bigint | null;
  readonly status: PaymentRequestStatus;
  readonly expiresAt: Date | null;
  readonly payerMemoRequired: boolean;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SerializedPaymentRequest {
  readonly id: string;
  readonly accountId: string;
  readonly publicId: string;
  readonly shareUrl: string;
  readonly title: string;
  readonly description: string | null;
  readonly destinationNetwork: string;
  readonly destinationAssetId: string;
  readonly destinationAssetSymbol: string;
  readonly destinationDecimals: number;
  readonly amountMode: PaymentAmountMode;
  readonly requestedAtomicAmount: string | null;
  readonly displayAmount: string | null;
  readonly status: PaymentRequestStatus;
  readonly expiresAt: string | null;
  readonly payerMemoRequired: boolean;
  readonly feePayer: PaymentFeePayer;
  readonly maxPayments: number | null;
  readonly paidCount: number;
  readonly remainingPayments: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EligibleSourceRoute {
  readonly id: string;
  readonly ecosystem: EcosystemFamily;
  readonly networkKey: string;
  readonly networkName: string;
  readonly assetSymbol: string;
  readonly assetName: string;
  readonly standard: string;
  readonly contractIdentifier: string;
  readonly decimals: number;
  readonly routeType: "DIRECT_TRANSFER" | "CROSS_CHAIN_1CLICK";
  readonly isOperationalNow: boolean;
  readonly availabilityNotice: string;
}

export interface PublicPaymentRequest {
  readonly publicId: string;
  readonly shareUrl: string;
  readonly title: string;
  readonly description: string | null;
  readonly recipientName: string;
  readonly recipientKind: "PERSONAL" | "BUSINESS";
  readonly destinationNetwork: string;
  readonly destinationAssetId: string;
  readonly destinationAssetSymbol: string;
  readonly destinationDecimals: number;
  readonly amountMode: PaymentAmountMode;
  readonly requestedAtomicAmount: string | null;
  readonly displayAmount: string | null;
  readonly status: PaymentRequestStatus;
  readonly expiresAt: string | null;
  readonly payerMemoRequired: boolean;
  readonly feePayer: PaymentFeePayer;
  readonly isExpired: boolean;
  readonly isDeleted?: boolean;
  readonly maxPayments: number | null;
  readonly paidCount: number;
  readonly remainingPayments: number | null;
  readonly eligibleSourceRoutes: readonly EligibleSourceRoute[];
  readonly recipientAddress?: string | null;
  readonly activeAttempt?: PaymentDepositInstructions | null;
}

export function parseFeePayer(
  metadata: Record<string, unknown> | null | undefined,
): PaymentFeePayer {
  const raw = metadata?.feePayer;
  if (typeof raw === "string" && raw.trim().toUpperCase() === "MERCHANT") {
    return "MERCHANT";
  }
  return "PAYER";
}

export function parseMaxPayments(
  metadata: Record<string, unknown> | null | undefined,
): number | null {
  const raw = metadata?.maxPayments;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) {
    return raw;
  }
  if (typeof raw === "string" && /^[1-9]\d*$/.test(raw.trim())) {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (Number.isSafeInteger(parsed) && parsed >= 1) return parsed;
  }
  return null;
}

export function generatePublicPaymentId(): string {
  // 24 random bytes provides 192 bits of cryptographic entropy, URL-safe
  return `pr_${randomBytes(24).toString("base64url")}`;
}

export function isValidPublicPaymentId(id: string): boolean {
  return /^pr_[a-zA-Z0-9_-]{16,64}$/.test(id);
}

export function serializePaymentRequest(
  record: PaymentRequestRecord,
  origin: string,
  paidCount = 0,
): SerializedPaymentRequest {
  const displayAmount =
    record.requestedAtomicAmount !== null
      ? formatAtomicToDisplay(
          record.requestedAtomicAmount,
          record.destinationDecimals,
        )
      : null;

  const maxPayments = parseMaxPayments(record.metadata);
  const safePaidCount = Math.max(0, Math.floor(paidCount));
  const remainingPayments =
    maxPayments !== null ? Math.max(0, maxPayments - safePaidCount) : null;
  const effectiveStatus: PaymentRequestStatus =
    record.status === "ACTIVE" &&
    maxPayments !== null &&
    safePaidCount >= maxPayments
      ? "COMPLETED"
      : record.status;

  return {
    id: record.id,
    accountId: record.accountId,
    publicId: record.publicId,
    shareUrl: `${origin.replace(/\/+$/, "")}/pay/${record.publicId}`,
    title: record.title,
    description: record.description,
    destinationNetwork: record.destinationNetwork,
    destinationAssetId: record.destinationAssetId,
    destinationAssetSymbol: record.destinationAssetSymbol,
    destinationDecimals: record.destinationDecimals,
    amountMode: record.amountMode,
    requestedAtomicAmount:
      record.requestedAtomicAmount !== null
        ? record.requestedAtomicAmount.toString()
        : null,
    displayAmount,
    status: effectiveStatus,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    payerMemoRequired: record.payerMemoRequired,
    feePayer: parseFeePayer(record.metadata),
    maxPayments,
    paidCount: safePaidCount,
    remainingPayments,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface PublicPaymentRequestDbRow {
  public_id: string;
  title: string;
  description: string | null;
  destination_network: string;
  destination_asset_id: string;
  destination_asset_symbol: string;
  destination_decimals: number;
  amount_mode: PaymentAmountMode;
  requested_atomic_amount: string | null;
  status: PaymentRequestStatus;
  expires_at: Date | string | null;
  payer_memo_required: boolean;
  recipient_name: string;
  recipient_kind: "PERSONAL" | "BUSINESS";
}

export function serializePublicPaymentRequest(
  row: PublicPaymentRequestDbRow,
  origin: string,
  recipientAddress?: string | null,
  usage?: {
    maxPayments: number | null;
    paidCount: number;
    isDeleted?: boolean;
    feePayer?: PaymentFeePayer;
  },
): PublicPaymentRequest {
  const expiresAtDate = row.expires_at ? new Date(row.expires_at) : null;
  const isExpired = expiresAtDate !== null && expiresAtDate <= new Date();
  const isDeleted = Boolean(usage?.isDeleted);
  const maxPayments = usage?.maxPayments ?? null;
  const paidCount = Math.max(0, Math.floor(usage?.paidCount ?? 0));
  const remainingPayments =
    maxPayments !== null ? Math.max(0, maxPayments - paidCount) : null;
  const isLimitReached =
    maxPayments !== null && paidCount >= maxPayments;
  const effectiveStatus: PaymentRequestStatus = isDeleted
    ? "DISABLED"
    : isExpired
      ? "EXPIRED"
      : row.status === "ACTIVE" && isLimitReached
        ? "COMPLETED"
        : row.status;

  const displayAmount =
    row.requested_atomic_amount !== null
      ? formatAtomicToDisplay(
          BigInt(row.requested_atomic_amount),
          row.destination_decimals,
        )
      : null;

  const eligibleSourceRoutes = computeEligibleSourceRoutes(
    row.destination_network,
    row.destination_asset_id,
  );

  return {
    publicId: row.public_id,
    shareUrl: `${origin.replace(/\/+$/, "")}/pay/${row.public_id}`,
    title: row.title,
    description: row.description,
    recipientName: row.recipient_name,
    recipientKind: row.recipient_kind,
    destinationNetwork: row.destination_network,
    destinationAssetId: row.destination_asset_id,
    destinationAssetSymbol: row.destination_asset_symbol,
    destinationDecimals: row.destination_decimals,
    amountMode: row.amount_mode,
    requestedAtomicAmount: row.requested_atomic_amount,
    displayAmount,
    status: effectiveStatus,
    expiresAt: expiresAtDate ? expiresAtDate.toISOString() : null,
    payerMemoRequired: row.payer_memo_required,
    feePayer: usage?.feePayer === "MERCHANT" ? "MERCHANT" : "PAYER",
    isExpired,
    isDeleted,
    maxPayments,
    paidCount,
    remainingPayments,
    eligibleSourceRoutes,
    recipientAddress:
      isDeleted || effectiveStatus === "COMPLETED"
        ? null
        : (recipientAddress ?? null),
  };
}

export function computeEligibleSourceRoutes(
  destinationNetwork: string,
  destinationAssetId: string,
): readonly EligibleSourceRoute[] {
  // Determine destination environment (testnet vs mainnet)
  const isTestnet =
    destinationNetwork.includes("sepolia") ||
    destinationNetwork.includes("testnet") ||
    destinationNetwork.includes("devnet");

  const targetEnv = isTestnet ? "testnet" : "mainnet";
  const executionEnabled = !isFinancialExecutionDisabled();

  return CURATED_SUPPORTED_DEPLOYMENTS.filter(
    (dep) => dep.environment === targetEnv,
  ).map((dep: CatalogTokenDeployment) => {
    const isDirect =
      dep.networkKey === destinationNetwork && dep.id === destinationAssetId;

    return {
      id: dep.id,
      ecosystem: dep.ecosystem,
      networkKey: dep.networkKey,
      networkName: dep.networkName,
      assetSymbol: dep.symbol,
      assetName: dep.name,
      standard: dep.standard,
      contractIdentifier: dep.contractIdentifier,
      decimals: dep.decimals,
      routeType: isDirect ? "DIRECT_TRANSFER" : "CROSS_CHAIN_1CLICK",
      isOperationalNow: executionEnabled,
      availabilityNotice: executionEnabled
        ? isDirect
          ? "Direct transfer ready on destination network."
          : "Cross-chain payment route active."
        : isDirect
          ? "Direct transfer path. Deposit address issuance and signing are staged for M5 Phase 2 / M6. FLOW_EXECUTION is disabled."
          : "1Click cross-chain route. Executable quoting and cross-chain routing are staged for M6. FLOW_EXECUTION is disabled.",
    };
  });
}
