import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  formatAtomicToDisplay,
  parseDisplayToAtomic,
} from "../domain/atomic-amounts.ts";
import { isFinancialExecutionDisabled } from "../domain/custody.ts";
import {
  BURROW_CONTRACT,
  BURROW_STORAGE_DEPOSIT_YOCTO,
  BURROW_USDC_CONTRACT,
  EARN_MEMO,
  LINEAR_CONTRACT,
  NEAR_GAS_RESERVE_YOCTO,
  type EarnMemo,
} from "../domain/earn.ts";
import { getMainnetWalletAddress, serializePortfolio } from "../domain/portfolio.ts";
import { runtime, transaction } from "../foundation/prisma.ts";
import { access, accountId, principal } from "./accounts.ts";
import { getAccountBalances } from "./assets/asset-service.ts";
import { fetchLiveMainnetBalance } from "./assets/connectors/multi-chain-reconciler.ts";
import { callJsonRpc } from "./assets/connectors/rpc-client.ts";
import { DEFAULT_RPC_ENDPOINTS } from "./custody/blockchain-connectivity.ts";
import { ApiFailure, input, reply } from "./http.ts";
import { serializeOutgoingTransfer } from "./outgoing-transfer-service.ts";

const earnExecuteSchema = z.strictObject({
  protocol: z.enum(["linear", "burrow"]),
  action: z.enum(["DEPOSIT", "WITHDRAW"]),
  unstakeType: z.enum(["INSTANT", "DELAYED"]).optional(),
  displayAmount: z.string().trim().min(1).max(64),
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

interface BurrowAccountBalanceEntry {
  token_id: string;
  balance?: string;
}

interface BurrowAccountResponse {
  supplied?: BurrowAccountBalanceEntry[];
  collateral?: BurrowAccountBalanceEntry[];
}

const NEAR_PRIMARY_RPC =
  process.env.FLOW_NEAR_RPC_URL?.trim() || DEFAULT_RPC_ENDPOINTS.near;
const NEAR_FALLBACK_RPC =
  process.env.FLOW_NEAR_FALLBACK_RPC_URL?.trim() ||
  "https://free.rpc.fastnear.com";
const YOCTO_SCALE = 10n ** 24n;
const BURROW_EXTRA_DECIMALS_SCALE = 10n ** 12n; // 18 internal - 6 USDC

async function queryNearMainnetView<T>(
  contractId: string,
  methodName: string,
  args: Record<string, unknown>,
): Promise<T | null> {
  const argsBase64 = Buffer.from(JSON.stringify(args), "utf8").toString(
    "base64",
  );
  const { response } = await callJsonRpc<{ result?: number[] }>(
    NEAR_PRIMARY_RPC,
    "query",
    {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: methodName,
      args_base64: argsBase64,
    },
    { fallbackEndpoint: NEAR_FALLBACK_RPC, timeoutMs: 7_000, maxRetries: 1 },
  );
  const bytes = response.result?.result;
  if (!Array.isArray(bytes)) {
    return null;
  }
  const text = Buffer.from(bytes).toString("utf8");
  return JSON.parse(text) as T;
}

const NEAR_ARCHIVAL_RPC =
  process.env.FLOW_NEAR_ARCHIVAL_RPC_URL?.trim() ||
  "https://archival-rpc.mainnet.near.org";
const APYS_CACHE_TTL_MS = 10 * 60 * 1000;

interface LiveEarnApys {
  linear: number;
  burrow: number;
  source: "onchain" | "cached" | "fallback";
  updatedAt: string;
}

let cachedEarnApys: { value: LiveEarnApys; expiresAt: number } | null = null;

async function fetchLinearLiveApy(): Promise<number | null> {
  const { response: statusRes } = await callJsonRpc<{
    sync_info?: { latest_block_height?: number; latest_block_time?: string };
  }>(NEAR_ARCHIVAL_RPC, "status", [], { timeoutMs: 7_000, maxRetries: 0 });
  const latestHeight = statusRes.result?.sync_info?.latest_block_height;
  const latestTime = statusRes.result?.sync_info?.latest_block_time;
  if (!latestHeight || !latestTime) return null;

  const pastHeight = Math.max(1, latestHeight - 2_000_000);
  const [{ response: pastBlockRes }, { response: nowPriceRes }, { response: pastPriceRes }] =
    await Promise.all([
      callJsonRpc<{ header?: { timestamp?: number } }>(
        NEAR_ARCHIVAL_RPC,
        "block",
        { block_id: pastHeight },
        { timeoutMs: 7_000, maxRetries: 0 },
      ),
      callJsonRpc<{ result?: number[] }>(
        NEAR_ARCHIVAL_RPC,
        "query",
        {
          request_type: "call_function",
          block_id: latestHeight,
          account_id: LINEAR_CONTRACT,
          method_name: "ft_price",
          args_base64: "e30=",
        },
        { timeoutMs: 7_000, maxRetries: 0 },
      ),
      callJsonRpc<{ result?: number[] }>(
        NEAR_ARCHIVAL_RPC,
        "query",
        {
          request_type: "call_function",
          block_id: pastHeight,
          account_id: LINEAR_CONTRACT,
          method_name: "ft_price",
          args_base64: "e30=",
        },
        { timeoutMs: 7_000, maxRetries: 0 },
      ),
    ]);

  const pastTimestampNs = pastBlockRes.result?.header?.timestamp;
  const nowBytes = nowPriceRes.result?.result;
  const pastBytes = pastPriceRes.result?.result;
  if (!pastTimestampNs || !Array.isArray(nowBytes) || !Array.isArray(pastBytes)) {
    return null;
  }

  const nowPrice = Number(JSON.parse(Buffer.from(nowBytes).toString("utf8")));
  const pastPrice = Number(JSON.parse(Buffer.from(pastBytes).toString("utf8")));
  const latestMs = new Date(latestTime).getTime();
  const pastMs = Number(pastTimestampNs) / 1e6;
  const days = (latestMs - pastMs) / 86_400_000;
  if (!Number.isFinite(nowPrice) || !Number.isFinite(pastPrice) || pastPrice <= 0 || days <= 0) {
    return null;
  }
  const apy = (Math.pow(nowPrice / pastPrice, 365 / days) - 1) * 100;
  return Number.isFinite(apy) && apy > 0 ? Math.round(apy * 100) / 100 : null;
}

async function fetchBurrowLiveApr(): Promise<number | null> {
  const asset = await queryNearMainnetView<{ supply_apr?: string }>(
    BURROW_CONTRACT,
    "get_asset",
    { token_id: BURROW_USDC_CONTRACT },
  );
  const apr = Number(asset?.supply_apr ?? NaN);
  if (!Number.isFinite(apr) || apr <= 0) return null;
  return Math.round(apr * 10_000) / 100;
}

async function fetchLiveEarnApys(): Promise<LiveEarnApys> {
  const now = Date.now();
  if (cachedEarnApys && cachedEarnApys.expiresAt > now) {
    return { ...cachedEarnApys.value, source: "cached" };
  }

  const [linearRes, burrowRes] = await Promise.allSettled([
    fetchLinearLiveApy(),
    fetchBurrowLiveApr(),
  ]);

  const linear =
    linearRes.status === "fulfilled" && linearRes.value !== null
      ? linearRes.value
      : cachedEarnApys?.value.linear ?? 4.33;
  const burrow =
    burrowRes.status === "fulfilled" && burrowRes.value !== null
      ? burrowRes.value
      : cachedEarnApys?.value.burrow ?? 10.85;

  const value: LiveEarnApys = {
    linear,
    burrow,
    source:
      (linearRes.status === "fulfilled" && linearRes.value !== null) ||
      (burrowRes.status === "fulfilled" && burrowRes.value !== null)
        ? "onchain"
        : "fallback",
    updatedAt: new Date(now).toISOString(),
  };

  cachedEarnApys = { value, expiresAt: now + APYS_CACHE_TTL_MS };
  return value;
}

async function fetchLinearPosition(nearAddress: string): Promise<{
  sharesAtomic: string;
  sharesDisplay: string;
  nearAtomic: string;
  nearDisplay: string;
  priceAtomic: string;
}> {
  const [sharesRaw, priceRaw] = await Promise.all([
    queryNearMainnetView<string>(LINEAR_CONTRACT, "ft_balance_of", {
      account_id: nearAddress,
    }),
    queryNearMainnetView<string>(LINEAR_CONTRACT, "ft_price", {}),
  ]);
  const sharesAtomic = BigInt(sharesRaw ?? "0");
  const priceAtomic = BigInt(priceRaw ?? YOCTO_SCALE.toString());
  const nearAtomic = (sharesAtomic * priceAtomic) / YOCTO_SCALE;
  return {
    sharesAtomic: sharesAtomic.toString(),
    sharesDisplay: formatAtomicToDisplay(sharesAtomic, 24),
    nearAtomic: nearAtomic.toString(),
    nearDisplay: formatAtomicToDisplay(nearAtomic, 24),
    priceAtomic: priceAtomic.toString(),
  };
}

async function fetchBurrowUsdcPosition(nearAddress: string): Promise<{
  internal18Atomic: string;
  usdc6Atomic: string;
  usdcDisplay: string;
  hasStorage: boolean;
}> {
  const [account, storage] = await Promise.all([
    queryNearMainnetView<BurrowAccountResponse | null>(
      BURROW_CONTRACT,
      "get_account",
      { account_id: nearAddress },
    ),
    queryNearMainnetView<{ total: string; available: string } | null>(
      BURROW_CONTRACT,
      "storage_balance_of",
      { account_id: nearAddress },
    ),
  ]);

  let internal18 = 0n;
  if (account) {
    for (const entry of [
      ...(account.supplied ?? []),
      ...(account.collateral ?? []),
    ]) {
      if (entry.token_id === BURROW_USDC_CONTRACT && entry.balance) {
        internal18 += BigInt(entry.balance);
      }
    }
  }
  const usdc6Atomic = internal18 / BURROW_EXTRA_DECIMALS_SCALE;
  return {
    internal18Atomic: internal18.toString(),
    usdc6Atomic: usdc6Atomic.toString(),
    usdcDisplay: formatAtomicToDisplay(usdc6Atomic, 6),
    hasStorage: storage !== null,
  };
}

async function fetchEarnJobs(accountUuid: string, token: string) {
  const db = runtime().db;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${accountUuid}, true)`;
    return tx.$queryRaw<OutgoingTransferRow[]>`
      SELECT id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount,
        provider_deposit_address, provider_deposit_memo, provider_correlation_id,
        status, source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${accountUuid}::uuid
        AND provider_deposit_memo LIKE 'EARN:%'
      ORDER BY created_at DESC
      LIMIT 10
    `;
  });
}

async function getReservedAtomic(
  accountUuid: string,
  token: string,
  sourceAssetId: string,
): Promise<bigint> {
  const db = runtime().db;
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${accountUuid}, true)`;
    return tx.$queryRaw<Array<{ reserved: string }>>`
      SELECT COALESCE(SUM(source_atomic_amount), 0)::text AS reserved
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${accountUuid}::uuid
        AND source_network = 'near-mainnet'
        AND source_asset_id = ${sourceAssetId}::text
        AND status IN (
          'PENDING_CUSTODY',
          'LEASED',
          'SIGNING_IN_PROGRESS',
          'CONFIRMING'
        )
    `;
  });
  return BigInt(rows[0]?.reserved ?? "0");
}

