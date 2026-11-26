import { createHash } from "node:crypto";
import { isValidNearAddress } from "../../domain/custody.ts";
import { FlowError } from "../../foundation/errors.ts";
import { log } from "../../foundation/logger.ts";
import type { PolicySponsorConfig } from "../../foundation/wallet-environment.ts";
import {
  decodeBase58,
  encodeBase58,
  encodeSignedNearTransactionBase64,
  parseNearEd25519PrivateKey,
} from "./near-policy-sponsor.ts";

export const NEAR_STORAGE_DEPOSIT_GAS_TGAS = 30_000_000_000_000n; // 30 TGas
export const YOCTO_PER_STORAGE_BYTE = 10_000_000_000_000_000_000n; // 10^19 yocto/byte
export const MIN_IMPLICIT_STORAGE_LOCK_YOCTO = 2_000_000_000_000_000_000_000n; // 0.002 NEAR
export const STORAGE_SAFETY_MARGIN_YOCTO = 200_000_000_000_000_000_000n; // 0.0002 NEAR
export const NATIVE_PREPAID_GAS_BUFFER_YOCTO = 5_000_000_000_000_000_000_000n; // 0.005 NEAR
export const FT_PREPAID_GAS_BUFFER_YOCTO = 10_000_000_000_000_000_000_000n; // 0.010 NEAR
export const NATIVE_ESTIMATED_GAS_REIMBURSE_YOCTO =
  250_000_000_000_000_000_000n; // 0.00025 NEAR
export const FT_ESTIMATED_GAS_REIMBURSE_YOCTO =
  1_000_000_000_000_000_000_000n; // 0.001 NEAR
export const MAX_SINGLE_GAS_TOPUP_YOCTO = 25_000_000_000_000_000_000_000n; // 0.025 NEAR sanity bound
export const MAX_SINGLE_STORAGE_DEPOSIT_YOCTO =
  20_000_000_000_000_000_000_000n; // 0.020 NEAR sanity bound
const SPONSOR_TX_OWN_GAS_MARGIN_YOCTO = 2_000_000_000_000_000_000_000n; // 0.002 NEAR

class BorshWriter {
  private readonly chunks: Buffer[] = [];

  writeU8(value: number): void {
    const b = Buffer.allocUnsafe(1);
    b.writeUInt8(value, 0);
    this.chunks.push(b);
  }

  writeU32LE(value: number): void {
    const b = Buffer.allocUnsafe(4);
    b.writeUInt32LE(value >>> 0, 0);
    this.chunks.push(b);
  }

