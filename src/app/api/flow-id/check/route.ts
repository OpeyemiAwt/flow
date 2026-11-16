import { runtime as appRuntime } from "../../../../foundation/prisma.ts";
import { principal } from "../../../../server/accounts.ts";
import { checkFlowIdAvailability } from "../../../../server/flow-id-service.ts";
import { api, reply } from "../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return api(async () => {
    const { db } = appRuntime();
    await principal(db, request.headers);
    const url = new URL(request.url);
    const handle = url.searchParams.get("handle") ?? "";
    const result = await checkFlowIdAvailability(db, handle);
    return reply(200, { ok: true, ...result });
  });
}
