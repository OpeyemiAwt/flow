import "server-only";
import { z } from "zod";
import {
  ALL_MCP_NETWORKS,
  centsToUsd,
  normalizeAllowedNetworks,
  normalizeRecipientAllowlist,
  usdToCents,
  type McpAgentKeyStatus,
  type McpNetworkKey,
} from "../domain/mcp-agents.ts";
import { generateMcpToken } from "./mcp-token-crypto.ts";
import { type FlowDb } from "../foundation/prisma.ts";

export interface SerializedMcpSpendEvent {
  readonly id: string;
  readonly operation: "SEND" | "CONVERT";
  readonly sourceAssetSymbol: string;
  readonly sourceNetwork: string;
  readonly sourceDisplayAmount: string;
  readonly destinationAssetSymbol: string;
  readonly destinationNetwork: string;
  readonly recipientLabel: string | null;
  readonly usdCents: number;
  readonly usdAmount: number;
  readonly transferPublicId: string | null;
  readonly transferStatus: string | null;
  readonly createdAt: string;
}

export interface SerializedMcpAgentKey {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly tokenPrefix: string;
  readonly status: McpAgentKeyStatus;
  readonly isExpired: boolean;
  readonly maxTotalUsdCents: number;
  readonly maxTotalUsd: number;
  readonly maxPerTxUsdCents: number;
  readonly maxPerTxUsd: number;
  readonly maxDailyUsdCents: number | null;
  readonly maxDailyUsd: number | null;
  readonly spentTotalUsdCents: number;
  readonly spentTotalUsd: number;
  readonly spent24hUsdCents: number;
  readonly spent24hUsd: number;
  readonly remainingTotalUsdCents: number;
  readonly remainingTotalUsd: number;
  readonly canRead: boolean;
  readonly canSend: boolean;
  readonly canConvert: boolean;
  readonly canCreatePaymentLinks: boolean;
  readonly allowedNetworks: readonly McpNetworkKey[];
  readonly allowedRecipients: readonly string[];
  readonly expiresAt: string | null;
  readonly lastUsedAt: string | null;
  readonly totalCalls: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recentEvents: readonly SerializedMcpSpendEvent[];
}

