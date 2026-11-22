import { callJsonRpc, type JsonRpcOptions } from "../connectors/rpc-client.ts";
import { verifyNearChainId } from "../connectors/near-connector.ts";
import type {
  ActivityDirection,
  ActivityFinality,
} from "../../../domain/activities.ts";

export interface NearIndexerOptions extends JsonRpcOptions {
  readonly network: "near-mainnet" | "near-testnet";
  readonly indexerApiUrl?: string;
}

export interface RawNearActivityItem {
  readonly txHash: string;
  readonly eventIndex: number;
  readonly fromAddress: string;
  readonly toAddress: string;
  readonly contractAddress: string | null;
  readonly atomicAmount: bigint;
  readonly blockHeight: bigint;
  readonly blockHash: string;
  readonly blockTimestamp: Date | null;
  readonly finality: ActivityFinality;
  readonly direction: ActivityDirection;
  readonly activityType: "ON_CHAIN_TRANSFER" | "ON_CHAIN_INTERACTION";
  readonly network: "near";
  readonly chainId: string;
  readonly ecosystem: "near";
  readonly feeAtomicAmount: bigint | null;
  readonly metadata: Record<string, unknown>;
}

export interface NearTxStatusResult {
  readonly status: {
    readonly SuccessValue?: string;
    readonly Failure?: unknown;
  };
  readonly transaction: {
    readonly hash: string;
    readonly signer_id: string;
    readonly receiver_id: string;
    readonly actions: Array<{
      readonly Transfer?: {
        readonly deposit: string;
      };
      readonly FunctionCall?: {
        readonly method_name: string;
        readonly args: string;
        readonly deposit: string;
        readonly gas: number;
      };
    }>;
  };
  readonly transaction_outcome: {
    readonly block_hash: string;
    readonly outcome: {
      readonly gas_burnt: number;
      readonly status: {
        readonly SuccessReceiptId?: string;
      };
    };
  };
  readonly receipts_outcome?: Array<{
    readonly outcome: {
      readonly logs: string[];
      readonly gas_burnt: number;
    };
  }>;
}

/**
 * Indexes verified NEAR transaction activity.
 * Validates endpoint chain ID and verifies status or indexer records.
 */
