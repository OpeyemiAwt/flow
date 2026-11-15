import { runtime } from "../../../foundation/prisma.ts";
import { loadUserInsightsData } from "../../../server/insights-service.ts";
import { pageData, pagePrincipal } from "../../../server/pages.ts";
import { getUserProfilePreference } from "../../../server/preferences-service.ts";
import { InsightsView } from "./insights-view.tsx";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const actor = await pagePrincipal();
  const token = actor.session.token;
  const db = runtime().db;

  const [insights, profilePref] = await Promise.all([
    pageData(() => loadUserInsightsData(actor)),
    pageData(() =>
      db.$transaction(async (tx) => {
        if (token) {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
        }
        return getUserProfilePreference(tx, actor.userId);
      }),
    ),
  ]);

  const primaryAccountId =
    insights.accounts.find((a) => a.kind === "PERSONAL")?.id ??
    insights.accounts[0]?.id ??
    null;

  return (
    <InsightsView
      initialInsights={insights}
      primaryAccountId={primaryAccountId}
      userEmail={actor.email}
      userName={profilePref.displayName || actor.name}
      userAvatarUrl={profilePref.avatarDataUrl || actor.image}
      profileId={actor.userId}
    />
  );
}
