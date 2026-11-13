import "server-only";
import { runtime } from "../foundation/prisma.ts";

export type AccountSyncKind = "BALANCE_REFRESH" | "ACTIVITY_SYNC";

export async function requestAccountSync(
  accountId: string,
  sessionToken: string,
  kind: AccountSyncKind,
) {
  const db = runtime().db;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${sessionToken}, true)`;
    const rows = await tx.$queryRaw<
      Array<{ job_id: string; job_status: string }>
    >`SELECT job_id, job_status FROM flow.request_account_sync(${accountId}::uuid, ${kind})`;
    return rows[0] ?? null;
  });
}

export async function readAccountSync(
  accountId: string,
  sessionToken: string,
  kind: AccountSyncKind,
) {
  const db = runtime().db;
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('flow.current_session_token', ${sessionToken}, true)`;
    const rows = await tx.$queryRaw<
      Array<{
        job_id: string;
        job_status: string;
        updated_at: Date;
        error_code: string | null;
      }>
    >`SELECT job_id, job_status, updated_at, error_code FROM flow.read_account_sync_status(${accountId}::uuid, ${kind})`;
    const row = rows[0];
    return row
      ? {
          jobId: row.job_id,
          status: row.job_status.toLowerCase(),
          updatedAt: row.updated_at.toISOString(),
          errorCode: row.error_code,
        }
      : null;
  });
}