export const createMcpAgentKeySchema = z.strictObject({
  name: z.string().trim().min(1, "Agent name is required.").max(80),
  maxTotalUsd: z.number().min(0).max(1_000_000),
  maxPerTxUsd: z.number().min(0).max(1_000_000).optional(),
  maxDailyUsd: z.number().min(0).max(1_000_000).nullable().optional(),
  canSend: z.boolean().default(true),
  canConvert: z.boolean().default(false),
  canCreatePaymentLinks: z.boolean().default(false),
  allowedNetworks: z.array(z.string().trim().min(1)).max(8).optional(),
  allowedRecipients: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const updateMcpAgentKeySchema = z
  .strictObject({
    name: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["ACTIVE", "PAUSED", "REVOKED"]).optional(),
    maxTotalUsd: z.number().min(0).max(1_000_000).optional(),
    maxPerTxUsd: z.number().min(0).max(1_000_000).optional(),
    maxDailyUsd: z.number().min(0).max(1_000_000).nullable().optional(),
    canSend: z.boolean().optional(),
    canConvert: z.boolean().optional(),
    canCreatePaymentLinks: z.boolean().optional(),
    allowedNetworks: z.array(z.string().trim().min(1)).max(8).optional(),
    allowedRecipients: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field to update is required.",
  });

interface KeyListRow {
  id: string;
  account_id: string;
  name: string;
  token_prefix: string;
  status: string;
  max_total_usd_cents: bigint | number | string;
  max_per_tx_usd_cents: bigint | number | string;
  max_daily_usd_cents: bigint | number | string | null;
  can_read: boolean;
  can_send: boolean;
  can_convert: boolean;
  can_create_payment_links: boolean;
  allowed_networks: string[] | null;
  allowed_recipients: string[] | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  total_calls: number;
  created_at: Date;
  updated_at: Date;
  spent_total_usd_cents: bigint | number | string;
  spent_24h_usd_cents: bigint | number | string;
}

interface SpendEventRow {
  id: string;
  agent_key_id: string;
  operation: string;
  source_asset_symbol: string;
  source_network: string;
  source_display_amount: string;
  destination_asset_symbol: string;
  destination_network: string;
  recipient_label: string | null;
  usd_cents: bigint | number | string;
  transfer_public_id: string | null;
  transfer_status: string | null;
  created_at: Date;
}

function toSafeInt(v: bigint | number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function serializeKeyRow(
  row: KeyListRow,
  events: readonly SerializedMcpSpendEvent[],
): SerializedMcpAgentKey {
  const maxTotalUsdCents = toSafeInt(row.max_total_usd_cents);
  const maxPerTxUsdCents = toSafeInt(row.max_per_tx_usd_cents);
  const maxDailyUsdCents =
    row.max_daily_usd_cents === null ? null : toSafeInt(row.max_daily_usd_cents);
  const spentTotalUsdCents = toSafeInt(row.spent_total_usd_cents);
  const spent24hUsdCents = toSafeInt(row.spent_24h_usd_cents);
  const remainingTotalUsdCents = Math.max(0, maxTotalUsdCents - spentTotalUsdCents);
  const expiresAtIso = row.expires_at ? row.expires_at.toISOString() : null;
  const isExpired =
    expiresAtIso !== null && Date.parse(expiresAtIso) <= Date.now();
  const status = (
    row.status === "PAUSED" || row.status === "REVOKED" ? row.status : "ACTIVE"
  ) as McpAgentKeyStatus;

  return {
    id: row.id,
    accountId: row.account_id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    status,
    isExpired,
    maxTotalUsdCents,
    maxTotalUsd: centsToUsd(maxTotalUsdCents),
    maxPerTxUsdCents,
    maxPerTxUsd: centsToUsd(maxPerTxUsdCents),
    maxDailyUsdCents,
    maxDailyUsd: maxDailyUsdCents === null ? null : centsToUsd(maxDailyUsdCents),
    spentTotalUsdCents,
    spentTotalUsd: centsToUsd(spentTotalUsdCents),
    spent24hUsdCents,
    spent24hUsd: centsToUsd(spent24hUsdCents),
    remainingTotalUsdCents,
    remainingTotalUsd: centsToUsd(remainingTotalUsdCents),
    canRead: row.can_read,
    canSend: row.can_send,
    canConvert: row.can_convert,
    canCreatePaymentLinks: row.can_create_payment_links,
    allowedNetworks: normalizeAllowedNetworks(row.allowed_networks ?? undefined),
    allowedRecipients: row.allowed_recipients ?? [],
    expiresAt: expiresAtIso,
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    totalCalls: row.total_calls ?? 0,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    recentEvents: events,
  };
}

export async function listAccountMcpAgentKeys(
  tx: FlowDb,
  accountId: string,
): Promise<SerializedMcpAgentKey[]> {
  const rows = await tx.$queryRaw<KeyListRow[]>`
    SELECT
      k.id,
      k.account_id,
      k.name,
      k.token_prefix,
      k.status,
      k.max_total_usd_cents,
      k.max_per_tx_usd_cents,
      k.max_daily_usd_cents,
      k.can_read,
      k.can_send,
      k.can_convert,
      k.can_create_payment_links,
      k.allowed_networks,
      k.allowed_recipients,
      k.expires_at,
      k.last_used_at,
      k.total_calls,
      k.created_at,
      k.updated_at,
      COALESCE(s.spent_total, 0)::bigint AS spent_total_usd_cents,
      COALESCE(s.spent_24h, 0)::bigint AS spent_24h_usd_cents
    FROM flow.mcp_agent_keys k
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(e.usd_cents), 0)::bigint AS spent_total,
        COALESCE(
          SUM(e.usd_cents) FILTER (WHERE e.created_at >= now() - interval '24 hours'),
          0
        )::bigint AS spent_24h
      FROM flow.mcp_agent_spend_events e
      LEFT JOIN flow.outgoing_transfer_jobs j ON j.id = e.transfer_job_id
      WHERE e.agent_key_id = k.id
        AND e.operation = 'SEND'
        AND COALESCE(j.status, 'PENDING_CUSTODY') NOT IN ('FAILED', 'REFUNDED')
    ) s ON true
    WHERE k.account_id = ${accountId}::uuid
    ORDER BY
      CASE k.status WHEN 'ACTIVE' THEN 0 WHEN 'PAUSED' THEN 1 ELSE 2 END ASC,
      k.created_at DESC
  `;

  if (rows.length === 0) return [];

  const eventRows = await tx.$queryRaw<SpendEventRow[]>`
    SELECT
      e.id,
      e.agent_key_id,
      e.operation,
      e.source_asset_symbol,
      e.source_network,
      e.source_display_amount,
      e.destination_asset_symbol,
      e.destination_network,
      e.recipient_label,
      e.usd_cents,
      j.public_id AS transfer_public_id,
      j.status AS transfer_status,
      e.created_at
    FROM flow.mcp_agent_spend_events e
    LEFT JOIN flow.outgoing_transfer_jobs j ON j.id = e.transfer_job_id
    WHERE e.account_id = ${accountId}::uuid
    ORDER BY e.created_at DESC
    LIMIT 60
  `;

  const byKey = new Map<string, SerializedMcpSpendEvent[]>();
  for (const ev of eventRows) {
    const list = byKey.get(ev.agent_key_id) ?? [];
    if (list.length < 10) {
      const usdCents = toSafeInt(ev.usd_cents);
      list.push({
        id: ev.id,
        operation: ev.operation === "CONVERT" ? "CONVERT" : "SEND",
        sourceAssetSymbol: ev.source_asset_symbol,
        sourceNetwork: ev.source_network,
        sourceDisplayAmount: ev.source_display_amount,
        destinationAssetSymbol: ev.destination_asset_symbol,
        destinationNetwork: ev.destination_network,
        recipientLabel: ev.recipient_label,
        usdCents,
        usdAmount: centsToUsd(usdCents),
        transferPublicId: ev.transfer_public_id,
        transferStatus: ev.transfer_status,
        createdAt: ev.created_at.toISOString(),
      });
      byKey.set(ev.agent_key_id, list);
    }
  }

  return rows.map((row) => serializeKeyRow(row, byKey.get(row.id) ?? []));
}

export async function createAccountMcpAgentKey(
  tx: FlowDb,
  params: {
    readonly accountId: string;
    readonly userId: string;
    readonly input: z.infer<typeof createMcpAgentKeySchema>;
  },
): Promise<{
  readonly key: SerializedMcpAgentKey;
  readonly rawToken: string;
}> {
  const { rawToken, tokenPrefix, tokenHash } = generateMcpToken();
  const maxTotalUsdCents = params.input.canSend
    ? usdToCents(params.input.maxTotalUsd)
    : 0;
  const rawPerTxCents =
    params.input.maxPerTxUsd !== undefined
      ? usdToCents(params.input.maxPerTxUsd)
      : maxTotalUsdCents;
  const maxPerTxUsdCents = params.input.canSend
    ? Math.min(rawPerTxCents, maxTotalUsdCents)
    : 0;
  const maxDailyUsdCents =
    params.input.canSend &&
    params.input.maxDailyUsd !== undefined &&
    params.input.maxDailyUsd !== null
      ? Math.min(usdToCents(params.input.maxDailyUsd), maxTotalUsdCents)
      : null;

  const canSend = params.input.canSend && maxTotalUsdCents > 0;
  const allowedNetworks = normalizeAllowedNetworks(params.input.allowedNetworks);
  const allowedRecipients = normalizeRecipientAllowlist(
    params.input.allowedRecipients,
  );
  const expiresAt =
    params.input.expiresInDays != null
      ? new Date(Date.now() + params.input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const inserted = await tx.$queryRaw<KeyListRow[]>`
    INSERT INTO flow.mcp_agent_keys (
      account_id,
      user_id,
      name,
      token_prefix,
      token_hash,
      status,
      max_total_usd_cents,
      max_per_tx_usd_cents,
      max_daily_usd_cents,
      can_read,
      can_send,
      can_convert,
      can_create_payment_links,
      allowed_networks,
      allowed_recipients,
      expires_at
    )
    VALUES (
      ${params.accountId}::uuid,
      ${params.userId}::uuid,
      ${params.input.name}::varchar,
      ${tokenPrefix}::varchar,
      ${tokenHash}::varchar,
      'ACTIVE',
      ${maxTotalUsdCents}::bigint,
      ${maxPerTxUsdCents}::bigint,
      ${maxDailyUsdCents}::bigint,
      true,
      ${canSend}::boolean,
      ${params.input.canConvert}::boolean,
      ${params.input.canCreatePaymentLinks}::boolean,
      ${allowedNetworks.length > 0 ? allowedNetworks : [...ALL_MCP_NETWORKS]}::text[],
      ${allowedRecipients}::text[],
      ${expiresAt}::timestamptz
    )
    RETURNING
      id,
      account_id,
      name,
      token_prefix,
      status,
      max_total_usd_cents,
      max_per_tx_usd_cents,
      max_daily_usd_cents,
      can_read,
      can_send,
      can_convert,
      can_create_payment_links,
      allowed_networks,
      allowed_recipients,
      expires_at,
      last_used_at,
      total_calls,
      created_at,
      updated_at,
      0::bigint AS spent_total_usd_cents,
      0::bigint AS spent_24h_usd_cents
  `;

  const row = inserted[0];
  if (!row) {
    throw new Error("Failed to create MCP agent key.");
  }
  return {
    key: serializeKeyRow(row, []),
    rawToken,
  };
}

export async function updateAccountMcpAgentKey(
  tx: FlowDb,
  params: {
    readonly accountId: string;
    readonly keyId: string;
    readonly patch: z.infer<typeof updateMcpAgentKeySchema>;
  },
): Promise<SerializedMcpAgentKey | null> {
  const existingRows = await tx.$queryRaw<KeyListRow[]>`
    SELECT
      id, account_id, name, token_prefix, status,
      max_total_usd_cents, max_per_tx_usd_cents, max_daily_usd_cents,
      can_read, can_send, can_convert, can_create_payment_links,
      allowed_networks, allowed_recipients, expires_at, last_used_at,
      total_calls, created_at, updated_at,
      0::bigint AS spent_total_usd_cents,
      0::bigint AS spent_24h_usd_cents
    FROM flow.mcp_agent_keys
    WHERE id = ${params.keyId}::uuid
      AND account_id = ${params.accountId}::uuid
    LIMIT 1
  `;
  const current = existingRows[0];
  if (!current) return null;

  // Revoked keys cannot be re-activated; user must create a fresh token.
  const nextStatus =
    current.status === "REVOKED"
      ? "REVOKED"
      : (params.patch.status ?? current.status);
  const nextName = params.patch.name ?? current.name;
  const nextCanSend = params.patch.canSend ?? current.can_send;
  const nextMaxTotalCents =
    params.patch.maxTotalUsd !== undefined
      ? usdToCents(params.patch.maxTotalUsd)
      : toSafeInt(current.max_total_usd_cents);
  const rawNextPerTx =
    params.patch.maxPerTxUsd !== undefined
      ? usdToCents(params.patch.maxPerTxUsd)
      : toSafeInt(current.max_per_tx_usd_cents);
  const nextMaxPerTxCents =
    nextMaxTotalCents > 0 ? Math.min(rawNextPerTx, nextMaxTotalCents) : 0;
  const nextMaxDailyCents =
    params.patch.maxDailyUsd === undefined
      ? current.max_daily_usd_cents === null
        ? null
        : toSafeInt(current.max_daily_usd_cents)
      : params.patch.maxDailyUsd === null
        ? null
        : Math.min(usdToCents(params.patch.maxDailyUsd), nextMaxTotalCents);
  const nextCanConvert = params.patch.canConvert ?? current.can_convert;
  const nextCanLinks =
    params.patch.canCreatePaymentLinks ?? current.can_create_payment_links;
  const nextNetworks =
    params.patch.allowedNetworks !== undefined
      ? normalizeAllowedNetworks(params.patch.allowedNetworks)
      : normalizeAllowedNetworks(current.allowed_networks ?? undefined);
  const nextRecipients =
    params.patch.allowedRecipients !== undefined
      ? normalizeRecipientAllowlist(params.patch.allowedRecipients)
      : (current.allowed_recipients ?? []);
  const nextExpiresAt =
    params.patch.expiresInDays === undefined
      ? current.expires_at
      : params.patch.expiresInDays === null
        ? null
        : new Date(Date.now() + params.patch.expiresInDays * 24 * 60 * 60 * 1000);

  await tx.$executeRaw`
    UPDATE flow.mcp_agent_keys
    SET
      name = ${nextName}::varchar,
      status = ${nextStatus}::varchar,
      max_total_usd_cents = ${nextMaxTotalCents}::bigint,
      max_per_tx_usd_cents = ${nextMaxPerTxCents}::bigint,
      max_daily_usd_cents = ${nextMaxDailyCents}::bigint,
      can_send = ${nextCanSend && nextMaxTotalCents > 0}::boolean,
      can_convert = ${nextCanConvert}::boolean,
      can_create_payment_links = ${nextCanLinks}::boolean,
      allowed_networks = ${nextNetworks}::text[],
      allowed_recipients = ${nextRecipients}::text[],
      expires_at = ${nextExpiresAt}::timestamptz,
      updated_at = now()
    WHERE id = ${params.keyId}::uuid
      AND account_id = ${params.accountId}::uuid
  `;

  const all = await listAccountMcpAgentKeys(tx, params.accountId);
  return all.find((k) => k.id === params.keyId) ?? null;
}

export async function deleteAccountMcpAgentKey(
  tx: FlowDb,
  accountId: string,
  keyId: string,
): Promise<boolean> {
  const deleted = await tx.$executeRaw`
    DELETE FROM flow.mcp_agent_keys
    WHERE id = ${keyId}::uuid
      AND account_id = ${accountId}::uuid
  `;
  return deleted > 0;
}
