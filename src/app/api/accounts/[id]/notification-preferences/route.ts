import { z } from "zod";
import { runtime as getPrismaRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
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
  })
  .refine(
    (value) =>
      value.incomingPayments !== undefined ||
      value.paymentLinkActivity !== undefined ||
      value.securityAlerts !== undefined,
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
    const preferences = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
        set_config('flow.current_account_id', ${id}, true)`;
      return upsertAccountNotificationPreferences(tx, id, actor.userId, body);
    });
    return reply(200, { ok: true, preferences });
  });
}
