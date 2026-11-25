import { parseDirectFlowIdParam } from "../../../../../domain/flow-id.ts";
import { runtime as flowRuntime } from "../../../../../foundation/prisma.ts";
import { getOrCreateDirectFlowExternalCheckout } from "../../../../../server/flow-id-service.ts";
import { ApiFailure, api, reply } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(
  _request: Request,
  context: { params: Promise<{ flowId: string }> },
): Promise<Response> {
  return api(async () => {
    const { flowId: rawFlowId } = await context.params;
    const parsedFlowId = parseDirectFlowIdParam(rawFlowId);
    if (!parsedFlowId) {
      throw new ApiFailure(400, "INVALID_FLOW_ID");
    }

    const publicId = await getOrCreateDirectFlowExternalCheckout(
      flowRuntime().db,
      parsedFlowId,
    );
    if (!publicId) {
      throw new ApiFailure(
        404,
        "External wallet checkout is unavailable for this Flow ID.",
      );
    }

    return reply(200, {
      publicId,
      checkoutUrl: `/pay/${publicId}`,
    });
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ flowId: string }> },
): Promise<Response> {
  return handle(request, context);
}

export async function GET(
  request: Request,
  context: { params: Promise<{ flowId: string }> },
): Promise<Response> {
  return handle(request, context);
}
