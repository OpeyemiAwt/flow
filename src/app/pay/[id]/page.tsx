import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isFinancialExecutionDisabled } from "../../../domain/custody.ts";
import { readPublicPaymentRequest } from "../../../server/payment-requests.ts";
import { CheckoutView } from "./checkout-view.tsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PayPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ attempt?: string }>;
}

export default async function PayPage({ params, searchParams }: PayPageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : undefined;
  const attemptParam = query?.attempt
    ? `?attempt=${encodeURIComponent(query.attempt)}`
    : "";

  let data;
  try {
    const incomingHeaders = await headers();
    const host =
      incomingHeaders.get("x-forwarded-host") ||
      incomingHeaders.get("host") ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      "127.0.0.1";
    const proto =
      incomingHeaders.get("x-forwarded-proto") ||
      (host.startsWith("127.0.0.1") || host.startsWith("localhost")
        ? "http"
        : "https");
    const req = new Request(
      `${proto}://${host}/api/pay/${id}${attemptParam}`,
      { headers: incomingHeaders },
    );
    const res = await readPublicPaymentRequest(req, id);

    if (res.status === 404) {
      notFound();
    }

    data = await res.json();
  } catch {
    notFound();
  }

  return (
    <CheckoutView
      request={data}
      executionDisabled={isFinancialExecutionDisabled()}
    />
  );
}
