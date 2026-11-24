import { z } from "zod";
import { BLOG_POSTS } from "../../../../../content/blog-posts.ts";
import { runtime as getPrismaRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
import { sendBlogNewsletterPostToUser } from "../../../../../server/email/flow-email.ts";
import { ApiFailure, api, input, reply } from "../../../../../server/http.ts";
import {
  getAccountNotificationPreferences,
  upsertAccountNotificationPreferences,
} from "../../../../../server/preferences-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const prefsPatchSchema = z
  .strictObject({
    incomingPayments: z.boolean().optional(),
    paymentLinkActivity: z.boolean().optional(),
    securityAlerts: z.boolean().optional(),
    emailTransactions: z.boolean().optional(),
    emailNewsletter: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.incomingPayments !== undefined ||
      value.paymentLinkActivity !== undefined ||
      value.securityAlerts !== undefined ||
      value.emailTransactions !== undefined ||
      value.emailNewsletter !== undefined,
    { message: "At least one notification preference is required." },
  );

type Context = { params: Promise<{ id: string }> };

export function GET(request: Request, context: Context) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db } = getPrismaRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const preferences = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return getAccountNotificationPreferences(tx, id, actor.userId);
    });
    return reply(200, { ok: true, preferences });
  });
}

export function PATCH(request: Request, context: Context) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db } = getPrismaRuntime();
    const body = await input(request, prefsPatchSchema);
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const { previous, preferences } = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      const prev = await getAccountNotificationPreferences(
        tx,
        id,
        actor.userId,
      );
      const next = await upsertAccountNotificationPreferences(
        tx,
        id,
        actor.userId,
        body,
      );
      return { previous: prev, preferences: next };
    });

    // When a user newly subscribes to the FLOW Blog newsletter, send the latest
    // blog post immediately (strictly deduped per post + user).
    if (!previous.emailNewsletter && preferences.emailNewsletter && actor.email) {
      const latestPost = BLOG_POSTS[0];
      if (latestPost) {
        void sendBlogNewsletterPostToUser(
          db,
          {
            accountId: id,
            userId: actor.userId,
            email: actor.email,
          },
          latestPost,
        ).catch(() => {});
      }
    }

    return reply(200, { ok: true, preferences });
  });
}
