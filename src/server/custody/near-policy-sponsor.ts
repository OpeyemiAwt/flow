import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  buildDefaultDenyCustodyPolicy,
  buildLiveExecutionCustodyPolicy,
  isFinancialExecutionDisabled,
  isValidNearAddress,
  type OnChainWalletPolicyView,
} from "../../domain/custody.ts";
import {
  decryptSecret,
  deserializeEnvelope,
} from "../../foundation/crypto-envelope.ts";
import { FlowError } from "../../foundation/errors.ts";
import { log } from "../../foundation/logger.ts";
import type { FlowDb } from "../../foundation/prisma.ts";
import {
  MAX_HARD_PER_WALLET_SPONSOR_YOCTO,
  OUTLAYER_POLICY_CONTRACT_ID,
  type PolicySponsorConfig,
  type WalletConfig,
} from "../../foundation/wallet-environment.ts";
import type { OutLayerAdapter } from "./outlayer-adapter.ts";

export const STORE_WALLET_POLICY_METHOD = "store_wallet_policy";
export const STORE_WALLET_POLICY_GAS_TGAS = 100_000_000_000_000n; // 100 TGas
export const CONSERVATIVE_GAS_FEE_BUFFER_YOCTO =
  5_000_000_000_000_000_000_000n; // 0.005 NEAR worst-case gas reserve per tx

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map<string, number>(
  [...BASE58_ALPHABET].map((ch, i) => [ch, i]),
);

const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function encodeBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let output = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    output += "1";
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    output += BASE58_ALPHABET[digits[i]!]!;
  }
  return output;
}

export function decodeBase58(encoded: string): Buffer {
  if (encoded.length === 0) {
    throw new FlowError("INVALID_CONFIGURATION", "Base58 string cannot be empty.");
  }
  const bytes = [0];
  for (const char of encoded) {
    const val = BASE58_INDEX.get(char);
    if (val === undefined) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "Invalid Base58 character encountered.",
      );
    }
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeros = 0;
  for (let i = 0; i < encoded.length && encoded[i] === "1"; i++) {
    leadingZeros++;
  }
  const out = Buffer.alloc(leadingZeros + (bytes.length === 1 && bytes[0] === 0 && leadingZeros === encoded.length ? 0 : bytes.length));
  if (!(bytes.length === 1 && bytes[0] === 0 && leadingZeros === encoded.length)) {
    for (let i = 0; i < bytes.length; i++) {
      out[out.length - 1 - i] = bytes[i]!;
    }
  }
  return out;
}

function decodeWalletPublicKeyBytes(
  rawPubkey: string,
): { scheme: "ed25519" | "secp256k1"; bytes: Buffer } | null {
  const trimmed = rawPubkey.trim();
  const match = /^(?:(ed25519|secp256k1):)?(.+)$/i.exec(trimmed);
  if (!match) return null;
  const scheme = (match[1]?.toLowerCase() ?? "ed25519") as
    | "ed25519"
    | "secp256k1";
  let body = match[2]!.trim();
  if (body.startsWith("0x") || body.startsWith("0X")) {
    body = body.slice(2);
  }
  let bytes: Buffer;
  if (/^[0-9a-f]+$/i.test(body) && body.length % 2 === 0) {
    bytes = Buffer.from(body, "hex");
  } else if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(body)) {
    try {
      bytes = decodeBase58(body);
    } catch {
      return null;
    }
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    bytes = Buffer.from(body, "base64");
  } else {
    return null;
  }
  if (scheme === "ed25519" && bytes.length !== 32) return null;
  if (
    scheme === "secp256k1" &&
    bytes.length !== 33 &&
    bytes.length !== 64 &&
    bytes.length !== 65
  ) {
    return null;
  }
  return { scheme, bytes };
}

const POLICY_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidPolicyWalletKey(rawPubkey: string): boolean {
  return (
    POLICY_UUID_REGEX.test(rawPubkey.trim()) ||
    decodeWalletPublicKeyBytes(rawPubkey) !== null
  );
}

function formatWalletPublicKeyCandidates(
  walletPubkey: string,
  providerWalletId?: string,
  storedSponsorshipPubkey?: string | null,
): string[] {
  const candidates = new Set<string>();
  if (storedSponsorshipPubkey && storedSponsorshipPubkey.trim().length > 0) {
    candidates.add(storedSponsorshipPubkey.trim());
  }
  candidates.add(walletPubkey);
  const decoded = decodeWalletPublicKeyBytes(walletPubkey);
  if (decoded) {
    candidates.add(`${decoded.scheme}:${decoded.bytes.toString("hex")}`);
    candidates.add(`${decoded.scheme}:${encodeBase58(decoded.bytes)}`);
  }
  if (providerWalletId && POLICY_UUID_REGEX.test(providerWalletId.trim())) {
    candidates.add(providerWalletId.trim());
  }
  return Array.from(candidates);
}

function formatOnChainWalletPublicKeyHex(rawPublicKey: string): string {
  const decoded = decodeWalletPublicKeyBytes(rawPublicKey);
  if (decoded) {
    return `${decoded.scheme}:${decoded.bytes.toString("hex")}`;
  }
  const stripped = rawPublicKey.trim().replace(/^0x/i, "");
  if (/^[0-9a-f]{66}$|^[0-9a-f]{128}$|^[0-9a-f]{130}$/i.test(stripped)) {
    return `secp256k1:${stripped.toLowerCase()}`;
  }
  throw new FlowError(
    "CORRUPTED_RESPONSE",
    "OutLayer sign-policy public_key_hex is not a valid Ed25519 or Secp256k1 key.",
  );
}

export interface ParsedNearEd25519KeyPair {
  readonly publicKeyString: string;
  readonly publicKeyBytes: Buffer;
  signDigest(digest32: Buffer): Buffer;
}

