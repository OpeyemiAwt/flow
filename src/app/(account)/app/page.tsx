import { redirect } from "next/navigation";
import { renderAppWorkspace, VALID_APP_TABS } from "./app-workspace.tsx";
import type { WorkspaceTab } from "../accounts/[id]/portfolio-view.tsx";

export default async function AppPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; tab?: string }>;
}) {
  const query = await searchParams;
  const requested = query.view ?? query.tab;
  if (
    requested &&
    requested !== "dashboard" &&
    VALID_APP_TABS.has(requested as WorkspaceTab)
  ) {
    redirect(`/app/${requested}`);
  }
  return renderAppWorkspace("dashboard");
}
