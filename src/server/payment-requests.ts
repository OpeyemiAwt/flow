import "server-only";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import {
  type PaymentAmountMode,
  type PaymentRequestRecord,
  type PaymentRequestStatus,
  type PublicPaymentRequest,
  type PublicPaymentRequestDbRow,
  generatePublicPaymentId,
  isValidPublicPaymentId,
  serializePaymentRequest,
  serializePublicPaymentRequest,
} from "../domain/payment-requests.ts";
import {
  isBannedIllustrativeAddress,
  validateProviderAtomicAmount,
  type PaymentAttemptStatus,
  type PaymentDepositInstructions,
} from "../domain/quote-discovery.ts";
import {
  CURATED_SUPPORTED_DEPLOYMENTS,
  canonicalizeNetworkId,
} from "../domain/supported-assets-catalog.ts";
import { runtime, type FlowDb } from "../foundation/prisma.ts";
import { access, principal } from "./accounts.ts";
import { clientBudget } from "./auth/limits.ts";
import { ApiFailure, reply } from "./http.ts";
import { resolveQuoteAsset } from "./providers/near-intents-discovery.ts";
import { validateProviderAddress } from "./providers/one-click-preview.ts";

export function readPaymentWalletAddresses(publicId: string) {
  return runtime().db.$queryRaw<
    Array<{ address: string; chain_id: string }>
  >`SELECT address, chain_id
      FROM flow.get_payment_request_wallet_addresses(${publicId})`;
}

export interface CreatePaymentRequestInput {
  title: string;
  description?: string | null;
  destinationNetwork: string;
  destinationAssetId: string;
  amountMode?: PaymentAmountMode;
  requestedAmount?: string | null;
  expiresInHours?: number | null;
  payerMemoRequired?: boolean;
}

export interface UpdatePaymentRequestInput {
  status?: PaymentRequestStatus;
  title?: string;
  description?: string | null;
}