export function parseNearEd25519PrivateKey(
  rawKey: string,
): ParsedNearEd25519KeyPair {
  if (!rawKey.startsWith("ed25519:")) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "NEAR sponsor key must start with ed25519:.",
    );
  }
  const decoded = decodeBase58(rawKey.slice("ed25519:".length));
  if (decoded.length !== 64 && decoded.length !== 32) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      `NEAR sponsor key must decode to 32 or 64 bytes (got ${decoded.length}).`,
    );
  }
  const seed32 = decoded.subarray(0, 32);
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed32]);
  const privateKeyObj = createPrivateKey({
    key: pkcs8,
    format: "der",
    type: "pkcs8",
  });
  const spki = createPublicKey(privateKeyObj).export({
    format: "der",
    type: "spki",
  }) as Buffer;
  const derivedPub32 = Buffer.from(spki.subarray(spki.length - 32));
  if (decoded.length === 64) {
    const embeddedPub32 = decoded.subarray(32, 64);
    if (Buffer.compare(derivedPub32, embeddedPub32) !== 0) {
      throw new FlowError(
        "INVALID_CONFIGURATION",
        "NEAR sponsor key public component does not match seed.",
      );
    }
  }
  const publicKeyString = `ed25519:${encodeBase58(derivedPub32)}`;
  return {
    publicKeyString,
    publicKeyBytes: derivedPub32,
    signDigest(digest32: Buffer): Buffer {
      if (digest32.length !== 32) {
        throw new FlowError(
          "INVALID_CONFIGURATION",
          "NEAR transaction digest must be 32 bytes.",
        );
      }
      return Buffer.from(cryptoSign(null, digest32, privateKeyObj));
    },
  };
}

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

export interface StoreWalletPolicyTxArgs {
  readonly wallet_pubkey: string;
  readonly encrypted_data: string;
  readonly wallet_signature: string;
  readonly version: number;
  readonly locked: boolean;
  readonly valid_until: number;
  readonly storage_refund_to?: string;
}

export interface BuildStoreWalletPolicyTxInput {
  readonly signerId: string;
  readonly publicKeyBytes: Buffer;
  readonly nonce: bigint;
  readonly receiverId: string;
  readonly blockHashBase58: string;
  readonly depositYocto: bigint;
  readonly maxDepositYocto: bigint;
  readonly allowTestContractOverride?: boolean;
  readonly args: StoreWalletPolicyTxArgs;
}

/**
 * Strictly constructs a single-action `FunctionCall` NEAR transaction for
 * `outlayer.near::store_wallet_policy` with bounded deposit.
 * By construction, NO other contract, method, transfer, or key action can be encoded.
 */
export function buildStoreWalletPolicyTransactionBytes(
  input: BuildStoreWalletPolicyTxInput,
): { txBytes: Buffer; txHash: string; argsJson: string } {
  const expectedContract = input.allowTestContractOverride
    ? input.receiverId
    : OUTLAYER_POLICY_CONTRACT_ID;
  if (input.receiverId !== expectedContract) {
    throw new FlowError(
      "POLICY_SPONSOR_TARGET_DENIED",
      `Policy sponsor refuses target contract ${input.receiverId}.`,
    );
  }
  if (!isValidNearAddress(input.signerId)) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "Invalid sponsor signer NEAR account ID.",
    );
  }
  if (input.publicKeyBytes.length !== 32) {
    throw new FlowError(
      "INVALID_CONFIGURATION",
      "Sponsor Ed25519 public key must be 32 bytes.",
    );
  }
  if (input.nonce <= 0n) {
    throw new FlowError("INVALID_INPUT", "NEAR transaction nonce must be >= 1.");
  }
  const blockHash = decodeBase58(input.blockHashBase58);
  if (blockHash.length !== 32) {
    throw new FlowError(
      "UPSTREAM_UNAVAILABLE",
      "NEAR block hash must decode to 32 bytes.",
    );
  }
  const cappedLimit =
    input.maxDepositYocto < MAX_HARD_PER_WALLET_SPONSOR_YOCTO
      ? input.maxDepositYocto
      : MAX_HARD_PER_WALLET_SPONSOR_YOCTO;
  if (input.depositYocto <= 0n || input.depositYocto > cappedLimit) {
    throw new FlowError(
      "POLICY_SPONSOR_CAP_EXCEEDED",
      `Policy storage deposit (${input.depositYocto}) exceeds capped limit (${cappedLimit}).`,
    );
  }
  if (
    input.args.storage_refund_to !== undefined &&
    input.args.storage_refund_to !== input.signerId
  ) {
    throw new FlowError(
      "POLICY_SPONSOR_TARGET_DENIED",
      "storage_refund_to must strictly equal sponsorAccountId.",
    );
  }
  if (!isValidPolicyWalletKey(input.args.wallet_pubkey)) {
    throw new FlowError("INVALID_INPUT", "Invalid wallet_pubkey for policy store.");
  }
  if (!Number.isSafeInteger(input.args.version) || input.args.version < 1) {
    throw new FlowError("INVALID_INPUT", "Policy version must be >= 1.");
  }

  const argsJson = JSON.stringify({
    wallet_pubkey: input.args.wallet_pubkey,
    encrypted_data: input.args.encrypted_data,
    wallet_signature: input.args.wallet_signature,
    version: input.args.version,
    locked: input.args.locked,
    valid_until: input.args.valid_until,
    ...(input.args.storage_refund_to !== undefined
      ? { storage_refund_to: input.args.storage_refund_to }
      : {}),
  });

  const w = new BorshWriter();
  w.writeString(input.signerId);
  w.writeU8(0); // PublicKey::Ed25519
  w.writeFixedBytes(input.publicKeyBytes);
  w.writeU64LE(input.nonce);
  w.writeString(input.receiverId);
  w.writeFixedBytes(blockHash);
  w.writeU32LE(1); // exactly 1 action
  w.writeU8(2); // Action::FunctionCall
  w.writeString(STORE_WALLET_POLICY_METHOD);
  w.writeLengthPrefixedBytes(Buffer.from(argsJson, "utf8"));
  w.writeU64LE(STORE_WALLET_POLICY_GAS_TGAS);
  w.writeU128LE(input.depositYocto);

  const txBytes = w.toBuffer();
  const digest = createHash("sha256").update(txBytes).digest();
  const txHash = encodeBase58(digest);
  return { txBytes, txHash, argsJson };
}

export function encodeSignedNearTransactionBase64(
  txBytes: Buffer,
  signature64: Buffer,
): string {
  if (signature64.length !== 64) {
    throw new FlowError(
      "INVALID_INPUT",
      "Ed25519 signature must be 64 bytes.",
    );
  }
  const w = new BorshWriter();
  w.writeFixedBytes(txBytes);
  w.writeU8(0); // Signature::Ed25519
  w.writeFixedBytes(signature64);
  return w.toBuffer().toString("base64");
}

