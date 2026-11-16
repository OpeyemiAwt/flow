import { z } from "zod";
import { runtime as appRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
import {
  claimAccountFlowId,
  getAccountFlowId,
} from "../../../../../server/flow-id-service.ts";
import { ApiFailure, api, input, reply } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const claimSchema = z.object({
  handle: z.string().trim().min(3).max(40),
});

export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db } = appRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const flowId = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return getAccountFlowId(tx, id);
    });
    return reply(200, { ok: true, flowId });
  });
}

export function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db } = appRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const { handle } = await input(request, claimSchema);
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return claimAccountFlowId(tx, { accountId: id, rawHandle: handle });
    });
    return reply(200, { ok: true, flowId: result.flowId });
  });
}
