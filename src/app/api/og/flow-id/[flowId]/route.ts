import { parseDirectFlowIdParam } from "../../../../../domain/flow-id.ts";
import { runtime as prismaRuntime } from "../../../../../foundation/prisma.ts";
import { lookupPublicFlowIdProfile } from "../../../../../server/flow-id-service.ts";
import {
  renderDirectFlowOgImage,
  renderSiteOgImage,
} from "../../../../../server/og-image.tsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ flowId: string }> },
) {
  const { flowId: rawFlowId } = await context.params;
  const parsedFlowId = parseDirectFlowIdParam(rawFlowId);
  if (!parsedFlowId) {
    return renderSiteOgImage();
  }

  let accountName: string | null = null;
  try {
    const db = prismaRuntime().db;
    const profile = await lookupPublicFlowIdProfile(db, parsedFlowId);
    accountName = profile?.accountName ?? null;
  } catch {
    // Fallback cleanly to handle-only preview card if DB lookup is unavailable
  }

  return renderDirectFlowOgImage({
    flowId: parsedFlowId,
    accountName,
  });
}
