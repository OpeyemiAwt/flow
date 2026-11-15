import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import {
  isFinancialExecutionDisabled,
  validateAddressForNetwork,
} from "../domain/custody.ts";
import {
  getMainnetWalletAddress,
  isBalanceMatchingDeployment,
  serializePortfolio,
} from "../domain/portfolio.ts";
import type { NetworkId } from "../domain/providers.ts";
import { isBannedIllustrativeAddress } from "../domain/quote-discovery.ts";
import {
  checkNetworkGasBalance,
  MAINNET_SUPPORTED_DEPLOYMENTS,
} from "../domain/supported-assets-catalog.ts";
import { runtime, transaction } from "../foundation/prisma.ts";
import { access, accountId, principal } from "./accounts.ts";
import { requestAccountSync } from "./account-sync.ts";
import { getAccountBalances } from "./assets/asset-service.ts";
import { fetchLiveMainnetBalance } from "./assets/connectors/multi-chain-reconciler.ts";
import { ApiFailure, input, reply } from "./http.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import { fetchOneClickCommittedQuote } from "./providers/one-click-adapter.ts";

const sendExecuteSchema = z.strictObject({
  sourceDeploymentId: z.string().trim().min(1).max(128),
  destinationDeploymentId: z.string().trim().min(1).max(128).optional(),
  recipientAddress: z.string().trim().min(2).max(128),
  sourceDisplayAmount: z.string().trim().min(1).max(64),
  idempotencyKey: z.string().uuid().optional(),
});

const convertExecuteSchema = z.strictObject({
  sourceDeploymentId: z.string().trim().min(1).max(128),
  destinationDeploymentId: z.string().trim().min(1).max(128),
  sourceDisplayAmount: z.string().trim().min(1).max(64),
  idempotencyKey: z.string().uuid().optional(),
});

interface OutgoingTransferRow {
  id: string;
  public_id: string;
  account_id: string;
  wallet_id: string;
  job_kind: "SEND" | "CONVERT";
  source_network: string;
  source_asset_id: string;
  source_asset_symbol: string;
  source_decimals: number;
  source_atomic_amount: string;
  recipient_address: string;
  destination_network: string;
  destination_asset_id: string;
  destination_asset_symbol: string;
  destination_decimals: number;
  quoted_destination_atomic_amount: string | null;
  provider_deposit_address: string | null;
  provider_deposit_memo: string | null;
  provider_correlation_id: string | null;
  status: string;
  source_tx_hash: string | null;
  destination_tx_hash: string | null;
  fee_atomic_amount: string | null;
  error_code: string | null;
  error_message: string | null;
  broadcast_at: Date | null;
  settled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export function serializeOutgoingTransfer(row: OutgoingTransferRow) {
  return {
    id: row.id,
    publicId: row.public_id,
    accountId: row.account_id,
    jobKind: row.job_kind,
    sourceNetwork: row.source_network,
    sourceAssetId: row.source_asset_id,
    sourceAssetSymbol: row.source_asset_symbol,
    sourceDecimals: row.source_decimals,
    sourceAtomicAmount: row.source_atomic_amount,
    sourceDisplayAmount: formatAtomicToDisplay(
      row.source_atomic_amount,
      row.source_decimals,
    ),
    recipientAddress: row.recipient_address,
    destinationNetwork: row.destination_network,
    destinationAssetId: row.destination_asset_id,
    destinationAssetSymbol: row.destination_asset_symbol,
    destinationDecimals: row.destination_decimals,
    quotedDestinationAtomicAmount: row.quoted_destination_atomic_amount,
    quotedDestinationDisplayAmount: row.quoted_destination_atomic_amount
      ? formatAtomicToDisplay(
          row.quoted_destination_atomic_amount,
          row.destination_decimals,
        )
      : null,
    providerDepositAddress: row.provider_deposit_address,
    providerDepositMemo: row.provider_deposit_memo,
    providerCorrelationId: row.provider_correlation_id,
    status: row.status,
    sourceTxHash: row.source_tx_hash,
    destinationTxHash: row.destination_tx_hash,
    feeAtomicAmount: row.fee_atomic_amount,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    broadcastAt: row.broadcast_at?.toISOString() ?? null,
    settledAt: row.settled_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function resolveIdempotencyKey(request: Request, bodyKey?: string): string {
  const headerKey = request.headers.get("idempotency-key")?.trim();
  const parsed = z
    .string()
    .uuid()
    .safeParse(headerKey ?? bodyKey);
  if (!parsed.success) {
    throw new ApiFailure(422, "IDEMPOTENCY_KEY_REQUIRED");
  }
  return parsed.data;
}

async function findTransferByIdempotencyKey(
  id: string,
  token: string,
  idempotencyKey: string,
): Promise<OutgoingTransferRow | null> {
  const { db } = runtime();
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    const rows = await tx.$queryRaw<OutgoingTransferRow[]>`
      SELECT id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount, provider_deposit_address,
        provider_deposit_memo, provider_correlation_id, status,
        source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${id}::uuid
        AND idempotency_key = ${idempotencyKey}::uuid
      LIMIT 1
    `;
    return rows[0] ?? null;
  });
}

async function computeAvailableBalanceForDeployment(
  id: string,
  token: string,
  deploymentId: string,
  requestedAmountAtomic: bigint,
) {
  const deployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (d) => d.id === deploymentId,
  );
  if (!deployment) {
    throw new ApiFailure(400, "UNSUPPORTED_SOURCE_ASSET");
  }

