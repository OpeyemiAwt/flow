import { api } from "../../../../server/http.ts";
import { getAdminAnalytics } from "../../../../server/admin-analytics-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(() => getAdminAnalytics(request));
}
