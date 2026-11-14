import { api } from "../../../../../../server/http.ts";
import { executeConvertTransfer } from "../../../../../../server/outgoing-transfer-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return api(() => executeConvertTransfer(request, id));
}
