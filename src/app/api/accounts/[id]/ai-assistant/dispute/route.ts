import { randomBytes } from "node:crypto";
import { z } from "zod";
import { runtime as appRuntime } from "../../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../../server/accounts.ts";
import { markAiConversationCardSent } from "../../../../../../server/ai-conversations-service.ts";
import { clientBudget } from "../../../../../../server/auth/limits.ts";
import { sendDisputeSupportEmail } from "../../../../../../server/email/flow-email.ts";
import { getAccountFlowId } from "../../../../../../server/flow-id-service.ts";
import {
  ApiFailure,
  api,
  input,
  reply,
} from "../../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const disputeInput = z.object({
  subject: z.string().trim().min(3).max(140),
  category: z.string().trim().min(2).max(60).optional(),
  message: z.string().trim().min(8).max(3000),
  transactionRef: z.string().trim().max(140).nullish(),
  conversationId: z.string().trim().max(64).nullish(),
  messageId: z.string().trim().max(80).nullish(),
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

    const allowed = await clientBudget(request, "ai:dispute-email");
    if (!allowed) {
      throw new ApiFailure(429, "RATE_LIMIT_EXCEEDED");
    }

    const body = await input(request, disputeInput);
    const referenceCode = `DSP-${randomBytes(3).toString("hex").toUpperCase()}`;

    const flowId = await db
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
          set_config('flow.current_account_id', ${id}, true)`;
        return getAccountFlowId(tx, id);
      })
      .catch(() => null);

    const delivery = await sendDisputeSupportEmail({
      referenceCode,
      subject: body.subject,
      category: body.category || "General Dispute",
      message: body.message,
      transactionRef: body.transactionRef ?? null,
      userEmail: actor.email,
      userName: actor.name,
      accountId: id,
      flowId,
    });

    if (!delivery.ok) {
      throw new ApiFailure(
        503,
        "Could not deliver dispute email right now. Please try again shortly.",
      );
    }

    // Persist sent status back onto the synced conversation card so switching devices shows it sent
    if (body.conversationId && body.messageId) {
      await db
        .$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
            set_config('flow.current_account_id', ${id}, true)`;
          await markAiConversationCardSent(tx, {
            accountId: id,
            userId: actor.userId,
            conversationId: body.conversationId,
            messageId: body.messageId,
            patch: {
              subject: body.subject,
              category: body.category || "General Dispute",
              message: body.message,
              transactionRef: body.transactionRef ?? "",
              sentReferenceCode: referenceCode,
              sentAt: new Date().toISOString(),
            },
          });
        })
        .catch(() => {});
    }

    return reply(200, {
      ok: true,
      referenceCode,
      supportEmail: delivery.supportEmail,
    });
  });
}