export interface NearSponsorTxOutcome {
  readonly txHash: string;
  readonly succeeded: boolean;
  readonly gasBurntYocto: bigint;
  readonly refundReceivedYocto: bigint;
  readonly netFeeYocto: bigint;
  readonly failureReason?: string;
}

export interface NearSponsorRpc {
  viewAccountBalance(accountId: string): Promise<bigint>;
  viewAccessKeyNonce(accountId: string, publicKey: string): Promise<bigint>;
  getLatestFinalBlockHash(): Promise<string>;
  estimatePolicyStorageCost(params: {
    walletPubkey: string;
    encryptedData: string;
    storageRefundTo: string;
  }): Promise<bigint>;
  getOnChainWalletPolicy(
    walletPubkey: string,
  ): Promise<OnChainWalletPolicyView | null>;
  sendSignedTransactionFinal(
    signedTxBase64: string,
    attachedDepositYocto: bigint,
    sponsorAccountId: string,
  ): Promise<NearSponsorTxOutcome>;
  queryTransactionStatus(
    txHash: string,
    signerId: string,
    attachedDepositYocto: bigint,
  ): Promise<NearSponsorTxOutcome | null>;
}

interface JsonRpcOutcome {
  status?: { SuccessValue?: string; Failure?: unknown };
  transaction_outcome?: { outcome?: { tokens_burnt?: string } };
  receipts_outcome?: Array<{ outcome?: { tokens_burnt?: string } }>;
  receipts?: Array<{
    predecessor_id?: string;
    receiver_id?: string;
    receipt?: {
      Action?: {
        actions?: Array<{ Transfer?: { deposit?: string } }>;
      };
    };
  }>;
}

function summarizeNearOutcome(
  txHash: string,
  result: JsonRpcOutcome,
  attachedDepositYocto: bigint,
  contractId: string,
  sponsorAccountId: string,
): NearSponsorTxOutcome {
  let gasBurntYocto = BigInt(
    result.transaction_outcome?.outcome?.tokens_burnt ?? "0",
  );
  for (const r of result.receipts_outcome ?? []) {
    gasBurntYocto += BigInt(r.outcome?.tokens_burnt ?? "0");
  }
  let refundReceivedYocto = 0n;
  for (const receipt of result.receipts ?? []) {
    if (
      receipt.predecessor_id === contractId &&
      receipt.receiver_id === sponsorAccountId
    ) {
      for (const action of receipt.receipt?.Action?.actions ?? []) {
        if (action.Transfer?.deposit && /^[0-9]+$/.test(action.Transfer.deposit)) {
          refundReceivedYocto += BigInt(action.Transfer.deposit);
        }
      }
    }
  }
  const succeeded =
    Boolean(result.status && "SuccessValue" in result.status) &&
    !result.status?.Failure;
  const netDepositYocto = succeeded
    ? attachedDepositYocto > refundReceivedYocto
      ? attachedDepositYocto - refundReceivedYocto
      : 0n
    : 0n;
  const netFeeYocto = netDepositYocto + gasBurntYocto;
  return {
    txHash,
    succeeded,
    gasBurntYocto,
    refundReceivedYocto,
    netFeeYocto,
    ...(result.status?.Failure ? { failureReason: "NEAR_TX_EXECUTION_FAILED" } : {}),
  };
}

export class HttpNearSponsorRpcClient implements NearSponsorRpc {
  private readonly endpoints: readonly string[];
  private readonly contractId: string;
  private readonly timeoutMs: number;

  constructor(
    config: Extract<PolicySponsorConfig, { enabled: true }>,
    timeoutMs = 15_000,
  ) {
    this.endpoints = [config.rpcUrl, ...config.fallbackRpcUrls];
    this.contractId = config.contractId;
    this.timeoutMs = timeoutMs;
  }

  private async rpc<T>(method: string, params: unknown): Promise<T> {
    let lastError: unknown;
    for (const url of this.endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
          throw new FlowError(
            "UPSTREAM_UNAVAILABLE",
            `NEAR RPC returned HTTP ${res.status}.`,
          );
        }
        const json = (await res.json()) as {
          result?: T;
          error?: {
            message?: string;
            name?: string;
            cause?: { name?: string };
            data?: unknown;
          };
        };
        if (json.error) {
          const code =
            json.error.cause?.name ?? json.error.name ?? "NEAR_RPC_ERROR";
          const rawTxErr = (
            json.error.data as
              | { TxExecutionError?: { InvalidTxError?: unknown } }
              | undefined
          )?.TxExecutionError?.InvalidTxError;
          let detail: string | null = null;
          if (typeof rawTxErr === "string" && /^[A-Za-z0-9_]+$/.test(rawTxErr)) {
            detail = rawTxErr;
          } else if (rawTxErr && typeof rawTxErr === "object" && !Array.isArray(rawTxErr)) {
            const key = Object.keys(rawTxErr)[0];
            if (key && /^[A-Za-z0-9_]+$/.test(key)) detail = key;
          }
          throw new FlowError(
            "UPSTREAM_UNAVAILABLE",
            detail
              ? `NEAR RPC error: ${code} (${detail})`
              : `NEAR RPC error: ${code}`,
          );
        }
        if (json.result === undefined) {
          throw new FlowError("CORRUPTED_RESPONSE", "NEAR RPC missing result.");
        }
        return json.result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof FlowError
      ? lastError
      : new FlowError("UPSTREAM_UNAVAILABLE", "NEAR RPC unreachable.");
  }

  async viewAccountBalance(accountId: string): Promise<bigint> {
    const res = await this.rpc<{ amount?: string }>("query", {
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    });
    if (!res.amount || !/^[0-9]+$/.test(res.amount)) {
      throw new FlowError("CORRUPTED_RESPONSE", "Invalid NEAR account balance.");
    }
    return BigInt(res.amount);
  }

