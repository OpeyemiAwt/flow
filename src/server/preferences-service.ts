import "server-only";
import { type FlowDb } from "../foundation/prisma.ts";

export interface ProfilePreferenceSnapshot {
  readonly displayName: string | null;
  readonly avatarDataUrl: string | null;
}

export interface NotificationPreferenceSnapshot {
  readonly incomingPayments: boolean;
  readonly paymentLinkActivity: boolean;
  readonly securityAlerts: boolean;
  readonly emailTransactions: boolean;
  readonly emailNewsletter: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceSnapshot =
  {
    incomingPayments: true,
    paymentLinkActivity: true,
    securityAlerts: true,
    emailTransactions: true,
    emailNewsletter: false,
  };

export async function getUserProfilePreference(
  db: FlowDb,
  flowUserId: string,
): Promise<ProfilePreferenceSnapshot> {
  const rows = await db.$queryRaw<
    Array<{ display_name: string | null; avatar_data_url: string | null }>
  >`
    SELECT display_name, avatar_data_url
    FROM flow.user_profile_preferences
    WHERE user_id = ${flowUserId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  return {
    displayName: row?.display_name ?? null,
    avatarDataUrl: row?.avatar_data_url ?? null,
  };
}

export async function upsertUserProfilePreference(
  db: FlowDb,
  flowUserId: string,
  input: {
    displayName?: string | null;
    avatarDataUrl?: string | null;
  },
): Promise<ProfilePreferenceSnapshot> {
  const current = await getUserProfilePreference(db, flowUserId);
  const nextDisplayName =
    input.displayName !== undefined ? input.displayName : current.displayName;
  const nextAvatar =
    input.avatarDataUrl !== undefined
      ? input.avatarDataUrl
      : current.avatarDataUrl;

  await db.$executeRaw`
    INSERT INTO flow.user_profile_preferences (user_id, display_name, avatar_data_url, updated_at)
    VALUES (${flowUserId}::uuid, ${nextDisplayName}, ${nextAvatar}, now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_data_url = EXCLUDED.avatar_data_url,
      updated_at = now()
  `;

  return {
    displayName: nextDisplayName,
    avatarDataUrl: nextAvatar,
  };
}

async function hasEmailPreferenceColumns(db: FlowDb): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ has_col: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'flow'
        AND table_name = 'account_notification_preferences'
        AND column_name = 'email_transactions'
    ) AS has_col
  `;
  return Boolean(rows[0]?.has_col);
}

export async function getAccountNotificationPreferences(
  db: FlowDb,
  accountId: string,
  flowUserId: string,
): Promise<NotificationPreferenceSnapshot> {
  const hasEmailCols = await hasEmailPreferenceColumns(db);
  if (hasEmailCols) {
    const rows = await db.$queryRaw<
      Array<{
        incoming_payments: boolean;
        payment_link_activity: boolean;
        security_alerts: boolean;
        email_transactions: boolean;
        email_newsletter: boolean;
      }>
    >`
      SELECT
        incoming_payments,
        payment_link_activity,
        security_alerts,
        email_transactions,
        email_newsletter
      FROM flow.account_notification_preferences
      WHERE account_id = ${accountId}::uuid
        AND user_id = ${flowUserId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    return {
      incomingPayments: row.incoming_payments,
      paymentLinkActivity: row.payment_link_activity,
      securityAlerts: row.security_alerts,
      emailTransactions: row.email_transactions,
      emailNewsletter: row.email_newsletter,
    };
  }

  // Graceful fallback while email_transactions / email_newsletter migration rolls out
  // without aborting an active PostgreSQL transaction (25P02).
  const rows = await db.$queryRaw<
    Array<{
      incoming_payments: boolean;
      payment_link_activity: boolean;
      security_alerts: boolean;
    }>
  >`
    SELECT incoming_payments, payment_link_activity, security_alerts
    FROM flow.account_notification_preferences
    WHERE account_id = ${accountId}::uuid
      AND user_id = ${flowUserId}::uuid
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  return {
    incomingPayments: row.incoming_payments,
    paymentLinkActivity: row.payment_link_activity,
    securityAlerts: row.security_alerts,
    emailTransactions: DEFAULT_NOTIFICATION_PREFERENCES.emailTransactions,
    emailNewsletter: DEFAULT_NOTIFICATION_PREFERENCES.emailNewsletter,
  };
}

export async function upsertAccountNotificationPreferences(
  db: FlowDb,
  accountId: string,
  flowUserId: string,
  input: Partial<NotificationPreferenceSnapshot>,
): Promise<NotificationPreferenceSnapshot> {
  const current = await getAccountNotificationPreferences(
    db,
    accountId,
    flowUserId,
  );
  const next: NotificationPreferenceSnapshot = {
    incomingPayments: input.incomingPayments ?? current.incomingPayments,
    paymentLinkActivity:
      input.paymentLinkActivity ?? current.paymentLinkActivity,
    securityAlerts: input.securityAlerts ?? current.securityAlerts,
    emailTransactions: input.emailTransactions ?? current.emailTransactions,
    emailNewsletter: input.emailNewsletter ?? current.emailNewsletter,
  };

  const hasEmailCols = await hasEmailPreferenceColumns(db);
  if (hasEmailCols) {
    await db.$executeRaw`
      INSERT INTO flow.account_notification_preferences (
        account_id,
        user_id,
        incoming_payments,
        payment_link_activity,
        security_alerts,
        email_transactions,
        email_newsletter,
        updated_at
      )
      VALUES (
        ${accountId}::uuid,
        ${flowUserId}::uuid,
        ${next.incomingPayments},
        ${next.paymentLinkActivity},
        ${next.securityAlerts},
        ${next.emailTransactions},
        ${next.emailNewsletter},
        now()
      )
      ON CONFLICT (account_id, user_id)
      DO UPDATE SET
        incoming_payments = EXCLUDED.incoming_payments,
        payment_link_activity = EXCLUDED.payment_link_activity,
        security_alerts = EXCLUDED.security_alerts,
        email_transactions = EXCLUDED.email_transactions,
        email_newsletter = EXCLUDED.email_newsletter,
        updated_at = now()
    `;
  } else {
    await db.$executeRaw`
      INSERT INTO flow.account_notification_preferences (
        account_id,
        user_id,
        incoming_payments,
        payment_link_activity,
        security_alerts,
        updated_at
      )
      VALUES (
        ${accountId}::uuid,
        ${flowUserId}::uuid,
        ${next.incomingPayments},
        ${next.paymentLinkActivity},
        ${next.securityAlerts},
        now()
      )
      ON CONFLICT (account_id, user_id)
      DO UPDATE SET
        incoming_payments = EXCLUDED.incoming_payments,
        payment_link_activity = EXCLUDED.payment_link_activity,
        security_alerts = EXCLUDED.security_alerts,
        updated_at = now()
    `;
  }

  return next;
}
