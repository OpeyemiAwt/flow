import { api } from "../../../server/http.ts";
import { getUserInsights } from "../../../server/insights-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return api(() => getUserInsights(request));
}
