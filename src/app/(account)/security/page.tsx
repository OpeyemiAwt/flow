import { headers } from "next/headers";
import { runtime } from "../../../foundation/prisma.ts";
import { accessibleAccounts } from "../../../server/accounts.ts";
import { securitySnapshot } from "../../../server/auth/flows.ts";
import { pageData, pagePrincipal } from "../../../server/pages.ts";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getAccountNotificationPreferences,
  getUserProfilePreference,
} from "../../../server/preferences-service.ts";
import { SecurityPanel } from "./security-panel.tsx";

export default async function SecurityPage() {
  const actor = await pagePrincipal();
  const h = await headers();
  const db = runtime().db;
  const [status, accounts] = await Promise.all([
    pageData(async () => securitySnapshot(h)),
    pageData(async () => accessibleAccounts(db, actor)),
  ]);
  const primaryAccountId =
    accounts.find((a) => a.kind === "PERSONAL")?.id ?? accounts[0]?.id ?? null;
  const token = actor.session.token;
  const [initialProfilePreference, initialNotificationPreferences] = token
    ? await pageData(() =>
        db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
          const profile = await getUserProfilePreference(tx, actor.userId);
          if (primaryAccountId) {
            await tx.$executeRaw`SELECT set_config('flow.current_account_id', ${primaryAccountId}, true)`;
          }
          const notifPrefs = primaryAccountId
            ? await getAccountNotificationPreferences(
                tx,
                primaryAccountId,
                actor.userId,
              )
            : DEFAULT_NOTIFICATION_PREFERENCES;
          return [profile, notifPrefs] as const;
        }),
      )
    : [
        { displayName: null, avatarDataUrl: null },
        DEFAULT_NOTIFICATION_PREFERENCES,
      ];

  return (
    <main>
      <SecurityPanel
        {...status}
        accounts={accounts}
        profileId={actor.userId}
        initialProfilePreference={initialProfilePreference}
        initialNotificationPreferences={initialNotificationPreferences}
      />
    </main>
  );
}
