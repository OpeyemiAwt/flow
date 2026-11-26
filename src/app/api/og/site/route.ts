import { renderSiteOgImage } from "../../../../server/og-image.tsx";

export const runtime = "nodejs";

export async function GET() {
  return renderSiteOgImage();
}