export async function getEarnPositions(
  request: Request,
  rawAccountId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const db = runtime().db;
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const accountBalances = await getAccountBalances(db, id, {
    sessionToken: token,
  });
  const portfolio = serializePortfolio(accountBalances);
  const nearAddress = getMainnetWalletAddress(portfolio.wallet, "near-mainnet");

  const [linear, burrow, jobs, apys] = await Promise.all([
    nearAddress
      ? fetchLinearPosition(nearAddress)
      : Promise.resolve({
          sharesAtomic: "0",
          sharesDisplay: "0",
          nearAtomic: "0",
          nearDisplay: "0",
          priceAtomic: YOCTO_SCALE.toString(),
        }),
    nearAddress
      ? fetchBurrowUsdcPosition(nearAddress)
      : Promise.resolve({
          internal18Atomic: "0",
          usdc6Atomic: "0",
          usdcDisplay: "0",
          hasStorage: false,
        }),
    fetchEarnJobs(id, token),
    fetchLiveEarnApys(),
  ]);

  const serializedJobs = jobs.map(serializeOutgoingTransfer);
  const activeJobs = serializedJobs.filter(
    (job) =>
      job.status === "PENDING_CUSTODY" ||
      job.status === "LEASED" ||
      job.status === "SIGNING_IN_PROGRESS" ||
      job.status === "CONFIRMING",
  );

  return reply(200, {
    ok: true,
    nearAddress,
    apys,
    positions: {
      linear,
      burrow,
    },
    activeJobs,
    recentJobs: serializedJobs,
  });
}

