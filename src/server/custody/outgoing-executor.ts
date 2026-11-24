import { address } from "@solana/addresses";
import { AccountRole } from "@solana/instructions";
import {
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/transaction-messages";
import {
  compileTransaction,
  getBase64EncodedWireTransaction,
} from "@solana/transactions";
import {
  encodeFunctionData,
  parseAbi,
  serializeTransaction,
  type Address,
  type Hex,
} from "viem";
import { isFinancialExecutionDisabled } from "../../domain/custody.ts";
import {
  BURROW_CONTRACT,
  BURROW_STORAGE_DEPOSIT_YOCTO,
  BURROW_USDC_CONTRACT,
  EARN_MEMO,
  isEarnMemo,
  LINEAR_CONTRACT,
  type EarnMemo,
} from "../../domain/earn.ts";
import {
  EARN_DEPOSIT_FEE_BPS,
  resolveFeeTreasuryAccount,
  splitPlatformFee,
} from "../../domain/platform-fees.ts";
import type { NetworkId } from "../../domain/providers.ts";
import {
  decryptSecret,
  deserializeEnvelope,
} from "../../foundation/crypto-envelope.ts";
import { FlowError } from "../../foundation/errors.ts";
import { log } from "../../foundation/logger.ts";
import type { FlowDb } from "../../foundation/prisma.ts";
import type { WalletConfig } from "../../foundation/wallet-environment.ts";
import { reconcileWalletBalances } from "../assets/connectors/multi-chain-reconciler.ts";
import { callJsonRpc } from "../assets/connectors/rpc-client.ts";
import { SOLANA_PROGRAMS } from "../assets/connectors/solana-connector.ts";
import { ingestWalletActivities } from "../assets/indexers/multi-chain-activity-ingester.ts";
import { verifyOnChainTransfer } from "../payments/on-chain-verifier.ts";
import { fetchOneClickExecutionStatus } from "../providers/one-click-adapter.ts";
import { DEFAULT_RPC_ENDPOINTS } from "./blockchain-connectivity.ts";
import type { OutLayerAdapter } from "./outlayer-adapter.ts";

const ERC20_TRANSFER_ABI = parseAbi([
  "function transfer(address to, uint256 value) returns (bool)",
]);

const SOLANA_SYSTEM_PROGRAM = "11111111111111111111111111111111";
const SOLANA_ASSOCIATED_TOKEN_PROGRAM =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SOLANA_SYSTEM_RENT_EXEMPT_LAMPORTS = 890_880n;
const SOLANA_ATA_RENT_LAMPORTS = 2_039_280n;
const SOLANA_BASE_FEE_LAMPORTS = 5_000n;
const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const ETH_MAINNET_RPC =
  process.env.FLOW_ETHEREUM_RPC_URL || "https://ethereum-rpc.publicnode.com";
const ETH_MAINNET_FALLBACK_RPC = "https://rpc.ankr.com/eth";
const ETH_SEPOLIA_RPC =
  process.env.FLOW_ETHEREUM_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";
const BASE_MAINNET_RPC =
  process.env.FLOW_BASE_RPC_URL || DEFAULT_RPC_ENDPOINTS.base;
const BASE_MAINNET_FALLBACK_RPC = "https://base-rpc.publicnode.com";
const BASE_SEPOLIA_RPC =
  process.env.FLOW_BASE_SEPOLIA_RPC_URL || DEFAULT_RPC_ENDPOINTS.baseSepolia;
const SOLANA_MAINNET_RPC =
  process.env.FLOW_SOLANA_RPC_URL || DEFAULT_RPC_ENDPOINTS.solana;
const SOLANA_MAINNET_FALLBACK_RPC = "https://solana-rpc.publicnode.com";
const SOLANA_DEVNET_RPC =
  process.env.FLOW_SOLANA_DEVNET_RPC_URL || DEFAULT_RPC_ENDPOINTS.solanaDevnet;
const NEAR_MAINNET_RPC =
  process.env.FLOW_NEAR_RPC_URL || DEFAULT_RPC_ENDPOINTS.near;
const NEAR_MAINNET_FALLBACK_RPC = "https://near.lava.build";
const NEAR_TESTNET_RPC =
  process.env.FLOW_NEAR_TESTNET_RPC_URL || DEFAULT_RPC_ENDPOINTS.nearTestnet;

export interface ClaimedOutgoingCustodyJob {
  readonly id: string;
  readonly public_id: string;
  readonly account_id: string;
  readonly wallet_id: string;
  readonly job_kind: "SEND" | "CONVERT";
  readonly source_network: string;
  readonly source_asset_id: string;
  readonly source_asset_symbol: string;
  readonly source_decimals: number;
  readonly source_atomic_amount: string;
  readonly recipient_address: string;
  readonly destination_network: string;
  readonly destination_asset_id: string;
  readonly destination_asset_symbol: string;
  readonly destination_decimals: number;
  readonly provider_deposit_address: string | null;
  readonly provider_deposit_memo: string | null;
  readonly provider_correlation_id: string | null;
  readonly fencing_token: bigint;
  readonly provider_wallet_id: string;
  readonly credential_envelope: string;
  readonly key_id: string;
  readonly wallet_environment: string;
  readonly source_address: string;
}

export interface ClaimedOutgoingConfirmationJob {
  readonly id: string;
  readonly public_id: string;
  readonly account_id: string;
  readonly wallet_id: string;
  readonly job_kind: "SEND" | "CONVERT";
  readonly source_network: string;
  readonly source_asset_id: string;
  readonly destination_network: string;
  readonly destination_asset_id: string;
  readonly recipient_address: string;
  readonly provider_deposit_address: string | null;
  readonly provider_deposit_memo: string | null;
  readonly source_tx_hash: string | null;
  readonly destination_tx_hash: string | null;
  readonly status: "CONFIRMING" | "PROVIDER_SETTLING";
  readonly wallet_environment: string;
}

export function decodeBase58(
  input: string,
  expectedLength?: number,
): Uint8Array {
  let num = 0n;
  for (const char of input) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        "Invalid base58 character in signature.",
      );
    }
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }
  bytes.reverse();
  let leadingZeros = 0;
  for (const char of input) {
    if (char === "1") {
      leadingZeros++;
    } else {
      break;
    }
  }
  const out = new Uint8Array(leadingZeros + bytes.length);
  out.set(bytes, leadingZeros);
  if (expectedLength !== undefined && out.length !== expectedLength) {
    throw new FlowError(
      "CUSTODY_PROVIDER_ERROR",
      `Expected ${expectedLength}-byte decoded base58 payload, received ${out.length} bytes.`,
    );
  }
  return out;
}

