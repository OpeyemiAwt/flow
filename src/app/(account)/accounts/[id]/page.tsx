import { runtime } from "../../../../foundation/prisma.ts";
import {
  access,
  accessibleAccounts,
  accountId,
} from "../../../../server/accounts.ts";
import { getAccountBalances } from "../../../../server/assets/asset-service.ts";
import { requestAccountSync } from "../../../../server/account-sync.ts";
import { pageData, pagePrincipal } from "../../../../server/pages.ts";
import { serializePortfolio } from "../../../../server/portfolio.ts";
import { getUserProfilePreference } from "../../../../server/preferences-service.ts";
import { PortfolioView, type WorkspaceTab } from "./portfolio-view.tsx";
import { redirect } from "next/navigation";
import { isFinancialExecutionDisabled } from "../../../../domain/custody.ts";

const VALID_VIEWS: ReadonlySet<WorkspaceTab> = new Set([
  "dashboard",
  "send",
  "receive",
  "request",
  "activity",
]);

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const actor = await pagePrincipal();
  const { id } = await params;
  const query = await searchParams;
  const account = await pageData(() =>
    access(runtime().db, actor, accountId(id)),
  );
  // Business identity, membership and team administration are account
  // functions, not custody actions. Keep those screens available while the
  // owner's Personal wallet is still onboarding; financial APIs independently
  // enforce wallet readiness before any execution path.
  if (account.kind === "PERSONAL" && !account.provisioningComplete) {
    redirect("/onboarding?step=status");
  }
  const db = runtime().db;
  const [allAccounts, initialProfilePreference] = await Promise.all([
    pageData(() => accessibleAccounts(db, actor)),
    actor.session.token
      ? pageData(() =>
          db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${actor.session.token}, true)`;
            return getUserProfilePreference(tx, actor.userId);
          }),
        )
      : Promise.resolve({ displayName: null, avatarDataUrl: null }),
  ]);
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
    query.view && VALID_VIEWS.has(query.view as WorkspaceTab)
      ? (query.view as WorkspaceTab)
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
