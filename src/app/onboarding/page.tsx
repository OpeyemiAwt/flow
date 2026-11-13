import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { runtime } from "../../foundation/prisma.ts";
import { accessibleAccounts, principal } from "../../server/accounts.ts";
import { readSession } from "../../server/auth/session.ts";
import { pageData } from "../../server/pages.ts";
import { CompleteOnboarding } from "./complete.tsx";

export const dynamic = "force-dynamic";

export default async function Onboarding({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const requestHeaders = await headers();
  const session = await pageData(() =>
    readSession(runtime().db, requestHeaders),
  );
  if (!session) redirect("/sign-in");

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
  if (existingUser?.active) {
    const actor = await pageData(() => principal(db, requestHeaders));
    const accounts = await pageData(() => accessibleAccounts(db, actor));
    account =
      accounts.find((candidate) => candidate.kind === "PERSONAL") ?? null;
    if (account?.provisioningComplete) redirect(`/accounts/${account.id}`);
  }

  const { step } = await searchParams;

  return (
    <CompleteOnboarding
      initialStep={step}
      userEmail={identity.email}
      userName={identity.name ?? ""}
      initialAccount={account}
    />
  );
}