export function resolveChainRpc(
  network: string,
  walletEnvironment = "mainnet",
): { primary: string; fallback?: string } {
  const isTestnet = walletEnvironment === "testnet";
  switch (network) {
    case "ethereum-mainnet":
    case "ethereum-sepolia":
      return isTestnet || network === "ethereum-sepolia"
        ? { primary: ETH_SEPOLIA_RPC }
        : { primary: ETH_MAINNET_RPC, fallback: ETH_MAINNET_FALLBACK_RPC };
    case "base-mainnet":
    case "base-sepolia":
      return isTestnet || network === "base-sepolia"
        ? { primary: BASE_SEPOLIA_RPC }
        : { primary: BASE_MAINNET_RPC, fallback: BASE_MAINNET_FALLBACK_RPC };
    case "solana-mainnet":
    case "solana-devnet":
      return isTestnet || network === "solana-devnet"
        ? { primary: SOLANA_DEVNET_RPC }
        : {
            primary: SOLANA_MAINNET_RPC,
            fallback: SOLANA_MAINNET_FALLBACK_RPC,
          };
    case "near-mainnet":
    case "near-testnet":
      return isTestnet || network === "near-testnet"
        ? { primary: NEAR_TESTNET_RPC }
        : { primary: NEAR_MAINNET_RPC, fallback: NEAR_MAINNET_FALLBACK_RPC };
    default:
      throw new FlowError(
        "UNSUPPORTED_CHAIN",
        `Unsupported custody execution network: ${network}`,
      );
  }
}

function resolveDecryptionKey(
  keyId: string,
  walletConfig: Pick<WalletConfig, "encryptionKey" | "keyId"> & {
    readonly fallbackEncryptionKey?: string;
  },
): string {
  if (keyId === walletConfig.keyId) {
    return walletConfig.encryptionKey;
  }
  if (walletConfig.fallbackEncryptionKey) {
    return walletConfig.fallbackEncryptionKey;
  }
  return walletConfig.encryptionKey;
}

function getEvmParams(
  network: string,
  walletEnvironment: string,
): { chainId: number; outlayerChain: "ethereum" | "base" } {
  if (network === "ethereum-mainnet" || network === "ethereum-sepolia") {
    return {
      chainId:
        walletEnvironment === "testnet" || network === "ethereum-sepolia"
          ? 11155111
          : 1,
      outlayerChain: "ethereum",
    };
  }
  if (network === "base-mainnet" || network === "base-sepolia") {
    return {
      chainId:
        walletEnvironment === "testnet" || network === "base-sepolia"
          ? 84532
          : 8453,
      outlayerChain: "base",
    };
  }
  throw new FlowError(
    "UNSUPPORTED_CHAIN",
    `Unsupported EVM network: ${network}`,
  );
}

async function executeEvmTransfer(
  job: ClaimedOutgoingCustodyJob,
  apiKey: string,
  outlayer: OutLayerAdapter,
  targetAddress: string,
  markSigningStarted: () => Promise<void>,
): Promise<{ txHash: string; feeAtomic: string }> {
  const { primary, fallback } = resolveChainRpc(
    job.source_network,
    job.wallet_environment,
  );
  const { chainId, outlayerChain } = getEvmParams(
    job.source_network,
    job.wallet_environment,
  );
  const amount = BigInt(job.source_atomic_amount);
  const isNative = job.source_asset_id.toLowerCase() === "native";

  const [nonceRes, blockRes, priorityRes] = await Promise.all([
    callJsonRpc<string>(
      primary,
      "eth_getTransactionCount",
      [job.source_address, "pending"],
      { fallbackEndpoint: fallback },
    ),
    callJsonRpc<{ baseFeePerGas?: string }>(
      primary,
      "eth_getBlockByNumber",
      ["latest", false],
      { fallbackEndpoint: fallback },
    ),
    callJsonRpc<string>(primary, "eth_maxPriorityFeePerGas", [], {
      fallbackEndpoint: fallback,
    }),
  ]);

  if (nonceRes.response.error || !nonceRes.response.result) {
    throw new FlowError(
      "RPC_NETWORK_ERROR",
      nonceRes.response.error?.message ?? "Failed to fetch EVM nonce.",
    );
  }
  const nonce = Number(BigInt(nonceRes.response.result));
  const baseFee = BigInt(
    blockRes.response.result?.baseFeePerGas ?? "0x3b9aca00",
  );
  const defaultPriority =
    outlayerChain === "base" ? 50_000_000n : 1_000_000_000n;
  const maxPriorityFeePerGas = priorityRes.response.result
    ? BigInt(priorityRes.response.result)
    : defaultPriority;
  const maxFeePerGas = baseFee * 2n + maxPriorityFeePerGas;

  let to: Address;
  let value: bigint;
  let data: Hex | undefined;
  let gas = 21_000n;

  if (isNative) {
    to = targetAddress as Address;
    value = amount;
  } else {
    to = job.source_asset_id as Address;
    value = 0n;
    data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: "transfer",
      args: [targetAddress as Address, amount],
    });
    const estRes = await callJsonRpc<string>(
      primary,
      "eth_estimateGas",
      [{ from: job.source_address, to, data }],
      { fallbackEndpoint: fallback },
    );
    if (estRes.response.error) {
      throw new FlowError(
        "RPC_NETWORK_ERROR",
        estRes.response.error.message ??
          "ERC-20 transfer preflight gas estimation failed.",
      );
    }
    const estimated = BigInt(estRes.response.result ?? "65000");
    const padded = (estimated * 125n) / 100n;
    gas = padded < 65_000n ? 65_000n : padded > 250_000n ? 250_000n : padded;
  }

  const unsignedTx = {
    type: "eip1559" as const,
    chainId,
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gas,
    to,
    value,
    ...(data ? { data } : {}),
  };

  const unsignedTxHex = serializeTransaction(unsignedTx);

  await markSigningStarted();
  const signedRes = await outlayer.signEvmTransaction(apiKey, {
    chain: outlayerChain,
    unsignedTxHex,
  });

  const sigHex = signedRes.signature.startsWith("0x")
    ? signedRes.signature.slice(2)
    : signedRes.signature;
  if (!/^[a-f0-9]{130}$/i.test(sigHex)) {
    throw new FlowError(
      "CUSTODY_PROVIDER_ERROR",
      "OutLayer returned invalid 65-byte EVM signature.",
    );
  }
  const r = `0x${sigHex.slice(0, 64)}` as Hex;
  const s = `0x${sigHex.slice(64, 128)}` as Hex;
  const vByte = parseInt(sigHex.slice(128, 130), 16);
  const yParity = vByte >= 27 ? vByte - 27 : vByte;
  if (yParity !== 0 && yParity !== 1) {
    throw new FlowError(
      "CUSTODY_PROVIDER_ERROR",
      "OutLayer returned invalid EVM recovery yParity.",
    );
  }

  const signedTxHex = serializeTransaction(unsignedTx, { r, s, yParity });
  const sendRes = await callJsonRpc<string>(
    primary,
    "eth_sendRawTransaction",
    [signedTxHex],
    { fallbackEndpoint: fallback },
  );
  if (sendRes.response.error || !sendRes.response.result) {
    throw new FlowError(
      "RPC_NETWORK_ERROR",
      sendRes.response.error?.message ?? "eth_sendRawTransaction rejected.",
    );
  }

  return {
    txHash: sendRes.response.result,
    feeAtomic: (gas * maxFeePerGas).toString(),
  };
}

