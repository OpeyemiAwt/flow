import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  buildDirectFlowLink,
  parseDirectFlowIdParam,
} from "../../domain/flow-id.ts";
import { runtime } from "../../foundation/prisma.ts";
import { accessibleAccounts, principal } from "../../server/accounts.ts";
import { readSession } from "../../server/auth/session.ts";
import { lookupPublicFlowIdProfile } from "../../server/flow-id-service.ts";
import { ApiFailure } from "../../server/http.ts";
import { authenticatedEntryPath } from "../../server/onboarding/routing.ts";
import { FlowIdLandingClient } from "./flow-id-landing-client.tsx";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ flowId: string }>;
}): Promise<Metadata> {
  const { flowId: rawFlowId } = await params;
  const parsedFlowId = parseDirectFlowIdParam(rawFlowId);
  if (!parsedFlowId) {
    return { title: "Not found · FLOW" };
  }
  const db = runtime().db;
  const profile = await lookupPublicFlowIdProfile(db, parsedFlowId).catch(
    () => null,
  );
  const displayName = profile?.accountName?.trim() || parsedFlowId;
  const canonical = buildDirectFlowLink(parsedFlowId);
  const title =
    displayName.toLowerCase() !== parsedFlowId.toLowerCase()
      ? `Pay ${displayName} (${parsedFlowId}) · FLOW`
      : `Pay ${parsedFlowId} · FLOW`;
  const description = `Send crypto directly to ${displayName} (${parsedFlowId}) with FLOW or any external wallet. Settles on NEAR Mainnet.`;
  const ogImageUrl = `https://flow.devhub.forum/api/og/flow-id/${encodeURIComponent(parsedFlowId)}`;
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

export default async function DirectFlowIdPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId: rawFlowId } = await params;
  const parsedFlowId = parseDirectFlowIdParam(rawFlowId);
  if (!parsedFlowId) {
    notFound();
  }

  const db = runtime().db;
  const reqHeaders = await headers();
  const [profile, session] = await Promise.all([
    lookupPublicFlowIdProfile(db, parsedFlowId).catch(() => null),
    readSession(db, reqHeaders).catch(() => null),
  ]);

  let isSignedIn = false;
  let needsOnboarding = false;

  if (session) {
    try {
      const actor = await principal(db, reqHeaders);
      const accounts = await accessibleAccounts(db, actor);
      const entryPath = authenticatedEntryPath(accounts);
      isSignedIn = true;
      needsOnboarding = !entryPath.startsWith("/accounts/");
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "ONBOARDING_REQUIRED") {
        isSignedIn = true;
        needsOnboarding = true;
      }
    }
  }

  return (
    <FlowIdLandingClient
      flowId={profile?.flowId ?? parsedFlowId}
      accountName={profile?.accountName ?? null}
      exists={Boolean(profile)}
      hasActiveWallet={Boolean(profile?.hasActiveWallet)}
      isSignedIn={isSignedIn}
      needsOnboarding={needsOnboarding}
    />
  );
}