  async viewAccessKeyNonce(
    accountId: string,
    publicKey: string,
  ): Promise<bigint> {
    const res = await this.rpc<{ nonce?: number | string }>("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: accountId,
      public_key: publicKey,
    });
    if (res.nonce === undefined || res.nonce === null) {
      throw new FlowError("CORRUPTED_RESPONSE", "Invalid NEAR access key nonce.");
    }
    return BigInt(res.nonce);
  }

  async getLatestFinalBlockHash(): Promise<string> {
    const res = await this.rpc<{ header?: { hash?: string } }>("block", {
      finality: "final",
    });
    if (!res.header?.hash) {
      throw new FlowError("CORRUPTED_RESPONSE", "NEAR block missing header.hash.");
    }
    return res.header.hash;
  }

  async estimatePolicyStorageCost(params: {
    walletPubkey: string;
    encryptedData: string;
    storageRefundTo: string;
  }): Promise<bigint> {
    const argsBase64 = Buffer.from(
      JSON.stringify({
        wallet_pubkey: params.walletPubkey,
        encrypted_data: params.encryptedData,
        storage_refund_to: params.storageRefundTo,
      }),
      "utf8",
    ).toString("base64");
    const res = await this.rpc<{ result?: number[] }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: this.contractId,
      method_name: "estimate_wallet_policy_cost",
      args_base64: argsBase64,
    });
    if (!Array.isArray(res.result)) {
      throw new FlowError("CORRUPTED_RESPONSE", "Invalid estimate response.");
    }
    const parsed = JSON.parse(Buffer.from(res.result).toString("utf8")) as unknown;
    if (typeof parsed !== "string" || !/^[0-9]+$/.test(parsed)) {
      throw new FlowError("CORRUPTED_RESPONSE", "Invalid storage cost yocto string.");
    }
    return BigInt(parsed);
  }

  async getOnChainWalletPolicy(
    walletPubkey: string,
  ): Promise<OnChainWalletPolicyView | null> {
    const argsBase64 = Buffer.from(
      JSON.stringify({ wallet_pubkey: walletPubkey }),
      "utf8",
    ).toString("base64");
    const res = await this.rpc<{ result?: number[] }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: this.contractId,
      method_name: "get_wallet_policy",
      args_base64: argsBase64,
    });
    if (!Array.isArray(res.result)) return null;
    const parsed = JSON.parse(Buffer.from(res.result).toString("utf8")) as
      | OnChainWalletPolicyView
      | null;
    return parsed ?? null;
  }

  async sendSignedTransactionFinal(
    signedTxBase64: string,
    attachedDepositYocto: bigint,
    sponsorAccountId: string,
  ): Promise<NearSponsorTxOutcome> {
    const res = await this.rpc<
      JsonRpcOutcome & { transaction?: { hash?: string } }
    >("send_tx", {
      signed_tx_base64: signedTxBase64,
      wait_until: "FINAL",
    });
    const txHash = res.transaction?.hash;
    if (!txHash) {
      throw new FlowError(
        "POST_DISPATCH_AMBIGUOUS",
        "NEAR send_tx returned no transaction hash.",
      );
    }
    return summarizeNearOutcome(
      txHash,
      res,
      attachedDepositYocto,
      this.contractId,
      sponsorAccountId,
    );
  }

  async queryTransactionStatus(
    txHash: string,
    signerId: string,
    attachedDepositYocto: bigint,
  ): Promise<NearSponsorTxOutcome | null> {
    try {
      const res = await this.rpc<JsonRpcOutcome>("tx", {
        tx_hash: txHash,
        sender_account_id: signerId,
        wait_until: "FINAL",
      });
      return summarizeNearOutcome(
        txHash,
        res,
        attachedDepositYocto,
        this.contractId,
        signerId,
      );
    } catch {
      return null;
    }
  }
}

async function resolveRemoteSponsorSignature(
  config: Extract<PolicySponsorConfig, { enabled: true }>,
  publicKeyBytes: Buffer,
  txBytes: Buffer,
  txHash: string,
  depositYocto: bigint,
): Promise<Buffer> {
  const res = await fetch(config.remoteSignerUrl!, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.remoteSignerToken}`,
    },
    body: JSON.stringify({
      txHash,
      txBytesBase64: txBytes.toString("base64"),
      contractId: config.contractId,
      methodName: STORE_WALLET_POLICY_METHOD,
      depositYocto: depositYocto.toString(),
      signerId: config.sponsorAccountId,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new FlowError(
      "UPSTREAM_UNAVAILABLE",
      `Remote policy sponsor signer failed with HTTP ${res.status}.`,
    );
  }
  const payload = (await res.json()) as {
    signatureBase64?: unknown;
    publicKey?: unknown;
  };
  if (typeof payload.signatureBase64 !== "string") {
    throw new FlowError(
      "CORRUPTED_RESPONSE",
      "Remote signer did not return signatureBase64.",
    );
  }
  const sig = Buffer.from(payload.signatureBase64, "base64");
  const digest = createHash("sha256").update(txBytes).digest();
  const spkiKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
    format: "der",
    type: "spki",
  });
  if (sig.length !== 64 || !cryptoVerify(null, digest, spkiKey, sig)) {
    throw new FlowError(
      "CORRELATION_ERROR",
      "Remote signer returned invalid Ed25519 signature.",
    );
  }
  return sig;
}

async function recordSponsorAudit(
  db: FlowDb,
  kind: string,
  accountId: string,
  targetId: string,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO flow.security_audit_events (
      kind, actor_auth_id, account_id, target_id, request_id, created_at
    ) VALUES (
      ${kind}, 'system:custody_policy_sponsor', ${accountId}::uuid, ${targetId}, ${randomUUID()}::uuid, CURRENT_TIMESTAMP
    )
  `;
}

async function bumpCircuitFailure(
  db: FlowDb,
  threshold: number,
  reason: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<
    Array<{ circuit_open: boolean; consecutive_failures: number }>
  >`
    UPDATE flow.custody_sponsor_circuit
    SET
      consecutive_failures = consecutive_failures + 1,
      circuit_open = CASE
        WHEN consecutive_failures + 1 >= ${threshold} THEN true
        ELSE circuit_open
      END,
      opened_at = CASE
        WHEN consecutive_failures + 1 >= ${threshold} AND circuit_open = false
          THEN CURRENT_TIMESTAMP
        ELSE opened_at
      END,
      opened_reason = CASE
        WHEN consecutive_failures + 1 >= ${threshold} THEN ${reason}
        ELSE opened_reason
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 'DEFAULT'
    RETURNING circuit_open, consecutive_failures
  `;
  const row = rows[0];
  if (row?.circuit_open) {
    log("error", "policy_sponsor_circuit_opened", {
      consecutiveFailures: row.consecutive_failures,
      reason,
    });
  }
  return Boolean(row?.circuit_open);
}