async function deriveAtaAddress(
  owner: string,
  tokenProgram: string,
  mint: string,
): Promise<string> {
  const ownerBytes = decodeBase58(owner, 32);
  const programBytes = decodeBase58(tokenProgram, 32);
  const mintBytes = decodeBase58(mint, 32);
  const [pda] = await Promise.resolve().then(() =>
    import("@solana/addresses").then((m) =>
      m.getProgramDerivedAddress({
        programAddress: address(SOLANA_ASSOCIATED_TOKEN_PROGRAM),
        seeds: [ownerBytes, programBytes, mintBytes],
      }),
    ),
  );
  return pda;
}

function formatSolanaRpcSendError(
  error:
    | {
        readonly message?: string;
        readonly data?: unknown;
      }
    | undefined,
): string {
  const baseMessage = error?.message ?? "Solana sendTransaction rejected.";
  const data =
    error?.data && typeof error.data === "object"
      ? (error.data as { err?: unknown; logs?: unknown })
      : null;
  const err = data?.err;

  if (err && typeof err === "object") {
    const errObj = err as Record<string, unknown>;
    if ("InsufficientFundsForRent" in errObj) {
      const rentObj = errObj.InsufficientFundsForRent as
        | { account_index?: number }
        | undefined;
      if (rentObj?.account_index === 0) {
        return "Solana requires keeping at least 0.001 SOL in your wallet for account rent and network fee. Try sending a slightly smaller amount.";
      }
      return "Recipient Solana address needs at least 0.001 SOL on first deposit to cover Solana account rent.";
    }
    if ("InstructionError" in errObj) {
      const logs = Array.isArray(data?.logs)
        ? data.logs.filter((l): l is string => typeof l === "string")
        : [];
      const insufficientLamports = logs.some((l) =>
        /insufficient lamports|insufficient funds/i.test(l),
      );
      if (insufficientLamports) {
        return "Insufficient SOL balance to cover this transfer, account rent, and Solana network fee.";
      }
      return `${baseMessage} (${JSON.stringify(err)})`;
    }
    return `${baseMessage} (${JSON.stringify(err)})`;
  }

  if (typeof err === "string") {
    if (err === "AccountNotFound" || err === "InsufficientFundsForFee") {
      return "Insufficient SOL balance in your wallet to pay Solana network fees.";
    }
    if (err === "BlockhashNotFound") {
      return "Solana blockhash expired before broadcast. Please retry your transfer.";
    }
    return `${baseMessage} (${err})`;
  }

  return baseMessage;
}