export async function createPaymentRequest(
  request: Request,
  accountId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  let body: CreatePaymentRequestInput;
  try {
    body = (await request.json()) as CreatePaymentRequestInput;
  } catch {
    throw new ApiFailure(400, "INVALID_JSON");
  }

  const title = body.title?.trim();
  if (!title || title.length > 120) {
    throw new ApiFailure(400, "INVALID_TITLE");
  }

  const description = body.description?.trim() || null;
  if (description && description.length > 1000) {
    throw new ApiFailure(400, "INVALID_DESCRIPTION");
  }

  // Validate destination asset from verified catalog
  const deployment = CURATED_SUPPORTED_DEPLOYMENTS.find(
    (d) =>
      d.id === body.destinationAssetId &&
      d.networkKey === body.destinationNetwork,
  );

  if (!deployment) {
    throw new ApiFailure(400, "UNSUPPORTED_DESTINATION_ASSET");
  }

  const amountMode: PaymentAmountMode = body.amountMode ?? "FIXED";
  let requestedAtomicAmount: bigint | null = null;

  if (amountMode === "FIXED") {
    if (!body.requestedAmount || typeof body.requestedAmount !== "string") {
      throw new ApiFailure(400, "AMOUNT_REQUIRED");
    }

    try {
      requestedAtomicAmount = parseDisplayToAtomic(
        body.requestedAmount.trim(),
        deployment.decimals,
      );
    } catch {
      throw new ApiFailure(400, "INVALID_AMOUNT_FORMAT");
    }

    if (requestedAtomicAmount <= 0n) {
      throw new ApiFailure(400, "AMOUNT_MUST_BE_POSITIVE");
    }
  } else if (amountMode === "OPTIONAL") {
    if (body.requestedAmount && body.requestedAmount.trim() !== "") {
      throw new ApiFailure(400, "OPTIONAL_AMOUNT_MUST_BE_EMPTY");
    }
  } else {
    throw new ApiFailure(400, "INVALID_AMOUNT_MODE");
  }

  let expiresAt: Date | null = null;
  if (
    body.expiresInHours !== undefined &&
    body.expiresInHours !== null &&
    body.expiresInHours > 0
  ) {
    const hours = Math.floor(body.expiresInHours);
    if (hours < 1 || hours > 8760) {
      // max 1 year
      throw new ApiFailure(400, "INVALID_EXPIRY");
    }
    expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  }

  const publicId = generatePublicPaymentId();
  const payerMemoRequired = Boolean(body.payerMemoRequired);
  const origin = new URL(request.url).origin;

  const result = await db.$transaction(async (tx: FlowDb) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true)`;

    const insertedRows = await tx.$queryRaw<
      Array<{
        id: string;
        account_id: string;
        public_id: string;
        title: string;
        description: string | null;
        destination_network: string;
        destination_asset_id: string;
        destination_asset_symbol: string;
        destination_decimals: number;
        amount_mode: PaymentAmountMode;
        requested_atomic_amount: string | null;
        status: PaymentRequestStatus;
        expires_at: Date | null;
        payer_memo_required: boolean;
        metadata: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      INSERT INTO flow.payment_requests (
        account_id,
        public_id,
        title,
        description,
        destination_network,
        destination_asset_id,
        destination_asset_symbol,
        destination_decimals,
        amount_mode,
        requested_atomic_amount,
        status,
        expires_at,
        payer_memo_required,
        metadata
      ) VALUES (
        ${accountId}::uuid,
        ${publicId},
        ${title},
        ${description},
        ${deployment.networkKey},
        ${deployment.id},
        ${deployment.symbol},
        ${deployment.decimals},
        ${amountMode}::flow.payment_amount_mode,
        ${requestedAtomicAmount !== null ? requestedAtomicAmount.toString() : null}::decimal,
        'ACTIVE'::flow.payment_request_status,
        ${expiresAt},
        ${payerMemoRequired},
        '{}'::jsonb
      )
      RETURNING *
    `;

    const row = insertedRows[0]!;
    const record: PaymentRequestRecord = {
      id: row.id,
      accountId: row.account_id,
      publicId: row.public_id,
      title: row.title,
      description: row.description,
      destinationNetwork: row.destination_network,
      destinationAssetId: row.destination_asset_id,
      destinationAssetSymbol: row.destination_asset_symbol,
      destinationDecimals: row.destination_decimals,
      amountMode: row.amount_mode,
      requestedAtomicAmount: row.requested_atomic_amount
        ? BigInt(row.requested_atomic_amount)
        : null,
      status: row.status,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      payerMemoRequired: row.payer_memo_required,
      metadata: row.metadata ?? {},
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };

    return serializePaymentRequest(record, origin);
  });

  return reply(201, result);
}

export async function listPaymentRequests(
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
  const statusParam = url.searchParams.get("status") || null;

  const limit = Math.min(100, Math.max(1, isNaN(limitParam) ? 20 : limitParam));
  const offset = Math.max(0, isNaN(offsetParam) ? 0 : offsetParam);
  const origin = url.origin;

  const result = await db.$transaction(async (tx: FlowDb) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true)`;

    const countRows = await tx.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM flow.payment_requests pr
      WHERE pr.account_id = ${accountId}::uuid
        AND (${statusParam}::text IS NULL OR pr.status::text = ${statusParam})
    `;
    const total = Number(countRows[0]?.count ?? 0n);

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        account_id: string;
        public_id: string;
        title: string;
        description: string | null;
        destination_network: string;
        destination_asset_id: string;
        destination_asset_symbol: string;
        destination_decimals: number;
        amount_mode: PaymentAmountMode;
        requested_atomic_amount: string | null;
        status: PaymentRequestStatus;
        expires_at: Date | null;
        payer_memo_required: boolean;
        metadata: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      SELECT *
      FROM flow.payment_requests pr
      WHERE pr.account_id = ${accountId}::uuid
        AND (${statusParam}::text IS NULL OR pr.status::text = ${statusParam})
      ORDER BY pr.created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const serialized = rows.map((r) =>
      serializePaymentRequest(
        {
          id: r.id,
          accountId: r.account_id,
          publicId: r.public_id,
          title: r.title,
          description: r.description,
          destinationNetwork: r.destination_network,
          destinationAssetId: r.destination_asset_id,
          destinationAssetSymbol: r.destination_asset_symbol,
          destinationDecimals: r.destination_decimals,
          amountMode: r.amount_mode,
          requestedAtomicAmount: r.requested_atomic_amount
            ? BigInt(r.requested_atomic_amount)
            : null,
          status: r.status,
          expiresAt: r.expires_at ? new Date(r.expires_at) : null,
          payerMemoRequired: r.payer_memo_required,
          metadata: r.metadata ?? {},
          createdAt: new Date(r.created_at),
          updatedAt: new Date(r.updated_at),
        },
        origin,
      ),
    );

    return {
      requests: serialized,
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
    };
  });

  return reply(200, result);
}