  const { db } = runtime();
  const portfolio = serializePortfolio(
    await getAccountBalances(db, id, { sessionToken: token }),
  );
  if (!portfolio.wallet || portfolio.wallet.status !== "ACTIVE") {
    throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
  }

  const balance = portfolio.balances.find(
    (record) =>
      record.networkAsset.isVerified &&
      record.networkAsset.status === "ACTIVE" &&
      isBalanceMatchingDeployment(record, deployment),
  );
  const observedAt = Date.parse(balance?.lastSyncedAt ?? "");
  const isStaleOrUnsynced =
    !balance ||
    balance.syncStatus !== "SYNCED" ||
    !Number.isFinite(observedAt) ||
    Date.now() - observedAt > 120_000 ||
    balance.finality === "UNKNOWN";

  let availableAtomic: bigint;
  let liveNativeBalanceAtomic: bigint | null = null;
  const nativeDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (d) => d.networkKey === deployment.networkKey && d.standard === "NATIVE",
  );

  if (isStaleOrUnsynced) {
    const walletAddress = getMainnetWalletAddress(
      portfolio.wallet,
      deployment.networkKey as NetworkId,
    );
    if (!walletAddress) {
      throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
    }
    const networkKey = deployment.networkKey as
      | "ethereum"
      | "base"
      | "solana"
      | "near";
    const liveObs = await fetchLiveMainnetBalance({
      networkKey,
      standard: deployment.standard,
      contractIdentifier: deployment.contractIdentifier,
      address: walletAddress,
      networkAssetId: balance?.networkAsset.id,
    });
    if (liveObs.syncStatus !== "SYNCED" || liveObs.finality === "UNKNOWN") {
      throw new ApiFailure(409, "BALANCE_REFRESH_REQUIRED");
    }
    availableAtomic = BigInt(liveObs.atomicBalance);

    if (deployment.standard === "NATIVE") {
      liveNativeBalanceAtomic = availableAtomic;
    } else if (nativeDeployment) {
      const liveNativeObs = await fetchLiveMainnetBalance({
        networkKey,
        standard: nativeDeployment.standard,
        contractIdentifier: nativeDeployment.contractIdentifier,
        address: walletAddress,
      });
      if (
        liveNativeObs.syncStatus === "SYNCED" &&
        liveNativeObs.finality !== "UNKNOWN"
      ) {
        liveNativeBalanceAtomic = BigInt(liveNativeObs.atomicBalance);
      }
    }

    // Best-effort background DB refresh so the portfolio view stays up to date
    void requestAccountSync(id, token, "BALANCE_REFRESH").catch(() => {});
  } else {
    availableAtomic = BigInt(balance.atomicBalance);
  }

  const sourceAssetKey =
    deployment.standard === "NATIVE" ? "native" : deployment.contractIdentifier;

  const reservedRows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    return tx.$queryRaw<Array<{ reserved: string }>>`
      SELECT COALESCE(SUM(source_atomic_amount), 0)::text AS reserved
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${id}::uuid
        AND source_network = ${deployment.networkKey}::text
        AND source_asset_id = ${sourceAssetKey}::text
        AND status IN (
          'PENDING_CUSTODY',
          'LEASED',
          'SIGNING_IN_PROGRESS',
          'UNKNOWN_AMBIGUOUS'
        )
    `;
  });

  const reservedAtomic = BigInt(reservedRows[0]?.reserved ?? "0");
  const spendable = availableAtomic - reservedAtomic;
  if (requestedAmountAtomic > spendable) {
    throw new ApiFailure(400, "INSUFFICIENT_SPENDABLE_BALANCE");
  }

  const nativeGasRecord = nativeDeployment
    ? portfolio.balances.find(
        (record) =>
          record.networkAsset.isVerified &&
          record.networkAsset.status === "ACTIVE" &&
          isBalanceMatchingDeployment(record, nativeDeployment),
      )
    : undefined;
  const nativeBalanceAtomic =
    liveNativeBalanceAtomic ??
    (nativeGasRecord ? BigInt(nativeGasRecord.atomicBalance) : 0n);
  const gasCheck = checkNetworkGasBalance({
    networkKey: deployment.networkKey,
    sourceStandard: deployment.standard,
    requestedAmountAtomic,
    nativeBalanceAtomic,
  });
  if (!gasCheck.ok) {
    throw new ApiFailure(400, "INSUFFICIENT_GAS_BALANCE");
  }

  return { deployment, sourceAssetKey, portfolio };
}

