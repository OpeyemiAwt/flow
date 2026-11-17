import "server-only";
import { runtime } from "../foundation/prisma.ts";
import { accessibleAccounts, principal } from "./accounts.ts";
import { fetchSymbolUsdPrices } from "./admin-analytics-service.ts";
import { forwardCookies } from "./auth/session.ts";
import { privateHeaders, reply } from "./http.ts";

export interface InsightsAccountOption {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly createdAt: string;
}

export interface InsightsBalanceHolding {
  readonly accountId: string;
  readonly assetSymbol: string;
  readonly network: string;
  readonly displayAmount: number;
  readonly usdValue: number;
}

export interface InsightsActivityBucket {
  readonly accountId: string;
  readonly monthKey: string;
  readonly direction: "IN" | "OUT";
  readonly assetSymbol: string;
  readonly network: string;
  readonly displayAmount: number;
  readonly usdValue: number;
  readonly txCount: number;
}

export interface UserInsightsSnapshot {
  readonly accountOpenedAt: string;
  readonly accounts: readonly InsightsAccountOption[];
  readonly holdings: readonly InsightsBalanceHolding[];
  readonly buckets: readonly InsightsActivityBucket[];
  readonly asOf: string;
}

type ActorPrincipal = Awaited<ReturnType<typeof principal>>;

export async function loadUserInsightsData(
  actor: ActorPrincipal,
): Promise<UserInsightsSnapshot> {
  const { db } = runtime();
  const token = actor.session.token;
  if (!token) {
    throw new Error("Missing session token for insights.");
  }

  const [rawAccounts, prices] = await Promise.all([
    accessibleAccounts(db, actor),
    fetchSymbolUsdPrices(),
  ]);

  const accounts: InsightsAccountOption[] = [];

  const holdings: InsightsBalanceHolding[] = [];
  const buckets: InsightsActivityBucket[] = [];
  let earliestOpenedMs = Date.now();

  for (const acct of rawAccounts) {

    const { balanceRows, activityRows, dbCreatedAt } = await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT
            set_config('flow.current_session_token', ${token}, true),
            set_config('flow.current_account_id', ${acct.id}, true)
        `;

        const [acctDates, balances, activities] = await Promise.all([
          tx.$queryRaw<Array<{ created_at: Date }>>`
            SELECT created_at
            FROM flow.accounts
            WHERE id = ${acct.id}::uuid
            LIMIT 1
          `,
          tx.$queryRaw<
            Array<{
              network: string;
              asset_symbol: string;
              total_display: string;
            }>
          >`
            SELECT
              na.network,
              UPPER(COALESCE(na.symbol_override, a.symbol))::text AS asset_symbol,
              SUM(wb.atomic_balance / POWER(10::numeric, na.decimals))::text AS total_display
            FROM flow.wallet_balances wb
            JOIN flow.network_assets na ON na.id = wb.network_asset_id
            JOIN flow.assets a ON a.id = na.asset_id
            JOIN flow.wallets w ON w.id = wb.wallet_id
            WHERE w.account_id = ${acct.id}::uuid
              AND wb.atomic_balance > 0
              AND wb.sync_status = 'SYNCED'
              AND w.status = 'ACTIVE'
              AND w.environment = 'mainnet'
              AND na.is_verified = true
              AND na.status = 'ACTIVE'
            GROUP BY 1, 2
          `,
          tx.$queryRaw<
            Array<{
              month_key: string;
              direction: string;
              asset_symbol: string;
              network: string;
              total_display: string;
              tx_count: bigint;
            }>
          >`
            SELECT
              TO_CHAR(
                DATE_TRUNC('month', COALESCE(wa.block_timestamp, wa.observed_at, wa.created_at) AT TIME ZONE 'UTC'),
                'YYYY-MM'
              ) AS month_key,
              CASE
                WHEN UPPER(wa.direction) IN ('IN', 'INBOUND', 'INCOMING') THEN 'IN'
                ELSE 'OUT'
              END AS direction,
              UPPER(wa.asset_symbol)::text AS asset_symbol,
              wa.network,
              SUM(wa.atomic_amount / POWER(10::numeric, wa.decimals))::text AS total_display,
              COUNT(*)::bigint AS tx_count
            FROM flow.wallet_activities wa
            JOIN flow.wallets w ON w.id = wa.wallet_id
            WHERE wa.account_id = ${acct.id}::uuid
              AND w.environment = 'mainnet'
              AND wa.reorg_status = 'CANONICAL'
              AND wa.atomic_amount > 0
              AND UPPER(wa.direction) IN ('IN', 'INBOUND', 'INCOMING', 'OUT', 'OUTBOUND', 'OUTGOING')
              AND COALESCE(wa.from_address, '') NOT IN ('linear-protocol.near', 'contract.main.burrow.near')
              AND COALESCE(wa.to_address, '') NOT IN ('linear-protocol.near', 'contract.main.burrow.near')
              AND NOT EXISTS (
                SELECT 1
                FROM flow.outgoing_transfer_jobs otj
                WHERE otj.account_id = wa.account_id
                  AND otj.provider_deposit_memo LIKE 'EARN:%'
                  AND (otj.source_tx_hash = wa.tx_hash OR otj.destination_tx_hash = wa.tx_hash)
              )
            GROUP BY 1, 2, 3, 4
          `,
        ]);

        return {
          dbCreatedAt: acctDates[0]?.created_at ?? null,
          balanceRows: balances,
          activityRows: activities,
        };
      },
    );

    const createdAtIso = dbCreatedAt
      ? dbCreatedAt.toISOString()
      : new Date().toISOString();
    accounts.push({
      id: acct.id,
      name: acct.name,
      kind: acct.kind,
      createdAt: createdAtIso,
    });
    if (dbCreatedAt) {
      const ms = dbCreatedAt.getTime();
      if (Number.isFinite(ms) && ms < earliestOpenedMs) {
        earliestOpenedMs = ms;
      }
    }

    for (const row of balanceRows) {
      const amount = Number(row.total_display);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const sym = row.asset_symbol.toUpperCase();
      const price = prices[sym] ?? 0;
      holdings.push({
        accountId: acct.id,
        assetSymbol: sym,
        network: row.network,
        displayAmount: amount,
        usdValue: Math.round(amount * price * 100) / 100,
      });
    }

    for (const row of activityRows) {
      const amount = Number(row.total_display);
      if (!Number.isFinite(amount) || amount <= 0 || !row.month_key) continue;
      const sym = row.asset_symbol.toUpperCase();
      const price = prices[sym] ?? 0;
      buckets.push({
        accountId: acct.id,
        monthKey: row.month_key,
        direction: row.direction === "IN" ? "IN" : "OUT",
        assetSymbol: sym,
        network: row.network,
        displayAmount: amount,
        usdValue: Math.round(amount * price * 100) / 100,
        txCount: Number(row.tx_count ?? 0n),
      });
    }
  }

  return {
    accountOpenedAt: new Date(earliestOpenedMs).toISOString(),
    accounts,
    holdings,
    buckets,
    asOf: new Date().toISOString(),
  };
}

export async function getUserInsights(request: Request) {
  const { db } = runtime();
  const actor = await principal(db, request.headers);
  const insights = await loadUserInsightsData(actor);
  const headers = privateHeaders();
  forwardCookies(headers, actor.session.headers);
  return reply(200, { insights }, headers);
}
