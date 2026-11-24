import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  parseDirectFlowIdParam,
  PENDING_SEND_FLOW_ID_COOKIE,
} from "../../domain/flow-id.ts";
import { runtime } from "../../foundation/prisma.ts";
import { accessibleAccounts, principal } from "../../server/accounts.ts";
import { readSession } from "../../server/auth/session.ts";
import { ApiFailure } from "../../server/http.ts";
import { authenticatedEntryPath } from "../../server/onboarding/routing.ts";
import { SignIn } from "./sign-in.tsx";

export const metadata = { title: "Sign in | FLOW", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ issue?: string; notice?: string; to?: string }>;
}) {
  const [{ issue, notice, to }, reqHeaders, cookieStore] = await Promise.all([
    searchParams,
    headers(),
    cookies(),
  ]);
  const pendingSendTo =
    parseDirectFlowIdParam(to) ??
    parseDirectFlowIdParam(cookieStore.get(PENDING_SEND_FLOW_ID_COOKIE)?.value);

  let targetAccountId: string | null = null;
  let needsOnboarding = false;

  try {
    const session = await readSession(runtime().db, reqHeaders);
    if (session) {
      const actor = await principal(runtime().db, reqHeaders);
      const accounts = await accessibleAccounts(runtime().db, actor);
      const entryPath = authenticatedEntryPath(accounts);
      if (entryPath.startsWith("/accounts/"))
        targetAccountId = entryPath.slice("/accounts/".length);
      else needsOnboarding = true;
    }
  } catch (error) {
    if (error instanceof ApiFailure && error.code === "ONBOARDING_REQUIRED") {
      needsOnboarding = true;
    }
  }

  if (targetAccountId) {
    redirect(
      pendingSendTo
        ? `/app/send?to=${encodeURIComponent(pendingSendTo)}`
        : "/app",
    );
  }

  if (needsOnboarding) {
    redirect(
      pendingSendTo
        ? `/onboarding?to=${encodeURIComponent(pendingSendTo)}`
        : "/onboarding",
    );
  }

  return <SignIn issue={issue} notice={notice} pendingSendTo={pendingSendTo} />;
}
