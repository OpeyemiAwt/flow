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
import { runtime, type FlowDb } from "../foundation/prisma.ts";
import { access, principal } from "./accounts.ts";
import { readAccountSync, requestAccountSync } from "./account-sync.ts";
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
        registry.asset_id::text AS asset_id, registry.id AS network_asset_id, pr.destination_asset_symbol AS asset_symbol,
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
      SELECT * FROM (
        SELECT DISTINCT ON (wa.network, wa.tx_hash, wa.direction)
          wa.id, wa.account_id, wa.wallet_id, wa.network, wa.chain_id, wa.ecosystem, wa.activity_type,
          wa.direction, wa.tx_hash, wa.event_index, wa.from_address, wa.to_address, wa.asset_id::text AS asset_id,
          wa.network_asset_id, wa.asset_symbol, wa.atomic_amount, wa.decimals, wa.block_height,
          wa.block_hash, wa.block_timestamp, wa.finality, wa.reorg_status, wa.fee_atomic_amount,
          CASE
            WHEN ot_meta.id IS NOT NULL THEN
              COALESCE(wa.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                'memo', ot_meta.provider_quote_payload->>'userMemo',
                'recipientLabel', ot_meta.provider_quote_payload->>'recipientLabel',
                'jobKind', ot_meta.job_kind,
                'publicId', ot_meta.public_id
              ))
            ELSE wa.metadata
          END AS metadata,
          wa.observed_at, wa.created_at, wa.updated_at
        FROM flow.wallet_activities wa
        LEFT JOIN LATERAL (
          SELECT otj.id, otj.provider_quote_payload, otj.job_kind, otj.public_id
          FROM flow.outgoing_transfer_jobs otj
          WHERE otj.account_id = wa.account_id
            AND otj.source_tx_hash = wa.tx_hash
          ORDER BY otj.created_at DESC
          LIMIT 1
        ) ot_meta ON wa.direction = 'OUTGOING'
        WHERE wa.account_id = ${accountId}::uuid
        ORDER BY
          wa.network,
          wa.tx_hash,
          wa.direction,
          (wa.block_timestamp IS NULL) ASC,
          COALESCE(wa.block_timestamp, wa.observed_at) ASC,
          wa.event_index ASC
      ) deduped_wa
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
      UNION ALL
      SELECT
        ot.id,
        ot.account_id,
        ot.wallet_id,
        ot.source_network AS network,
        CASE ot.source_network
          WHEN 'ethereum-mainnet' THEN '1'
          WHEN 'base-mainnet' THEN '8453'
          WHEN 'solana-mainnet' THEN 'solana-mainnet'
          ELSE ot.source_network
        END AS chain_id,
        CASE
          WHEN ot.source_network IN ('ethereum-mainnet', 'base-mainnet', 'ethereum-sepolia', 'base-sepolia') THEN 'evm'
          WHEN ot.source_network LIKE 'solana%' THEN 'solana'
          ELSE 'near'
        END AS ecosystem,
        CASE WHEN ot.job_kind = 'CONVERT' THEN 'FLOW_CONVERT' ELSE 'FLOW_PAYMENT' END AS activity_type,
        'OUTGOING'::text AS direction,
        COALESCE(ot.source_tx_hash, ot.public_id) AS tx_hash,
        0::integer AS event_index,
        COALESCE(wa_src.address, '') AS from_address,
        ot.recipient_address AS to_address,
        ot.source_asset_id::text AS asset_id,
        NULL::uuid AS network_asset_id,
        ot.source_asset_symbol AS asset_symbol,
        ot.source_atomic_amount AS atomic_amount,
        ot.source_decimals AS decimals,
        NULL::bigint AS block_height,
        NULL::text AS block_hash,
        NULL::timestamptz AS block_timestamp,
        CASE
          WHEN ot.status = 'SETTLED' THEN 'FINALIZED'
          WHEN ot.status IN ('CONFIRMING', 'PROVIDER_SETTLING') THEN 'CONFIRMED'
          ELSE 'PENDING'
        END AS finality,
        'CANONICAL'::text AS reorg_status,
        ot.fee_atomic_amount,
        jsonb_build_object(
          'executionStatus', ot.status,
          'publicId', ot.public_id,
          'jobKind', ot.job_kind,
          'destinationNetwork', ot.destination_network,
          'destinationAssetSymbol', ot.destination_asset_symbol,
          'destinationTxHash', ot.destination_tx_hash,
          'memo', ot.provider_quote_payload->>'userMemo',
          'recipientLabel', ot.provider_quote_payload->>'recipientLabel',
          'errorCode', ot.error_code,
          'errorMessage', ot.error_message
        ) AS metadata,
        COALESCE(ot.settled_at, ot.broadcast_at, ot.created_at) AS observed_at,
        ot.created_at,
        ot.updated_at
      FROM flow.outgoing_transfer_jobs ot
      LEFT JOIN flow.wallet_addresses wa_src
        ON wa_src.wallet_id = ot.wallet_id
       AND (
         wa_src.network = ot.source_network
         OR wa_src.chain_id = CASE ot.source_network
           WHEN 'base-mainnet' THEN '8453'
           WHEN 'ethereum-mainnet' THEN '1'
           WHEN 'solana-mainnet' THEN 'solana-mainnet'
           WHEN 'near-mainnet' THEN 'near-mainnet'
           ELSE ot.source_network
         END
       )
      WHERE ot.account_id = ${accountId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM flow.wallet_activities indexed
          WHERE indexed.account_id = ot.account_id
            AND ot.source_tx_hash IS NOT NULL
            AND indexed.tx_hash = ot.source_tx_hash
            AND indexed.direction = 'OUTGOING'
            AND indexed.reorg_status = 'CANONICAL'
        )
      UNION ALL
      SELECT
        am.id,
        am.account_id,
        am.wallet_id,
        am.destination_network AS network,
        am.destination_network AS chain_id,
        CASE
          WHEN am.destination_network LIKE 'solana%' THEN 'solana'
          WHEN am.destination_network LIKE 'base%' THEN 'base'
          WHEN am.destination_network LIKE 'ethereum%' THEN 'ethereum'
          ELSE 'near'
        END::text AS ecosystem,
        CASE
          WHEN am.status = 'SETTLED' THEN 'FLOW_CROSS_CHAIN_SETTLEMENT'
          ELSE 'FLOW_PAYMENT'
        END::text AS activity_type,
        'INCOMING'::text AS direction,
        COALESCE(am.destination_tx_hash, am.source_tx_hash, am.public_id) AS tx_hash,
        0::integer AS event_index,
        COALESCE(am.deposit_address, am.refund_address) AS from_address,
        am.destination_address AS to_address,
        am.destination_asset_id::text AS asset_id,
        NULL::uuid AS network_asset_id,
        am.destination_asset_symbol AS asset_symbol,
        am.quoted_destination_atomic_amount AS atomic_amount,
        am.destination_decimals AS decimals,
        NULL::bigint AS block_height,
        NULL::text AS block_hash,
        NULL::timestamptz AS block_timestamp,
        CASE
          WHEN am.status = 'SETTLED' THEN 'FINALIZED'
          WHEN am.status = 'SETTLING' THEN 'CONFIRMED'
          ELSE 'PENDING'
        END AS finality,
        'CANONICAL'::text AS reorg_status,
        NULL::numeric AS fee_atomic_amount,
        jsonb_build_object(
          'executionStatus', am.status,
          'publicId', am.public_id,
          'sourceNetwork', am.source_network,
          'sourceAssetSymbol', am.source_asset_symbol,
          'sourceTxHash', am.source_tx_hash,
          'destinationTxHash', am.destination_tx_hash,
          'settlementError', am.settlement_error
        ) AS metadata,
        COALESCE(am.settled_at, am.created_at) AS observed_at,
        am.created_at,
        am.updated_at
      FROM flow.add_money_intents am
      WHERE am.account_id = ${accountId}::uuid
        AND NOT (
          am.source_tx_hash IS NULL
          AND am.destination_tx_hash IS NULL
          AND (am.status = 'EXPIRED' OR (am.status = 'AWAITING_DEPOSIT' AND am.deposit_deadline < CURRENT_TIMESTAMP))
        )
        AND NOT EXISTS (
          SELECT 1 FROM flow.wallet_activities indexed
          WHERE indexed.account_id = am.account_id
            AND am.destination_tx_hash IS NOT NULL
            AND indexed.tx_hash = am.destination_tx_hash
            AND indexed.direction = 'INCOMING'
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
        wa.atomic_amount::text AS "atomicAmount",
        wa.decimals,
        wa.block_height::text AS "blockHeight",
        wa.block_hash AS "blockHash",
        wa.block_timestamp AS "blockTimestamp",
        wa.finality,
        wa.reorg_status AS "reorgStatus",
        wa.fee_atomic_amount::text AS "feeAtomicAmount",
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

  const job = await requestAccountSync(
    accountId,
    actor.session.token,
    "ACTIVITY_SYNC",
  );
  const feedResponse = await readActivities(request, accountId);
  const feedJson = (await feedResponse.json()) as ActivityFeedResponse;
  return reply(
    200,
    job
      ? {
          ...feedJson,
          syncStatus: job.job_status.toLowerCase(),
          syncJobId: job.job_id,
        }
      : { ...feedJson, syncStatus: "unavailable" },
  );
}

export async function readActivitySyncStatus(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);
  if (!actor.session.token) throw new ApiFailure(401, "AUTH_REQUIRED");
  return reply(200, {
    sync: await readAccountSync(
      accountId,
      actor.session.token,
      "ACTIVITY_SYNC",
    ),
  });
}
