import { api } from "../../../../../server/http.ts";
import { listOutgoingTransfers } from "../../../../../server/outgoing-transfer-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return api(() => listOutgoingTransfers(request, id));
}