async function executeSolanaTransfer(
  job: ClaimedOutgoingCustodyJob,
  apiKey: string,
  outlayer: OutLayerAdapter,
  targetAddress: string,
  markSigningStarted: () => Promise<void>,
): Promise<{ txHash: string; feeAtomic: string }> {
  const { primary, fallback } = resolveChainRpc(
    job.source_network,
    job.wallet_environment,
  );
  const amount = BigInt(job.source_atomic_amount);
  const isNative = job.source_asset_id.toLowerCase() === "native";

  const [blockhashRes, senderBalanceRes] = await Promise.all([
    callJsonRpc<{
      value?: { blockhash?: string; lastValidBlockHeight?: number };
    }>(primary, "getLatestBlockhash", [{ commitment: "finalized" }], {
      fallbackEndpoint: fallback,
    }),
    callJsonRpc<{ value?: number }>(
      primary,
      "getBalance",
      [job.source_address, { commitment: "confirmed" }],
      { fallbackEndpoint: fallback },
    ).catch(() => null),
  ]);

  const blockhash = blockhashRes.response.result?.value?.blockhash;
  const lastValidBlockHeight =
    blockhashRes.response.result?.value?.lastValidBlockHeight;
  if (!blockhash || lastValidBlockHeight === undefined) {
    throw new FlowError(
      "RPC_NETWORK_ERROR",
      "Failed to fetch Solana latest blockhash.",
    );
  }

  const senderLamportsRaw = senderBalanceRes?.response.result?.value;
  const senderLamports =
    typeof senderLamportsRaw === "number" ? BigInt(senderLamportsRaw) : null;

  const fromAddr = address(job.source_address);
  const toAddr = address(targetAddress);
  const instructions = [];

  if (isNative) {
    if (senderLamports !== null) {
      if (senderLamports < amount + SOLANA_BASE_FEE_LAMPORTS) {
        throw new FlowError(
          "INSUFFICIENT_FUNDS",
          "Insufficient SOL balance to cover this transfer and Solana network fee.",
        );
      }
      const remainingLamports =
        senderLamports - amount - SOLANA_BASE_FEE_LAMPORTS;
      if (
        remainingLamports > 0n &&
        remainingLamports < SOLANA_SYSTEM_RENT_EXEMPT_LAMPORTS
      ) {
        throw new FlowError(
          "INSUFFICIENT_FUNDS",
          "Solana requires keeping at least 0.001 SOL in your wallet for account rent and network fee. Try sending a slightly smaller amount.",
        );
      }
    }

    if (amount < SOLANA_SYSTEM_RENT_EXEMPT_LAMPORTS) {
      const recipientBalanceRes = await callJsonRpc<{ value?: number }>(
        primary,
        "getBalance",
        [targetAddress, { commitment: "confirmed" }],
        { fallbackEndpoint: fallback },
      ).catch(() => null);
      const recipientLamportsRaw = recipientBalanceRes?.response.result?.value;
      const recipientLamports =
        typeof recipientLamportsRaw === "number"
          ? BigInt(recipientLamportsRaw)
          : null;
      if (
        recipientLamports !== null &&
        recipientLamports + amount < SOLANA_SYSTEM_RENT_EXEMPT_LAMPORTS
      ) {
        throw new FlowError(
          "INSUFFICIENT_FUNDS",
          "New Solana wallets require at least 0.0009 SOL on first deposit to cover account rent.",
        );
      }
    }

    const data = new Uint8Array(12);
    const view = new DataView(data.buffer);
    view.setUint32(0, 2, true); // SystemProgram::Transfer = 2
    view.setBigUint64(4, amount, true);
    instructions.push({
      programAddress: address(SOLANA_SYSTEM_PROGRAM),
      accounts: [
        { address: fromAddr, role: AccountRole.WRITABLE_SIGNER },
        { address: toAddr, role: AccountRole.WRITABLE },
      ],
      data,
    });
  } else {
    const mintAddr = job.source_asset_id;
    const mintInfoRes = await callJsonRpc<{
      value?: {
        owner?: string;
        data?: { parsed?: { info?: { decimals?: number } } };
      } | null;
    }>(primary, "getAccountInfo", [mintAddr, { encoding: "jsonParsed" }], {
      fallbackEndpoint: fallback,
    });
    const mintOwner = mintInfoRes.response.result?.value?.owner;
    const tokenProgram =
      mintOwner === SOLANA_PROGRAMS.token2022
        ? SOLANA_PROGRAMS.token2022
        : SOLANA_PROGRAMS.splToken;
    const mintDecimals =
      mintInfoRes.response.result?.value?.data?.parsed?.info?.decimals ??
      job.source_decimals;

    const sourceAta = await deriveAtaAddress(
      job.source_address,
      tokenProgram,
      mintAddr,
    );
    const destAta = await deriveAtaAddress(
      targetAddress,
      tokenProgram,
      mintAddr,
    );

    const destAtaInfo = await callJsonRpc<{ value?: unknown | null }>(
      primary,
      "getAccountInfo",
      [destAta, { encoding: "base64" }],
      { fallbackEndpoint: fallback },
    );

    if (!destAtaInfo.response.result?.value) {
      if (
        senderLamports !== null &&
        senderLamports <
          SOLANA_ATA_RENT_LAMPORTS +
            SOLANA_BASE_FEE_LAMPORTS +
            SOLANA_SYSTEM_RENT_EXEMPT_LAMPORTS
      ) {
        throw new FlowError(
          "INSUFFICIENT_FUNDS",
          "Sending tokens to a new Solana address requires at least ~0.003 SOL in your wallet to initialize the recipient token account.",
        );
      }
      instructions.push({
        programAddress: address(SOLANA_ASSOCIATED_TOKEN_PROGRAM),
        accounts: [
          { address: fromAddr, role: AccountRole.WRITABLE_SIGNER },
          { address: address(destAta), role: AccountRole.WRITABLE },
          { address: toAddr, role: AccountRole.READONLY },
          { address: address(mintAddr), role: AccountRole.READONLY },
          {
            address: address(SOLANA_SYSTEM_PROGRAM),
            role: AccountRole.READONLY,
          },
          { address: address(tokenProgram), role: AccountRole.READONLY },
        ],
        data: new Uint8Array([1]), // CreateIdempotent
      });
    }

    const transferData = new Uint8Array(10);
    const view = new DataView(transferData.buffer);
    transferData[0] = 12; // SPL Token TransferChecked
    view.setBigUint64(1, amount, true);
    transferData[9] = mintDecimals;

    instructions.push({
      programAddress: address(tokenProgram),
      accounts: [
        { address: address(sourceAta), role: AccountRole.WRITABLE },
        { address: address(mintAddr), role: AccountRole.READONLY },
        { address: address(destAta), role: AccountRole.WRITABLE },
        { address: fromAddr, role: AccountRole.WRITABLE_SIGNER },
      ],
      data: transferData,
    });
  }

  const baseMessage = setTransactionMessageLifetimeUsingBlockhash(
    {
      blockhash: blockhash as Parameters<
        typeof setTransactionMessageLifetimeUsingBlockhash
      >[0]["blockhash"],
      lastValidBlockHeight: BigInt(lastValidBlockHeight),
    },
    setTransactionMessageFeePayer(
      fromAddr,
      createTransactionMessage({ version: 0 }),
    ),
  );
  const compiled =
    instructions.length === 1
      ? compileTransaction(
          appendTransactionMessageInstruction(instructions[0]!, baseMessage),
        )
      : compileTransaction(
          appendTransactionMessageInstructions(instructions, baseMessage),
        );
  const unsignedTxBase64 = Buffer.from(compiled.messageBytes).toString(
    "base64",
  );

  await markSigningStarted();
  const signedRes = await outlayer.signSolanaTransaction(apiKey, {
    chain: "solana",
    unsignedTxBase64,
  });

  const sigBytes = decodeBase58(signedRes.signature, 64);
  const signedTx = {
    ...compiled,
    signatures: {
      ...compiled.signatures,
      [fromAddr]: sigBytes,
    },
  } as Parameters<typeof getBase64EncodedWireTransaction>[0];

  const wireBase64 = getBase64EncodedWireTransaction(signedTx);
  const sendRes = await callJsonRpc<string>(
    primary,
    "sendTransaction",
    [wireBase64, { encoding: "base64", preflightCommitment: "confirmed" }],
    { fallbackEndpoint: fallback, timeoutMs: 12_000 },
  );

  if (sendRes.response.error || !sendRes.response.result) {
    throw new FlowError(
      "RPC_NETWORK_ERROR",
      formatSolanaRpcSendError(sendRes.response.error),
    );
  }

  return { txHash: sendRes.response.result, feeAtomic: "5000" };
}