export async function getPaymentRequest(
  request: Request,
  accountId: string,
  requestId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  const origin = new URL(request.url).origin;

  const result = await db.$transaction(async (tx: FlowDb) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true)`;

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        account_id: string;
        public_id: string;
        title: string;
        description: string | null;
        destination_network: string;
        destination_asset_id: string;
        destination_asset_symbol: string;
        destination_decimals: number;
        amount_mode: PaymentAmountMode;
        requested_atomic_amount: string | null;
        status: PaymentRequestStatus;
        expires_at: Date | null;
        payer_memo_required: boolean;
        metadata: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      SELECT *
      FROM flow.payment_requests pr
      WHERE pr.account_id = ${accountId}::uuid
        AND (pr.id::text = ${requestId} OR pr.public_id = ${requestId})
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
    }

    const r = rows[0]!;
    return serializePaymentRequest(
      {
        id: r.id,
        accountId: r.account_id,
        publicId: r.public_id,
        title: r.title,
        description: r.description,
        destinationNetwork: r.destination_network,
        destinationAssetId: r.destination_asset_id,
        destinationAssetSymbol: r.destination_asset_symbol,
        destinationDecimals: r.destination_decimals,
        amountMode: r.amount_mode,
        requestedAtomicAmount: r.requested_atomic_amount
          ? BigInt(r.requested_atomic_amount)
          : null,
        status: r.status,
        expiresAt: r.expires_at ? new Date(r.expires_at) : null,
        payerMemoRequired: r.payer_memo_required,
        metadata: r.metadata ?? {},
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      },
      origin,
    );
  });

  return reply(200, result);
}

export async function updatePaymentRequest(
  request: Request,
  accountId: string,
  requestId: string,
): Promise<Response> {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  await access(db, actor, accountId);

  if (!actor.session.token) {
    throw new ApiFailure(401, "AUTH_REQUIRED");
  }

  let body: UpdatePaymentRequestInput;
  try {
    body = (await request.json()) as UpdatePaymentRequestInput;
  } catch {
    throw new ApiFailure(400, "INVALID_JSON");
  }

  const origin = new URL(request.url).origin;

  const result = await db.$transaction(async (tx: FlowDb) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true)`;

    const existingRows = await tx.$queryRaw<
      Array<{ id: string; status: string }>
    >`
      SELECT id, status::text
      FROM flow.payment_requests pr
      WHERE pr.account_id = ${accountId}::uuid
        AND (pr.id::text = ${requestId} OR pr.public_id = ${requestId})
      LIMIT 1
    `;

    if (existingRows.length === 0) {
      throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
    }

    const newStatus = body.status || null;
    const newTitle = body.title?.trim() || null;
    const newDescription =
      body.description !== undefined ? body.description?.trim() || null : null;

    const updatedRows = await tx.$queryRaw<
      Array<{
        id: string;
        account_id: string;
        public_id: string;
        title: string;
        description: string | null;
        destination_network: string;
        destination_asset_id: string;
        destination_asset_symbol: string;
        destination_decimals: number;
        amount_mode: PaymentAmountMode;
        requested_atomic_amount: string | null;
        status: PaymentRequestStatus;
        expires_at: Date | null;
        payer_memo_required: boolean;
        metadata: Record<string, unknown>;
        created_at: Date;
        updated_at: Date;
      }>
    >`
      UPDATE flow.payment_requests
      SET
        status = COALESCE(${newStatus}::flow.payment_request_status, status),
        title = COALESCE(${newTitle}, title),
        description = CASE WHEN ${body.description !== undefined} THEN ${newDescription} ELSE description END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${existingRows[0]!.id}::uuid
      RETURNING *
    `;

    const r = updatedRows[0]!;
    return serializePaymentRequest(
      {
        id: r.id,
        accountId: r.account_id,
        publicId: r.public_id,
        title: r.title,
        description: r.description,
        destinationNetwork: r.destination_network,
        destinationAssetId: r.destination_asset_id,
        destinationAssetSymbol: r.destination_asset_symbol,
        destinationDecimals: r.destination_decimals,
        amountMode: r.amount_mode,
        requestedAtomicAmount: r.requested_atomic_amount
          ? BigInt(r.requested_atomic_amount)
          : null,
        status: r.status,
        expiresAt: r.expires_at ? new Date(r.expires_at) : null,
        payerMemoRequired: r.payer_memo_required,
        metadata: r.metadata ?? {},
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      },
      origin,
    );
  });

  return reply(200, result);
}

