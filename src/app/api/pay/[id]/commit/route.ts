import { isFinancialExecutionDisabled } from "../../../../../domain/custody.ts";
import { ApiFailure, api } from "../../../../../server/http.ts";
import { commitPaymentAttempt } from "../../../../../server/payment-lifecycle.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return api(() => {
    if (isFinancialExecutionDisabled()) {
      throw new ApiFailure(403, "PAYMENT_EXECUTION_DISABLED");
    }
    return commitPaymentAttempt(request, id);
  });
}
