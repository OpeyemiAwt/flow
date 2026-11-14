import { getAddMoneyIntent } from "../../../../../../server/add-money-service.ts";
import { api } from "../../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; intentId: string }> };

export async function GET(request: Request, context: Context) {
  const { id, intentId } = await context.params;
  return api(() => getAddMoneyIntent(request, id, intentId));
}
