import {
  commitAddMoneyIntent,
  listAddMoneyIntents,
} from "../../../../../server/add-money-service.ts";
import { api } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return api(() => listAddMoneyIntents(request, id));
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  return api(() => commitAddMoneyIntent(request, id));
}