async function queryNearViewJson<T>(
  rpcUrl: string,
  fallbackUrl: string | undefined,
  accountId: string,
  methodName: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const res = await callJsonRpc<{ result?: number[] }>(
    rpcUrl,
    "query",
    {
      request_type: "call_function",
      finality: "optimistic",
      account_id: accountId,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    },
    { fallbackEndpoint: fallbackUrl },
  );
  if (res.response.error || !res.response.result?.result) {
    return null;
  }
  try {
    const raw = Buffer.from(res.response.result.result).toString("utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function pollOutLayerRequestForTxHash(
  outlayer: OutLayerAdapter,
  apiKey: string,
  requestId: string,
  initialTxHash?: string | null,
): Promise<{ txHash: string; requestId: string }> {
  if (initialTxHash) {
    return { txHash: initialTxHash, requestId };
  }
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await outlayer.getRequestStatus(apiKey, requestId);
    const resultObj =
      status.result && typeof status.result === "object"
        ? (status.result as Record<string, unknown>)
        : undefined;
    const resolvedHash =
      typeof resultObj?.tx_hash === "string" ? resultObj.tx_hash : null;
    if (resolvedHash) {
      return { txHash: resolvedHash, requestId };
    }
    if (status.status === "failed") {
      throw new FlowError(
        "CUSTODY_PROVIDER_ERROR",
        typeof resultObj?.error === "string"
          ? resultObj.error
          : "OutLayer request failed during NEAR execution.",
      );
    }
  }
  return { txHash: `outlayer-req:${requestId}`, requestId };
}

async function executeNearEarnJob(
  memo: EarnMemo,
  job: ClaimedOutgoingCustodyJob,
  apiKey: string,
  outlayer: OutLayerAdapter,
  targetAddress: string,
  markSigningStarted: () => Promise<void>,
): Promise<{ txHash: string; requestId: string; feeAtomic: string }> {
  const { primary, fallback } = resolveChainRpc(
    job.source_network,
    job.wallet_environment,
  );

  if (memo === EARN_MEMO.LINEAR_DEPOSIT && targetAddress === LINEAR_CONTRACT) {
    const grossAtomic = BigInt(job.source_atomic_amount);
    const { feeAtomic, netAtomic } = splitPlatformFee(
      grossAtomic,
      EARN_DEPOSIT_FEE_BPS,
    );
    const treasuryAccount = resolveFeeTreasuryAccount();
    const shouldCollectFee = Boolean(
      treasuryAccount &&
        feeAtomic > 0n &&
        treasuryAccount.toLowerCase() !== job.source_address.toLowerCase(),
    );
    const depositAtomic = shouldCollectFee ? netAtomic : grossAtomic;

    await markSigningStarted();

    if (shouldCollectFee) {
      const feeRes = await outlayer.transferNearNative(apiKey, {
        chain: "near",
        to: treasuryAccount,
        amountYocto: feeAtomic.toString(),
      });
      await pollOutLayerRequestForTxHash(
        outlayer,
        apiKey,
        feeRes.request_id,
        feeRes.tx_hash,
      );
    }

    const res = await outlayer.callNearContract(apiKey, {
      receiverId: LINEAR_CONTRACT,
      methodName: "deposit_and_stake",
      args: {},
      gas: "50000000000000",
      deposit: depositAtomic.toString(),
    });
    const polled = await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      res.request_id,
      res.tx_hash,
    );
    return {
      ...polled,
      feeAtomic: shouldCollectFee ? feeAtomic.toString() : "0",
    };
  }

  if (
    memo === EARN_MEMO.LINEAR_CLAIM_UNSTAKED &&
    targetAddress === LINEAR_CONTRACT
  ) {
    await markSigningStarted();
    const res = await outlayer.callNearContract(apiKey, {
      receiverId: LINEAR_CONTRACT,
      methodName: "withdraw_all",
      args: {},
      gas: "100000000000000",
      deposit: "0",
    });
    const polled = await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      res.request_id,
      res.tx_hash,
    );
    return { ...polled, feeAtomic: "0" };
  }

  if (
    (memo === EARN_MEMO.LINEAR_WITHDRAW_INSTANT ||
      memo === EARN_MEMO.LINEAR_WITHDRAW_DELAYED) &&
    targetAddress === LINEAR_CONTRACT
  ) {
    await markSigningStarted();
    const isDelayed = memo === EARN_MEMO.LINEAR_WITHDRAW_DELAYED;
    let methodName = isDelayed ? "unstake" : "instant_unstake";
    let args: Record<string, unknown> = { amount: job.source_atomic_amount };

    if (isDelayed) {
      const [priceRaw, currentSharesRaw] = await Promise.all([
        queryNearViewJson<string>(
          primary,
          fallback,
          LINEAR_CONTRACT,
          "ft_price",
          {},
        ).catch(() => null),
        queryNearViewJson<string>(
          primary,
          fallback,
          LINEAR_CONTRACT,
          "ft_balance_of",
          {
            account_id: job.source_address,
          },
        ).catch(() => null),
      ]);
      const requestedShares = BigInt(job.source_atomic_amount);
      const currentShares = currentSharesRaw ? BigInt(currentSharesRaw) : 0n;
      if (currentShares > 0n && requestedShares >= currentShares) {
        methodName = "unstake_all";
        args = {};
      } else if (priceRaw) {
        const nearAmount = (requestedShares * BigInt(priceRaw)) / 10n ** 24n;
        if (nearAmount > 0n) {
          args = { amount: nearAmount.toString() };
        }
      }
    }

    const res = await outlayer.callNearContract(apiKey, {
      receiverId: LINEAR_CONTRACT,
      methodName,
      args,
      gas: "100000000000000",
      deposit: "0",
    });
    const polled = await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      res.request_id,
      res.tx_hash,
    );
    return { ...polled, feeAtomic: "0" };
  }

  if (memo === EARN_MEMO.BURROW_DEPOSIT && targetAddress === BURROW_CONTRACT) {
    const tokenContract =
      job.source_asset_id && job.source_asset_id !== "native"
        ? job.source_asset_id
        : BURROW_USDC_CONTRACT;
    const grossAtomic = BigInt(job.source_atomic_amount);
    const { feeAtomic, netAtomic } = splitPlatformFee(
      grossAtomic,
      EARN_DEPOSIT_FEE_BPS,
    );
    const treasuryAccount = resolveFeeTreasuryAccount();
    const shouldCollectFee = Boolean(
      treasuryAccount &&
        feeAtomic > 0n &&
        treasuryAccount.toLowerCase() !== job.source_address.toLowerCase(),
    );
    const depositAtomic = shouldCollectFee ? netAtomic : grossAtomic;

    const [storageBalance, treasuryTokenStorage] = await Promise.all([
      queryNearViewJson<{
        total: string;
        available: string;
      } | null>(primary, fallback, BURROW_CONTRACT, "storage_balance_of", {
        account_id: job.source_address,
      }),
      shouldCollectFee
        ? queryNearViewJson<{
            total: string;
            available: string;
          } | null>(primary, fallback, tokenContract, "storage_balance_of", {
            account_id: treasuryAccount,
          })
        : Promise.resolve({ total: "1", available: "1" }),
    ]);

    await markSigningStarted();

    if (shouldCollectFee) {
      if (treasuryTokenStorage === null) {
        const bounds = await queryNearViewJson<{ min?: string }>(
          primary,
          fallback,
          tokenContract,
          "storage_balance_bounds",
          {},
        );
        const storageDepositAmount = bounds?.min ?? "1250000000000000000000";
        const regRes = await outlayer.callNearContract(apiKey, {
          receiverId: tokenContract,
          methodName: "storage_deposit",
          args: { account_id: treasuryAccount, registration_only: true },
          gas: "30000000000000",
          deposit: storageDepositAmount,
        });
        await pollOutLayerRequestForTxHash(
          outlayer,
          apiKey,
          regRes.request_id,
          regRes.tx_hash,
        );
      }

      const feeRes = await outlayer.callNearContract(apiKey, {
        receiverId: tokenContract,
        methodName: "ft_transfer",
        args: {
          receiver_id: treasuryAccount,
          amount: feeAtomic.toString(),
          memo: "FLOW Earn deposit fee (0.3%)",
        },
        gas: "50000000000000",
        deposit: "1",
      });
      await pollOutLayerRequestForTxHash(
        outlayer,
        apiKey,
        feeRes.request_id,
        feeRes.tx_hash,
      );
    }

    if (storageBalance === null) {
      const depRes = await outlayer.callNearContract(apiKey, {
        receiverId: BURROW_CONTRACT,
        methodName: "storage_deposit",
        args: { account_id: job.source_address, registration_only: false },
        gas: "30000000000000",
        deposit: BURROW_STORAGE_DEPOSIT_YOCTO.toString(),
      });
      await pollOutLayerRequestForTxHash(
        outlayer,
        apiKey,
        depRes.request_id,
        depRes.tx_hash,
      );
    }

    const res = await outlayer.callNearContract(apiKey, {
      receiverId: tokenContract,
      methodName: "ft_transfer_call",
      args: {
        receiver_id: BURROW_CONTRACT,
        amount: depositAtomic.toString(),
        msg: "",
      },
      gas: "100000000000000",
      deposit: "1",
    });
    const polled = await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      res.request_id,
      res.tx_hash,
    );
    return {
      ...polled,
      feeAtomic: shouldCollectFee ? feeAtomic.toString() : "0",
    };
  }

  if (memo === EARN_MEMO.BURROW_WITHDRAW && targetAddress === BURROW_CONTRACT) {
    const account = await queryNearViewJson<{
      supplied?: Array<{ token_id: string; balance?: string }>;
      collateral?: Array<{ token_id: string; balance?: string }>;
    } | null>(primary, fallback, BURROW_CONTRACT, "get_account", {
      account_id: job.source_address,
    });
    let available18 = 0n;
    if (account) {
      for (const entry of [
        ...(account.supplied ?? []),
        ...(account.collateral ?? []),
      ]) {
        if (entry.token_id === BURROW_USDC_CONTRACT && entry.balance) {
          available18 += BigInt(entry.balance);
        }
      }
    }
    const requested18 = BigInt(job.source_atomic_amount) * 10n ** 12n;
    const withdrawMax18 =
      available18 > 0n && requested18 >= available18 - 10n ** 12n
        ? available18.toString()
        : requested18.toString();

    await markSigningStarted();
    const res = await outlayer.callNearContract(apiKey, {
      receiverId: BURROW_CONTRACT,
      methodName: "execute",
      args: {
        actions: [
          {
            Withdraw: {
              token_id: BURROW_USDC_CONTRACT,
              max_amount: withdrawMax18,
            },
          },
        ],
      },
      gas: "100000000000000",
      deposit: "1",
    });
    const polled = await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      res.request_id,
      res.tx_hash,
    );
    return { ...polled, feeAtomic: "0" };
  }

  throw new FlowError(
    "UNSUPPORTED_CHAIN",
    `Unsupported Earn action ${memo} for target ${targetAddress}`,
  );
}

