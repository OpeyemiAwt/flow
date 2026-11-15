import { notFound } from "next/navigation";
import { runtime } from "../../../foundation/prisma.ts";
import { accessibleAccounts } from "../../../server/accounts.ts";
import {
  isPlatformAdmin,
  loadAdminAnalyticsData,
} from "../../../server/admin-analytics-service.ts";
import { pageData, pagePrincipal } from "../../../server/pages.ts";
import { getUserProfilePreference } from "../../../server/preferences-service.ts";
import { AnalyticsView } from "./analytics-view.tsx";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const actor = await pagePrincipal();
  if (!isPlatformAdmin(actor.email, actor.verifiedEmail)) {
    notFound();
  }
  const token = actor.session.token;
  if (!token) {
    notFound();
  }

  const db = runtime().db;
  const [analytics, accounts, profilePref] = await Promise.all([
    pageData(() => loadAdminAnalyticsData(token)),
    pageData(() => accessibleAccounts(db, actor)),
    pageData(() =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
        return getUserProfilePreference(tx, actor.userId);
      }),
    ),
  ]);

  const primaryAccountId =
    accounts.find((a) => a.kind === "PERSONAL")?.id ?? accounts[0]?.id ?? null;

  return (
    <AnalyticsView
      initialAnalytics={analytics}
      primaryAccountId={primaryAccountId}
      userEmail={actor.email}
      userName={profilePref.displayName || actor.name}
      userAvatarUrl={profilePref.avatarDataUrl || actor.image}
      profileId={actor.userId}
    />
  );
}
