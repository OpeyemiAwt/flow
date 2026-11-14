import { api } from "../../../../../../server/http.ts";
import { getOutgoingTransfer } from "../../../../../../server/outgoing-transfer-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; transferId: string }> },
) {
  const { id, transferId } = await context.params;
  return api(() => getOutgoingTransfer(request, id, transferId));
}
