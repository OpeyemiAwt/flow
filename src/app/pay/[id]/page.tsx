import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isFinancialExecutionDisabled } from "../../../domain/custody.ts";
import { formatOgNetworkName } from "../../../server/og-image.tsx";
import {
  readPublicPaymentRequest,
  readPublicPaymentRequestMeta,
} from "../../../server/payment-requests.ts";
import { CheckoutView } from "./checkout-view.tsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PayPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ attempt?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const meta = await readPublicPaymentRequestMeta(id).catch(() => null);
  const canonical = `https://flow.devhub.forum/pay/${encodeURIComponent(id)}`;
  if (!meta || meta.isDeleted) {
    return {
      title: "Checkout · FLOW",
      description: "Pay across chains with FLOW Checkout.",
      alternates: { canonical },
    };
  }

  const networkLabel = formatOgNetworkName(meta.destinationNetwork);
  const hasFixedAmount =
    meta.amountMode === "FIXED" && Boolean(meta.displayAmount);
  const title = hasFixedAmount
    ? `Pay ${meta.displayAmount} ${meta.destinationAssetSymbol} · ${meta.title} · FLOW`
    : `${meta.title} · FLOW Checkout`;
  const description = hasFixedAmount
    ? `Pay ${meta.displayAmount} ${meta.destinationAssetSymbol} to ${meta.recipientName} using stablecoins or any token. Settles automatically on ${networkLabel}.`
    : `Pay ${meta.recipientName} any amount using stablecoins or any token. Settles in ${meta.destinationAssetSymbol} on ${networkLabel}.`;
  const ogImageUrl = `https://flow.devhub.forum/api/og/pay/${encodeURIComponent(id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "FLOW",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          type: "image/png",
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
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