export interface SponsorPolicyInput {
  readonly db: FlowDb;
  readonly adapter: OutLayerAdapter;
  readonly nearRpc: NearSponsorRpc;
  readonly config: Extract<PolicySponsorConfig, { enabled: true }>;
  readonly accountId: string;
  readonly walletId: string;
  readonly jobId: string;
  readonly fencingToken: bigint;
  readonly providerWalletId: string;
  readonly apiKey: string;
  readonly walletPubkey: string;
  readonly allowTestContractOverride?: boolean;
  readonly forceReapply?: boolean;
}

export interface SponsorPolicyOutcome {
  readonly status: "SUBMITTED_AND_FINALIZED" | "ALREADY_ON_CHAIN";
  readonly txHash?: string;
  readonly estimatedStorageYocto?: string;
  readonly attachedDepositYocto?: string;
  readonly actualFeeYocto?: string;
  readonly controllerAccountId: string;
}

/**
 * Automated, idempotent, spend-capped NEAR mainnet policy storage sponsor.
 * Guarantees per-wallet idempotency (1 row per wallet_id + pre-broadcast tx_hash),
 * live balance reserve enforcement, 24h daily spend cap, persistent circuit breaker,
 * and strict contract/method isolation (outlayer.near::store_wallet_policy only).
 */
