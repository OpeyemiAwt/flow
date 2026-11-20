import { redirect } from "next/navigation";
import { renderAppWorkspace, VALID_APP_TABS } from "../app-workspace.tsx";
import type { WorkspaceTab } from "../../accounts/[id]/portfolio-view.tsx";

export default async function AppTabPage({
  params,
}: {
  params: Promise<{ tab: string }>;
}) {
  const { tab } = await params;
  const normalized = tab.toLowerCase();
  if (normalized === "dashboard") {
    redirect("/app");
  }
  if (!VALID_APP_TABS.has(normalized as WorkspaceTab)) {
    redirect("/app");
  }
  return renderAppWorkspace(normalized);
}
