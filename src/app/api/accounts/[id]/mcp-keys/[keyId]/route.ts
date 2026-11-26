import { z } from "zod";
import { runtime as getPrismaRuntime } from "../../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../../server/accounts.ts";
import { ApiFailure, api, input, reply } from "../../../../../../server/http.ts";
import {
  deleteAccountMcpAgentKey,
  updateAccountMcpAgentKey,
  updateMcpAgentKeySchema,
} from "../../../../../../server/mcp-agent-keys-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; keyId: string }> };

function parseKeyId(raw: string): string {
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(400, "INVALID_AGENT_KEY_ID");
  }
  return parsed.data;
}

export function PATCH(request: Request, context: Context) {
  return api(async () => {
    const params = await context.params;
    const id = accountId(params.id);
    const keyId = parseKeyId(params.keyId);
    const body = await input(request, updateMcpAgentKeySchema);
    const { db } = getPrismaRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

    const updated = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return updateAccountMcpAgentKey(tx, {
        accountId: id,
        keyId,
        patch: body,
      });
    });

    if (!updated) {
      throw new ApiFailure(404, "AGENT_KEY_NOT_FOUND");
    }

    return reply(200, { ok: true, key: updated });
  });
}

export function DELETE(request: Request, context: Context) {
  return api(async () => {
    const params = await context.params;
    const id = accountId(params.id);
    const keyId = parseKeyId(params.keyId);
    const { db } = getPrismaRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

    const deleted = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return deleteAccountMcpAgentKey(tx, id, keyId);
    });

    if (!deleted) {
      throw new ApiFailure(404, "AGENT_KEY_NOT_FOUND");
    }

    return reply(200, { ok: true });
  });
}
