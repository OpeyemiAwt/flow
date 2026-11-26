import { runtime as getPrismaRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
import { ApiFailure, api, input, reply } from "../../../../../server/http.ts";
import {
  createAccountMcpAgentKey,
  createMcpAgentKeySchema,
  listAccountMcpAgentKeys,
} from "../../../../../server/mcp-agent-keys-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db } = getPrismaRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

    const keys = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return listAccountMcpAgentKeys(tx, id);
    });

    return reply(200, { ok: true, keys });
  });
}

export function POST(request: Request, context: Context) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const body = await input(request, createMcpAgentKeySchema);
    const { db } = getPrismaRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

    const created = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return createAccountMcpAgentKey(tx, {
        accountId: id,
        userId: actor.userId,
        input: body,
      });
    });

    return reply(201, {
      ok: true,
      key: created.key,
      rawToken: created.rawToken,
    });
  });
}