export async function executeSendTransfer(
  request: Request,
  rawAccountId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const body = await input(request, sendExecuteSchema);
  const idempotencyKey = resolveIdempotencyKey(request, body.idempotencyKey);

  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const existing = await findTransferByIdempotencyKey(
    id,
    token,
    idempotencyKey,
  );
  if (existing) {
    return reply(200, {
      ok: true,
      transfer: serializeOutgoingTransfer(existing),
    });
  }

  if (isFinancialExecutionDisabled()) {
    throw new ApiFailure(403, "PAYMENT_EXECUTION_DISABLED");
  }

  const sourceDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (d) => d.id === body.sourceDeploymentId,
  );
  if (!sourceDeployment) {
    throw new ApiFailure(400, "UNSUPPORTED_SOURCE_ASSET");
  }
  const destDeployment = body.destinationDeploymentId
    ? MAINNET_SUPPORTED_DEPLOYMENTS.find(
        (d) => d.id === body.destinationDeploymentId,
      )
    : sourceDeployment;
  if (!destDeployment) {
    throw new ApiFailure(400, "UNSUPPORTED_DESTINATION_ASSET");
  }
  const isCrossChainSend = destDeployment.id !== sourceDeployment.id;

  let amountAtomic: bigint;
  try {
    amountAtomic = parseDisplayToAtomic(
      body.sourceDisplayAmount,
      sourceDeployment.decimals,
    );
  } catch {
    throw new ApiFailure(400, "INVALID_AMOUNT");
  }
  if (amountAtomic <= 0n) {
    throw new ApiFailure(400, "INVALID_AMOUNT");
  }

  const trimmedRecipient = body.recipientAddress.trim();
  const addressValidation = validateAddressForNetwork(
    destDeployment.networkKey as NetworkId,
    trimmedRecipient,
  );
  if (
    !addressValidation.valid ||
    isBannedIllustrativeAddress(trimmedRecipient)
  ) {
    throw new ApiFailure(400, "INVALID_RECIPIENT_ADDRESS");
  }

  const { sourceAssetKey, portfolio } =
    await computeAvailableBalanceForDeployment(
      id,
      token,
      sourceDeployment.id,
      amountAtomic,
    );
  const wallet = portfolio.wallet;
  const walletId = wallet?.id;
  if (!wallet || !walletId) {
    throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
  }

  let committedQuote: {
    quotedOutAtomic?: string;
    depositAddress?: string;
    depositMemo?: string | null;
    correlationId?: string | null;
  } | null = null;

  if (isCrossChainSend) {
    const ownSourceAddress = getMainnetWalletAddress(
      wallet,
      sourceDeployment.networkKey,
    );
    if (!ownSourceAddress) {
      throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
    }

    const [srcQuote, dstQuote] = await Promise.all([
      resolveQuoteAsset(sourceDeployment.id),
      resolveQuoteAsset(destDeployment.id),
    ]);
    if (!srcQuote || !dstQuote) {
      throw new ApiFailure(400, "UNSUPPORTED_SEND_ROUTE");
    }

    const committed = await fetchOneClickCommittedQuote({
      originAsset: srcQuote.assetId,
      destinationAsset: dstQuote.assetId,
      amountAtomic: amountAtomic.toString(),
      swapType: "EXACT_INPUT",
      recipient: trimmedRecipient,
      refundTo: ownSourceAddress,
    });
    if (
      !committed.ok ||
      !committed.depositAddress ||
      !committed.amountOutAtomic
    ) {
      throw new ApiFailure(
        422,
        committed.errorMessage || "QUOTE_COMMIT_FAILED",
      );
    }
    committedQuote = {
      quotedOutAtomic: committed.amountOutAtomic,
      depositAddress: committed.depositAddress,
      depositMemo: committed.depositMemo,
      correlationId: committed.correlationId,
    };
  }

  const destAssetKey =
    destDeployment.standard === "NATIVE"
      ? "native"
      : destDeployment.contractIdentifier;
  const publicId = `snd_${randomBytes(10).toString("hex")}`;

  const created = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;

    const rows = await tx.$queryRaw<OutgoingTransferRow[]>`
      INSERT INTO flow.outgoing_transfer_jobs (
        public_id,
        account_id,
        wallet_id,
        idempotency_key,
        job_kind,
        source_network,
        source_asset_id,
        source_asset_symbol,
        source_decimals,
        source_atomic_amount,
        recipient_address,
        destination_network,
        destination_asset_id,
        destination_asset_symbol,
        destination_decimals,
        expected_destination_atomic_amount,
        provider_deposit_address,
        provider_deposit_memo,
        provider_correlation_id,
        status,
        created_by_user_id
      )
      VALUES (
        ${publicId}::text,
        ${id}::uuid,
        ${walletId}::uuid,
        ${idempotencyKey}::uuid,
        'SEND',
        ${sourceDeployment.networkKey}::text,
        ${sourceAssetKey}::text,
        ${sourceDeployment.symbol}::text,
        ${sourceDeployment.decimals}::integer,
        ${amountAtomic.toString()}::numeric,
        ${trimmedRecipient}::text,
        ${destDeployment.networkKey}::text,
        ${destAssetKey}::text,
        ${destDeployment.symbol}::text,
        ${destDeployment.decimals}::integer,
        ${committedQuote?.quotedOutAtomic ?? null}::numeric,
        ${committedQuote?.depositAddress ?? null}::text,
        ${committedQuote?.depositMemo ?? null}::text,
        ${committedQuote?.correlationId ?? null}::text,
        'PENDING_CUSTODY',
        ${actor.userId}::uuid
      )
      RETURNING id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount, provider_deposit_address,
        provider_deposit_memo, provider_correlation_id, status,
        source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
    `;
    return rows[0]!;
  });

  return reply(201, { ok: true, transfer: serializeOutgoingTransfer(created) });
}

