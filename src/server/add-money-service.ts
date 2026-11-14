import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import { isFinancialExecutionDisabled } from "../domain/custody.ts";
import { supportsQuoteAddress } from "../domain/quote-addresses.ts";
import { canonicalizeNetworkId } from "../domain/supported-assets-catalog.ts";
import { runtime } from "../foundation/prisma.ts";
import { access, accountId, principal } from "./accounts.ts";
import { ApiFailure, input, reply } from "./http.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import { fetchOneClickCommittedQuote } from "./providers/one-click-adapter.ts";
import { validateProviderAddress } from "./providers/one-click-preview.ts";

const commitBodySchema = z.strictObject({
  sourceDeploymentId: z.string().trim().min(1).max(128),
  sourceAmount: z.string().trim().min(1).max(64),
  refundAddress: z.string().trim().max(256).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

interface AddMoneyRow {
  id: string;
  public_id: string;
  account_id: string;
  wallet_id: string;
  source_network: string;
  source_asset_id: string;
  source_asset_symbol: string;
  source_decimals: number;
  destination_network: string;
  destination_asset_id: string;
  destination_asset_symbol: string;
  destination_decimals: number;
  destination_address: string;
  refund_address: string;
  quoted_source_atomic_amount: string;
  quoted_destination_atomic_amount: string;
  estimated_duration_seconds: number | null;
  deposit_address: string | null;
  deposit_memo: string | null;
  deposit_deadline: Date | null;
  source_tx_hash: string | null;
  destination_tx_hash: string | null;
  status: string;
  settlement_error: string | null;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function serializeAddMoneyIntent(row: AddMoneyRow) {
  return {
    id: row.id,
    publicId: row.public_id,
    accountId: row.account_id,
    sourceNetwork: row.source_network,
    sourceAssetId: row.source_asset_id,
    sourceAssetSymbol: row.source_asset_symbol,
    sourceDecimals: row.source_decimals,
    destinationNetwork: row.destination_network,
    destinationAssetId: row.destination_asset_id,
    destinationAssetSymbol: row.destination_asset_symbol,
    destinationDecimals: row.destination_decimals,
    destinationAddress: row.destination_address,
    refundAddress: row.refund_address,
    quotedSourceAtomicAmount: row.quoted_source_atomic_amount,
    quotedSourceDisplayAmount: formatAtomicToDisplay(
      row.quoted_source_atomic_amount,
      row.source_decimals,
    ),
    quotedDestinationAtomicAmount: row.quoted_destination_atomic_amount,
    quotedDestinationDisplayAmount: formatAtomicToDisplay(
      row.quoted_destination_atomic_amount,
      row.destination_decimals,
    ),
    estimatedDurationSeconds: row.estimated_duration_seconds,
    depositAddress: row.deposit_address,
    depositMemo: row.deposit_memo,
    depositDeadline: row.deposit_deadline?.toISOString() ?? null,
    sourceTxHash: row.source_tx_hash,
    destinationTxHash: row.destination_tx_hash,
    status: row.status,
    settlementError: row.settlement_error,
    settledAt: row.settled_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function commitAddMoneyIntent(
  request: Request,
  rawAccountId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const body = await input(request, commitBodySchema);
  const headerKey = request.headers.get("idempotency-key")?.trim();
  const idempotencyKey = z
    .string()
    .uuid()
    .safeParse(headerKey ?? body.idempotencyKey);
  if (!idempotencyKey.success) {
    throw new ApiFailure(422, "IDEMPOTENCY_KEY_REQUIRED");
  }

  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  // Check idempotency first before calling external quote commit
  const existing = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    const rows = await tx.$queryRaw<AddMoneyRow[]>`
      SELECT id, public_id, account_id, wallet_id, source_network, source_asset_id,
        source_asset_symbol, source_decimals, destination_network, destination_asset_id,
        destination_asset_symbol, destination_decimals, destination_address, refund_address,
        quoted_source_atomic_amount::text, quoted_destination_atomic_amount::text,
        estimated_duration_seconds, deposit_address, deposit_memo, deposit_deadline,
        source_tx_hash, destination_tx_hash, status, settlement_error, settled_at,
        created_at, updated_at
      FROM flow.add_money_intents
      WHERE account_id = ${id}::uuid
        AND idempotency_key = ${idempotencyKey.data}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  });

  if (existing) {
    return reply(200, { ok: true, intent: serializeAddMoneyIntent(existing) });
  }

  if (isFinancialExecutionDisabled()) {
    throw new ApiFailure(403, "PAYMENT_EXECUTION_DISABLED");
  }

  const [source, destination] = await Promise.all([
    resolveQuoteAsset(body.sourceDeploymentId),
    resolveQuoteAsset("near-mainnet:NEAR"),
  ]);

  if (
    !source ||
    source.isWrapped ||
    !supportsQuoteAddress(source) ||
    source.id === "near-mainnet:NEAR" ||
    !destination
  ) {
    throw new ApiFailure(400, "UNSUPPORTED_ADD_MONEY_ASSET");
  }

  const atomicBig = parseDisplayToAtomic(body.sourceAmount, source.decimals);
  if (atomicBig <= 0n) {
    throw new ApiFailure(400, "INVALID_AMOUNT");
  }
  const sourceAtomic = atomicBig.toString();

  // Resolve active wallet & permanent NEAR address + optional fallback refund address
  const walletContext = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    const rows = await tx.$queryRaw<
      Array<{
        wallet_id: string;
        network: string;
        chain_id: string;
        address: string;
      }>
    >`
      SELECT w.id AS wallet_id, wa.network, wa.chain_id, wa.address
      FROM flow.wallets w
      JOIN flow.wallet_addresses wa ON wa.wallet_id = w.id
      WHERE w.account_id = ${id}::uuid
        AND w.status = 'ACTIVE'
        AND w.environment = 'mainnet'
    `;
    return rows;
  });

  const nearWalletRow = walletContext.find(
    (r) =>
      (canonicalizeNetworkId(r.chain_id) ?? canonicalizeNetworkId(r.network)) ===
      "near-mainnet",
  );
  if (!nearWalletRow) {
    throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
  }

  const ownSourceAddress =
    walletContext.find(
      (r) =>
        (canonicalizeNetworkId(r.chain_id) ??
          canonicalizeNetworkId(r.network)) === source.networkKey,
    )?.address ?? null;
  const candidateRefundAddress =
    body.refundAddress?.trim() || ownSourceAddress || "";
  if (!candidateRefundAddress) {
    throw new ApiFailure(400, "REFUND_ADDRESS_REQUIRED");
  }
  const refundValidation = validateProviderAddress(
    source,
    candidateRefundAddress,
  );
  if (!refundValidation.valid) {
    throw new ApiFailure(400, "INVALID_REFUND_ADDRESS");
  }

  const committed = await fetchOneClickCommittedQuote({
    originAsset: source.assetId,
    destinationAsset: destination.assetId,
    swapType: "EXACT_INPUT",
    amountAtomic: sourceAtomic,
    refundTo: candidateRefundAddress,
    recipient: nearWalletRow.address,
  });

  if (
    !committed.ok ||
    !committed.depositAddress ||
    !committed.amountInAtomic ||
    !committed.amountOutAtomic ||
    !committed.depositDeadline
  ) {
    throw new ApiFailure(502, "PROVIDER_COMMIT_FAILED");
  }

  const deadlineDate = new Date(committed.depositDeadline);
  const publicId = `am_${randomBytes(10).toString("hex")}`;
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    const inserted = await tx.$queryRaw<AddMoneyRow[]>`
      INSERT INTO flow.add_money_intents (
        public_id,
        account_id,
        wallet_id,
        created_by_user_id,
        idempotency_key,
        source_network,
        source_asset_id,
        source_asset_symbol,
        source_decimals,
        destination_network,
        destination_asset_id,
        destination_asset_symbol,
        destination_decimals,
        destination_address,
        refund_address,
        quoted_source_atomic_amount,
        quoted_destination_atomic_amount,
        estimated_duration_seconds,
        provider_correlation_id,
        provider_signature,
        deposit_address,
        deposit_memo,
        deposit_deadline,
        deposit_instructions,
        status
      )
      VALUES (
        ${publicId},
        ${id}::uuid,
        ${nearWalletRow.wallet_id}::uuid,
        ${actor.userId}::uuid,
        ${idempotencyKey.data}::uuid,
        ${source.networkKey},
        ${source.id},
        ${source.symbol},
        ${source.decimals},
        'near-mainnet',
        'near-mainnet:NEAR',
        'NEAR',
        24,
        ${nearWalletRow.address},
        ${candidateRefundAddress},
        ${committed.amountInAtomic}::decimal(78, 0),
        ${committed.amountOutAtomic}::decimal(78, 0),
        ${committed.timeEstimateSeconds ?? null},
        ${committed.correlationId ?? null},
        ${committed.signature ?? null},
        ${committed.depositAddress},
        ${committed.depositMemo ?? null},
        ${deadlineDate},
        ${JSON.stringify({ depositAddress: committed.depositAddress, depositMemo: committed.depositMemo ?? null })}::jsonb,
        'DEPOSIT_COMMITTED'
      )
      ON CONFLICT (account_id, idempotency_key) DO NOTHING
      RETURNING id, public_id, account_id, wallet_id, source_network, source_asset_id,
        source_asset_symbol, source_decimals, destination_network, destination_asset_id,
        destination_asset_symbol, destination_decimals, destination_address, refund_address,
        quoted_source_atomic_amount::text, quoted_destination_atomic_amount::text,
        estimated_duration_seconds, deposit_address, deposit_memo, deposit_deadline,
        source_tx_hash, destination_tx_hash, status, settlement_error, settled_at,
        created_at, updated_at
    `;
    if (inserted[0]) return inserted[0];
    const race = await tx.$queryRaw<AddMoneyRow[]>`
      SELECT id, public_id, account_id, wallet_id, source_network, source_asset_id,
        source_asset_symbol, source_decimals, destination_network, destination_asset_id,
        destination_asset_symbol, destination_decimals, destination_address, refund_address,
        quoted_source_atomic_amount::text, quoted_destination_atomic_amount::text,
        estimated_duration_seconds, deposit_address, deposit_memo, deposit_deadline,
        source_tx_hash, destination_tx_hash, status, settlement_error, settled_at,
        created_at, updated_at
      FROM flow.add_money_intents
      WHERE account_id = ${id}::uuid
        AND idempotency_key = ${idempotencyKey.data}::uuid
      LIMIT 1
    `;
    return race[0]!;
  });

  return reply(201, { ok: true, intent: serializeAddMoneyIntent(created) });
}

export async function listAddMoneyIntents(
  request: Request,
  rawAccountId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    return tx.$queryRaw<AddMoneyRow[]>`
      SELECT id, public_id, account_id, wallet_id, source_network, source_asset_id,
        source_asset_symbol, source_decimals, destination_network, destination_asset_id,
        destination_asset_symbol, destination_decimals, destination_address, refund_address,
        quoted_source_atomic_amount::text, quoted_destination_atomic_amount::text,
        estimated_duration_seconds, deposit_address, deposit_memo, deposit_deadline,
        source_tx_hash, destination_tx_hash, status, settlement_error, settled_at,
        created_at, updated_at
      FROM flow.add_money_intents
      WHERE account_id = ${id}::uuid
      ORDER BY created_at DESC
      LIMIT 25
    `;
  });

  return reply(200, { ok: true, intents: rows.map(serializeAddMoneyIntent) });
}

export async function getAddMoneyIntent(
  request: Request,
  rawAccountId: string,
  intentPublicId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  if (!/^am_[a-f0-9]{20}$/.test(intentPublicId)) {
    throw new ApiFailure(404, "ADD_MONEY_INTENT_NOT_FOUND");
  }
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    return tx.$queryRaw<AddMoneyRow[]>`
      SELECT id, public_id, account_id, wallet_id, source_network, source_asset_id,
        source_asset_symbol, source_decimals, destination_network, destination_asset_id,
        destination_asset_symbol, destination_decimals, destination_address, refund_address,
        quoted_source_atomic_amount::text, quoted_destination_atomic_amount::text,
        estimated_duration_seconds, deposit_address, deposit_memo, deposit_deadline,
        source_tx_hash, destination_tx_hash, status, settlement_error, settled_at,
        created_at, updated_at
      FROM flow.add_money_intents
      WHERE account_id = ${id}::uuid
        AND public_id = ${intentPublicId}
      LIMIT 1
    `;
  });

  const row = rows[0];
  if (!row) throw new ApiFailure(404, "ADD_MONEY_INTENT_NOT_FOUND");
  return reply(200, { ok: true, intent: serializeAddMoneyIntent(row) });
}