export async function readPaymentAttempt(
  publicId: string,
  requestedAttemptId: string | null,
  merchantAddresses: readonly { address: string }[],
): Promise<PaymentDepositInstructions | null> {
  const attemptRows = await runtime().db.$queryRaw<
    Array<{
      attempt_public_id: string;
      status: string;
      deposit_address: string | null;
      deposit_memo: string | null;
      deposit_deadline: Date | null;
      route_type: string;
      is_provider_verified: boolean;
      destination_network: string;
      destination_asset_symbol: string;
      destination_decimals: number;
      request_status: string;
      request_expires_at: Date | null;
      payer_memo_required: boolean;
      source_network: string;
      source_asset_id: string;
      source_asset_symbol: string;
      source_decimals: number;
      quoted_source_atomic_amount: string | null;
      quoted_destination_atomic_amount: string | null;
      source_tx_hash: string | null;
      destination_tx_hash: string | null;
      settled_at: Date | null;
      payer_refund_address: string | null;
    }>
  >`
    SELECT
      pa.attempt_public_id,
      pa.status::text AS status,
      pa.deposit_address,
      pa.deposit_memo,
      pa.deposit_deadline,
      pa.route_type,
      pa.is_provider_verified,
      pa.destination_network,
      pa.destination_asset_symbol,
      pa.destination_decimals,
      pa.request_status,
      pa.request_expires_at,
      pa.payer_memo_required,
      pa.source_network,
      pa.source_asset_id,
      pa.source_asset_symbol,
      pa.source_decimals,
      pa.quoted_source_atomic_amount::text,
      pa.quoted_destination_atomic_amount::text,
      pa.source_tx_hash,
      pa.destination_tx_hash,
      pa.settled_at,
      pa.payer_refund_address
    FROM flow.get_checkout_payment_attempt(${publicId}, ${requestedAttemptId}) AS pa
  `;

  const att = attemptRows[0];
  if (!att) return null;
  const address = att.deposit_address?.trim();
  const hasVerifiedDeposit =
    att.status === "DEPOSIT_COMMITTED" &&
    att.route_type === "CROSS_CHAIN_1CLICK" &&
    att.is_provider_verified &&
    att.request_status === "ACTIVE" &&
    (!att.request_expires_at || +att.request_expires_at > Date.now()) &&
    !att.source_tx_hash &&
    Boolean(att.deposit_deadline && +att.deposit_deadline > Date.now()) &&
    validateProviderAtomicAmount(att.quoted_source_atomic_amount) &&
    (!att.payer_memo_required || Boolean(att.deposit_memo?.trim())) &&
    Boolean(
      address &&
      !address.startsWith("flow-") &&
      !isBannedIllustrativeAddress(address) &&
      merchantAddresses.length > 0 &&
      !merchantAddresses.some(
        (wallet) => wallet.address.toLowerCase() === address.toLowerCase(),
      ),
    );
  const source = hasVerifiedDeposit
    ? await resolveQuoteAsset(att.source_asset_id)
    : null;
  const canPay =
    source &&
    address &&
    source.networkKey ===
      (canonicalizeNetworkId(att.source_network) ?? att.source_network) &&
    source.decimals === att.source_decimals &&
    validateProviderAddress(source, address).valid;
  const sourceDisplayAmount = formatAtomicToDisplay(
    BigInt(att.quoted_source_atomic_amount ?? "0"),
    att.source_decimals,
  );
  const destDisplayAmount = formatAtomicToDisplay(
    BigInt(att.quoted_destination_atomic_amount ?? "0"),
    att.destination_decimals,
  );
  return {
    attemptPublicId: att.attempt_public_id,
    status: att.status as PaymentAttemptStatus,
    depositAddress: canPay ? (address ?? "") : "",
    depositMemo: canPay ? att.deposit_memo : null,
    depositDeadline: att.deposit_deadline
      ? new Date(att.deposit_deadline).toISOString()
      : "",
    sourceNetwork: att.source_network,
    sourceAssetId: att.source_asset_id,
    sourceAssetSymbol: att.source_asset_symbol,
    sourceDecimals: att.source_decimals,
    destinationNetwork: att.destination_network,
    destinationAssetSymbol: att.destination_asset_symbol,
    requiredAtomicAmount: att.quoted_source_atomic_amount ?? "0",
    requiredDisplayAmount: sourceDisplayAmount,
    destinationDisplayAmount: destDisplayAmount,
    qrData: canPay ? (address ?? "") : "",
    instructionsNotice: `Payment status: ${att.status}`,
    isExecutionDisabled: true,
    sourceTxHash: att.source_tx_hash,
    destinationTxHash: att.destination_tx_hash,
    settledAt: att.settled_at ? new Date(att.settled_at).toISOString() : null,
    payerRefundAddress: att.payer_refund_address ?? null,
  };
}

