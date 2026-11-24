import { runtime as getPrismaRuntime } from "../../../../foundation/prisma.ts";
import { verifyEmailUnsubscribeToken } from "../../../../server/email/flow-email.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function renderConfirmationHtml(title: string, detail: string): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} · FLOW</title>
</head>
<body style="margin:0;padding:32px 16px;background:#F5F5F4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;color:#0B0C0E;">
  <div style="max-width:460px;margin:48px auto;background:#FFFFFF;border:1px solid #E6E4DF;border-radius:24px;padding:32px 28px;text-align:center;">
    <img src="/assets/flow-symbol.png" alt="FLOW" width="34" height="34" style="margin-bottom:14px;" />
    <h1 style="margin:0 0 10px;font-size:22px;font-weight:600;letter-spacing:-0.02em;">${title}</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#5F636A;">${detail}</p>
    <a href="/security" style="display:inline-block;padding:11px 22px;border-radius:999px;background:#0B0C0E;color:#FFFFFF;font-size:13px;font-weight:600;text-decoration:none;">Manage settings in FLOW</a>
  </div>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleUnsubscribe(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim() ?? "";
  const verified = verifyEmailUnsubscribeToken(token);
  if (!verified) {
    return renderConfirmationHtml(
      "Link expired or invalid",
      "You can update your email notification settings anytime from Settings → Notifications inside FLOW.",
    );
  }

  const { db } = getPrismaRuntime();
  await db.$queryRaw`
    SELECT flow.unsubscribe_email_preference(
      ${verified.accountId}::uuid,
      ${verified.userId}::uuid,
      ${verified.kind}::text
    )
  `;

  if (verified.kind === "newsletter") {
    return renderConfirmationHtml(
      "Unsubscribed from FLOW Blog newsletter",
      "You will no longer receive FLOW Blog newsletter emails. You can re-subscribe anytime in Settings → Notifications.",
    );
  }
  return renderConfirmationHtml(
    "Transaction receipt emails turned off",
    "You will no longer receive email receipts for completed transactions. You can turn them back on anytime in Settings → Notifications.",
  );
}

export function GET(request: Request) {
  return handleUnsubscribe(request);
}

export function POST(request: Request) {
  return handleUnsubscribe(request);
}
