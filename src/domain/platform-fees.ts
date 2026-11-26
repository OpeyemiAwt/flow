export const EARN_DEPOSIT_FEE_BPS = 30; // 0.30%
export const EARN_WITHDRAW_FEE_BPS = 0; // 0%
export const DIRECT_SEND_FEE_BPS = 0; // 0% (same-asset direct send is free)
export const CROSS_ASSET_SEND_FEE_BPS = 30; // 0.30% (cross-asset send)
export const CONVERT_BRIDGE_FEE_BPS = 150; // 1.50%
export const PAYMENT_LINK_FEE_BPS = 0; // 0%

export const EARN_DEPOSIT_FEE_LABEL = "0.3%";
export const CROSS_ASSET_SEND_FEE_LABEL = "0.3%";
export const CONVERT_BRIDGE_FEE_LABEL = "1.5%";

/**
 * Default FLOW fee treasury NEAR mainnet account (also used as the gas/policy sponsor).
 * Can be overridden at runtime via FLOW_FEE_TREASURY_ACCOUNT.
 */
export const DEFAULT_FEE_TREASURY_ACCOUNT =
  "02e683a4da211743b6759d85a37e8ebe8d2ab22a22746d0c8c38f34395a0ae0c";

export interface OneClickAppFee {
  readonly recipient: string;
  readonly fee: number;
}

export function resolveFeeTreasuryAccount(): string {
  if (typeof process !== "undefined" && process.env) {
    const explicit = process.env.FLOW_FEE_TREASURY_ACCOUNT?.trim();
    if (explicit) return explicit.toLowerCase();
    const sponsor = process.env.FLOW_NEAR_SPONSOR_ACCOUNT_ID?.trim();
    if (sponsor) return sponsor.toLowerCase();
  }
  return DEFAULT_FEE_TREASURY_ACCOUNT;
}

export function resolveNearGasSponsorAccountId(): string {
  if (typeof process !== "undefined" && process.env) {
    const sponsor = process.env.FLOW_NEAR_SPONSOR_ACCOUNT_ID?.trim();
    if (sponsor) return sponsor.toLowerCase();
    const explicit = process.env.FLOW_FEE_TREASURY_ACCOUNT?.trim();
    if (explicit) return explicit.toLowerCase();
  }
  return DEFAULT_FEE_TREASURY_ACCOUNT;
}

export interface FeeRouteContext {
  readonly sourceNetwork?: string | null;
  readonly destinationNetwork?: string | null;
}

/**
 * Returns true when both the source and destination networks are NEAR Mainnet.
 * Within FLOW, NEAR-to-NEAR Send and Convert transactions are gas-sponsored by
 * FLOW and carry a 0% FLOW platform fee (Earn deposits keep their own fee).
 */
export function isNearToNearFlow(
  sourceNetwork: string | null | undefined,
  destinationNetwork: string | null | undefined,
): boolean {
  const src = (sourceNetwork ?? "").trim().toLowerCase();
  const dst = (destinationNetwork ?? "").trim().toLowerCase();
  return (
    (src === "near-mainnet" || src === "near") &&
    (dst === "near-mainnet" || dst === "near")
  );
}

export function getCrossAssetSendAppFees(): readonly OneClickAppFee[] {
  const recipient = resolveFeeTreasuryAccount();
  if (!recipient || CROSS_ASSET_SEND_FEE_BPS <= 0) {
    return [];
  }
  return [{ recipient, fee: CROSS_ASSET_SEND_FEE_BPS }];
}

export function getConvertBridgeAppFees(): readonly OneClickAppFee[] {
  const recipient = resolveFeeTreasuryAccount();
  if (!recipient || CONVERT_BRIDGE_FEE_BPS <= 0) {
    return [];
  }
  return [{ recipient, fee: CONVERT_BRIDGE_FEE_BPS }];
}

export function getOperationPlatformFeeBps(
  operation: "SEND" | "CONVERT" | "ADD_MONEY",
  isSameAsset: boolean,
  route?: FeeRouteContext,
): number {
  if (
    (operation === "SEND" || operation === "CONVERT") &&
    isNearToNearFlow(route?.sourceNetwork, route?.destinationNetwork)
  ) {
    return 0;
  }
  if (operation === "CONVERT") {
    return isSameAsset ? 0 : CONVERT_BRIDGE_FEE_BPS;
  }
  if (operation === "SEND") {
    return isSameAsset ? DIRECT_SEND_FEE_BPS : CROSS_ASSET_SEND_FEE_BPS;
  }
  return 0;
}

export function getOperationAppFees(
  operation: "SEND" | "CONVERT" | "ADD_MONEY",
  isSameAsset: boolean,
  route?: FeeRouteContext,
): readonly OneClickAppFee[] {
  const feeBps = getOperationPlatformFeeBps(operation, isSameAsset, route);
  const recipient = resolveFeeTreasuryAccount();
  if (!recipient || feeBps <= 0) {
    return [];
  }
  return [{ recipient, fee: feeBps }];
}

export function splitPlatformFee(
  grossAtomic: bigint,
  feeBps: number,
): {
  readonly grossAtomic: bigint;
  readonly feeAtomic: bigint;
  readonly netAtomic: bigint;
} {
  if (grossAtomic <= 0n || feeBps <= 0) {
    return { grossAtomic, feeAtomic: 0n, netAtomic: grossAtomic };
  }
  const feeAtomic = (grossAtomic * BigInt(feeBps)) / 10_000n;
  const netAtomic = grossAtomic - feeAtomic;
  return { grossAtomic, feeAtomic, netAtomic };
}

/**
 * Computes the gross atomic amount to debit from the user's balance when the
 * platform fee is charged on top of the user's desired principal amount (not
 * deducted from the amount being sent/deposited).
 *
 * Guarantees that after `feeBps` is taken from `grossAtomic` via
 * `floor(gross * feeBps / 10_000)`, the remaining net principal is >= `principalAtomic`.
 */
export function grossUpForPlatformFee(
  principalAtomic: bigint,
  feeBps: number,
): {
  readonly principalAtomic: bigint;
  readonly feeAtomic: bigint;
  readonly grossAtomic: bigint;
} {
  if (principalAtomic <= 0n || feeBps <= 0 || feeBps >= 10_000) {
    return {
      principalAtomic,
      feeAtomic: 0n,
      grossAtomic: principalAtomic,
    };
  }
  const denom = BigInt(10_000 - feeBps);
  const grossAtomic = (principalAtomic * 10_000n + denom - 1n) / denom;
  const feeAtomic = grossAtomic - principalAtomic;
  return {
    principalAtomic,
    feeAtomic,
    grossAtomic,
  };
}

/**
 * Inverse of `grossUpForPlatformFee`: given a maximum spendable balance
 * (`maxGrossAtomic`, already net of any native gas reserve), returns the largest
 * principal amount whose grossed-up total (principal + platform fee) does not
 * exceed `maxGrossAtomic`.
 */
export function maxPrincipalBeforePlatformFee(
  maxGrossAtomic: bigint,
  feeBps: number,
): bigint {
  if (maxGrossAtomic <= 0n) return 0n;
  if (feeBps <= 0 || feeBps >= 10_000) return maxGrossAtomic;
  return (maxGrossAtomic * BigInt(10_000 - feeBps)) / 10_000n;
}