export async function executeConvertTransfer(
  request: Request,
  rawAccountId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const body = await input(request, convertExecuteSchema);
  const idempotencyKey = resolveIdempotencyKey(request, body.idempotencyKey);

  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const existing = await findTransferByIdempotencyKey(
    id,
    token,
    idempotencyKey,
  );
  if (existing) {
    return reply(200, {
      ok: true,
      transfer: serializeOutgoingTransfer(existing),
    });
  }

  if (isFinancialExecutionDisabled()) {
    throw new ApiFailure(403, "PAYMENT_EXECUTION_DISABLED");
  }

  const sourceDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (d) => d.id === body.sourceDeploymentId,
  );
  const destinationDeployment = MAINNET_SUPPORTED_DEPLOYMENTS.find(
    (d) => d.id === body.destinationDeploymentId,
  );
  if (
    !sourceDeployment ||
    !destinationDeployment ||
    sourceDeployment.id === destinationDeployment.id
  ) {
    throw new ApiFailure(400, "UNSUPPORTED_CONVERT_PAIR");
  }

  const [sourceQuoteAsset, destinationQuoteAsset] = await Promise.all([
    resolveQuoteAsset(sourceDeployment.id),
    resolveQuoteAsset(destinationDeployment.id),
  ]);
  if (!sourceQuoteAsset || !destinationQuoteAsset) {
    throw new ApiFailure(400, "UNSUPPORTED_CONVERT_PAIR");
  }

  let amountAtomic: bigint;
  try {
    amountAtomic = parseDisplayToAtomic(
      body.sourceDisplayAmount,
      sourceDeployment.decimals,
    );
  } catch {
    throw new ApiFailure(400, "INVALID_AMOUNT");
  }
  if (amountAtomic <= 0n) {
    throw new ApiFailure(400, "INVALID_AMOUNT");
  }

  const { sourceAssetKey, portfolio } =
    await computeAvailableBalanceForDeployment(
      id,
      token,
      sourceDeployment.id,
      amountAtomic,
    );
  const wallet = portfolio.wallet;
  if (!wallet) {
    throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
  }

  const ownSourceAddress = getMainnetWalletAddress(
    wallet,
    sourceDeployment.networkKey,
  );
  const ownDestinationAddress = getMainnetWalletAddress(
    wallet,
    destinationDeployment.networkKey,
  );
  if (!ownSourceAddress || !ownDestinationAddress) {
    throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
  }

  const committed = await fetchOneClickCommittedQuote({
    originAsset: sourceQuoteAsset.assetId,
    destinationAsset: destinationQuoteAsset.assetId,
    amountAtomic: amountAtomic.toString(),
    swapType: "EXACT_INPUT",
    recipient: ownDestinationAddress,
    refundTo: ownSourceAddress,
  });

  if (
    !committed.ok ||
    !committed.depositAddress ||
    !committed.amountOutAtomic
  ) {
    throw new ApiFailure(422, committed.errorMessage || "QUOTE_COMMIT_FAILED");
  }
  const convertAmountOutAtomic = committed.amountOutAtomic;
  const convertDepositAddress = committed.depositAddress;
  const convertDepositMemo = committed.depositMemo ?? null;
  const convertCorrelationId = committed.correlationId ?? null;

  const destinationAssetKey =
    destinationDeployment.standard === "NATIVE"
      ? "native"
      : destinationDeployment.contractIdentifier;
  const publicId = `cnv_${randomBytes(10).toString("hex")}`;

  const created = await transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;

    const rows = await tx.$queryRaw<OutgoingTransferRow[]>`
      INSERT INTO flow.outgoing_transfer_jobs (
        public_id,
        account_id,
        wallet_id,
        idempotency_key,
        job_kind,
        source_network,
        source_asset_id,
        source_asset_symbol,
        source_decimals,
        source_atomic_amount,
        recipient_address,
        destination_network,
        destination_asset_id,
        destination_asset_symbol,
        destination_decimals,
        expected_destination_atomic_amount,
        provider_deposit_address,
        provider_deposit_memo,
        provider_correlation_id,
        status,
        created_by_user_id
      )
      VALUES (
        ${publicId}::text,
        ${id}::uuid,
        ${wallet.id}::uuid,
        ${idempotencyKey}::uuid,
        'CONVERT',
        ${sourceDeployment.networkKey}::text,
        ${sourceAssetKey}::text,
        ${sourceDeployment.symbol}::text,
        ${sourceDeployment.decimals}::integer,
        ${amountAtomic.toString()}::numeric,
        ${ownDestinationAddress}::text,
        ${destinationDeployment.networkKey}::text,
        ${destinationAssetKey}::text,
        ${destinationDeployment.symbol}::text,
        ${destinationDeployment.decimals}::integer,
        ${convertAmountOutAtomic}::numeric,
        ${convertDepositAddress}::text,
        ${convertDepositMemo}::text,
        ${convertCorrelationId}::text,
        'PENDING_CUSTODY',
        ${actor.userId}::uuid
      )
      RETURNING id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount, provider_deposit_address,
        provider_deposit_memo, provider_correlation_id, status,
        source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
    `;
    return rows[0]!;
  });

  return reply(201, { ok: true, transfer: serializeOutgoingTransfer(created) });
}

export async function listOutgoingTransfers(
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
    return tx.$queryRaw<OutgoingTransferRow[]>`
      SELECT id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount, provider_deposit_address,
        provider_deposit_memo, provider_correlation_id, status,
        source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${id}::uuid
      ORDER BY created_at DESC
      LIMIT 30
    `;
  });

  return reply(200, {
    ok: true,
    transfers: rows.map(serializeOutgoingTransfer),
  });
}

export async function getOutgoingTransfer(
  request: Request,
  rawAccountId: string,
  transferId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const row = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    const rows = await tx.$queryRaw<OutgoingTransferRow[]>`
      SELECT id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount, provider_deposit_address,
        provider_deposit_memo, provider_correlation_id, status,
        source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${id}::uuid
        AND (id::text = ${transferId}::text OR public_id = ${transferId}::text)
      LIMIT 1
    `;
    return rows[0] ?? null;
  });

  if (!row) {
    throw new ApiFailure(404, "TRANSFER_NOT_FOUND");
  }

  return reply(200, { ok: true, transfer: serializeOutgoingTransfer(row) });
}
