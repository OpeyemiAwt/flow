import { z } from "zod";
import { runtime as appRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
import { processAssistantQuery } from "../../../../../server/ai-assistant-service.ts";
import { ApiFailure, api, input, reply } from "../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const promptInput = z.object({ prompt: z.string().trim().min(1).max(1000) });

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
    const { prompt } = await input(request, promptInput);
    const message = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return processAssistantQuery({ accountId: id, prompt, db: tx });
    });
    return reply(200, { ok: true, message });
  });
}