async function executeNearTransfer(
  job: ClaimedOutgoingCustodyJob,
  apiKey: string,
  outlayer: OutLayerAdapter,
  targetAddress: string,
  markSigningStarted: () => Promise<void>,
): Promise<{ txHash: string; requestId: string; feeAtomic: string }> {
  if (job.job_kind === "SEND" && isEarnMemo(job.provider_deposit_memo)) {
    return executeNearEarnJob(
      job.provider_deposit_memo,
      job,
      apiKey,
      outlayer,
      targetAddress,
      markSigningStarted,
    );
  }
  const isNative = job.source_asset_id.toLowerCase() === "native";
  if (isNative) {
    await markSigningStarted();
    const res = await outlayer.transferNearNative(apiKey, {
      chain: "near",
      to: targetAddress,
      amountYocto: job.source_atomic_amount,
    });
    const polled = await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      res.request_id,
      res.tx_hash,
    );
    return { ...polled, feeAtomic: "0" };
  }

  const { primary, fallback } = resolveChainRpc(
    job.source_network,
    job.wallet_environment,
  );
  const tokenContract = job.source_asset_id;
  const storageBalance = await queryNearViewJson<{
    total: string;
    available: string;
  } | null>(primary, fallback, tokenContract, "storage_balance_of", {
    account_id: targetAddress,
  });

  await markSigningStarted();

  if (storageBalance === null) {
    const bounds = await queryNearViewJson<{ min?: string }>(
      primary,
      fallback,
      tokenContract,
      "storage_balance_bounds",
      {},
    );
    const storageDepositAmount = bounds?.min ?? "1250000000000000000000";
    const depRes = await outlayer.callNearContract(apiKey, {
      receiverId: tokenContract,
      methodName: "storage_deposit",
      args: { account_id: targetAddress, registration_only: true },
      gas: "30000000000000",
      deposit: storageDepositAmount,
    });
    await pollOutLayerRequestForTxHash(
      outlayer,
      apiKey,
      depRes.request_id,
      depRes.tx_hash,
    );
  }

  const ftRes = await outlayer.callNearContract(apiKey, {
    receiverId: tokenContract,
    methodName: "ft_transfer",
    args: {
      receiver_id: targetAddress,
      amount: job.source_atomic_amount,
      ...(job.job_kind === "CONVERT" && job.provider_deposit_memo
        ? { memo: job.provider_deposit_memo }
        : {}),
    },
    gas: "50000000000000",
    deposit: "1",
  });
  const polled = await pollOutLayerRequestForTxHash(
    outlayer,
    apiKey,
    ftRes.request_id,
    ftRes.tx_hash,
  );
  return { ...polled, feeAtomic: "0" };
}

