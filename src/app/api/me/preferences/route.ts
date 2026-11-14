import { z } from "zod";
import {
  type FlowDb,
  runtime as getPrismaRuntime,
} from "../../../../foundation/prisma.ts";
import { principal } from "../../../../server/accounts.ts";
import {
  ApiFailure,
  api,
  canonicalHost,
  input,
  reply,
} from "../../../../server/http.ts";
import {
  getUserProfilePreference,
  upsertUserProfilePreference,
} from "../../../../server/preferences-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profilePatchSchema = z
  .strictObject({
    displayName: z.string().trim().max(80).nullable().optional(),
    avatarDataUrl: z
      .string()
      .max(350_000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .nullable()
      .optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined || value.avatarDataUrl !== undefined,
    { message: "At least one profile preference field is required." },
  );

export function GET(request: Request) {
  return api(async () => {
    const { db, auth } = getPrismaRuntime();
    canonicalHost(request.headers, auth);
    const actor = await principal(db, request.headers);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const profile = await db.$transaction(async (tx: FlowDb) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
      return getUserProfilePreference(tx, actor.userId);
    });
    return reply(200, { ok: true, profile });
  });
}

export function PATCH(request: Request) {
  return api(async () => {
    const { db } = getPrismaRuntime();
    const body = await input(request, profilePatchSchema);
    const actor = await principal(db, request.headers);
    const token = actor.session.token;
    if (!token) throw new ApiFailure(401, "AUTH_REQUIRED");
    const displayName =
      body.displayName === undefined
        ? undefined
        : body.displayName === null || body.displayName === ""
          ? null
          : body.displayName;
    const profile = await db.$transaction(async (tx: FlowDb) => {
      await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${token}, true)`;
      return upsertUserProfilePreference(tx, actor.userId, {
        displayName,
        avatarDataUrl: body.avatarDataUrl,
      });
    });
    return reply(200, { ok: true, profile });
  });
}