export async function indexNearAddressActivities(
  rpcUrl: string,
  accountId: string,
  options: NearIndexerOptions & {
    readonly knownTxHashes?: string[];
  },
): Promise<RawNearActivityItem[]> {
  // 1. Verify chain ID
  await verifyNearChainId(rpcUrl, options.network, options);

  const activities: RawNearActivityItem[] = [];

  let txHashesToInspect = options.knownTxHashes ?? [];
  const nearblocksTimestamps = new Map<string, Date>();
  if (txHashesToInspect.length === 0) {
    try {
      const apiBase = options.network.includes("testnet")
        ? "https://api-testnet.nearblocks.io"
        : "https://api.nearblocks.io";
      const res = await fetch(
        `${apiBase}/v1/account/${encodeURIComponent(accountId)}/txns?per_page=25`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (res.ok) {
        const json = (await res.json()) as {
          txns?: Array<{
            transaction_hash?: string;
            block_timestamp?: string | number | null;
          }>;
        };
        const hashes: string[] = [];
        for (const t of json.txns ?? []) {
          const hash = t.transaction_hash?.trim();
          if (!hash) continue;
          hashes.push(hash);
          if (t.block_timestamp != null) {
            try {
              const ns = BigInt(String(t.block_timestamp));
              const ms = Number(ns / 1_000_000n);
              if (Number.isFinite(ms) && ms > 0) {
                nearblocksTimestamps.set(hash, new Date(ms));
              }
            } catch {
              // Ignore malformed timestamp
            }
          }
        }
        txHashesToInspect = hashes;
      }
    } catch {
      // Non-fatal fallback if Nearblocks API is temporarily unreachable
    }
  }

  const blockTimestampCache = new Map<string, Date | null>();
  const resolveNearBlockTimestamp = async (
    txHash: string,
    blockHash: string | undefined,
  ): Promise<Date | null> => {
    const fromNearblocks = nearblocksTimestamps.get(txHash);
    if (fromNearblocks) return fromNearblocks;
    if (!blockHash) return null;
    if (blockTimestampCache.has(blockHash)) {
      return blockTimestampCache.get(blockHash) ?? null;
    }
    try {
      const blockRes = await callJsonRpc<{
        header?: { timestamp?: number; timestamp_nanosec?: string };
      }>(rpcUrl, "block", { block_id: blockHash }, options);
      const header = blockRes.response.result?.header;
      const rawNs = header?.timestamp_nanosec ?? (header?.timestamp != null ? String(header.timestamp) : null);
      if (rawNs) {
        const ms = Number(BigInt(rawNs) / 1_000_000n);
        const dt = Number.isFinite(ms) && ms > 0 ? new Date(ms) : null;
        blockTimestampCache.set(blockHash, dt);
        return dt;
      }
    } catch {
      // Non-fatal fallback
    }
    blockTimestampCache.set(blockHash, null);
    return null;
  };

  // Inspect and verify each transaction via NEAR RPC (including internal receipts)
  if (txHashesToInspect.length > 0) {
    for (const txHash of txHashesToInspect) {
      try {
        const txRes = await callJsonRpc<
          NearTxStatusResult & {
            receipts?: Array<{
              predecessor_id?: string;
              receiver_id?: string;
              receipt?: {
                Action?: {
                  actions?: Array<{
                    Transfer?: { deposit?: string };
                  }>;
                };
              };
            }>;
          }
        >(rpcUrl, "EXPERIMENTAL_tx_status", [txHash, accountId], options);

        const tx = txRes.response.result;
        if (!tx) continue;

        const signer = tx.transaction.signer_id;
        let receiver = tx.transaction.receiver_id;
        const normAccount = accountId.toLowerCase();
        const isFromMe = signer.toLowerCase() === normAccount;
        let isToMe = receiver.toLowerCase() === normAccount;

        let depositAtomic = 0n;
        for (const action of tx.transaction.actions) {
          if (action.Transfer?.deposit) {
            depositAtomic += BigInt(action.Transfer.deposit);
          }
        }

        // Check internal receipts (e.g. wrap.near / intents.near 1Click payouts)
        if (depositAtomic === 0n && Array.isArray(tx.receipts)) {
          let receiptIncoming = 0n;
          let receiptFrom = signer;
          for (const r of tx.receipts) {
            if (
              r.receiver_id?.toLowerCase() === normAccount &&
              r.predecessor_id?.toLowerCase() !== "system"
            ) {
              for (const act of r.receipt?.Action?.actions ?? []) {
                if (act.Transfer?.deposit) {
                  receiptIncoming += BigInt(act.Transfer.deposit);
                  if (r.predecessor_id) receiptFrom = r.predecessor_id;
                }
              }
            }
          }
          if (receiptIncoming > 0n) {
            depositAtomic = receiptIncoming;
            receiver = accountId;
            isToMe = true;
            const blockTimestamp = await resolveNearBlockTimestamp(
              tx.transaction.hash,
              tx.transaction_outcome.block_hash,
            );
            activities.push({
              txHash: tx.transaction.hash,
              eventIndex: 0,
              fromAddress: receiptFrom,
              toAddress: accountId,
              contractAddress: null,
              atomicAmount: depositAtomic,
              blockHeight: 0n,
              blockHash: tx.transaction_outcome.block_hash,
              blockTimestamp,
              finality: "FINALIZED",
              direction: "INCOMING",
              activityType: "ON_CHAIN_TRANSFER",
              network: "near",
              chainId: options.network,
              ecosystem: "near",
              feeAtomicAmount: BigInt(
                tx.transaction_outcome.outcome.gas_burnt ?? 0,
              ),
              metadata: {
                signer,
                receiver: accountId,
                viaReceipt: true,
              },
            });
            continue;
          }
        }

        let direction: ActivityDirection = "INTERNAL";
        if (isFromMe && isToMe) {
          direction = "INTERNAL";
        } else if (isToMe) {
          direction = "INCOMING";
        } else if (isFromMe) {
          direction = "OUTGOING";
        }

        const blockTimestamp = await resolveNearBlockTimestamp(
          tx.transaction.hash,
          tx.transaction_outcome.block_hash,
        );
        activities.push({
          txHash: tx.transaction.hash,
          eventIndex: 0,
          fromAddress: signer,
          toAddress: receiver,
          contractAddress: null,
          atomicAmount: depositAtomic,
          blockHeight: 0n,
          blockHash: tx.transaction_outcome.block_hash,
          blockTimestamp,
          finality: "FINALIZED",
          direction,
          activityType:
            depositAtomic > 0n ? "ON_CHAIN_TRANSFER" : "ON_CHAIN_INTERACTION",
          network: "near",
          chainId: options.network,
          ecosystem: "near",
          feeAtomicAmount: BigInt(
            tx.transaction_outcome.outcome.gas_burnt ?? 0,
          ),
          metadata: {
            signer,
            receiver,
          },
        });
      } catch {
        // Skip invalid/unconfirmed tx
      }
    }
  }

  return activities;
}
