import { NextResponse } from "next/server";
import { fetchLiveEarnApys } from "../../../../server/earn-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apys = await fetchLiveEarnApys();
  return NextResponse.json({ ok: true, apys });
}
