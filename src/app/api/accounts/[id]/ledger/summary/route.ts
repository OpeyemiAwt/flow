import { runtime as appRuntime } from "../../../../../../foundation/prisma.ts";
import {
  access,
  accountId,
  principal,
} from "../../../../../../server/accounts.ts";
import { ApiFailure, api, reply } from "../../../../../../server/http.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return api(async () => {
    const id = accountId((await context.params).id);
    const { db } = appRuntime();
    const actor = await principal(db, request.headers);
    await access(db, actor, id);
    const sessionToken = actor.session.token;
    if (!sessionToken) throw new ApiFailure(401, "AUTH_REQUIRED");

    const movements = await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('flow.current_session_token', ${sessionToken}, true),
          set_config('flow.current_account_id', ${id}, true)
      `;
      return tx.$queryRaw<
        Array<{
          assetId: string;
          network: string;
          decimals: number;
          inflow: string;
          outflow: string;
        }>
      >`
        SELECT a.asset_id AS "assetId", a.network, a.decimals,
          COALESCE(SUM(e.amount_atomic) FILTER (WHERE e.entry_direction = 'CREDIT'), 0)::text AS inflow,
          COALESCE(SUM(e.amount_atomic) FILTER (WHERE e.entry_direction = 'DEBIT'), 0)::text AS outflow
        FROM flow.ledger_accounts a
        JOIN flow.ledger_entries e ON e.ledger_account_id = a.id
        JOIN flow.ledger_journals j ON j.id = e.journal_id
        WHERE a.account_id = ${id}::uuid AND a.account_code = 'LIABILITY_MERCHANT_PAYABLE'
          AND j.status = 'POSTED' AND j.reference_type IN ('PAYMENT_SETTLEMENT', 'PAYMENT_REFUND')
          AND j.posted_at >= date_trunc('month', now(), 'UTC')
          AND j.posted_at <= now()
        GROUP BY a.asset_id, a.network, a.decimals
        ORDER BY a.network, a.asset_id
      `;
    });
    return reply(200, { movements });
  });
}
