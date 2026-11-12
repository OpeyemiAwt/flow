import { z } from "zod";
import { runtime as getPrismaRuntime } from "../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../server/accounts.ts";
import { ApiFailure, api, input, reply } from "../../../../../server/http.ts";
import {
  getAccountNotifications,
  markAllNotificationsAsRead,
} from "../../../../../server/notifications-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notificationSelection = z.union([
  z.object({ id: z.string().max(128) }),
  z.object({
    markAll: z.literal(true),
    ids: z.array(z.string().max(128)).max(50),
  }),
]);

async function handle(request: Request, rawId: string): Promise<Response> {
  const id = accountId(rawId);
  const { db } = getPrismaRuntime();
  const actor = await principal(db, request.headers);
  await access(db, actor, id);
  const token = actor.session.token;
  if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
  const selection =
    request.method === "POST"
      ? await input(request, notificationSelection)
      : null;
  const viewer = actor.userId + ":" + id;
  const notifications = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true),
      set_config('flow.current_account_id', ${id}, true)`;
    return getAccountNotifications(tx, id, viewer);
  });
  if (selection) {
    const allowed = new Set(notifications.map((item) => item.id));
    const ids = "ids" in selection ? selection.ids : [selection.id];
    markAllNotificationsAsRead(
      ids.filter((id) => allowed.has(id)),
      viewer,
    );
    return reply(200, { ok: true });
  }
  return reply(200, {
    ok: true,
    notifications,
    unreadCount: notifications.filter((item) => !item.isRead).length,
  });
}

type Context = { params: Promise<{ id: string }> };
export function GET(request: Request, context: Context) {
  return api(async () => handle(request, (await context.params).id));
}
export function POST(request: Request, context: Context) {
  return api(async () => handle(request, (await context.params).id));
}
