import { api } from "../../../../../../server/http.ts";
import { executeEarnAction } from "../../../../../../server/earn-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return api(() => executeEarnAction(request, id));
}
