import { runtime as appRuntime } from "../../../../foundation/prisma.ts";
import { principal } from "../../../../server/accounts.ts";
import { resolveFlowIdForSend } from "../../../../server/flow-id-service.ts";
import { ApiFailure, api, reply } from "../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(async () => {
    const { db } = appRuntime();
    await principal(db, request.headers);
    const url = new URL(request.url);
    const flowId = url.searchParams.get("flowId") ?? "";
    const network = url.searchParams.get("network") ?? "";
    if (!flowId.trim() || !network.trim()) {
      throw new ApiFailure(400, "FLOW_ID_AND_NETWORK_REQUIRED");
    }
    const resolved = await resolveFlowIdForSend(db, {
      rawFlowId: flowId,
      destinationNetwork: network,
    });
    return reply(200, { ok: true, ...resolved });
  });
}
