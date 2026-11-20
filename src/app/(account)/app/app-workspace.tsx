import { redirect } from "next/navigation";
import { isFinancialExecutionDisabled } from "../../../domain/custody.ts";
import { runtime } from "../../../foundation/prisma.ts";
import { access, accessibleAccounts } from "../../../server/accounts.ts";
import { requestAccountSync } from "../../../server/account-sync.ts";
import { getAccountBalances } from "../../../server/assets/asset-service.ts";
import { pageData, pagePrincipal } from "../../../server/pages.ts";
import { serializePortfolio } from "../../../server/portfolio.ts";
import { getUserProfilePreference } from "../../../server/preferences-service.ts";
import {
  PortfolioView,
  type WorkspaceTab,
} from "../accounts/[id]/portfolio-view.tsx";

export const VALID_APP_TABS: ReadonlySet<WorkspaceTab> = new Set([
  "dashboard",
  "send",
  "receive",
  "request",
  "earn",
  "activity",
]);

export async function renderAppWorkspace(requestedTab?: string) {
  const actor = await pagePrincipal();
  const db = runtime().db;
  const allAccounts = await pageData(() => accessibleAccounts(db, actor));
  const primary =
    allAccounts.find((a) => a.kind === "PERSONAL") ?? allAccounts[0] ?? null;

  if (!primary) {
    redirect("/onboarding");
  }

  const account = await pageData(() => access(db, actor, primary.id));
  if (account.kind === "PERSONAL" && !account.provisioningComplete) {
    redirect("/onboarding?step=status");
  }

  const initialProfilePreference = actor.session.token
    ? await pageData(() =>
        db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true)`;
          return getUserProfilePreference(tx, actor.userId);
        }),
      )
    : { displayName: null, avatarDataUrl: null };

  const initialPortfolio = await pageData(async () => {
    if (!actor.session.token) {
      throw new Error("Session token required to view portfolio.");
    }
    const projection = await getAccountBalances(db, account.id, {
      sessionToken: actor.session.token,
    });
    return serializePortfolio(projection);
  });

  if (
    actor.session.token &&
    initialPortfolio.wallet?.status === "ACTIVE" &&
    initialPortfolio.wallet.environment === "mainnet" &&
    initialPortfolio.balances.length === 0
  ) {
    void requestAccountSync(
      account.id,
      actor.session.token,
      "BALANCE_REFRESH",
    ).catch(() => {});
  }

  const initialView: WorkspaceTab =
    requestedTab && VALID_APP_TABS.has(requestedTab as WorkspaceTab)
      ? (requestedTab as WorkspaceTab)
      : "dashboard";

  return (
    <main>
      <PortfolioView
        accountId={account.id}
        initialPortfolio={initialPortfolio}
        account={account}
        allAccounts={allAccounts}
        initialView={initialView}
        userEmail={actor.email}
        userAvatarUrl={actor.image}
        initialDisplayName={
          initialProfilePreference.displayName || actor.name || null
        }
        profileId={actor.userId}
        executionDisabled={isFinancialExecutionDisabled()}
      />
    </main>
  );
}
