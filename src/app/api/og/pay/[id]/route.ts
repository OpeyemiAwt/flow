import { readPublicPaymentRequestMeta } from "../../../../../server/payment-requests.ts";
import {
  renderCheckoutOgImage,
  renderSiteOgImage,
} from "../../../../../server/og-image.tsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  let meta = null;
  try {
    meta = await readPublicPaymentRequestMeta(id);
  } catch {
    meta = null;
  }

  if (!meta || meta.isDeleted) {
    return renderSiteOgImage();
  }

  return renderCheckoutOgImage({
    title: meta.title,
    recipientName: meta.recipientName,
    amountMode: meta.amountMode,
    displayAmount: meta.displayAmount,
    destinationAssetSymbol: meta.destinationAssetSymbol,
    destinationNetwork: meta.destinationNetwork,
  });
}