  writeU64LE(value: bigint): void {
    if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
      throw new FlowError("INVALID_INPUT", "u64 out of range.");
    }
    const b = Buffer.allocUnsafe(8);
    b.writeBigUInt64LE(value, 0);
    this.chunks.push(b);
  }

  writeU128LE(value: bigint): void {
    if (value < 0n || value >= 1n << 128n) {
      throw new FlowError("INVALID_INPUT", "u128 out of range.");
    }
    const lo = value & 0xffff_ffff_ffff_ffffn;
    const hi = value >> 64n;
    const b = Buffer.allocUnsafe(16);
    b.writeBigUInt64LE(lo, 0);
    b.writeBigUInt64LE(hi, 8);
    this.chunks.push(b);
  }

  writeFixedBytes(bytes: Uint8Array): void {
    this.chunks.push(Buffer.from(bytes));
  }

  writeLengthPrefixedBytes(bytes: Uint8Array): void {
    this.writeU32LE(bytes.length);
    this.chunks.push(Buffer.from(bytes));
  }

  writeString(value: string): void {
    this.writeLengthPrefixedBytes(Buffer.from(value, "utf8"));
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

export interface NearAccountState {
  readonly exists: boolean;
  readonly balanceYocto: bigint;
  readonly storageUsageBytes: bigint;
}

/**
 * Computes the exact yoctoNEAR gas top-up needed so a NEAR-to-NEAR user
 * transaction executes completely gas-free without draining the user's balance.
 */
export function computeNearGasTopupYocto(params: {
  readonly isNativeTransfer: boolean;
  readonly transferAmountYocto: bigint;
  readonly senderAccount: NearAccountState;
}): bigint {
  const dynamicStorageLock = params.senderAccount.exists
    ? params.senderAccount.storageUsageBytes * YOCTO_PER_STORAGE_BYTE +
      STORAGE_SAFETY_MARGIN_YOCTO
    : MIN_IMPLICIT_STORAGE_LOCK_YOCTO;
  const storageLock =
    dynamicStorageLock > MIN_IMPLICIT_STORAGE_LOCK_YOCTO
      ? dynamicStorageLock
      : MIN_IMPLICIT_STORAGE_LOCK_YOCTO;

  const prepaidGasBuffer = params.isNativeTransfer
    ? NATIVE_PREPAID_GAS_BUFFER_YOCTO
    : FT_PREPAID_GAS_BUFFER_YOCTO;
  const spendPrincipal = params.isNativeTransfer
    ? params.transferAmountYocto
    : 1n; // 1 yoctoNEAR attached to NEP-141 ft_transfer
  const requiredBalance = spendPrincipal + storageLock + prepaidGasBuffer;

  const deficit =
    requiredBalance > params.senderAccount.balanceYocto
      ? requiredBalance - params.senderAccount.balanceYocto
      : 0n;

  const gasReimburse = params.isNativeTransfer
    ? NATIVE_ESTIMATED_GAS_REIMBURSE_YOCTO
    : FT_ESTIMATED_GAS_REIMBURSE_YOCTO;

  const topup = deficit > gasReimburse ? deficit : gasReimburse;
  return topup > MAX_SINGLE_GAS_TOPUP_YOCTO
    ? MAX_SINGLE_GAS_TOPUP_YOCTO
    : topup;
}

/**
 * Builds a single-action NEAR `Action::Transfer` transaction from the FLOW
 * sponsor account to top up a user's NEAR wallet for gas.
 */
export function buildSponsorGasTopupTransactionBytes(input: {
  readonly signerId: string;
  readonly publicKeyBytes: Buffer;
  readonly nonce: bigint;
  readonly receiverId: string;
  readonly blockHashBase58: string;
  readonly amountYocto: bigint;
}): { txBytes: Buffer; txHash: string } {
  if (!isValidNearAddress(input.signerId)) {
    throw new FlowError("INVALID_CONFIGURATION", "Invalid sponsor NEAR account ID.");
  }
  if (!isValidNearAddress(input.receiverId)) {
    throw new FlowError("INVALID_INPUT", "Invalid NEAR gas recipient account ID.");
  }
  if (input.publicKeyBytes.length !== 32) {
    throw new FlowError("INVALID_CONFIGURATION", "Sponsor Ed25519 public key must be 32 bytes.");
  }
  if (input.nonce <= 0n) {
    throw new FlowError("INVALID_INPUT", "NEAR transaction nonce must be >= 1.");
  }
  if (
    input.amountYocto <= 0n ||
    input.amountYocto > MAX_SINGLE_GAS_TOPUP_YOCTO
  ) {
    throw new FlowError(
      "INVALID_INPUT",
      `Sponsor gas top-up (${input.amountYocto}) exceeds per-tx safety bound.`,
    );
  }
  const blockHash = decodeBase58(input.blockHashBase58);
  if (blockHash.length !== 32) {
    throw new FlowError("UPSTREAM_UNAVAILABLE", "NEAR block hash must decode to 32 bytes.");
  }

  const w = new BorshWriter();
  w.writeString(input.signerId);
  w.writeU8(0); // PublicKey::Ed25519
  w.writeFixedBytes(input.publicKeyBytes);
  w.writeU64LE(input.nonce);
  w.writeString(input.receiverId);
  w.writeFixedBytes(blockHash);
  w.writeU32LE(1); // 1 action
  w.writeU8(3); // Action::Transfer
  w.writeU128LE(input.amountYocto);

  const txBytes = w.toBuffer();
  const digest = createHash("sha256").update(txBytes).digest();
  return { txBytes, txHash: encodeBase58(digest) };
}

/**
 * Builds a single-action NEAR `FunctionCall` transaction for `storage_deposit`
 * (`registration_only: true`) on a NEP-141 token contract, paid by the FLOW sponsor.
 */
export function buildSponsorStorageDepositTransactionBytes(input: {
  readonly signerId: string;
  readonly publicKeyBytes: Buffer;
  readonly nonce: bigint;
  readonly tokenContractId: string;
  readonly accountToRegister: string;
  readonly blockHashBase58: string;
  readonly depositYocto: bigint;
}): { txBytes: Buffer; txHash: string; argsJson: string } {
  if (!isValidNearAddress(input.signerId)) {
    throw new FlowError("INVALID_CONFIGURATION", "Invalid sponsor NEAR account ID.");
  }
  if (!isValidNearAddress(input.tokenContractId)) {
    throw new FlowError("INVALID_INPUT", "Invalid NEAR token contract ID.");
  }
  if (!isValidNearAddress(input.accountToRegister)) {
    throw new FlowError("INVALID_INPUT", "Invalid NEAR account ID for storage_deposit.");
  }
  if (input.publicKeyBytes.length !== 32) {
    throw new FlowError("INVALID_CONFIGURATION", "Sponsor Ed25519 public key must be 32 bytes.");
  }
  if (input.nonce <= 0n) {
    throw new FlowError("INVALID_INPUT", "NEAR transaction nonce must be >= 1.");
  }
  if (
    input.depositYocto <= 0n ||
    input.depositYocto > MAX_SINGLE_STORAGE_DEPOSIT_YOCTO
  ) {
    throw new FlowError(
      "INVALID_INPUT",
      `Sponsor storage_deposit (${input.depositYocto}) exceeds per-tx safety bound.`,
    );
  }
  const blockHash = decodeBase58(input.blockHashBase58);
  if (blockHash.length !== 32) {
    throw new FlowError("UPSTREAM_UNAVAILABLE", "NEAR block hash must decode to 32 bytes.");
  }

  const argsJson = JSON.stringify({
    account_id: input.accountToRegister,
    registration_only: true,
  });

  const w = new BorshWriter();
  w.writeString(input.signerId);
  w.writeU8(0); // PublicKey::Ed25519
  w.writeFixedBytes(input.publicKeyBytes);
  w.writeU64LE(input.nonce);
  w.writeString(input.tokenContractId);
  w.writeFixedBytes(blockHash);
  w.writeU32LE(1); // 1 action
  w.writeU8(2); // Action::FunctionCall
  w.writeString("storage_deposit");
  w.writeLengthPrefixedBytes(Buffer.from(argsJson, "utf8"));
  w.writeU64LE(NEAR_STORAGE_DEPOSIT_GAS_TGAS);
  w.writeU128LE(input.depositYocto);

  const txBytes = w.toBuffer();
  const digest = createHash("sha256").update(txBytes).digest();
  return { txBytes, txHash: encodeBase58(digest), argsJson };
}

// Serialize all sponsor broadcasts within the worker process to prevent nonce collisions
let sponsorTxTail: Promise<void> = Promise.resolve();

function enqueueSponsorTx<T>(fn: () => Promise<T>): Promise<T> {
  const next = sponsorTxTail.then(fn, fn);
  sponsorTxTail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function nearJsonRpc<T>(
  endpoints: readonly string[],
  method: string,
  params: unknown,
  timeoutMs = 15_000,
): Promise<{ ok: true; result: T } | { ok: false; causeName: string; detail: string }> {
  let lastCause = "NEAR_RPC_UNREACHABLE";
  let lastDetail = "NEAR RPC unreachable.";
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        lastCause = `HTTP_${res.status}`;
        lastDetail = `NEAR RPC HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as {
        result?: T;
        error?: {
          name?: string;
          message?: string;
          cause?: { name?: string };
          data?: unknown;
        };
      };
      if (json.error) {
        const causeName =
          json.error.cause?.name ?? json.error.name ?? "NEAR_RPC_ERROR";
        const rawTxErr = (
          json.error.data as
            | { TxExecutionError?: { InvalidTxError?: unknown } }
            | undefined
        )?.TxExecutionError?.InvalidTxError;
        let txErrKey = "";
        if (typeof rawTxErr === "string") txErrKey = rawTxErr;
        else if (rawTxErr && typeof rawTxErr === "object") {
          txErrKey = Object.keys(rawTxErr)[0] ?? "";
        }
        // Account-level errors (e.g. UNKNOWN_ACCOUNT or InvalidNonce) are definitive on-chain answers
        if (
          causeName === "UNKNOWN_ACCOUNT" ||
          txErrKey === "InvalidNonce" ||
          txErrKey === "Expired" ||
          txErrKey === "NotEnoughBalance"
        ) {
          return {
            ok: false,
            causeName: txErrKey || causeName,
            detail: json.error.message ?? causeName,
          };
        }
        lastCause = txErrKey || causeName;
        lastDetail = json.error.message ?? causeName;
        continue;
      }
      if (json.result !== undefined) {
        return { ok: true, result: json.result };
      }
    } catch (err: unknown) {
      lastCause = "NEAR_RPC_NETWORK_ERROR";
      lastDetail = err instanceof Error ? err.message : "Network error";
    }
  }
  return { ok: false, causeName: lastCause, detail: lastDetail };
}

async function viewNearAccountState(
  endpoints: readonly string[],
  accountId: string,
): Promise<NearAccountState> {
  const res = await nearJsonRpc<{
    amount?: string;
    storage_usage?: number | string;
  }>(endpoints, "query", {
    request_type: "view_account",
    finality: "final",
    account_id: accountId,
  });
  if (!res.ok) {
    if (res.causeName === "UNKNOWN_ACCOUNT") {
      return { exists: false, balanceYocto: 0n, storageUsageBytes: 0n };
    }
    throw new FlowError(
      "UPSTREAM_UNAVAILABLE",
      `Could not query NEAR account ${accountId}: ${res.causeName}`,
    );
  }
  const amount = res.result.amount ?? "0";
  const storageUsage = res.result.storage_usage ?? 0;
  return {
    exists: true,
    balanceYocto: /^[0-9]+$/.test(amount) ? BigInt(amount) : 0n,
    storageUsageBytes: BigInt(storageUsage),
  };
}

async function signAndBroadcastSponsorTx(
  sponsorConfig: Extract<PolicySponsorConfig, { enabled: true }>,
  buildTx: (ctx: {
    signerId: string;
    publicKeyBytes: Buffer;
    nonce: bigint;
    blockHashBase58: string;
  }) => { txBytes: Buffer; txHash: string },
  minSponsorBalanceNeededYocto: bigint,
): Promise<
  | { ok: true; txHash: string }
  | { ok: false; reason: string }
> {
  if (
    sponsorConfig.signerMode !== "local-ed25519" ||
    !sponsorConfig.privateKey
  ) {
    return { ok: false, reason: "SPONSOR_REMOTE_SIGNER_UNSUPPORTED_FOR_GAS" };
  }

  const endpoints = [sponsorConfig.rpcUrl, ...sponsorConfig.fallbackRpcUrls];
  const keyPair = parseNearEd25519PrivateKey(sponsorConfig.privateKey);

  return enqueueSponsorTx(async () => {
    const sponsorState = await viewNearAccountState(
      endpoints,
      sponsorConfig.sponsorAccountId,
    );
    if (
      !sponsorState.exists ||
      sponsorState.balanceYocto <
        minSponsorBalanceNeededYocto + SPONSOR_TX_OWN_GAS_MARGIN_YOCTO
    ) {
      log("error", "near_gas_sponsor_insufficient_balance", {
        sponsorAccountId: sponsorConfig.sponsorAccountId,
        sponsorBalanceYocto: sponsorState.balanceYocto.toString(),
        neededYocto: minSponsorBalanceNeededYocto.toString(),
      });
      return { ok: false, reason: "SPONSOR_INSUFFICIENT_BALANCE" };
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const [akRes, blockRes] = await Promise.all([
        nearJsonRpc<{ nonce?: number | string }>(endpoints, "query", {
          request_type: "view_access_key",
          finality: "final",
          account_id: sponsorConfig.sponsorAccountId,
          public_key: keyPair.publicKeyString,
        }),
        nearJsonRpc<{ header?: { hash?: string } }>(endpoints, "block", {
          finality: "final",
        }),
      ]);
      if (!akRes.ok || akRes.result.nonce === undefined) {
        return {
          ok: false,
          reason: `SPONSOR_NONCE_UNAVAILABLE:${akRes.ok ? "MISSING" : akRes.causeName}`,
        };
      }
      if (!blockRes.ok || !blockRes.result.header?.hash) {
        return {
          ok: false,
          reason: `SPONSOR_BLOCK_UNAVAILABLE:${blockRes.ok ? "MISSING" : blockRes.causeName}`,
        };
      }

      const nonce = BigInt(akRes.result.nonce) + 1n;
      const { txBytes, txHash } = buildTx({
        signerId: sponsorConfig.sponsorAccountId,
        publicKeyBytes: keyPair.publicKeyBytes,
        nonce,
        blockHashBase58: blockRes.result.header.hash,
      });
      const digest = createHash("sha256").update(txBytes).digest();
      const signature64 = keyPair.signDigest(digest);
      const signedTxBase64 = encodeSignedNearTransactionBase64(
        txBytes,
        signature64,
      );

      const sendRes = await nearJsonRpc<{
        status?: { SuccessValue?: string; Failure?: unknown };
        transaction?: { hash?: string };
      }>(endpoints, "send_tx", {
        signed_tx_base64: signedTxBase64,
        wait_until: "FINAL",
      });

      if (sendRes.ok) {
        const succeeded =
          Boolean(sendRes.result.status && "SuccessValue" in sendRes.result.status) &&
          !sendRes.result.status?.Failure;
        if (succeeded) {
          return { ok: true, txHash: sendRes.result.transaction?.hash ?? txHash };
        }
        return { ok: false, reason: "SPONSOR_TX_EXECUTION_FAILED" };
      }

      if (
        (sendRes.causeName === "InvalidNonce" || sendRes.causeName === "Expired") &&
        attempt < 3
      ) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      return { ok: false, reason: `SPONSOR_BROADCAST_FAILED:${sendRes.causeName}` };
    }

    return { ok: false, reason: "SPONSOR_RETRIES_EXHAUSTED" };
  });
}

/**
 * Pays a recipient's NEP-141 `storage_deposit` directly from the FLOW sponsor
 * account so the user spends 0 NEAR on token registration.
 */
export async function sponsorNearStorageDeposit(params: {
  readonly sponsorConfig: PolicySponsorConfig | undefined;
  readonly tokenContractId: string;
  readonly accountToRegister: string;
  readonly depositYocto: bigint;
  readonly jobId: string;
}): Promise<{ sponsored: true; txHash: string } | { sponsored: false; reason: string }> {
  if (!params.sponsorConfig?.enabled) {
    return { sponsored: false, reason: "SPONSOR_DISABLED" };
  }
  if (
    params.depositYocto <= 0n ||
    params.depositYocto > MAX_SINGLE_STORAGE_DEPOSIT_YOCTO
  ) {
    return { sponsored: false, reason: "STORAGE_DEPOSIT_EXCEEDS_SAFETY_BOUND" };
  }

  const res = await signAndBroadcastSponsorTx(
    params.sponsorConfig,
    (ctx) =>
      buildSponsorStorageDepositTransactionBytes({
        signerId: ctx.signerId,
        publicKeyBytes: ctx.publicKeyBytes,
        nonce: ctx.nonce,
        tokenContractId: params.tokenContractId,
        accountToRegister: params.accountToRegister,
        blockHashBase58: ctx.blockHashBase58,
        depositYocto: params.depositYocto,
      }),
    params.depositYocto,
  );

  if (!res.ok) {
    log("error", "near_storage_deposit_sponsor_skipped", {
      jobId: params.jobId,
      tokenContractId: params.tokenContractId,
      accountToRegister: params.accountToRegister,
      reason: res.reason,
    });
    return { sponsored: false, reason: res.reason };
  }

  log("info", "near_storage_deposit_sponsored", {
    jobId: params.jobId,
    tokenContractId: params.tokenContractId,
    accountToRegister: params.accountToRegister,
    depositYocto: params.depositYocto.toString(),
    txHash: res.txHash,
  });
  return { sponsored: true, txHash: res.txHash };
}

/**
 * Tops up the sender's NEAR wallet from the FLOW sponsor address right before
 * OutLayer executes a NEAR-to-NEAR Send or Convert transaction.
 */
export async function sponsorNearSenderGas(params: {
  readonly sponsorConfig: PolicySponsorConfig | undefined;
  readonly senderAddress: string;
  readonly isNativeTransfer: boolean;
  readonly transferAmountYocto: bigint;
  readonly jobId: string;
}): Promise<
  | { sponsored: true; txHash: string; topupYocto: bigint }
  | { sponsored: false; reason: string }
> {
  if (!params.sponsorConfig?.enabled) {
    return { sponsored: false, reason: "SPONSOR_DISABLED" };
  }
  const endpoints = [
    params.sponsorConfig.rpcUrl,
    ...params.sponsorConfig.fallbackRpcUrls,
  ];
  const senderAccount = await viewNearAccountState(
    endpoints,
    params.senderAddress,
  );
  const topupYocto = computeNearGasTopupYocto({
    isNativeTransfer: params.isNativeTransfer,
    transferAmountYocto: params.transferAmountYocto,
    senderAccount,
  });
  if (topupYocto <= 0n) {
    return { sponsored: false, reason: "NO_TOPUP_NEEDED" };
  }

  const res = await signAndBroadcastSponsorTx(
    params.sponsorConfig,
    (ctx) =>
      buildSponsorGasTopupTransactionBytes({
        signerId: ctx.signerId,
        publicKeyBytes: ctx.publicKeyBytes,
        nonce: ctx.nonce,
        receiverId: params.senderAddress,
        blockHashBase58: ctx.blockHashBase58,
        amountYocto: topupYocto,
      }),
    topupYocto,
  );

  if (!res.ok) {
    log("error", "near_gas_sponsor_skipped", {
      jobId: params.jobId,
      senderAddress: params.senderAddress,
      topupYocto: topupYocto.toString(),
      reason: res.reason,
    });
    return { sponsored: false, reason: res.reason };
  }

  // Brief propagation wait so OutLayer's NEAR RPC observes the finalized top-up
  await new Promise((resolve) => setTimeout(resolve, 400));

  log("info", "near_gas_sponsored", {
    jobId: params.jobId,
    senderAddress: params.senderAddress,
    isNativeTransfer: params.isNativeTransfer,
    topupYocto: topupYocto.toString(),
    txHash: res.txHash,
  });
  return { sponsored: true, txHash: res.txHash, topupYocto };
}
