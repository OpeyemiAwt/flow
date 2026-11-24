import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  parseDirectFlowIdParam,
  PENDING_SEND_FLOW_ID_COOKIE,
} from "../../domain/flow-id.ts";
import { runtime } from "../../foundation/prisma.ts";
import { accessibleAccounts, principal } from "../../server/accounts.ts";
import { readSession } from "../../server/auth/session.ts";
import { getAccountFlowId } from "../../server/flow-id-service.ts";
import { pageData } from "../../server/pages.ts";
import { SignOutButton } from "../controls.tsx";
import { CompleteOnboarding } from "./complete.tsx";

export const dynamic = "force-dynamic";

export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; to?: string }>;
}) {
  const [{ step, to }, requestHeaders, cookieStore] = await Promise.all([
    searchParams,
    headers(),
    cookies(),
  ]);
  const pendingSendTo =
    parseDirectFlowIdParam(to) ??
    parseDirectFlowIdParam(cookieStore.get(PENDING_SEND_FLOW_ID_COOKIE)?.value);

  const session = await pageData(() =>
    readSession(runtime().db, requestHeaders),
  );
  if (!session) {
    redirect(
      pendingSendTo
        ? `/sign-in?to=${encodeURIComponent(pendingSendTo)}`
        : "/sign-in",
    );
  }

  const db = runtime().db;
  const [identity, existingUser] = await Promise.all([
    pageData(() =>
      db.authUser.findUnique({
        where: { id: session.userId },
        select: { email: true, name: true },
      }),
    ),
    pageData(() =>
      db.flowUser.findUnique({ where: { authUserId: session.userId } }),
    ),
  ]);
  if (!identity) redirect("/sign-in");

  let account = null;
  if (existingUser && !existingUser.active) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="font-serif text-3xl text-[#0B0B0B]">
          Account unavailable
        </h1>
        <p className="mt-3 text-sm text-[#555]">
          This FLOW account is currently inactive. Sign out to access a
          different account.
        </p>
        <div className="mt-6">
          <SignOutButton />
        </div>
      </main>
    );
  }
  let initialFlowId: string | null = null;
  if (existingUser?.active) {
    const actor = await pageData(() => principal(db, requestHeaders));
    const accounts = await pageData(() => accessibleAccounts(db, actor));
    account =
      accounts.find((candidate) => candidate.kind === "PERSONAL") ?? null;
    if (account?.id) {
      const accountId = account.id;
      const sessionToken = actor.session.token;
      initialFlowId = await pageData(() =>
        db.$transaction(async (tx) => {
          if (sessionToken) {
            await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${sessionToken}, true)`;
          }
          await tx.$executeRaw`SELECT set_config('flow.current_account_id', ${accountId}, true)`;
          return getAccountFlowId(tx, accountId);
        }),
      );
    }
    if (account?.provisioningComplete && initialFlowId) {
      redirect(
        pendingSendTo
          ? `/app/send?to=${encodeURIComponent(pendingSendTo)}`
          : "/app",
      );
    }
  }

  return (
    <CompleteOnboarding
      initialStep={step}
      userEmail={identity.email}
      userName={identity.name?.trim() || identity.email}
      initialAccount={account}
      initialFlowId={initialFlowId}
      pendingSendTo={pendingSendTo}
    />
  );
}
