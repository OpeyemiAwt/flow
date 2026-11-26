import { runtime as appRuntime } from "../../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../../server/accounts.ts";
import {
  deleteAiConversation,
  getAiConversation,
  isValidUuid,
  listAiConversations,
} from "../../../../../../server/ai-conversations-service.ts";
import { ApiFailure, api, reply } from "../../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");

    if (conversationId) {
      if (!isValidUuid(conversationId)) {
        throw new ApiFailure(400, "INVALID_CONVERSATION_ID");
      }
      const conversation = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
          set_config('flow.current_account_id', ${id}, true)`;
        return getAiConversation(tx, {
          accountId: id,
          userId: actor.userId,
          conversationId,
        });
      });
      if (!conversation) {
        throw new ApiFailure(404, "CONVERSATION_NOT_FOUND");
      }
      return reply(200, { ok: true, conversation });
    }

    const conversations = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return listAiConversations(tx, {
        accountId: id,
        userId: actor.userId,
        limit: 30,
      });
    });

    return reply(200, { ok: true, conversations });
  });
}

export function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db, auth } = appRuntime();
    const site = request.headers.get("sec-fetch-site");
    const origin = request.headers.get("origin");
    if (
      (origin && origin !== auth.origin) ||
      (site && site !== "same-origin")
    ) {
      throw new ApiFailure(403, "INVALID_ORIGIN");
    }
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");

    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId");
    if (!isValidUuid(conversationId)) {
      throw new ApiFailure(400, "INVALID_CONVERSATION_ID");
    }

    const deleted = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return deleteAiConversation(tx, {
        accountId: id,
        userId: actor.userId,
        conversationId,
      });
    });

    return reply(200, { ok: true, deleted });
  });
}
