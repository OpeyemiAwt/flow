export const LINEAR_CONTRACT = "linear-protocol.near";
export const BURROW_CONTRACT = "contract.main.burrow.near";
export const BURROW_USDC_CONTRACT =
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

export const NEAR_GAS_RESERVE_YOCTO = 120_000_000_000_000_000_000_000n;
export const BURROW_STORAGE_DEPOSIT_YOCTO = 250_000_000_000_000_000_000_000n;

export const EARN_MEMO = {
  LINEAR_DEPOSIT: "EARN:LINEAR:DEPOSIT",
  LINEAR_WITHDRAW_INSTANT: "EARN:LINEAR:WITHDRAW_INSTANT",
  LINEAR_WITHDRAW_DELAYED: "EARN:LINEAR:WITHDRAW_DELAYED",
  BURROW_DEPOSIT: "EARN:BURROW:DEPOSIT",
  BURROW_WITHDRAW: "EARN:BURROW:WITHDRAW",
} as const;

export type EarnMemo = (typeof EARN_MEMO)[keyof typeof EARN_MEMO];

const EARN_MEMO_SET = new Set<string>(Object.values(EARN_MEMO));

export function isEarnMemo(value: string | null | undefined): value is EarnMemo {
  return typeof value === "string" && EARN_MEMO_SET.has(value);
}
