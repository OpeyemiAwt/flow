export const EARN_DEPOSIT_FEE_BPS = 15; // 0.15%
export const EARN_WITHDRAW_FEE_BPS = 0; // 0%
export const CONVERT_BRIDGE_FEE_BPS = 100; // 1.00%
export const PAYMENT_LINK_FEE_BPS = 0; // 0%

export const EARN_DEPOSIT_FEE_LABEL = "0.15%";
export const CONVERT_BRIDGE_FEE_LABEL = "1%";

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

export function getConvertBridgeAppFees(): readonly OneClickAppFee[] {
  const recipient = resolveFeeTreasuryAccount();
  if (!recipient || CONVERT_BRIDGE_FEE_BPS <= 0) {
    return [];
  }
  return [{ recipient, fee: CONVERT_BRIDGE_FEE_BPS }];
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
