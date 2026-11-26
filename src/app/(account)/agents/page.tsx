import { notFound } from "next/navigation";
import { runtime } from "../../../foundation/prisma.ts";
import { accessibleAccounts } from "../../../server/accounts.ts";
import { getAccountFlowId } from "../../../server/flow-id-service.ts";
import { listAccountMcpAgentKeys } from "../../../server/mcp-agent-keys-service.ts";
import { pageData, pagePrincipal } from "../../../server/pages.ts";
import { getUserProfilePreference } from "../../../server/preferences-service.ts";
import { AgentsView } from "./agents-view.tsx";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  const actor = await pagePrincipal();
  const token = actor.session.token;
  if (!token) {
    notFound();
  }

  const db = runtime().db;
  const [accounts, profilePref] = await Promise.all([
    pageData(() => accessibleAccounts(db, actor)),
    pageData(() =>
      db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
        return getUserProfilePreference(tx, actor.userId);
      }),
    ),
  ]);

  const primaryAccount =
    accounts.find((a) => a.kind === "PERSONAL") ?? accounts[0] ?? null;

  const [initialKeys, flowId] = primaryAccount
    ? await pageData(() =>
        db.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
            set_config('flow.current_account_id', ${primaryAccount.id}, true)`;
          const [keys, fid] = await Promise.all([
            listAccountMcpAgentKeys(tx, primaryAccount.id),
            getAccountFlowId(tx, primaryAccount.id).catch(() => null),
          ]);
          return [keys, fid] as const;
        }),
      )
    : [[], null];

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
    "https://flow.devhub.forum";

  return (
    <AgentsView
      accountId={primaryAccount?.id ?? null}
      flowId={flowId}
      appBaseUrl={appBaseUrl}
      initialKeys={initialKeys}
      userEmail={actor.email}
      userName={profilePref.displayName || actor.name}
      userAvatarUrl={profilePref.avatarDataUrl || actor.image}
      profileId={actor.userId}
    />
  );
}
