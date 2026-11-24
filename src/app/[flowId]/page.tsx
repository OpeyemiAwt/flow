import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
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
  const canonical = buildDirectFlowLink(parsedFlowId);
  const title = `Pay ${parsedFlowId} · FLOW`;
  const description = `Send crypto directly to ${parsedFlowId} across NEAR, Solana, Base, and Ethereum on FLOW.`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [
        {
          url: "https://flow.devhub.forum/assets/blog/send-anywhere-and-flow-id.png",
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [
        "https://flow.devhub.forum/assets/blog/send-anywhere-and-flow-id.png",
      ],
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

  if (session && profile?.hasActiveWallet) {
    let targetAccountId: string | null = null;
    let needsOnboarding = false;
    try {
      const actor = await principal(db, reqHeaders);
      const accounts = await accessibleAccounts(db, actor);
      const entryPath = authenticatedEntryPath(accounts);
      if (entryPath.startsWith("/accounts/")) {
        targetAccountId = entryPath.slice("/accounts/".length);
      } else {
        needsOnboarding = true;
      }
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "ONBOARDING_REQUIRED") {
        needsOnboarding = true;
      }
    }

    if (targetAccountId) {
      redirect(`/app/send?to=${encodeURIComponent(profile.flowId)}`);
    }
    if (needsOnboarding) {
      redirect(`/onboarding?to=${encodeURIComponent(profile.flowId)}`);
    }
  }

  return (
    <FlowIdLandingClient
      flowId={profile?.flowId ?? parsedFlowId}
      accountName={profile?.accountName ?? null}
      exists={Boolean(profile)}
      hasActiveWallet={Boolean(profile?.hasActiveWallet)}
    />
  );
}
