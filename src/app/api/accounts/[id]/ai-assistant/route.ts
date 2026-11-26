import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runtime as appRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
import {
  processAssistantQuery,
  type AssistantMessage,
} from "../../../../../server/ai-assistant-service.ts";
import {
  getAiConversation,
  isValidUuid,
  saveAiConversationTurn,
} from "../../../../../server/ai-conversations-service.ts";
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
  prompt: z.string().trim().min(1).max(2000),
  history: z.array(historyItem).max(24).optional(),
  conversationId: z.string().trim().max(64).nullish(),
  viaVoice: z.boolean().optional(),
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
    const { prompt, history, conversationId, viaVoice } = await input(
      request,
      promptInput,
    );

    const nowIso = new Date().toISOString();
    const userMessage: AssistantMessage = {
      id: `user-${randomUUID()}`,
      role: "user",
      content: prompt,
      ...(viaVoice ? { viaVoice: true } : {}),
      timestamp: nowIso,
    };

    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;

      // Prefer synced server history if conversationId was supplied and history wasn't
      let effectiveHistory =
        (history as AssistantMessage[] | undefined) ?? [];
      if (effectiveHistory.length === 0 && isValidUuid(conversationId)) {
        const existing = await getAiConversation(tx, {
          accountId: id,
          userId: actor.userId,
          conversationId,
        });
        if (existing) {
          effectiveHistory = existing.messages.slice(-16);
        }
      }

      const rawReply = await processAssistantQuery({
        accountId: id,
        prompt,
        history: effectiveHistory,
        userEmail: actor.email,
        db: tx,
      });

      const assistantMessage: AssistantMessage = {
        ...rawReply,
        id: rawReply.id ?? `assistant-${randomUUID()}`,
        timestamp: rawReply.timestamp ?? new Date().toISOString(),
      };

      const saved = await saveAiConversationTurn(tx, {
        accountId: id,
        userId: actor.userId,
        conversationId: conversationId ?? null,
        userMessage,
        assistantMessage,
      });

      return {
        message: assistantMessage,
        userMessageId: userMessage.id,
        conversationId: saved?.conversationId ?? conversationId ?? null,
        conversationTitle: saved?.title ?? null,
        updatedAt: saved?.updatedAt ?? assistantMessage.timestamp,
      };
    });

    return reply(200, { ok: true, ...result });
  });
}
