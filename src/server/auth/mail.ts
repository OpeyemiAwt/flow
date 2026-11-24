import "server-only";
import type { AuthConfig } from "../../foundation/auth-environment.ts";
import { log } from "../../foundation/logger.ts";

export async function sendMail(
  config: AuthConfig,
  to: string,
  subject: string,
  text: string,
  diagnosticId?: string,
  html?: string,
): Promise<boolean> {
  let status: number | undefined;
  let providerMessageId: string | undefined;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
      headers: {
        Authorization: `Bearer ${config.mailKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.mailFrom,
        to: [to],
        subject,
        text,
        ...(html ? { html } : {}),
      }),
    });
    status = res.status;
    if (res.ok) {
      const payload: unknown = await res.json().catch(() => undefined);
      if (
        payload &&
        typeof payload === "object" &&
        "id" in payload &&
        typeof payload.id === "string" &&
        /^[\w-]{8,128}$/.test(payload.id)
      )
        providerMessageId = payload.id;
      if (diagnosticId)
        log("info", "otp_diagnostic", {
          diagnosticId,
          outcome: "PROVIDER_ACCEPTED",
          provider: "resend",
          httpStatus: status,
          ...(providerMessageId ? { providerMessageId } : {}),
        });
      return true;
    }
    await res.body?.cancel();
  } catch {
    // Delivery responses can contain email addresses or provider credentials.
  }
  if (diagnosticId)
    log("error", "otp_diagnostic", {
      diagnosticId,
      outcome: status === undefined ? "DELIVERY_UNKNOWN" : "PROVIDER_REJECTED",
      provider: "resend",
      ...(status === undefined ? {} : { httpStatus: status }),
    });
  log("error", "mail_delivery_failed", { code: "DELIVERY_UNAVAILABLE" });
  return false;
}