export async function sponsorAndStoreWalletPolicy(
  input: SponsorPolicyInput,
): Promise<SponsorPolicyOutcome> {
  const {
    db,
    adapter,
    nearRpc,
    config,
    accountId,
    walletId,
    jobId,
    fencingToken,
    providerWalletId,
    apiKey,
    walletPubkey,
  } = input;

  // 1 & 2. Check existing sponsorship record and on-chain policy state (recovers crash-after-tx cleanly)
  const existingRows = await db.$queryRaw<
    Array<{
      id: string;
      status: string;
      tx_hash: string | null;
      wallet_pubkey: string;
      attached_deposit_yocto: string;
    }>
  >`
    SELECT id, status, tx_hash, wallet_pubkey, attached_deposit_yocto::text
    FROM flow.custody_policy_sponsorships
    WHERE wallet_id = ${walletId}::uuid
    LIMIT 1
  `;
  const existingSponsorship = existingRows[0];

  let existingOnChain: OnChainWalletPolicyView | null = null;
  if (!input.forceReapply) {
    for (const candidatePubkey of formatWalletPublicKeyCandidates(
      walletPubkey,
      providerWalletId,
      existingSponsorship?.wallet_pubkey,
    )) {
      existingOnChain = await nearRpc.getOnChainWalletPolicy(candidatePubkey);
      if (existingOnChain) break;
    }
    if (existingOnChain) {
      await db.$executeRaw`
        UPDATE flow.custody_policy_sponsorships
        SET status = 'FINALIZED', finalized_at = COALESCE(finalized_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE wallet_id = ${walletId}::uuid AND status IN ('PREPARED', 'BROADCASTING', 'AMBIGUOUS')
      `;
      return {
        status: "ALREADY_ON_CHAIN",
        controllerAccountId: existingOnChain.owner,
      };
    }

    if (existingSponsorship?.tx_hash) {
    const reconciled = await nearRpc.queryTransactionStatus(
      existingSponsorship.tx_hash,
      config.sponsorAccountId,
      BigInt(existingSponsorship.attached_deposit_yocto),
    );
    if (reconciled?.succeeded) {
      await db.$executeRaw`
        UPDATE flow.custody_policy_sponsorships
        SET
          status = 'FINALIZED',
          actual_gas_burnt_yocto = ${reconciled.gasBurntYocto.toString()}::numeric,
          actual_fee_yocto = ${reconciled.netFeeYocto.toString()}::numeric,
          finalized_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${existingSponsorship.id}::uuid
      `;
      await adapter.invalidatePolicyCache(apiKey, providerWalletId);
      return {
        status: "SUBMITTED_AND_FINALIZED",
        txHash: reconciled.txHash,
        attachedDepositYocto: existingSponsorship.attached_deposit_yocto,
        actualFeeYocto: reconciled.netFeeYocto.toString(),
        controllerAccountId: config.sponsorAccountId,
      };
    }
    if (
      existingSponsorship.status === "BROADCASTING" ||
      existingSponsorship.status === "AMBIGUOUS"
    ) {
      throw new FlowError(
        "POST_DISPATCH_AMBIGUOUS",
        "Existing policy sponsorship tx outcome is unresolved; refusing duplicate funded TX.",
      );
    }
  }
  }

  // 3. Persistent circuit breaker check
  const circuitRows = await db.$queryRaw<
    Array<{ circuit_open: boolean; opened_reason: string | null }>
  >`
    SELECT circuit_open, opened_reason
    FROM flow.custody_sponsor_circuit
    WHERE id = 'DEFAULT'
    LIMIT 1
  `;
  if (circuitRows[0]?.circuit_open) {
    throw new FlowError(
      "SPONSOR_CIRCUIT_OPEN",
      "Automated NEAR policy sponsor circuit breaker is open.",
    );
  }

  // 4. Encrypt custody policy (default-deny when execution disabled, live execution when enabled) & request keystore policy signature
  const policyPayload = isFinancialExecutionDisabled()
    ? buildDefaultDenyCustodyPolicy({
        approvalAccountId: config.approvalAccountId,
        lockPolicy: config.lockInitialPolicy,
      })
    : buildLiveExecutionCustodyPolicy();
  const encrypted = await adapter.encryptPolicy(apiKey, {
    walletId: providerWalletId,
    policy: policyPayload,
  });

  const matchesProviderWalletUuid =
    POLICY_UUID_REGEX.test(providerWalletId.trim()) &&
    encrypted.wallet_pubkey.trim().toLowerCase() ===
      providerWalletId.trim().toLowerCase();
  const expectedDecoded = decodeWalletPublicKeyBytes(walletPubkey);
  const actualDecoded = decodeWalletPublicKeyBytes(encrypted.wallet_pubkey);
  const keysMatch =
    matchesProviderWalletUuid ||
    (expectedDecoded && actualDecoded
      ? expectedDecoded.scheme === actualDecoded.scheme &&
        expectedDecoded.bytes.equals(actualDecoded.bytes)
      : encrypted.wallet_pubkey.toLowerCase() === walletPubkey.toLowerCase());
  if (!keysMatch) {
    throw new FlowError(
      "CORRELATION_ERROR",
      "Encrypted policy wallet_pubkey does not match FLOW wallet record.",
    );
  }

  const initialEstimateKey = POLICY_UUID_REGEX.test(encrypted.wallet_pubkey.trim())
    ? walletPubkey
    : encrypted.wallet_pubkey;
  let estimatedStorageYocto = await nearRpc.estimatePolicyStorageCost({
    walletPubkey: initialEstimateKey,
    encryptedData: encrypted.encrypted_base64,
    storageRefundTo: config.sponsorAccountId,
  });

  let maxProjectedFeeYocto =
    estimatedStorageYocto + CONSERVATIVE_GAS_FEE_BUFFER_YOCTO;
  if (maxProjectedFeeYocto > config.maxFeePerWalletYocto) {
    await bumpCircuitFailure(
      db,
      config.circuitFailureThreshold,
      "PER_WALLET_FEE_CAP_EXCEEDED",
    );
    throw new FlowError(
      "POLICY_SPONSOR_CAP_EXCEEDED",
      `Projected policy fee (${maxProjectedFeeYocto}) exceeds per-wallet limit (${config.maxFeePerWalletYocto}).`,
    );
  }

  // 5. Daily 24h spend cap check
  const spendRows = await db.$queryRaw<Array<{ total_yocto: string | null }>>`
    SELECT COALESCE(SUM(COALESCE(actual_fee_yocto, max_allowed_fee_yocto)), 0)::text AS total_yocto
    FROM flow.custody_policy_sponsorships
    WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
      AND status IN ('BROADCASTING', 'FINALIZED', 'VERIFIED', 'AMBIGUOUS')
  `;
  const spent24hYocto = BigInt(spendRows[0]?.total_yocto ?? "0");
  if (spent24hYocto + maxProjectedFeeYocto > config.dailySpendCapYocto) {
    throw new FlowError(
      "SPONSOR_DAILY_CAP_EXCEEDED",
      "Automated NEAR policy sponsor 24-hour spending cap reached.",
    );
  }

  // 6. Live sponsor balance + reserve check
  const sponsorBalanceYocto = await nearRpc.viewAccountBalance(
    config.sponsorAccountId,
  );
  await db.$executeRaw`
    UPDATE flow.custody_sponsor_circuit
    SET
      last_known_balance_yocto = ${sponsorBalanceYocto.toString()}::numeric,
      last_balance_checked_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 'DEFAULT'
  `;
  if (sponsorBalanceYocto - maxProjectedFeeYocto < config.minBalanceReserveYocto) {
    await bumpCircuitFailure(
      db,
      config.circuitFailureThreshold,
      "SPONSOR_BALANCE_BELOW_RESERVE",
    );
    throw new FlowError(
      "SPONSOR_LOW_BALANCE",
      "Sponsor NEAR account balance is below configured minimum operational reserve.",
    );
  }

  // 7. Sign encrypted policy via OutLayer keystore bound exclusively to sponsorAccountId
  const signRes = await adapter.signPolicy(apiKey, {
    encryptedData: encrypted.encrypted_base64,
    callerAccountId: config.sponsorAccountId,
  });
  if (!("signature_hex" in signRes)) {
    throw new FlowError(
      "POLICY_VERIFICATION_FAILED",
      "Initial policy unexpectedly returned pending_approval.",
    );
  }
  const onChainWalletPubkey = formatOnChainWalletPublicKeyHex(
    signRes.public_key_hex,
  );
  if (onChainWalletPubkey !== initialEstimateKey) {
    estimatedStorageYocto = await nearRpc.estimatePolicyStorageCost({
      walletPubkey: onChainWalletPubkey,
      encryptedData: encrypted.encrypted_base64,
      storageRefundTo: config.sponsorAccountId,
    });
    maxProjectedFeeYocto =
      estimatedStorageYocto + CONSERVATIVE_GAS_FEE_BUFFER_YOCTO;
    if (maxProjectedFeeYocto > config.maxFeePerWalletYocto) {
      await bumpCircuitFailure(
        db,
        config.circuitFailureThreshold,
        "PER_WALLET_FEE_CAP_EXCEEDED",
      );
      throw new FlowError(
        "POLICY_SPONSOR_CAP_EXCEEDED",
        `Projected policy fee (${maxProjectedFeeYocto}) exceeds per-wallet limit (${config.maxFeePerWalletYocto}).`,
      );
    }
    if (
      sponsorBalanceYocto - maxProjectedFeeYocto <
      config.minBalanceReserveYocto
    ) {
      await bumpCircuitFailure(
        db,
        config.circuitFailureThreshold,
        "SPONSOR_BALANCE_BELOW_RESERVE",
      );
      throw new FlowError(
        "SPONSOR_LOW_BALANCE",
        "Sponsor NEAR account balance is below configured minimum operational reserve.",
      );
    }
  }

  // 8. Resolve sponsor signer keypair, nonce, and block hash
  let publicKeyBytes: Buffer;
  let publicKeyString: string;
  let signFn: (digest32: Buffer, txBytes: Buffer, txHash: string) => Promise<Buffer>;

  if (config.signerMode === "local-ed25519") {
    const keyPair = parseNearEd25519PrivateKey(config.privateKey!);
    publicKeyBytes = keyPair.publicKeyBytes;
    publicKeyString = keyPair.publicKeyString;
    signFn = async (digest32) => keyPair.signDigest(digest32);
  } else {
    // Remote signer provides public key query or derives from access key view
    const remoteRes = await fetch(config.remoteSignerUrl!, {
      method: "GET",
      headers: { authorization: `Bearer ${config.remoteSignerToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!remoteRes.ok) {
      throw new FlowError(
        "UPSTREAM_UNAVAILABLE",
        "Remote policy sponsor signer metadata request failed.",
      );
    }
    const meta = (await remoteRes.json()) as { publicKey?: string };
    if (!meta.publicKey || !meta.publicKey.startsWith("ed25519:")) {
      throw new FlowError(
        "CORRUPTED_RESPONSE",
        "Remote signer returned invalid publicKey.",
      );
    }
    publicKeyString = meta.publicKey;
    publicKeyBytes = decodeBase58(meta.publicKey.slice("ed25519:".length));
    signFn = async (_digest32, txBytes, txHash) =>
      resolveRemoteSponsorSignature(
        config,
        publicKeyBytes,
        txBytes,
        txHash,
        estimatedStorageYocto,
      );
  }

  let outcome: NearSponsorTxOutcome | null = null;
  for (let broadcastAttempt = 0; broadcastAttempt < 2; broadcastAttempt++) {
    const [currentNonce, blockHashBase58] = await Promise.all([
      nearRpc.viewAccessKeyNonce(config.sponsorAccountId, publicKeyString),
      nearRpc.getLatestFinalBlockHash(),
    ]);

    const { txBytes, txHash } = buildStoreWalletPolicyTransactionBytes({
      signerId: config.sponsorAccountId,
      publicKeyBytes,
      nonce: currentNonce + 1n,
      receiverId: config.contractId,
      blockHashBase58,
      depositYocto: estimatedStorageYocto,
      maxDepositYocto: config.maxFeePerWalletYocto,
      allowTestContractOverride: input.allowTestContractOverride,
      args: {
        wallet_pubkey: onChainWalletPubkey,
        encrypted_data: encrypted.encrypted_base64,
        wallet_signature: signRes.signature_hex,
        version: signRes.version,
        locked: signRes.locked,
        valid_until: signRes.valid_until,
        ...(input.forceReapply
          ? {}
          : { storage_refund_to: config.sponsorAccountId }),
      },
    });

    const digest = createHash("sha256").update(txBytes).digest();
    const signature64 = await signFn(digest, txBytes, txHash);
    const signedTxBase64 = encodeSignedNearTransactionBase64(txBytes, signature64);

    // 9. Persist deterministic tx_hash & fee reservation BEFORE broadcast (crash-safe)
    await db.$executeRaw`
      INSERT INTO flow.custody_policy_sponsorships (
        wallet_id, account_id, job_id, wallet_pubkey, sponsor_account_id,
        contract_id, method_name, policy_version, policy_hash,
        estimated_storage_yocto, attached_deposit_yocto, max_allowed_fee_yocto,
        tx_hash, status, fencing_token
      ) VALUES (
        ${walletId}::uuid, ${accountId}::uuid, ${jobId}::uuid, ${onChainWalletPubkey},
        ${config.sponsorAccountId}, ${config.contractId}, ${STORE_WALLET_POLICY_METHOD},
        ${BigInt(signRes.version)}, ${encrypted.policy_hash},
        ${estimatedStorageYocto.toString()}::numeric, ${estimatedStorageYocto.toString()}::numeric,
        ${maxProjectedFeeYocto.toString()}::numeric,
        ${txHash}, 'BROADCASTING', ${fencingToken}
      )
      ON CONFLICT (wallet_id) DO UPDATE SET
        wallet_pubkey = EXCLUDED.wallet_pubkey,
        tx_hash = EXCLUDED.tx_hash,
        policy_version = EXCLUDED.policy_version,
        policy_hash = EXCLUDED.policy_hash,
        estimated_storage_yocto = EXCLUDED.estimated_storage_yocto,
        attached_deposit_yocto = EXCLUDED.attached_deposit_yocto,
        max_allowed_fee_yocto = EXCLUDED.max_allowed_fee_yocto,
        status = 'BROADCASTING',
        error_code = NULL,
        fencing_token = EXCLUDED.fencing_token,
        updated_at = CURRENT_TIMESTAMP
    `;

    await recordSponsorAudit(
      db,
      "wallet_policy_sponsor_submitted",
      accountId,
      `${walletId}:${txHash}`,
    );

    // 10. Broadcast transaction with finality confirmation
    try {
      outcome = await nearRpc.sendSignedTransactionFinal(
        signedTxBase64,
        estimatedStorageYocto,
        config.sponsorAccountId,
      );
      break;
    } catch (error) {
      // Reconcile immediately by deterministic tx_hash before deciding rejected/ambiguous
      const recovered = await nearRpc.queryTransactionStatus(
        txHash,
        config.sponsorAccountId,
        estimatedStorageYocto,
      );
      if (recovered) {
        outcome = recovered;
        break;
      }

      const isPreMempoolInvalidTx =
        error instanceof FlowError &&
        error.code === "UPSTREAM_UNAVAILABLE" &&
        error.message.includes("INVALID_TRANSACTION");

      if (isPreMempoolInvalidTx) {
        await db.$executeRaw`
          UPDATE flow.custody_policy_sponsorships
          SET status = 'FAILED', error_code = 'NEAR_INVALID_TRANSACTION', updated_at = CURRENT_TIMESTAMP
          WHERE wallet_id = ${walletId}::uuid
        `;
        if (broadcastAttempt === 0) {
          log("info", "policy_sponsor_retrying_invalid_tx", {
            walletId,
            reason: error.message,
          });
          continue;
        }
        await bumpCircuitFailure(
          db,
          config.circuitFailureThreshold,
          "NEAR_INVALID_TRANSACTION",
        );
        await recordSponsorAudit(
          db,
          "wallet_policy_sponsor_failed",
          accountId,
          `${walletId}:${txHash}`,
        );
        throw error;
      }

      await db.$executeRaw`
        UPDATE flow.custody_policy_sponsorships
        SET status = 'AMBIGUOUS', error_code = 'POST_DISPATCH_AMBIGUOUS', updated_at = CURRENT_TIMESTAMP
        WHERE wallet_id = ${walletId}::uuid
      `;
      await bumpCircuitFailure(
        db,
        config.circuitFailureThreshold,
        "NEAR_BROADCAST_AMBIGUOUS",
      );
      await recordSponsorAudit(
        db,
        "wallet_policy_sponsor_ambiguous",
        accountId,
        `${walletId}:${txHash}`,
      );
      throw error instanceof FlowError
        ? error
        : new FlowError("POST_DISPATCH_AMBIGUOUS", "NEAR policy tx status ambiguous.");
    }
  }
  if (!outcome) {
    throw new FlowError("UPSTREAM_UNAVAILABLE", "NEAR policy transaction did not complete.");
  }

  if (!outcome.succeeded) {
    await db.$executeRaw`
      UPDATE flow.custody_policy_sponsorships
      SET
        status = 'FAILED',
        actual_gas_burnt_yocto = ${outcome.gasBurntYocto.toString()}::numeric,
        actual_fee_yocto = ${outcome.netFeeYocto.toString()}::numeric,
        error_code = 'NEAR_TX_EXECUTION_FAILED',
        updated_at = CURRENT_TIMESTAMP
      WHERE wallet_id = ${walletId}::uuid
    `;
    await bumpCircuitFailure(
      db,
      config.circuitFailureThreshold,
      "NEAR_TX_EXECUTION_FAILED",
    );
    await recordSponsorAudit(
      db,
      "wallet_policy_sponsor_failed",
      accountId,
      `${walletId}:${outcome.txHash}`,
    );
    throw new FlowError(
      "POLICY_VERIFICATION_FAILED",
      "On-chain store_wallet_policy transaction failed execution.",
    );
  }

  // 11. Verify on-chain stored policy before cache invalidation
  const storedView = await nearRpc.getOnChainWalletPolicy(onChainWalletPubkey);
  if (
    !storedView ||
    storedView.owner.toLowerCase() !== config.sponsorAccountId.toLowerCase() ||
    storedView.frozen !== false
  ) {
    throw new FlowError(
      "POLICY_VERIFICATION_FAILED",
      "On-chain wallet policy could not be verified after tx finality.",
    );
  }

  await db.$executeRaw`
    UPDATE flow.custody_policy_sponsorships
    SET
      status = 'FINALIZED',
      actual_gas_burnt_yocto = ${outcome.gasBurntYocto.toString()}::numeric,
      actual_fee_yocto = ${outcome.netFeeYocto.toString()}::numeric,
      finalized_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
    WHERE wallet_id = ${walletId}::uuid
  `;

  await db.$executeRaw`
    UPDATE flow.custody_sponsor_circuit
    SET consecutive_failures = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = 'DEFAULT'
  `;

  await adapter.invalidatePolicyCache(apiKey, providerWalletId);
  await recordSponsorAudit(
    db,
    "wallet_policy_sponsor_finalized",
    accountId,
    `${walletId}:${outcome.txHash}:${outcome.netFeeYocto.toString()}`,
  );

  return {
    status: "SUBMITTED_AND_FINALIZED",
    txHash: outcome.txHash,
    estimatedStorageYocto: estimatedStorageYocto.toString(),
    attachedDepositYocto: estimatedStorageYocto.toString(),
    actualFeeYocto: outcome.netFeeYocto.toString(),
    controllerAccountId: config.sponsorAccountId,
  };
}

function isLiveExecutionPolicyActive(policyResponse: {
  readonly policy?: string;
  readonly rules?: Record<string, unknown>;
  readonly capabilities?: Record<string, unknown>;
}): boolean {
  if (policyResponse.policy !== "stored" || !policyResponse.rules) {
    return false;
  }
  const txTypes = policyResponse.rules.transaction_types;
  const hasTransferAndCall =
    Array.isArray(txTypes) &&
    txTypes.includes("transfer") &&
    txTypes.includes("call");
  const caps = policyResponse.capabilities ?? {};
  const evmAllowed =
    caps.evm_sign === true ||
    (typeof caps.evm_sign === "object" &&
      caps.evm_sign !== null &&
      (caps.evm_sign as Record<string, unknown>).allowed === true);
  const solAllowed =
    caps.solana_sign === true ||
    (typeof caps.solana_sign === "object" &&
      caps.solana_sign !== null &&
      (caps.solana_sign as Record<string, unknown>).allowed === true);
  return hasTransferAndCall && evmAllowed && solAllowed;
}

/**
 * Upgrades any ACTIVE mainnet wallets still carrying a default-deny policy to the
 * live-execution custody policy when `FLOW_EXECUTION=enabled`.
 */
export async function upgradeActiveWalletsToLiveExecutionPolicy(params: {
  readonly db: FlowDb;
  readonly adapter: OutLayerAdapter;
  readonly sponsorConfig: Extract<PolicySponsorConfig, { enabled: true }>;
  readonly walletConfig: Pick<WalletConfig, "encryptionKey" | "keyId"> & {
    readonly fallbackEncryptionKey?: string;
  };
}): Promise<void> {
  if (isFinancialExecutionDisabled()) return;

  const { db, adapter, sponsorConfig, walletConfig } = params;
  const nearRpc = new HttpNearSponsorRpcClient(sponsorConfig);

  // Reset transient circuit breaker from prior startup attempts before upgrading policies
  await db.$executeRaw`
    UPDATE flow.custody_sponsor_circuit
    SET circuit_open = false,
        consecutive_failures = 0,
        opened_reason = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 'DEFAULT'
      AND circuit_open = true
  `;
  const wallets = await db.$queryRaw<
    Array<{
      wallet_id: string;
      account_id: string;
      provider_wallet_id: string;
      near_account_id: string;
      encrypted_credential: string;
      key_id: string;
      job_id: string | null;
    }>
  >`
    SELECT
      w.id::text AS wallet_id,
      w.account_id::text AS account_id,
      w.provider_wallet_id,
      w.near_account_id,
      w.encrypted_credential,
      w.key_id,
      j.id::text AS job_id
    FROM flow.wallets w
    LEFT JOIN flow.wallet_provisioning_jobs j ON j.account_id = w.account_id
    WHERE w.status = 'ACTIVE'::flow.wallet_status
      AND w.environment = 'mainnet'
      AND w.policy_state = 'stored'
      AND w.provider_wallet_id IS NOT NULL
      AND w.near_account_id IS NOT NULL
      AND w.encrypted_credential IS NOT NULL
  `;

  for (const wallet of wallets) {
    try {
      const keyHex =
        wallet.key_id === walletConfig.keyId
          ? walletConfig.encryptionKey
          : (walletConfig.fallbackEncryptionKey ?? walletConfig.encryptionKey);
      const apiKey = decryptSecret(
        deserializeEnvelope(wallet.encrypted_credential),
        keyHex,
      );
      const currentPolicy = await adapter.getPolicy(
        apiKey,
        wallet.provider_wallet_id,
      );
      if (isLiveExecutionPolicyActive(currentPolicy)) {
        continue;
      }
      const outcome = await sponsorAndStoreWalletPolicy({
        db,
        adapter,
        nearRpc,
        config: sponsorConfig,
        accountId: wallet.account_id,
        walletId: wallet.wallet_id,
        jobId: wallet.job_id ?? wallet.wallet_id,
        fencingToken: 1n,
        providerWalletId: wallet.provider_wallet_id,
        apiKey,
        walletPubkey: wallet.near_account_id,
        forceReapply: true,
      });
      log("info", "wallet_policy_upgraded_to_live_execution", {
        walletId: wallet.wallet_id,
        providerWalletId: wallet.provider_wallet_id,
        status: outcome.status,
        txHash: outcome.txHash ?? null,
      });
    } catch (error: unknown) {
      log("error", "wallet_policy_upgrade_failed", {
        walletId: wallet.wallet_id,
        reason: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      });
    }
  }
}
