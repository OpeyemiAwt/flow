import { redirect } from "next/navigation";
import { parseDirectFlowIdParam } from "../../../../domain/flow-id.ts";
import { renderAppWorkspace, VALID_APP_TABS } from "../app-workspace.tsx";
import type { WorkspaceTab } from "../../accounts/[id]/portfolio-view.tsx";

export default async function AppTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ tab: string }>;
  searchParams: Promise<{ to?: string }>;
}) {
  const [{ tab }, query] = await Promise.all([params, searchParams]);
  const normalized = tab.toLowerCase();
  if (normalized === "dashboard") {
    redirect("/app");
  }
  if (!VALID_APP_TABS.has(normalized as WorkspaceTab)) {
    redirect("/app");
  }
  const initialSendTo =
    normalized === "send" ? parseDirectFlowIdParam(query.to) : null;
  return renderAppWorkspace(normalized, { initialSendTo });
}
