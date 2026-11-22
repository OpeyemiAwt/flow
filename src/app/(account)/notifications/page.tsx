import { runtime } from "../../../foundation/prisma.ts";
import { accessibleAccounts } from "../../../server/accounts.ts";
import { pageData, pagePrincipal } from "../../../server/pages.ts";
import { getUserProfilePreference } from "../../../server/preferences-service.ts";
import { NotificationsView } from "./notifications-view.tsx";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ account?: string }>;
}) {
  const actor = await pagePrincipal();
  const token = actor.session.token;
  const db = runtime().db;
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const [accounts, profilePref] = await Promise.all([
    pageData(() => accessibleAccounts(db, actor)),
    pageData(() =>
      db.$transaction(async (tx) => {
        if (token) {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
        }
        return getUserProfilePreference(tx, actor.userId);
      }),
    ),
  ]);

  const requestedId = resolvedSearchParams.account;
  const matchedAccount = requestedId
    ? accounts.find((a) => a.id === requestedId)
    : undefined;
  const primaryAccount =
    matchedAccount ??
    accounts.find((a) => a.kind === "PERSONAL") ??
    accounts[0] ??
    null;

  return (
    <NotificationsView
      accountId={primaryAccount?.id ?? null}
      userEmail={actor.email}
      userName={profilePref.displayName || actor.name}
      userAvatarUrl={profilePref.avatarDataUrl || actor.image}
      profileId={actor.userId}
    />
  );
}