export async function readPublicPaymentRequest(
  request: Request,
  publicId: string,
): Promise<Response> {
  if (!isValidPublicPaymentId(publicId)) {
    throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
  }

  // Durable rate limiting to resist token enumeration
  const allowed = await clientBudget(request, "public:payment-request");
  if (!allowed) {
    throw new ApiFailure(429, "RATE_LIMIT_EXCEEDED");
  }

  const { db } = runtime();
  const origin = new URL(request.url).origin;

  const rows = await db.$queryRaw<Array<PublicPaymentRequestDbRow>>`
    SELECT *
    FROM flow.get_public_payment_request(${publicId})
  `;

  if (rows.length === 0) {
    throw new ApiFailure(404, "PAYMENT_REQUEST_NOT_FOUND");
  }

  const row = rows[0]!;

  if (row.status === "DISABLED") {
    throw new ApiFailure(404, "PAYMENT_REQUEST_UNAVAILABLE");
  }

  // Resolve verified permanent recipient wallet address for destination network
  let recipientAddress: string | null = null;
  let activeAttempt: PaymentDepositInstructions | null = null;
  try {
    const recipientWalletRows = await readPaymentWalletAddresses(publicId);
    recipientAddress =
      recipientWalletRows.find(
        (rowAddress) =>
          canonicalizeNetworkId(rowAddress.chain_id) ===
          row.destination_network,
      )?.address ?? null;
    activeAttempt = await readPaymentAttempt(
      publicId,
      new URL(request.url).searchParams.get("attempt"),
      recipientWalletRows,
    );
  } catch {
    // Non-fatal if worker DB is unavailable in unit context
  }

  const publicData: PublicPaymentRequest = serializePublicPaymentRequest(
    row,
    origin,
    recipientAddress,
  );

  return reply(200, {
    ...publicData,
    ...(activeAttempt ? { activeAttempt } : {}),
  });
}