export async function executeEarnAction(
  request: Request,
  rawAccountId: string,
): Promise<Response> {
  const id = accountId(rawAccountId);
  const body = await input(request, earnExecuteSchema);
  const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();
  const db = runtime().db;
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

  const existingRows = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    return tx.$queryRaw<OutgoingTransferRow[]>`
      SELECT id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount,
        provider_deposit_address, provider_deposit_memo, provider_correlation_id,
        status, source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
      FROM flow.outgoing_transfer_jobs
      WHERE account_id = ${id}::uuid
        AND idempotency_key = ${idempotencyKey}::uuid
      LIMIT 1
    `;
  });
  if (existingRows[0]) {
    return reply(200, {
      ok: true,
      transfer: serializeOutgoingTransfer(existingRows[0]),
    });
  }

  if (isFinancialExecutionDisabled()) {
    throw new ApiFailure(403, "PAYMENT_EXECUTION_DISABLED");
  }

  const accountBalances = await getAccountBalances(db, id, {
    sessionToken: token,
  });
  const portfolio = serializePortfolio(accountBalances);
  const wallet = portfolio.wallet;
  const nearAddress = getMainnetWalletAddress(wallet, "near-mainnet");
  if (!wallet?.id || !nearAddress) {
    throw new ApiFailure(409, "ACTIVE_MAINNET_WALLET_REQUIRED");
  }

  const liveNearObs = await fetchLiveMainnetBalance({
    networkKey: "near",
    standard: "NATIVE",
    contractIdentifier: "native",
    address: nearAddress,
  });
  if (liveNearObs.syncStatus !== "SYNCED" || liveNearObs.finality === "UNKNOWN") {
    throw new ApiFailure(409, "BALANCE_REFRESH_REQUIRED");
  }
  const liveNearAtomic = BigInt(liveNearObs.atomicBalance);

  let memo: EarnMemo;
  let sourceAssetId: string;
  let sourceSymbol: string;
  let sourceDecimals: number;
  let sourceAtomicAmount: bigint;
  let recipientAddress: string;
  let expectedDestAtomic: bigint | null = null;

  if (body.protocol === "linear" && body.action === "DEPOSIT") {
    let nearAtomic: bigint;
    try {
      nearAtomic = parseDisplayToAtomic(body.displayAmount, 24);
    } catch {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    if (nearAtomic <= 0n) {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    const reservedNear = await getReservedAtomic(id, token, "native");
    const spendableNear = liveNearAtomic - reservedNear;
    if (nearAtomic + NEAR_GAS_RESERVE_YOCTO > spendableNear) {
      throw new ApiFailure(400, "INSUFFICIENT_SPENDABLE_BALANCE");
    }
    memo = EARN_MEMO.LINEAR_DEPOSIT;
    sourceAssetId = "native";
    sourceSymbol = "NEAR";
    sourceDecimals = 24;
    sourceAtomicAmount = nearAtomic;
    recipientAddress = LINEAR_CONTRACT;
  } else if (body.protocol === "linear" && body.action === "WITHDRAW") {
    if (liveNearAtomic < NEAR_GAS_RESERVE_YOCTO) {
      throw new ApiFailure(400, "INSUFFICIENT_GAS_BALANCE");
    }
    let requestedNearAtomic: bigint;
    try {
      requestedNearAtomic = parseDisplayToAtomic(body.displayAmount, 24);
    } catch {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    if (requestedNearAtomic <= 0n) {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    const position = await fetchLinearPosition(nearAddress);
    const sharesAtomic = BigInt(position.sharesAtomic);
    const positionNearAtomic = BigInt(position.nearAtomic);
    const priceAtomic = BigInt(position.priceAtomic);
    if (sharesAtomic <= 0n || requestedNearAtomic > positionNearAtomic) {
      throw new ApiFailure(400, "INSUFFICIENT_PROTOCOL_POSITION");
    }
    const reservedShares = await getReservedAtomic(id, token, LINEAR_CONTRACT);
    const spendableShares = sharesAtomic - reservedShares;
    let sharesToWithdraw = (requestedNearAtomic * YOCTO_SCALE) / priceAtomic;
    // Clamp to full shares if within 0.000001 NEAR of max so no dust remains
    if (
      requestedNearAtomic >= positionNearAtomic - 10n ** 18n ||
      sharesToWithdraw > sharesAtomic
    ) {
      sharesToWithdraw = sharesAtomic;
    }
    if (sharesToWithdraw <= 0n || sharesToWithdraw > spendableShares) {
      throw new ApiFailure(400, "INSUFFICIENT_PROTOCOL_POSITION");
    }
    memo =
      body.unstakeType === "DELAYED"
        ? EARN_MEMO.LINEAR_WITHDRAW_DELAYED
        : EARN_MEMO.LINEAR_WITHDRAW_INSTANT;
    sourceAssetId = LINEAR_CONTRACT;
    sourceSymbol = "LiNEAR";
    sourceDecimals = 24;
    sourceAtomicAmount = sharesToWithdraw;
    recipientAddress = LINEAR_CONTRACT;
    expectedDestAtomic = requestedNearAtomic;
  } else if (body.protocol === "burrow" && body.action === "DEPOSIT") {
    let usdcAtomic: bigint;
    try {
      usdcAtomic = parseDisplayToAtomic(body.displayAmount, 6);
    } catch {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    if (usdcAtomic <= 0n) {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    const [liveUsdcObs, burrowPos, reservedUsdc] = await Promise.all([
      fetchLiveMainnetBalance({
        networkKey: "near",
        standard: "NEP141",
        contractIdentifier: BURROW_USDC_CONTRACT,
        address: nearAddress,
      }),
      fetchBurrowUsdcPosition(nearAddress),
      getReservedAtomic(id, token, BURROW_USDC_CONTRACT),
    ]);
    if (
      liveUsdcObs.syncStatus !== "SYNCED" ||
      liveUsdcObs.finality === "UNKNOWN"
    ) {
      throw new ApiFailure(409, "BALANCE_REFRESH_REQUIRED");
    }
    const spendableUsdc = BigInt(liveUsdcObs.atomicBalance) - reservedUsdc;
    if (usdcAtomic > spendableUsdc) {
      throw new ApiFailure(400, "INSUFFICIENT_SPENDABLE_BALANCE");
    }
    const requiredNear = burrowPos.hasStorage
      ? NEAR_GAS_RESERVE_YOCTO
      : NEAR_GAS_RESERVE_YOCTO + BURROW_STORAGE_DEPOSIT_YOCTO;
    if (liveNearAtomic < requiredNear) {
      throw new ApiFailure(400, "INSUFFICIENT_GAS_BALANCE");
    }
    memo = EARN_MEMO.BURROW_DEPOSIT;
    sourceAssetId = BURROW_USDC_CONTRACT;
    sourceSymbol = "USDC";
    sourceDecimals = 6;
    sourceAtomicAmount = usdcAtomic;
    recipientAddress = BURROW_CONTRACT;
  } else {
    // burrow WITHDRAW
    if (liveNearAtomic < NEAR_GAS_RESERVE_YOCTO) {
      throw new ApiFailure(400, "INSUFFICIENT_GAS_BALANCE");
    }
    let usdcAtomic: bigint;
    try {
      usdcAtomic = parseDisplayToAtomic(body.displayAmount, 6);
    } catch {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    if (usdcAtomic <= 0n) {
      throw new ApiFailure(400, "INVALID_AMOUNT");
    }
    const [burrowPos, reservedWithdraw] = await Promise.all([
      fetchBurrowUsdcPosition(nearAddress),
      getReservedAtomic(id, token, BURROW_CONTRACT),
    ]);
    const spendableSupplied =
      BigInt(burrowPos.usdc6Atomic) - reservedWithdraw;
    if (usdcAtomic > spendableSupplied) {
      throw new ApiFailure(400, "INSUFFICIENT_PROTOCOL_POSITION");
    }
    memo = EARN_MEMO.BURROW_WITHDRAW;
    sourceAssetId = BURROW_CONTRACT;
    sourceSymbol = "USDC";
    sourceDecimals = 6;
    sourceAtomicAmount = usdcAtomic;
    recipientAddress = BURROW_CONTRACT;
  }

  const publicId = `ern_${randomBytes(10).toString("hex")}`;
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
        'SEND',
        'near-mainnet',
        ${sourceAssetId}::text,
        ${sourceSymbol}::text,
        ${sourceDecimals}::integer,
        ${sourceAtomicAmount.toString()}::numeric,
        ${recipientAddress}::text,
        'near-mainnet',
        ${sourceAssetId}::text,
        ${sourceSymbol}::text,
        ${sourceDecimals}::integer,
        ${expectedDestAtomic ? expectedDestAtomic.toString() : null}::numeric,
        NULL,
        ${memo}::text,
        NULL,
        'PENDING_CUSTODY',
        ${actor.userId}::uuid
      )
      RETURNING id, public_id, account_id, wallet_id, job_kind, source_network,
        source_asset_id, source_asset_symbol, source_decimals,
        source_atomic_amount::text, recipient_address, destination_network,
        destination_asset_id, destination_asset_symbol, destination_decimals,
        expected_destination_atomic_amount::text AS quoted_destination_atomic_amount,
        provider_deposit_address, provider_deposit_memo, provider_correlation_id,
        status, source_tx_hash, destination_tx_hash, fee_atomic_amount::text,
        error_code, error_message, broadcast_at, settled_at, created_at, updated_at
    `;
    return rows[0]!;
  });

  return reply(201, {
    ok: true,
    transfer: serializeOutgoingTransfer(created),
  });
}