async function processNextQueuedOutgoingJob(
  db: FlowDb,
  outlayer: OutLayerAdapter,
  walletConfig: Pick<WalletConfig, "encryptionKey" | "keyId"> & {
    readonly fallbackEncryptionKey?: string;
  },
  workerId: string,
): Promise<boolean> {
  const claimed = await db.$queryRaw<ClaimedOutgoingCustodyJob[]>`
    SELECT * FROM flow.claim_outgoing_transfer_for_custody(
      ${workerId}::text,
      ${90}::integer
    )
  `;
  const job = claimed[0];
  if (!job) {
    return false;
  }

  const targetAddress =
    job.provider_deposit_address ?? job.recipient_address;

  if (!targetAddress) {
    await db.$executeRaw`
      SELECT flow.fail_outgoing_transfer_before_broadcast(
        ${job.id}::uuid,
        ${job.fencing_token}::bigint,
        'FAILED',
        'MISSING_DESTINATION',
        'Transfer job is missing destination address.'
      )
    `;
    return true;
  }

  let signingStarted = false;
  const markSigningStarted = async () => {
    if (signingStarted) return;
    signingStarted = true;
    await db.$executeRaw`
      SELECT flow.mark_outgoing_transfer_signing_started(
        ${job.id}::uuid,
        ${job.fencing_token}::bigint
      )
    `;
  };

  try {
    const keyHex = resolveDecryptionKey(job.key_id, walletConfig);
    const envelope = deserializeEnvelope(job.credential_envelope);
    const apiKey = decryptSecret(envelope, keyHex);

    let result: { txHash: string; requestId?: string; feeAtomic: string };
    if (
      job.source_network === "ethereum-mainnet" ||
      job.source_network === "ethereum-sepolia" ||
      job.source_network === "base-mainnet" ||
      job.source_network === "base-sepolia"
    ) {
      result = await executeEvmTransfer(
        job,
        apiKey,
        outlayer,
        targetAddress,
        markSigningStarted,
      );
    } else if (
      job.source_network === "solana-mainnet" ||
      job.source_network === "solana-devnet"
    ) {
      result = await executeSolanaTransfer(
        job,
        apiKey,
        outlayer,
        targetAddress,
        markSigningStarted,
      );
    } else if (
      job.source_network === "near-mainnet" ||
      job.source_network === "near-testnet"
    ) {
      result = await executeNearTransfer(
        job,
        apiKey,
        outlayer,
        targetAddress,
        markSigningStarted,
      );
    } else {
      throw new FlowError(
        "UNSUPPORTED_CHAIN",
        `Unsupported source network for custody transfer: ${job.source_network}`,
      );
    }

    await db.$executeRaw`
      SELECT flow.mark_outgoing_transfer_broadcast(
        ${job.id}::uuid,
        ${job.fencing_token}::bigint,
        ${result.txHash}::text,
        ${result.requestId ?? null}::text,
        ${result.feeAtomic}::numeric
      )
    `;

    log("info", "outgoing_transfer_broadcast", {
      workerId,
      jobId: job.id,
      kind: job.job_kind,
      network: job.source_network,
      txHash: result.txHash,
    });
  } catch (error: unknown) {
    const code =
      error instanceof FlowError ? error.code : "CUSTODY_EXECUTION_ERROR";
    const message =
      error instanceof Error
        ? error.message
        : "Outgoing custody transfer failed.";
    const isPreSignProviderRejection =
      code === "CUSTODY_PROVIDER_ERROR" &&
      (message.startsWith("OutLayer authentication failed") ||
        message.startsWith("OutLayer rejected the request") ||
        message.startsWith("OutLayer wallet gas balance is underfunded") ||
        message.startsWith("OutLayer rate limit exceeded") ||
        message.startsWith("Requested OutLayer resource was not found") ||
        message.startsWith("Bitcoin is unsupported"));
    const status = "FAILED";
    await db.$executeRaw`
      SELECT flow.fail_outgoing_transfer_before_broadcast(
        ${job.id}::uuid,
        ${job.fencing_token}::bigint,
        ${status}::text,
        ${code}::text,
        ${message}::text
      )
    `;
    log("error", "outgoing_transfer_failed", {
      workerId,
      jobId: job.id,
      network: job.source_network,
      status,
      code,
      errorMessage: message,
    });
  }
  return true;
}

