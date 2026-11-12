import "server-only";
import {
  type ActivityFeedResponse,
  type ActivityType,
  type ActivityDirection,
  type ActivityFinality,
  type ReorgStatus,
  type WalletActivityRecord,
  serializeActivities,
} from "../domain/activities.ts";
import { Prisma } from "../generated/prisma/client.ts";
import { getPrismaClient, runtime, type FlowDb } from "../foundation/prisma.ts";
import { access, principal } from "./accounts.ts";
import { ingestWalletActivities } from "./assets/indexers/multi-chain-activity-ingester.ts";
import { ApiFailure, reply } from "./http.ts";

function accountActivityRows(accountId: string) {
  return Prisma.sql`
    WITH receipt_events AS (
      SELECT
        pv.id, pr.account_id, w.id AS wallet_id, wallet_address.network,
        wallet_address.chain_id,
        CASE wallet_address.chain_id WHEN '1' THEN 'evm' WHEN '8453' THEN 'evm'
          WHEN 'solana-mainnet' THEN 'solana' ELSE 'near' END AS ecosystem,
        'FLOW_CROSS_CHAIN_SETTLEMENT'::text AS activity_type, 'INCOMING'::text AS direction,
        pv.tx_hash, pv.event_index, pv.from_address, pv.to_address,
        registry.asset_id, registry.id AS network_asset_id, pr.destination_asset_symbol AS asset_symbol,
        pv.atomic_amount, pr.destination_decimals AS decimals,
        pv.block_height, pv.block_hash, NULL::timestamptz AS block_timestamp,
        pv.finality, 'CANONICAL'::text AS reorg_status, NULL::numeric AS fee_atomic_amount,
        jsonb_build_object('paymentRequestPublicId', pr.public_id, 'attemptPublicId', pa.attempt_public_id) AS metadata,
        COALESCE(pa.settled_at, pv.verified_at) AS observed_at,
        pv.created_at, pv.verified_at AS updated_at
      FROM flow.payment_requests pr
      JOIN flow.payment_attempts pa ON pa.payment_request_id = pr.id AND pa.status = 'SETTLED'
      JOIN flow.payment_verifications pv ON pv.payment_attempt_id = pa.id
      JOIN flow.wallets w ON w.account_id = pr.account_id AND w.environment = 'mainnet'
      JOIN flow.wallet_addresses wallet_address ON wallet_address.wallet_id = w.id
        AND wallet_address.chain_id = CASE pv.network WHEN 'base-mainnet' THEN '8453'
          WHEN 'ethereum-mainnet' THEN '1' WHEN 'solana-mainnet' THEN 'solana-mainnet'
          WHEN 'near-mainnet' THEN 'near-mainnet' END
        AND (wallet_address.address = pv.to_address OR
          (wallet_address.chain_id IN ('1','8453') AND lower(wallet_address.address) = lower(pv.to_address)))
      LEFT JOIN LATERAL (
        SELECT na.id, na.asset_id FROM flow.network_assets na
        WHERE na.chain_id = wallet_address.chain_id AND na.is_verified
          AND na.decimals = pr.destination_decimals
          AND (na.contract_address IS NOT DISTINCT FROM pv.token_contract OR
            (wallet_address.chain_id IN ('1','8453') AND lower(na.contract_address) = lower(pv.token_contract)))
        ORDER BY na.id LIMIT 1
      ) registry ON true
      WHERE pr.account_id = ${accountId}::uuid
        AND pv.verification_type = 'DESTINATION_SETTLEMENT'
        AND pv.finality = 'FINALIZED' AND pv.evidence_source = 'CHAIN_RPC_DIRECT'
        AND pv.network = pr.destination_network AND pv.asset_id = pr.destination_asset_id
        AND pv.tx_hash = pa.destination_tx_hash AND pv.atomic_amount > 0
        AND EXISTS (
          SELECT 1 FROM flow.ledger_journals j
          JOIN flow.ledger_entries e ON e.journal_id = j.id
          JOIN flow.ledger_accounts la ON la.id = e.ledger_account_id
          WHERE j.reference_id = pa.attempt_public_id AND j.reference_type = 'PAYMENT_SETTLEMENT'
            AND j.status = 'POSTED' AND la.account_id = pr.account_id
            AND la.asset_id = pv.asset_id AND la.network = pv.network
            AND la.account_code = 'LIABILITY_MERCHANT_PAYABLE' AND e.entry_direction = 'CREDIT'
        )
    ), account_activity AS (
      SELECT wa.id, wa.account_id, wa.wallet_id, wa.network, wa.chain_id, wa.ecosystem, wa.activity_type,
        wa.direction, wa.tx_hash, wa.event_index, wa.from_address, wa.to_address, wa.asset_id,
        wa.network_asset_id, wa.asset_symbol, wa.atomic_amount, wa.decimals, wa.block_height,
        wa.block_hash, wa.block_timestamp, wa.finality, wa.reorg_status, wa.fee_atomic_amount,
        wa.metadata, wa.observed_at, wa.created_at, wa.updated_at
      FROM flow.wallet_activities wa
      WHERE wa.account_id = ${accountId}::uuid
      UNION ALL
      SELECT receipt.*
      FROM receipt_events receipt
      WHERE NOT EXISTS (
        SELECT 1 FROM flow.wallet_activities indexed
        WHERE indexed.account_id = receipt.account_id
          AND indexed.chain_id = receipt.chain_id AND indexed.event_index = receipt.event_index
          AND indexed.tx_hash = receipt.tx_hash AND indexed.direction = receipt.direction
          AND indexed.reorg_status = 'CANONICAL'
      )
    )
  `;
}

