import "server-only";
import { validateFlowIdHandle } from "../domain/flow-id.ts";
import { canonicalizeNetworkId } from "../domain/supported-assets-catalog.ts";
import { type FlowDb } from "../foundation/prisma.ts";
import { ApiFailure } from "./http.ts";

export async function ensureFlowIdSchema(_db: FlowDb): Promise<void> {
  // Schema is managed via Prisma migration 20261121000000_flow_id_unique_handle.
  // Never execute DDL at request time because least-privilege web roles cannot
  // alter flow.accounts and a failed DDL inside $transaction aborts the whole tx.
}

export async function getAccountFlowId(
  db: FlowDb,
  accountId: string,
): Promise<string | null> {
  await ensureFlowIdSchema(db);
  const rows = await db.$queryRaw<Array<{ flow_id: string | null }>>`
    SELECT flow_id
    FROM flow.accounts
    WHERE id = ${accountId}::uuid
    LIMIT 1
  `;
  return rows[0]?.flow_id ?? null;
}

export async function checkFlowIdAvailability(
  db: FlowDb,
  rawHandle: string,
): Promise<{ available: boolean; flowId: string | null; reason?: string }> {
  await ensureFlowIdSchema(db);
  const parsed = validateFlowIdHandle(rawHandle);
  if (!parsed.valid) {
    return { available: false, flowId: null, reason: parsed.reason };
  }
  const existing = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM flow.accounts
    WHERE LOWER(flow_id) = LOWER(${parsed.flowId})
    LIMIT 1
  `;
  if (existing.length > 0) {
    return {
      available: false,
      flowId: parsed.flowId,
      reason: `${parsed.flowId} is already claimed by another user.`,
    };
  }
  return { available: true, flowId: parsed.flowId };
}

export async function claimAccountFlowId(
  db: FlowDb,
  params: { accountId: string; rawHandle: string },
): Promise<{ flowId: string }> {
  await ensureFlowIdSchema(db);
  const parsed = validateFlowIdHandle(params.rawHandle);
  if (!parsed.valid) {
    throw new ApiFailure(400, parsed.reason);
  }

  const current = await getAccountFlowId(db, params.accountId);
  if (current) {
    throw new ApiFailure(
      409,
      `Your Flow ID (${current}) is permanent and has already been claimed.`,
    );
  }

  const taken = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id::text
    FROM flow.accounts
    WHERE LOWER(flow_id) = LOWER(${parsed.flowId})
    LIMIT 1
  `;
  if (taken.length > 0) {
    throw new ApiFailure(
      409,
      `${parsed.flowId} is already taken. Please choose a different ID.`,
    );
  }

  try {
    const updated = await db.$queryRaw<Array<{ flow_id: string | null }>>`
      UPDATE flow.accounts
      SET flow_id = ${parsed.flowId}
      WHERE id = ${params.accountId}::uuid
        AND flow_id IS NULL
      RETURNING flow_id
    `;
    const saved = updated[0]?.flow_id;
    if (!saved) {
      throw new ApiFailure(409, "Your Flow ID has already been claimed.");
    }
    return { flowId: saved };
  } catch (err) {
    if (err instanceof ApiFailure) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("23505") || msg.toLowerCase().includes("unique")) {
      throw new ApiFailure(
        409,
        `${parsed.flowId} was just claimed by someone else. Please choose another.`,
      );
    }
    throw err;
  }
}

export async function resolveFlowIdForSend(
  db: FlowDb,
  params: {
    rawFlowId: string;
    destinationNetwork: string;
  },
): Promise<{
  accountId: string;
  accountName: string;
  flowId: string;
  recipientAddress: string;
}> {
  await ensureFlowIdSchema(db);
  const parsed = validateFlowIdHandle(params.rawFlowId);
  if (!parsed.valid) {
    throw new ApiFailure(400, parsed.reason);
  }

  const accountRows = await db.$queryRaw<
    Array<{
      id: string;
      name: string;
      flow_id: string;
      wallet_id: string | null;
      wallet_status: string | null;
    }>
  >`
    SELECT a.id::text, a.name, a.flow_id,
           w.id::text AS wallet_id, w.status AS wallet_status
    FROM flow.accounts a
    LEFT JOIN flow.wallets w
      ON w.account_id = a.id AND w.environment = 'mainnet'
    WHERE LOWER(a.flow_id) = LOWER(${parsed.flowId})
    LIMIT 1
  `;

  const acc = accountRows[0];
  if (!acc) {
    throw new ApiFailure(404, `No Flow account found for ${parsed.flowId}.`);
  }
  if (!acc.wallet_id || acc.wallet_status !== "ACTIVE") {
    throw new ApiFailure(
      409,
      `${acc.flow_id} does not have an active Flow wallet yet.`,
    );
  }

  const targetNetwork =
    canonicalizeNetworkId(params.destinationNetwork) ??
    params.destinationNetwork;

  const addresses = await db.$queryRaw<
    Array<{ network: string; chain_id: string; address: string }>
  >`
    SELECT network, chain_id, address
    FROM flow.wallet_addresses
    WHERE wallet_id = ${acc.wallet_id}::uuid
  `;

  const matched = addresses.find(
    (w) =>
      (canonicalizeNetworkId(w.chain_id) ??
        canonicalizeNetworkId(w.network)) === targetNetwork,
  );
  if (!matched?.address) {
    throw new ApiFailure(
      409,
      `${acc.flow_id} does not have a verified ${targetNetwork} address yet.`,
    );
  }

  return {
    accountId: acc.id,
    accountName: acc.name,
    flowId: acc.flow_id,
    recipientAddress: matched.address,
  };
}