async function confirmSingleOutgoingJob(
  db: FlowDb,
  workerId: string,
  job: ClaimedOutgoingConfirmationJob,
): Promise<void> {
  if (job.status === "CONFIRMING") {
    if (!job.source_tx_hash || job.source_tx_hash.startsWith("outlayer-req:")) {
      await db.$executeRaw`
        SELECT flow.complete_outgoing_transfer_settlement(
          ${job.id}::uuid,
          ${workerId}::text,
          'CONFIRMING',
          NULL,
          NULL,
          NULL
        )
      `;
      return;
    }

    const { primary, fallback } = resolveChainRpc(
      job.source_network,
      job.wallet_environment,
    );
    let settledStatus: "CONFIRMING" | "SETTLED" | "FAILED" = "CONFIRMING";
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    if (
      job.source_network.startsWith("ethereum-") ||
      job.source_network.startsWith("base-")
    ) {
      const receipt = await callJsonRpc<{ status?: string } | null>(
        primary,
        "eth_getTransactionReceipt",
        [job.source_tx_hash],
        { fallbackEndpoint: fallback },
      );
      if (receipt.response.result?.status === "0x1") {
        settledStatus = "SETTLED";
      } else if (receipt.response.result?.status === "0x0") {
        settledStatus = "FAILED";
        errorCode = "TX_REVERTED";
        errorMessage = "Transaction reverted on-chain.";
      }
    } else if (job.source_network.startsWith("solana-")) {
      const sigRes = await callJsonRpc<{
        value?: Array<{ err?: unknown; confirmationStatus?: string } | null>;
      }>(
        primary,
        "getSignatureStatuses",
        [[job.source_tx_hash], { searchTransactionHistory: true }],
        { fallbackEndpoint: fallback },
      );
      const entry = sigRes.response.result?.value?.[0];
      if (entry) {
        if (entry.err !== null && entry.err !== undefined) {
          settledStatus = "FAILED";
          errorCode = "TX_REVERTED";
          errorMessage = "Solana transaction failed on-chain.";
        } else if (
          entry.confirmationStatus === "confirmed" ||
          entry.confirmationStatus === "finalized"
        ) {
          settledStatus = "SETTLED";
        }
      }
    } else if (job.source_network.startsWith("near-")) {
      const [nearAddressRow] = await db.$queryRaw<Array<{ address: string }>>`
        SELECT address
        FROM flow.wallet_addresses
        WHERE wallet_id = ${job.wallet_id}::uuid
          AND network = 'near'
        LIMIT 1
      `;
      const senderAccountId = nearAddressRow?.address ?? job.recipient_address;
      const txRes = await callJsonRpc<{
        status?: {
          SuccessValue?: string;
          SuccessReceiptId?: string;
          Failure?: unknown;
        };
      }>(primary, "tx", [job.source_tx_hash, senderAccountId], {
        fallbackEndpoint: fallback,
      });
      if (
        txRes.response.result?.status?.SuccessValue !== undefined ||
        txRes.response.result?.status?.SuccessReceiptId !== undefined
      ) {
        settledStatus = "SETTLED";
      } else if (txRes.response.result?.status?.Failure !== undefined) {
        settledStatus = "FAILED";
        errorCode = "TX_REVERTED";
        errorMessage = "NEAR transaction execution failed.";
      }
    }

    await db.$executeRaw`
      SELECT flow.complete_outgoing_transfer_settlement(
        ${job.id}::uuid,
        ${workerId}::text,
        ${settledStatus}::text,
        NULL,
        ${errorCode}::text,
        ${errorMessage}::text
      )
    `;

    if (settledStatus === "SETTLED") {
      await Promise.allSettled([
        reconcileWalletBalances(db, job.wallet_id),
        ingestWalletActivities(db, job.wallet_id, {
          nearTxHashes:
            job.source_network.startsWith("near-") && job.source_tx_hash
              ? [job.source_tx_hash]
              : undefined,
        }),
      ]);
    }
    return;
  }

  // PROVIDER_SETTLING (CONVERT via 1Click)
  if (!job.provider_deposit_address) {
    await db.$executeRaw`
      SELECT flow.complete_outgoing_transfer_settlement(
        ${job.id}::uuid,
        ${workerId}::text,
        'FAILED',
        NULL,
        'MISSING_PROVIDER_DEPOSIT',
        'Conversion job is missing provider deposit address.'
      )
    `;
    return;
  }

  const execStatus = await fetchOneClickExecutionStatus({
    depositAddress: job.provider_deposit_address,
    depositMemo: job.provider_deposit_memo,
  });

  if (execStatus.stage === "DESTINATION_FINALIZED") {
    const destTx = execStatus.destinationTxHash ?? job.destination_tx_hash;
    if (destTx) {
      const check = await verifyOnChainTransfer({
        network: job.destination_network as NetworkId,
        txHash: destTx,
        expectedRecipient: job.recipient_address,
        expectedAssetId: job.destination_asset_id,
        expectedTokenContract:
          job.destination_asset_id === "native"
            ? null
            : job.destination_asset_id,
        minimumAtomicAmount: 1n,
      });
      if (
        !check.isSuccess ||
        (check.finality !== "CONFIRMED" && check.finality !== "FINALIZED")
      ) {
        await db.$executeRaw`
          SELECT flow.complete_outgoing_transfer_settlement(
            ${job.id}::uuid,
            ${workerId}::text,
            'PROVIDER_SETTLING',
            ${destTx}::text,
            NULL,
            NULL
          )
        `;
        return;
      }
    }
    await db.$executeRaw`
      SELECT flow.complete_outgoing_transfer_settlement(
        ${job.id}::uuid,
        ${workerId}::text,
        'SETTLED',
        ${destTx ?? null}::text,
        NULL,
        NULL
      )
    `;
    await Promise.allSettled([
      reconcileWalletBalances(db, job.wallet_id),
      ingestWalletActivities(db, job.wallet_id, {
        nearTxHashes:
          job.destination_network.startsWith("near-") && destTx
            ? [destTx]
            : undefined,
      }),
    ]);
    return;
  }

  if (execStatus.stage === "REFUNDED" || execStatus.stage === "FAILED") {
    const nextStatus = execStatus.stage === "REFUNDED" ? "REFUNDED" : "FAILED";
    await db.$executeRaw`
      SELECT flow.complete_outgoing_transfer_settlement(
        ${job.id}::uuid,
        ${workerId}::text,
        ${nextStatus}::text,
        ${execStatus.destinationTxHash ?? null}::text,
        ${nextStatus === "REFUNDED" ? "CONVERT_REFUNDED" : "CONVERT_FAILED"}::text,
        ${execStatus.failureReason ?? "Provider conversion did not settle."}::text
      )
    `;
    return;
  }

  await db.$executeRaw`
    SELECT flow.complete_outgoing_transfer_settlement(
      ${job.id}::uuid,
      ${workerId}::text,
      'PROVIDER_SETTLING',
      ${execStatus.destinationTxHash ?? null}::text,
      NULL,
      NULL
    )
  `;
}

export async function processOutgoingTransferCycle(
  db: FlowDb,
  outlayer: OutLayerAdapter,
  walletConfig: Pick<WalletConfig, "encryptionKey" | "keyId"> & {
    readonly fallbackEncryptionKey?: string;
  },
  workerId: string,
): Promise<void> {
  if (!isFinancialExecutionDisabled()) {
    await processNextQueuedOutgoingJob(db, outlayer, walletConfig, workerId);
  }

  const confirming = await db.$queryRaw<ClaimedOutgoingConfirmationJob[]>`
    SELECT * FROM flow.claim_outgoing_transfers_for_confirmation(
      ${workerId}::text,
      ${60}::integer,
      ${10}::integer
    )
  `;

  for (const job of confirming) {
    try {
      await confirmSingleOutgoingJob(db, workerId, job);
    } catch (error: unknown) {
      log("error", "outgoing_transfer_confirmation_error", {
        workerId,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
