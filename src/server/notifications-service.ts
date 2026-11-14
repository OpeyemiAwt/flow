import { formatAtomicToDisplay } from "../domain/atomic-amounts.ts";
import { type FlowDb } from "../foundation/prisma.ts";

export type NotificationCategory = "all" | "payments" | "accounts" | "system";

export type NotificationType =
  | "PAYMENT_RECEIVED"
  | "PAYMENT_COMPLETED"
  | "PAYMENT_LINK_CREATED"
  | "DEPOSIT_DETECTED"
  | "SWAP_COMPLETED"
  | "SYNC_NOTICE"
  | "SECURITY_NOTICE";

export interface AccountNotification {
  readonly id: string;
  readonly accountId: string;
  readonly category: "payments" | "accounts" | "system";
  readonly type: NotificationType;
  readonly title: string;
  readonly description: string;
  readonly link: string | null;
  readonly isRead: boolean;
  readonly createdAt: string;
}

export async function getAccountNotifications(
  db: FlowDb,
  accountId: string,
  viewerUserId: string,
): Promise<AccountNotification[]> {
  const notifications: AccountNotification[] = [];

  // 1. Fetch genuine completed payment attempts for this account
  const completedAttempts = await db.$queryRaw<
    Array<{
      attempt_id: string;
      public_id: string;
      title: string;
      source_network: string;
      source_asset_symbol: string;
      destination_network: string;
      destination_asset_symbol: string;
      settled_atomic_amount: string;
      destination_decimals: number;
      settled_at: Date | null;
      created_at: Date;
    }>
  >`
      SELECT 
        pa.id as attempt_id,
        pa.attempt_public_id as public_id,
        pr.title,
        pa.source_network,
        pa.source_asset_symbol,
        pr.destination_network,
        pr.destination_asset_symbol,
        settlement.atomic_amount::text AS settled_atomic_amount,
        pr.destination_decimals,
        pa.settled_at,
        pa.created_at
      FROM flow.payment_attempts pa
      JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
      JOIN LATERAL (
        SELECT pv.atomic_amount
        FROM flow.payment_verifications pv
        WHERE pv.payment_attempt_id = pa.id AND pv.verification_type = 'DESTINATION_SETTLEMENT'
          AND pv.finality = 'FINALIZED' AND pv.evidence_source = 'CHAIN_RPC_DIRECT'
        ORDER BY pv.verified_at DESC
        LIMIT 1
      ) settlement ON true
      WHERE pr.account_id = ${accountId}::uuid
        AND pa.status = 'SETTLED'
      ORDER BY pa.settled_at DESC NULLS LAST, pa.created_at DESC
      LIMIT 10
  `;

  for (const a of completedAttempts) {
    const notifId = `notif_settled_${a.attempt_id}`;
    const amount = formatAtomicToDisplay(
      a.settled_atomic_amount,
      a.destination_decimals,
    );
    notifications.push({
      id: notifId,
      accountId,
      category: "payments",
      type: "PAYMENT_RECEIVED",
      title: "Payment received",
      description: `+${amount} ${a.destination_asset_symbol} on ${a.destination_network.replace("-mainnet", "")}`,
      link: `/accounts/${accountId}?view=activity`,
      isRead: false,
      createdAt: (a.settled_at ?? a.created_at).toISOString(),
    });
  }

  // 2. Fetch created payment requests
  const prs = await db.$queryRaw<
    Array<{
      id: string;
      public_id: string;
      title: string;
      created_at: Date;
    }>
  >`
      SELECT id, public_id, title, created_at
      FROM flow.payment_requests
      WHERE account_id = ${accountId}::uuid
      ORDER BY created_at DESC
      LIMIT 10
  `;

  for (const pr of prs) {
    const notifId = `notif_pr_${pr.id}`;
    notifications.push({
      id: notifId,
      accountId,
      category: "payments",
      type: "PAYMENT_LINK_CREATED",
      title: "Payment link created",
      description: `"${pr.title}"`,
      link: `/accounts/${accountId}?view=request`,
      isRead: false,
      createdAt: pr.created_at.toISOString(),
    });
  }

  // 3. Balance sync notices from wallet balances
  const syncErrors = await db.$queryRaw<
    Array<{
      id: string;
      network: string;
      last_error: string;
      observed_at: Date;
    }>
  >`
      SELECT wb.id, na.network, wb.last_error, wb.observed_at
      FROM flow.wallet_balances wb
      JOIN flow.network_assets na ON na.id = wb.network_asset_id
      JOIN flow.wallets w ON w.id = wb.wallet_id
      WHERE w.account_id = ${accountId}::uuid
        AND wb.last_error IS NOT NULL
      ORDER BY wb.observed_at DESC
      LIMIT 5
  `;

  for (const se of syncErrors) {
    const notifId = `notif_sync_${se.id}`;
    notifications.push({
      id: notifId,
      accountId,
      category: "system",
      type: "SYNC_NOTICE",
      title: "Balance sync notice",
      description: `Balance refresh is incomplete on ${se.network}.`,
      link: `/accounts/${accountId}?view=dashboard`,
      isRead: false,
      createdAt: se.observed_at.toISOString(),
    });
  }

  // Sort latest first
  notifications.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const prefRows = await db.$queryRaw<
    Array<{
      incoming_payments: boolean;
      payment_link_activity: boolean;
      security_alerts: boolean;
    }>
  >`
    SELECT incoming_payments, payment_link_activity, security_alerts
    FROM flow.account_notification_preferences
    WHERE account_id = ${accountId}::uuid
      AND user_id = ${viewerUserId}::uuid
    LIMIT 1
  `;
  const prefs = prefRows[0] ?? {
    incoming_payments: true,
    payment_link_activity: true,
    security_alerts: true,
  };

  const visibleNotifications = notifications.filter((notification) => {
    if (
      notification.type === "PAYMENT_RECEIVED" ||
      notification.type === "PAYMENT_COMPLETED" ||
      notification.type === "DEPOSIT_DETECTED"
    ) {
      return prefs.incoming_payments;
    }
    if (notification.type === "PAYMENT_LINK_CREATED") {
      return prefs.payment_link_activity;
    }
    if (notification.type === "SECURITY_NOTICE") {
      return prefs.security_alerts;
    }
    return true;
  });

  const readRows = await db.$queryRaw<Array<{ notification_id: string }>>`
    SELECT notification_id
    FROM flow.account_notification_reads
    WHERE account_id = ${accountId}::uuid
      AND viewer_user_id = ${viewerUserId}::uuid
  `;
  const readIds = new Set(readRows.map((row) => row.notification_id));
  return visibleNotifications.map((notification) => ({
    ...notification,
    isRead: readIds.has(notification.id),
  }));
}

export async function markNotificationsAsRead(
  db: FlowDb,
  accountId: string,
  viewerUserId: string,
  notificationIds: string[],
): Promise<void> {
  if (notificationIds.length === 0) return;
  await db.$executeRaw`
    INSERT INTO flow.account_notification_reads
      (account_id, viewer_user_id, notification_id)
    SELECT ${accountId}::uuid, ${viewerUserId}::uuid, requested.notification_id
    FROM unnest(${notificationIds}::text[]) AS requested(notification_id)
    ON CONFLICT (account_id, viewer_user_id, notification_id) DO NOTHING
  `;
}
