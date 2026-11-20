import { redirect } from "next/navigation";
import { runtime } from "../../../../foundation/prisma.ts";
import { access, accountId } from "../../../../server/accounts.ts";
import { pageData, pagePrincipal } from "../../../../server/pages.ts";

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await pagePrincipal();
  const { id } = await params;
  const query = await searchParams;
  const account = await pageData(() =>
    access(runtime().db, actor, accountId(id)),
  );
  if (account.kind === "PERSONAL" && !account.provisioningComplete) {
    redirect("/onboarding?step=status");
  }

  const sp = new URLSearchParams();
  for (const [key, val] of Object.entries(query)) {
    if (typeof val === "string") sp.set(key, val);
    else if (Array.isArray(val) && val[0]) sp.set(key, val[0]);
  }
  const qs = sp.toString();
  redirect(qs ? `/app?${qs}` : "/app");
}
