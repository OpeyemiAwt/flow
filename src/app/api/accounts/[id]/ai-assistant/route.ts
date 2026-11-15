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

const historyItem = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
  card: z
    .object({
      type: z.string(),
      title: z.string().optional(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable()
    .optional(),
});

const promptInput = z.object({
  prompt: z.string().trim().min(1).max(1000),
  history: z.array(historyItem).max(20).optional(),
});

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
    const { prompt, history } = await input(request, promptInput);
    const message = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return processAssistantQuery({
        accountId: id,
        prompt,
        history: history as Parameters<typeof processAssistantQuery>[0]["history"],
        db: tx,
      });
    });
    return reply(200, { ok: true, message });
  });
}