export async function readActivities(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  const url = new URL(request.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "20", 10);
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 20 : limitParam));
  const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);
  const network = url.searchParams.get("network") || null;
  const direction = url.searchParams.get("direction") || null;
  const activityType = url.searchParams.get("activityType") || null;
  const assetSymbol = url.searchParams.get("assetSymbol") || null;

  const execute = async (tx: FlowDb): Promise<ActivityFeedResponse> => {
    // Set RLS session token context
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true),
      set_config('flow.current_account_id', ${accountId}, true)`;
    const source = accountActivityRows(accountId);

    const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
      ${source}
      SELECT COUNT(*)::bigint AS count
      FROM account_activity wa
      WHERE wa.account_id = ${accountId}::uuid
        AND (${network}::text IS NULL OR wa.network = ${network})
        AND (${direction}::text IS NULL OR wa.direction = ${direction})
        AND (${activityType}::text IS NULL OR wa.activity_type = ${activityType})
        AND (${assetSymbol}::text IS NULL OR wa.asset_symbol = ${assetSymbol})
    `;

    const total = Number(countRows[0]?.count ?? 0n);

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        accountId: string;
        walletId: string;
        network: string;
        chainId: string;
        ecosystem: string;
        activityType: string;
        direction: string;
        txHash: string;
        eventIndex: number;
        fromAddress: string;
        toAddress: string;
        assetId: string | null;
        networkAssetId: string | null;
        assetSymbol: string;
        atomicAmount: unknown;
        decimals: number;
        blockHeight: unknown;
        blockHash: string | null;
        blockTimestamp: Date | null;
        finality: string;
        reorgStatus: string;
        feeAtomicAmount: unknown;
        metadata: unknown;
        observedAt: Date;
        createdAt: Date;
        updatedAt: Date;
      }>
    >`
      ${source}
      SELECT
        wa.id,
        wa.account_id AS "accountId",
        wa.wallet_id AS "walletId",
        wa.network,
        wa.chain_id AS "chainId",
        wa.ecosystem,
        wa.activity_type AS "activityType",
        wa.direction,
        wa.tx_hash AS "txHash",
        wa.event_index AS "eventIndex",
        wa.from_address AS "fromAddress",
        wa.to_address AS "toAddress",
        wa.asset_id AS "assetId",
        wa.network_asset_id AS "networkAssetId",
        wa.asset_symbol AS "assetSymbol",
        wa.atomic_amount AS "atomicAmount",
        wa.decimals,
        wa.block_height AS "blockHeight",
        wa.block_hash AS "blockHash",
        wa.block_timestamp AS "blockTimestamp",
        wa.finality,
        wa.reorg_status AS "reorgStatus",
        wa.fee_atomic_amount AS "feeAtomicAmount",
        wa.metadata,
        wa.observed_at AS "observedAt",
        wa.created_at AS "createdAt",
        wa.updated_at AS "updatedAt"
      FROM account_activity wa
      WHERE wa.account_id = ${accountId}::uuid
        AND (${network}::text IS NULL OR wa.network = ${network})
        AND (${direction}::text IS NULL OR wa.direction = ${direction})
        AND (${activityType}::text IS NULL OR wa.activity_type = ${activityType})
        AND (${assetSymbol}::text IS NULL OR wa.asset_symbol = ${assetSymbol})
      ORDER BY COALESCE(wa.block_timestamp, wa.observed_at) DESC, wa.block_height DESC NULLS LAST, wa.created_at DESC, wa.id
      LIMIT ${limit} OFFSET ${offset}
    `;

    const records: WalletActivityRecord[] = rows.map((r) => {
      const atomicAmountStr =
        String(r.atomicAmount ?? "0").split(".")[0] || "0";
      const atomicAmount =
        typeof r.atomicAmount === "bigint"
          ? r.atomicAmount
          : BigInt(atomicAmountStr);

      const blockHeight =
        r.blockHeight === null || r.blockHeight === undefined
          ? null
          : typeof r.blockHeight === "bigint"
            ? r.blockHeight
            : BigInt(String(r.blockHeight));

      const feeAtomicStr =
        r.feeAtomicAmount === null || r.feeAtomicAmount === undefined
          ? null
          : String(r.feeAtomicAmount).split(".")[0] || "0";
      const feeAtomicAmount =
        r.feeAtomicAmount === null ||
        r.feeAtomicAmount === undefined ||
        feeAtomicStr === null
          ? null
          : typeof r.feeAtomicAmount === "bigint"
            ? r.feeAtomicAmount
            : BigInt(feeAtomicStr);

      const metadata =
        typeof r.metadata === "object" && r.metadata !== null
          ? (r.metadata as Record<string, unknown>)
          : {};

      return {
        id: r.id,
        accountId: r.accountId,
        walletId: r.walletId,
        network: r.network,
        chainId: r.chainId,
        ecosystem: r.ecosystem as "evm" | "solana" | "near",
        activityType: r.activityType as ActivityType,
        direction: r.direction as ActivityDirection,
        txHash: r.txHash,
        eventIndex: r.eventIndex,
        fromAddress: r.fromAddress,
        toAddress: r.toAddress,
        assetId: r.assetId,
        networkAssetId: r.networkAssetId,
        assetSymbol: r.assetSymbol,
        atomicAmount,
        decimals: r.decimals,
        blockHeight,
        blockHash: r.blockHash,
        blockTimestamp: r.blockTimestamp ? new Date(r.blockTimestamp) : null,
        finality: r.finality as ActivityFinality,
        reorgStatus: r.reorgStatus as ReorgStatus,
        feeAtomicAmount,
        metadata,
        observedAt: new Date(r.observedAt),
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      };
    });

    const serialized = serializeActivities(records);
    return {
      activities: serialized,
      total,
      limit,
      offset,
      hasMore: offset + records.length < total,
    };
  };

  const dbWithTx = db as {
    $transaction?: <T>(fn: (tx: FlowDb) => Promise<T>) => Promise<T>;
  };
  const result =
    typeof dbWithTx.$transaction === "function"
      ? await dbWithTx.$transaction(execute)
      : await execute(db);

  return reply(200, result);
}

export async function syncActivities(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  const wallets = await db.$queryRaw<
    Array<{ id: string; environment: string }>
  >`
    SELECT id, environment FROM flow.wallets WHERE account_id = ${accountId}::uuid LIMIT 1
  `;
  const wallet = wallets[0];
  if (!wallet) {
    return reply(200, {
      activities: [],
      total: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
      syncSummary: {
        totalDiscovered: 0,
        insertedCount: 0,
        updatedCount: 0,
      },
    });
  }

  // Use worker database client for privileged indexer ingestion
  const workerDb = getPrismaClient("worker");
  const summary = await ingestWalletActivities(workerDb, wallet.id);

  // Return fresh activity list for the user
  const feedResponse = await readActivities(request, accountId);
  const feedJson = (await feedResponse.json()) as ActivityFeedResponse;

  return reply(200, {
    ...feedJson,
    syncSummary: summary,
  });
}
